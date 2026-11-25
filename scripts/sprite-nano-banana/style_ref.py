#!/usr/bin/env python3
"""Style-reference generator for visual parity with recent shipped Conquestoria strip sprites.

Because downloaded raw originals are never committed to the repo, this builds a clean in-memory
style reference PNG from an already-approved preview under `design/png-sprites/previews/<id>/`:
it takes idle frame 0 from `sheet.png` + `mask.png`, restores pure red (#E01010) onto the masked
team-colour region, and composites the sprite onto a flat #FF00FF magenta canvas.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]

# Recent shipped strip sprites per family (newest, highest-parity exemplars first).
FAMILY_STYLE_EXEMPLARS: dict[str, tuple[str, ...]] = {
    'biped': ('warrior', 'swordsman', 'paratrooper', 'infantry', 'spearman', 'archer'),
    'mounted': ('horseman', 'cavalry'),
    'vehicle': ('mechanized_infantry', 'tank', 'cannon', 'artillery'),
    'naval': ('ironclad', 'pre_dreadnought', 'submarine'),
    'aircraft': ('biplane', 'observation_balloon'),
}

TEAM_RED_RGB = np.array([0xE0, 0x10, 0x10], dtype=np.float32) / 255.0
MAGENTA_RGBA = (255, 0, 255, 255)


def pick_exemplar_id(
    family: str,
    repo_root: Path = REPO,
    *,
    preferred_id: str | None = None,
    exclude_unit: str | None = None,
) -> str | None:
    previews_dir = repo_root / 'design' / 'png-sprites' / 'previews'
    candidates: list[str] = []
    if preferred_id:
        candidates.append(preferred_id)
    candidates.extend(FAMILY_STYLE_EXEMPLARS.get(family, ()))
    # Fall back to any shipped preview of the same family if custom repo layout.
    if previews_dir.is_dir():
        for child in sorted(previews_dir.iterdir()):
            if child.is_dir() and child.name not in candidates:
                man_path = child / 'manifest.json'
                if man_path.is_file():
                    try:
                        if json.loads(man_path.read_text()).get('family') == family:
                            candidates.append(child.name)
                    except (OSError, ValueError):
                        pass
    for uid in candidates:
        if uid == exclude_unit:
            continue
        p = previews_dir / uid
        if (p / 'sheet.png').is_file() and (p / 'mask.png').is_file() and (p / 'manifest.json').is_file():
            return uid
    return None


def render_style_reference_png(preview_dir: Path, target_height: int = 512) -> bytes:
    """Reconstruct idle frame 0 with pure red (#E01010) team colour on flat #FF00FF magenta."""
    manifest = json.loads((preview_dir / 'manifest.json').read_text())
    cw, ch = int(manifest['cellWidth']), int(manifest['cellHeight'])
    idle_row = int((manifest.get('states') or {}).get('idle', {}).get('row', 0))

    sheet = np.asarray(Image.open(preview_dir / 'sheet.png').convert('RGBA'), dtype=np.float32) / 255.0
    mask = np.asarray(Image.open(preview_dir / 'mask.png').convert('RGBA'), dtype=np.float32) / 255.0

    y0, y1 = idle_row * ch, (idle_row + 1) * ch
    cell = sheet[y0:y1, 0:cw].copy()
    malpha = mask[y0:y1, 0:cw, 3:4]

    # Restore saturated pure red (#E01010) on the team-colour mask using the same multiply model the game uses.
    cell[..., :3] = cell[..., :3] * (1.0 - malpha) + cell[..., :3] * TEAM_RED_RGB * malpha

    # Crop tightly to opaque figure pixels.
    alpha_mask = cell[..., 3] > 0.15
    ys, xs = np.where(alpha_mask)
    if len(xs) == 0:
        raise ValueError(f'preview {preview_dir} idle frame 0 is empty')
    crop = cell[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1]
    u8 = (np.clip(crop, 0.0, 1.0) * 255 + 0.5).astype(np.uint8)
    sprite = Image.fromarray(u8, 'RGBA')

    # Scale cleanly so the style exemplar is crisp for multimodal conditioning, with ~15% magenta margin.
    scale = target_height / max(1, sprite.height)
    nw = max(1, round(sprite.width * scale))
    nh = max(1, round(sprite.height * scale))
    scaled = sprite.resize((nw, nh), Image.LANCZOS)

    pad = max(32, round(max(nw, nh) * 0.16))
    canvas = Image.new('RGBA', (nw + 2 * pad, nh + 2 * pad), MAGENTA_RGBA)
    canvas.alpha_composite(scaled, (pad, pad))

    out = io.BytesIO()
    canvas.convert('RGB').save(out, format='PNG', optimize=True)
    return out.getvalue()


def build_style_reference(
    family: str,
    repo_root: Path = REPO,
    *,
    style_ref: str | None = None,
    exclude_unit: str | None = None,
) -> tuple[bytes, str] | None:
    """Resolve a style reference as `(png_bytes, label)`.

    `style_ref` may be `'none'` (disable), a path to an existing PNG file, or a shipped unit id.
    When omitted, automatically picks the most recent shipped exemplar for `family`.
    """
    if style_ref is not None:
        cleaned = style_ref.strip()
        if cleaned.lower() in ('none', 'off', 'false'):
            return None
        as_path = Path(cleaned)
        if as_path.is_file():
            return as_path.read_bytes(), as_path.stem
        exemplar = pick_exemplar_id(family, repo_root, preferred_id=cleaned, exclude_unit=exclude_unit)
    else:
        exemplar = pick_exemplar_id(family, repo_root, exclude_unit=exclude_unit)

    if not exemplar:
        return None
    preview_dir = repo_root / 'design' / 'png-sprites' / 'previews' / exemplar
    return render_style_reference_png(preview_dir), exemplar
