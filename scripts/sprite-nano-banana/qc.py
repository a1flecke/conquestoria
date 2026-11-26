#!/usr/bin/env python3
"""Automated quality control for Nano Banana generated unit sprite sheets.

Runs before a sheet is accepted into the preview build (driving the automated retry loop):
  1. Structural security scan via `scripts/portrait-pixelate/portrait_pixelate.py` (`scan`)
  2. Background & figure-extraction checks via `scripts/sprite-puppet/strips.py` (`load_figures`)
  3. Team-colour presence (master) and leak check (follow-up sheets) via `strips.tint_fraction`
  4. Magenta-halo scan on figure boundaries (catches soft semi-transparent smoke over #FF00FF)
  5. Rig-cut calibration check via `strips.calibrate` (mandatory on master; checked on all 4 damage tiers)
  6. Export pre-flight check (one-shot hold durations, centering, unit box, disk/memory budgets)
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REPO = Path(__file__).resolve().parents[2]

MIN_MASTER_TINT = 0.012
MAX_MASTER_TINT = 0.60
# A biped master's two legs must stand nearly parallel, as the shipped Warrior's do (resting angles about -2 and +10 degrees,
# spread 12.5): the walk rig swings each leg from its resting angle, so a wide or turned stance makes the legs scissor and the
# boots tilt (the first Crossbowman masters measured spread 17 to 23).
MAX_LEG_SPREAD_DEG = 13.0
MAX_LEG_ANGLE_DEG = 13.0
MAX_HALO_FRACTION = 0.12  # >12% magenta-like pixels in the outer 3px shell signals semi-transparent smoke halo (1px anti-alias is ~3-5% and stripped by clean_rgba)


def _load_module(name: str, path: Path):
    mod_name = f'_nb_{name}'
    existing = sys.modules.get(mod_name)
    if existing is not None and getattr(existing, '__file__', None) == str(path):
        return existing
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


def leg_rest_angles(strips, rgba: np.ndarray, rig: dict) -> tuple[float, float]:
    """The resting angle (degrees from vertical, back leg then front leg) the walk rig measures for a biped drawing."""
    cal = strips.calibrate(rgba, dict(rig))
    full = {**rig, **cal}
    alpha = rgba[..., 3] > 40
    u = strips.figure_scale(alpha)
    comps, _ = strips.leg_pieces(alpha, cal['cut_y'], u, 2, rig.get('shafts', 0))
    angles = []
    for d in comps[-2:]:
        _, px = strips.leg_band(d, alpha, full, cal['cut_y'], u)
        ys, xs = np.where(d['mask'])
        foot = ys > ys.max() - round(60 * u)
        angles.append(float(np.degrees(np.arctan2(xs[foot].mean() - px, ys[foot].mean() - cal['hip_y']))))
    return angles[0], angles[1]


def load_strips(repo_root: Path = REPO):
    return _load_module('strips', repo_root / 'scripts' / 'sprite-puppet' / 'strips.py')


def load_strips_export(repo_root: Path = REPO):
    return _load_module('strips_export', repo_root / 'scripts' / 'sprite-puppet' / 'strips_export.py')


def load_portrait_scanner(repo_root: Path = REPO):
    return _load_module('portrait_pixelate', repo_root / 'scripts' / 'portrait-pixelate' / 'portrait_pixelate.py')


@dataclass
class SheetQCResult:
    """QC verdict for one generated source image (`a.png`, `b.png`, ...)."""
    file_key: str
    state: str
    ok: bool
    retryable: bool
    scan_report: dict
    tint_fraction: float | None = None
    figure_heights: list[int] = field(default_factory=list)
    errors: list[tuple[str, str]] = field(default_factory=list)
    warnings: list[tuple[str, str]] = field(default_factory=list)

    @property
    def retry_issues(self) -> list[tuple[str, str]]:
        """Issues that justify an automated retry (all errors, plus retryable structural warnings)."""
        issues = list(self.errors)
        for code, msg in self.warnings:
            if code in ('edge', 'tint_leak', 'rig_cut', 'magenta_halo', 'leg_stance'):
                issues.append((code, msg))
        return issues

    def summary_reason(self) -> str:
        if self.errors:
            return self.errors[0][0]
        if self.warnings:
            return self.warnings[0][0]
        return 'ok'


def _magenta_halo_fraction(rgb: np.ndarray, mask: np.ndarray) -> float:
    """Measure residual purple/magenta spill on the outer 3px boundary of an extracted figure."""
    inner = ndi.binary_erosion(mask, iterations=3)
    shell = mask & ~inner
    shell_px = int(shell.sum())
    if shell_px == 0:
        return 0.0
    a = rgb.astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # Softer than strips.field_mask so purple-tinted semi-transparent smoke over #FF00FF is caught.
    purple = (r > 135) & (b > 135) & (g < 125) & (np.abs(r - b) < 60) & ((r - g) > 45) & ((b - g) > 45)
    return float((purple & shell).sum()) / shell_px


def _states_referencing_file(spec: dict, file_key: str) -> list[tuple[dict, list[str]]]:
    """Return `[(rig_dict, [ref, ...])]` for every rig that cuts from `file_key`."""
    out: list[tuple[dict, list[str]]] = []
    for st in spec.get('states', []):
        rig = st.get('rig')
        if not rig:
            continue
        refs = [r for r in (rig.get('sources') or [rig['source']]) if r.partition('#')[0] == file_key]
        if refs:
            out.append((rig, refs))
    return out


def validate_sheet(
    spec: dict,
    state_spec: dict,
    image_path: Path,
    *,
    is_master: bool,
    master_tint: float | None = None,
    strict_damage_rigs: bool = True,
    repo_root: Path = REPO,
) -> SheetQCResult:
    """Run automated security, extraction, tint, halo, and rig-calibration checks on one sheet."""
    strips = load_strips(repo_root)
    scanner = load_portrait_scanner(repo_root)

    file_key = state_spec['file']
    state = state_spec['state']
    errors: list[tuple[str, str]] = []
    warnings: list[tuple[str, str]] = []

    scan_report = scanner.scan(image_path)
    if not scan_report.get('ok'):
        errors.append(('scan', str(scan_report.get('error', 'security scan failed'))))
        return SheetQCResult(
            file_key=file_key,
            state=state,
            ok=False,
            retryable=True,
            scan_report=scan_report,
            errors=errors,
        )

    findings = []
    try:
        figs = strips.load_figures(image_path, int(state_spec['cells']), state_spec.get('grid'), findings)
    except strips.FigureError as exc:
        errors.append((exc.code, exc.message))
        return SheetQCResult(
            file_key=file_key,
            state=state,
            ok=False,
            retryable=True,
            scan_report=scan_report,
            errors=errors,
        )

    for f in findings:
        target = errors if f.level == 'error' else warnings
        target.append((f.code, f.message))

    heights = [int(y1 - y0) for _, _, (_, y0, _, y1) in figs]
    for h in heights:
        if h < strips.SMALL_FIGURE_PX:
            # Prone defeat figures are legitimately shorter; warn only without forcing failure.
            warnings.append(('small', f'a figure is {h}px tall (under {strips.SMALL_FIGURE_PX}px)'))
            break

    # Team-colour checks.
    tint_frac = strips.tint_fraction(image_path, figs, spec['tint'])
    if is_master:
        if tint_frac < MIN_MASTER_TINT:
            errors.append((
                'tint_missing',
                f'only {tint_frac:.1%} of the master takes team colour (minimum {MIN_MASTER_TINT:.1%})',
            ))
        elif tint_frac > MAX_MASTER_TINT:
            warnings.append((
                'tint_excessive',
                f'{tint_frac:.0%} of the master takes team colour (over {MAX_MASTER_TINT:.0%})',
            ))
    elif master_tint is not None:
        if tint_frac > 1.5 * master_tint and (tint_frac - master_tint) > 0.02:
            warnings.append((
                'tint_leak',
                f'{tint_frac:.0%} of the figure takes team colour vs {master_tint:.0%} in the master',
            ))

    # Magenta halo check (catches soft airbrushed smoke/edges over #FF00FF).
    rgba_full = np.asarray(Image.open(image_path).convert('RGBA'))
    if strips.background_kind(rgba_full) == 'magenta':
        worst_halo = 0.0
        for rgb, fig_mask, _ in figs:
            worst_halo = max(worst_halo, _magenta_halo_fraction(rgb, fig_mask))
        if worst_halo > MAX_HALO_FRACTION:
            warnings.append((
                'magenta_halo',
                f'{worst_halo:.1%} of figure border pixels show magenta/purple blending (limit {MAX_HALO_FRACTION:.1%})',
            ))

    # Rig-cut checks for any rig referencing this image (master MUST pass; damage tiers checked too).
    rig_uses = _states_referencing_file(spec, file_key)
    for rig, refs in rig_uses:
        for ref in refs:
            _, _, idx_str = ref.partition('#')
            try:
                if not idx_str and strips.background_kind(rgba_full) == 'transparent':
                    src_rgba = rgba_full
                else:
                    idx = int(idx_str or 0)
                    cleaned, _ = strips.clean_rgba(*figs[idx])
                    src_rgba = (cleaned * 255 + 0.5).astype(np.uint8)
                strips.calibrate(src_rgba, rig)
                if is_master and spec.get('family') == 'biped' and rig.get('kind') not in getattr(strips, 'GIVEN_KINDS', ()):
                    back, front = leg_rest_angles(strips, src_rgba, rig)
                    if front - back > MAX_LEG_SPREAD_DEG or max(abs(back), abs(front)) > MAX_LEG_ANGLE_DEG:
                        errors.append((
                            'leg_stance',
                            f'the legs rest at {back:+.0f} and {front:+.0f} degrees from vertical '
                            f'(spread {front - back:.0f}, limit {MAX_LEG_SPREAD_DEG:.0f})',
                        ))
            except (strips.RigCutError, IndexError) as exc:
                if is_master:
                    errors.append(('rig_cut', f'{ref}: {exc}'))
                elif strict_damage_rigs:
                    warnings.append(('rig_cut', f'{ref}: {exc}'))

    # Decide whether this sheet is clean enough to stop retrying.
    # Errors always fail; retryable warnings (edge clipping, tint leak, magenta halo, damage rig_cut)
    # fail strict acceptance during retries so the loop tries to get a cleaner draw, while still
    # allowing the best warning-only draw to survive if max retries are exhausted.
    ok = len(errors) == 0
    retryable = len(errors) > 0 or any(
        code in ('edge', 'tint_leak', 'rig_cut', 'magenta_halo') for code, _ in warnings
    )
    return SheetQCResult(
        file_key=file_key,
        state=state,
        ok=ok,
        retryable=retryable,
        scan_report=scan_report,
        tint_fraction=tint_frac,
        figure_heights=heights,
        errors=errors,
        warnings=warnings,
    )


def preflight_export_check(
    spec: dict,
    preview_dir: Path,
    *,
    scale: float = 0.75,
    repo_root: Path = REPO,
) -> dict:
    """Dry-run `strips_export.export` into a temp folder so sign-off knows budgets & checks pass."""
    exporter = load_strips_export(repo_root)
    with tempfile.TemporaryDirectory(prefix='nb-export-preflight-') as tmp:
        tmp_path = Path(tmp)
        pub = tmp_path / 'public'
        gen = tmp_path / 'generated'
        try:
            exporter.export(spec, preview_dir, scale, pub, gen)
        except SystemExit as exc:
            return {'ok': False, 'error': str(exc), 'scale': scale}
        sheet_bytes = (pub / 'sheet.png').stat().st_size
        mask_bytes = (pub / 'mask.png').stat().st_size
        with Image.open(pub / 'sheet.png') as im:
            sw, sh = im.size
        kb = (sheet_bytes + mask_bytes) / 1024.0
        mib = sw * sh * 4 * 2 / (2 ** 20)
        return {
            'ok': True,
            'scale': scale,
            'diskKb': round(kb, 1),
            'maxDiskKb': exporter.MAX_DISK_KB,
            'decodedMib': round(mib, 2),
            'maxDecodedMib': exporter.MAX_DECODED_MIB,
            'sheetSize': [sw, sh],
        }
