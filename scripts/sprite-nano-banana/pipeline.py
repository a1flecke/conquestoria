#!/usr/bin/env python3
"""Automated Nano Banana (Google Gemini) unit sprite production pipeline.

A second production pipeline beside the ChatGPT workflow (`scripts/sprite-puppet/strips.py`):
zero prompt copy-pasting, automated Nano Banana generation with visual style-reference parity,
automated security scanning / probing / rig calibration / retry self-healing, compact review
cards/GIF for in-Antigravity sign-off, and automated export + game/test/ledger wiring.

Agent-friendly two-stage workflow (minimal token use; human only signs off on images):
    ./scripts/sprite-nano-banana.sh status --json
    ./scripts/sprite-nano-banana.sh produce <unit> --stage master --json
      -> human reviews review-master.png inside Antigravity
    ./scripts/sprite-nano-banana.sh produce <unit> --stage set --json
      -> human reviews review-sheet.png + review-anim.gif inside Antigravity
    ./scripts/sprite-nano-banana.sh approve <unit> --json

Exit codes:
    0  success
    1  runtime / API / QC error
    2  usage / spec validation error
    3  missing Gemini authentication (set GEMINI_API_KEY or configure `gemini-api` CLI)
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import re
import shutil
import sys
from pathlib import Path

_HERE = str(Path(__file__).resolve().parent)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from PIL import Image

from nano_banana_client import (
    DEFAULT_MODEL,
    DEFAULT_VERTEX_MODEL,
    MODEL_ALIASES,
    NanoBananaAuthError,
    NanoBananaClient,
    NanoBananaError,
    ReferenceImage,
    resolve_image_size,
    resolve_model,
    resolve_vertex_model,
)
from prompts import (
    SheetJob,
    build_master_prompt,
    build_retry_feedback,
    build_sheet_prompt,
    list_sheet_jobs,
)
from qc import SheetQCResult, load_strips, preflight_export_check, validate_sheet
from review_cards import render_master_review_card, render_review_gif, render_set_review_card
from review_server import start_review_server
from style_ref import build_style_reference, pick_exemplar_id
from wiring import build_provenance_record, export_unit, wire_all_game_files, write_provenance

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TINT = {'hue_ranges': [[0, 0.045], [0.955, 1]], 'min_sat': 0.45, 'min_val': 0.18}


class SpecUsageError(ValueError):
    """Raised on missing/invalid unit specs or CLI arguments (maps to exit code 2)."""


def resolve_spec_path(spec_arg: str, repo_root: Path = REPO) -> Path:
    p = Path(spec_arg)
    if p.is_file():
        return p.resolve()
    rel = repo_root / spec_arg
    if rel.is_file():
        return rel.resolve()
    by_id = repo_root / 'scripts' / 'sprite-puppet' / 'strip-rigs' / f'{spec_arg}.json'
    if by_id.is_file():
        return by_id.resolve()
    raise SpecUsageError(
        f'Spec not found for "{spec_arg}". Pass a path to a strip-rig JSON or a unit id in '
        f'scripts/sprite-puppet/strip-rigs/<id>.json (or run `scaffold {spec_arg} --family ...` first).'
    )


def default_originals_dir(unit_id: str, override: str | None = None) -> Path:
    if override:
        base = Path(override).expanduser()
        return base if base.name == unit_id else base / unit_id
    env_dir = os.environ.get('SPRITE_ORIGINALS_DIR')
    if env_dir:
        return Path(env_dir).expanduser() / unit_id
    return Path.home() / 'conquestoria-art-originals' / 'strips' / unit_id


def _review_dir(unit_id: str, repo_root: Path) -> Path:
    d = repo_root / '.verification' / 'nano-banana' / unit_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _archive_rejected(target: Path, reason: str) -> Path:
    slug = re.sub(r'[^a-z0-9_-]+', '-', reason.lower()).strip('-') or 'retry'
    stem = target.stem
    n = 1
    while True:
        cand = target.with_name(f'{stem}-v{n}-{slug}.png')
        if not cand.exists():
            shutil.copy2(target, cand)
            return cand
        n += 1


def _load_existing_provenance(preview_dir: Path) -> dict:
    p = preview_dir / 'provenance.json'
    if p.is_file():
        try:
            return json.loads(p.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
    return {}


def _generate_one_sheet(
    client: NanoBananaClient | None,
    spec: dict,
    job: SheetJob,
    originals_dir: Path,
    *,
    max_retries: int,
    image_size_mode: str | None,
    style_ref: tuple[bytes, str] | None,
    theme_note: str | None,
    owner_note: str | None,
    master_tint: float | None,
    repo_root: Path,
    dry_run: bool = False,
) -> tuple[SheetQCResult | None, str, str, list[str]]:
    """Generate one sheet with automated scan/probe/calibrate/retry loop.

    Returns `(best_qc_result, final_prompt_used, resolved_image_size, regen_notes)`.
    """
    originals_dir.mkdir(parents=True, exist_ok=True)
    target = originals_dir / f'{job.file_key}.png'
    family = spec.get('family', 'biped')
    regen_notes: list[str] = []
    chosen_size = resolve_image_size(image_size_mode, cells=job.cells, grid=job.grid)

    refs: list[ReferenceImage] = []
    style_ref_id: str | None = None
    if job.is_master:
        if style_ref is not None:
            ref_bytes, style_ref_id = style_ref
            refs.append(ReferenceImage(
                data=ref_bytes,
                mime_type='image/png',
                label=f'STYLE REFERENCE ONLY (shipped unit "{style_ref_id}" — copy style/outlines/red-tint convention only, NOT the character):',
            ))
    else:
        master_path = originals_dir / 'a.png'
        if not master_path.is_file() and not dry_run:
            raise SpecUsageError(
                f'Master image {master_path} is required before generating {job.file_key}.png '
                '(run `--stage master` first).'
            )
        if master_path.is_file():
            refs.append(ReferenceImage.from_path(
                master_path,
                label=f'APPROVED MASTER DESIGN for {spec["prompt"]["name"]} (authoritative reference):',
            ))

    extra_feedback = f'- Owner review feedback: {owner_note.strip()}' if (owner_note and owner_note.strip()) else None
    best_result: SheetQCResult | None = None
    best_bytes: bytes | None = None
    best_prompt = ''

    attempts = max(1, max_retries + 1)
    qc_res: SheetQCResult | None = None
    for attempt in range(1, attempts + 1):
        prompt = (
            build_master_prompt(
                spec,
                template_dir=repo_root / 'scripts' / 'sprite-puppet' / 'strip-prompts',
                style_ref_id=style_ref_id,
                theme_note=theme_note,
                extra_feedback=extra_feedback,
            )
            if job.is_master
            else build_sheet_prompt(
                spec,
                job,
                template_dir=repo_root / 'scripts' / 'sprite-puppet' / 'strip-prompts',
                theme_note=theme_note,
                extra_feedback=extra_feedback,
            )
        )
        if dry_run:
            print(f'\n--- DRY RUN [{job.file_key}.png | {job.state} | aspect {job.aspect_ratio} | size {chosen_size} | refs {len(refs)}] ---')
            print(prompt)
            return None, prompt, chosen_size, []

        assert client is not None
        print(
            f'[{spec["id"]}] generating {job.file_key}.png ({job.state}, aspect {job.aspect_ratio}, '
            f'size {chosen_size}, backend {client.backend}, attempt {attempt}/{attempts})...'
        )
        gen = client.generate_image(
            prompt,
            references=refs,
            aspect_ratio=job.aspect_ratio,
            image_size=chosen_size,
        )
        if attempt == 1 and owner_note and target.is_file():
            archived = _archive_rejected(target, 'owner-regen')
            regen_notes.append(f'{job.file_key}: archived previous take as {archived.name} (owner note: {owner_note})')

        target.write_bytes(gen.png_bytes)
        qc_res = validate_sheet(
            spec,
            job.state_spec,
            target,
            is_master=job.is_master,
            master_tint=master_tint,
            repo_root=repo_root,
        )
        if qc_res.ok and not qc_res.retryable:
            print(f'  OK {job.file_key}.png (tint {qc_res.tint_fraction:.1%}, heights {qc_res.figure_heights})')
            return qc_res, prompt, chosen_size, regen_notes

        if qc_res.ok and (best_result is None or len(qc_res.warnings) < len(best_result.warnings)):
            best_result = qc_res
            best_bytes = gen.png_bytes
            best_prompt = prompt

        reason = qc_res.summary_reason()
        archived = _archive_rejected(target, reason)
        detail = '; '.join(f'{c}: {m}' for c, m in (qc_res.errors + qc_res.warnings))
        print(f'  RETRY {job.file_key}.png (attempt {attempt}, archived {archived.name}): {detail}')
        regen_notes.append(f'{job.file_key} attempt {attempt} rejected ({reason}, archived {archived.name})')

        if attempt < attempts:
            extra_feedback = build_retry_feedback(qc_res.retry_issues, job, family, owner_note=owner_note)

    if best_result is not None and best_bytes is not None:
        target.write_bytes(best_bytes)
        print(f'  KEPT best warning-only take for {job.file_key}.png: {best_result.warnings}')
        return best_result, best_prompt, chosen_size, regen_notes

    raise NanoBananaError(
        f'{spec["id"]}/{job.file_key}.png failed automated QC after {attempts} attempts '
        f'(last error: {qc_res.errors if qc_res is not None else "unknown"}).'
    )


def _calibrate_master_only(spec: dict, originals_dir: Path, repo_root: Path) -> Path | None:
    """Write a master-only `rig-review.png` during `--stage master` (before b.png exists)."""
    strips = load_strips(repo_root)
    strips.REPO = repo_root
    master_spec = {
        **spec,
        'states': [
            {
                **st,
                'rig': {**st['rig'], 'sources': ['a']},
            }
            if st.get('rig') and ('sources' in st['rig'] or st['rig'].get('source') == 'a')
            else st
            for st in spec.get('states', [])
            if st.get('file') == 'a' or st.get('rig')
        ],
    }
    strips.calibrate_command(master_spec, originals_dir)
    rig_img = repo_root / '.verification' / 'strips' / spec['id'] / 'rig-review.png'
    return rig_img if rig_img.is_file() else None


def rebuild_preview_and_provenance(
    spec_path: Path,
    spec: dict,
    jobs: list[SheetJob],
    originals_dir: Path,
    preview_dir: Path,
    *,
    model: str,
    sheet_prompts: dict[str, str],
    qc_results: dict[str, SheetQCResult],
    regenerations: list[str],
    style_ref_id: str | None = None,
    shipped: bool = False,
    repo_root: Path = REPO,
) -> dict:
    """Run `strips.py probe`, `strips.py calibrate`, `strips.py build`, and write `provenance.json`."""
    strips = load_strips(repo_root)
    strips.REPO = repo_root
    findings = strips.probe(spec, originals_dir)
    errors = [f for f in findings if f.level == 'error']
    for f in findings:
        print('  ' + f.line())
    if errors:
        raise NanoBananaError(f'{spec["id"]}: strips.py probe reported {len(errors)} error(s); refusing to build preview')

    strips.calibrate_command(spec, originals_dir)
    strips.build(spec_path, originals_dir, preview_dir)

    existing = _load_existing_provenance(preview_dir)
    merged_prompts = {**(existing.get('sheet_prompts') or {}), **sheet_prompts}
    scan_summaries = {k: list(v.scan_report.get('checks') or []) for k, v in qc_results.items()}
    record = build_provenance_record(
        spec,
        jobs,
        originals_dir,
        model=model,
        sheet_prompts=merged_prompts,
        scan_summaries=scan_summaries,
        regenerations=regenerations,
        shipped=shipped,
        style_ref_id=style_ref_id,
        existing=existing,
    )
    write_provenance(preview_dir, record)
    return record


def _compact_qc(qc_results: dict[str, SheetQCResult], sizes: dict[str, str]) -> dict:
    return {
        k: {
            'ok': v.ok,
            'tintPct': round(v.tint_fraction * 100.0, 1) if v.tint_fraction is not None else None,
            'imageSize': sizes.get(k),
            'errors': [f'{c}: {m}' for c, m in v.errors],
            'warnings': [f'{c}: {m}' for c, m in v.warnings],
        }
        for k, v in qc_results.items()
    }


def produce_unit(
    spec_path: Path,
    *,
    stage: str = 'all',
    model: str | None = None,
    vertex_model: str | None = None,
    backend: str | None = None,
    image_size: str | None = 'auto',
    max_retries: int = 3,
    style_ref_arg: str | None = None,
    theme_note: str | None = None,
    originals_override: str | None = None,
    preview_override: str | None = None,
    skip_existing: bool = False,
    only_files: list[str] | None = None,
    owner_note: str | None = None,
    dry_run: bool = False,
    repo_root: Path = REPO,
    api_key: str | None = None,
    base_url: str | None = None,
    vertex_base_url: str | None = None,
) -> dict:
    """Generate source sheets via Nano Banana, auto-validate, build review cards/preview, and write provenance.

    `stage`:
      - `'master'`: generate & QC only `a.png` + `review-master.png` (for cheap human sign-off before b..e)
      - `'set'`: keep existing approved `a.png`, generate `b..e`, build preview + `review-sheet.png` + `review-anim.gif`
      - `'all'`: generate all sheets (`a..e`) and build all review cards/GIF
    """
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    uid = spec['id']
    family = spec.get('family', 'biped')
    jobs = list_sheet_jobs(spec)
    originals_dir = default_originals_dir(uid, originals_override)
    preview_dir = Path(preview_override) if preview_override else repo_root / 'design' / 'png-sprites' / 'previews' / uid
    rev_dir = _review_dir(uid, repo_root)

    resolved_model = resolve_model(model)
    resolved_vertex_model = resolve_vertex_model(vertex_model)
    style_ref = build_style_reference(family, repo_root, style_ref=style_ref_arg, exclude_unit=uid)
    style_ref_id = style_ref[1] if style_ref else None
    exemplar_id = pick_exemplar_id(family, repo_root, exclude_unit=uid)
    parity_dir = (repo_root / 'design' / 'png-sprites' / 'previews' / exemplar_id) if exemplar_id else None

    if style_ref_id:
        print(f'[{uid}] style parity reference: {style_ref_id} ({family})')

    if stage == 'master':
        active_jobs = [j for j in jobs if j.is_master]
    else:
        active_jobs = jobs

    client = None if dry_run else NanoBananaClient(
        api_key=api_key,
        model=resolved_model,
        vertex_model=resolved_vertex_model,
        base_url=base_url,
        vertex_base_url=vertex_base_url,
        backend=backend,
    )
    sheet_prompts: dict[str, str] = {}
    qc_results: dict[str, SheetQCResult] = {}
    resolved_sizes: dict[str, str] = {}
    regenerations: list[str] = []
    master_tint: float | None = None

    for job in active_jobs:
        target = originals_dir / f'{job.file_key}.png'
        should_generate = True
        if only_files is not None:
            should_generate = job.file_key in only_files
        elif stage == 'set' and job.is_master:
            should_generate = False
        elif skip_existing and target.is_file():
            should_generate = False

        if should_generate:
            qc_res, prompt_text, chosen_size, notes = _generate_one_sheet(
                client,
                spec,
                job,
                originals_dir,
                max_retries=max_retries,
                image_size_mode=image_size,
                style_ref=style_ref,
                theme_note=theme_note,
                owner_note=owner_note if (only_files is None or job.file_key in only_files) else None,
                master_tint=master_tint,
                repo_root=repo_root,
                dry_run=dry_run,
            )
            sheet_prompts[job.file_key] = prompt_text
            resolved_sizes[job.file_key] = chosen_size
            regenerations.extend(notes)
            if qc_res is not None:
                qc_results[job.file_key] = qc_res
                if job.is_master:
                    master_tint = qc_res.tint_fraction
        elif not dry_run:
            if not target.is_file():
                raise SpecUsageError(
                    f'Missing source image {target} (run `--stage master` first before `--stage set`).'
                )
            qc_res = validate_sheet(
                spec,
                job.state_spec,
                target,
                is_master=job.is_master,
                master_tint=master_tint,
                repo_root=repo_root,
            )
            qc_results[job.file_key] = qc_res
            resolved_sizes[job.file_key] = 'existing'
            if job.is_master:
                master_tint = qc_res.tint_fraction

    if dry_run:
        return {
            'ok': True,
            'unitId': uid,
            'stage': stage,
            'dryRun': True,
            'sheets': [{'file': j.file_key, 'state': j.state, 'aspectRatio': j.aspect_ratio, 'imageSize': resolved_sizes.get(j.file_key)} for j in active_jobs],
        }

    # Always produce the compact master review card whenever a.png is present.
    active_backend = client.backend if client else 'dry-run'
    active_model = resolved_vertex_model if active_backend == 'vertex' else resolved_model
    failover_reason = client.failover_reason if client else None
    master_path = originals_dir / 'a.png'
    master_qc = qc_results.get('a')
    if stage == 'master':
        rig_review_path = _calibrate_master_only(spec, originals_dir, repo_root)
        master_card = render_master_review_card(
            spec,
            master_path,
            model=active_model,
            tint_fraction=master_qc.tint_fraction if master_qc else None,
            qc_ok=master_qc.ok if master_qc else True,
            warnings=master_qc.warnings if master_qc else [],
            rig_review_path=rig_review_path,
            parity_preview_dir=parity_dir,
            out_path=rev_dir / 'review-master.png',
            repo_root=repo_root,
        )
        # Save master prompt into draft provenance so `--stage set` preserves it verbatim.
        existing = _load_existing_provenance(preview_dir)
        merged_prompts = {**(existing.get('sheet_prompts') or {}), **sheet_prompts}
        prov = build_provenance_record(
            spec,
            active_jobs,
            originals_dir,
            model=active_model,
            sheet_prompts=merged_prompts,
            scan_summaries={'a': list(master_qc.scan_report.get('checks') or [])} if master_qc else {},
            regenerations=regenerations,
            shipped=False,
            style_ref_id=style_ref_id,
            existing=existing,
        )
        prov_path = write_provenance(preview_dir, prov)
        out_payload = {
            'ok': True,
            'unitId': uid,
            'stage': 'master',
            'model': active_model,
            'backend': active_backend,
            'styleRef': style_ref_id,
            'originalsDir': str(originals_dir),
            'provenancePath': str(prov_path),
            'reviewImages': {
                'master': str(master_card),
                'rigReview': str(rig_review_path) if rig_review_path else None,
            },
            'qc': _compact_qc(qc_results, resolved_sizes),
            'nextAction': (
                f'Show {master_card} to the user for master sign-off. If approved, run: '
                f'./scripts/sprite-nano-banana.sh produce {uid} --stage set --json'
            ),
        }
        if failover_reason:
            out_payload['failoverReason'] = failover_reason
        return out_payload

    # Full set or `--stage set`: probe, calibrate, build preview, preflight export, render review sheet + GIF.
    prov = rebuild_preview_and_provenance(
        spec_path,
        spec,
        jobs,
        originals_dir,
        preview_dir,
        model=active_model,
        sheet_prompts=sheet_prompts,
        qc_results=qc_results,
        regenerations=regenerations,
        style_ref_id=style_ref_id,
        shipped=False,
        repo_root=repo_root,
    )
    preflight = preflight_export_check(spec, preview_dir, repo_root=repo_root)
    rig_review_path = repo_root / '.verification' / 'strips' / uid / 'rig-review.png'

    master_card = render_master_review_card(
        spec,
        master_path,
        model=active_model,
        tint_fraction=master_qc.tint_fraction if master_qc else None,
        qc_ok=master_qc.ok if master_qc else True,
        warnings=master_qc.warnings if master_qc else [],
        rig_review_path=rig_review_path if rig_review_path.is_file() else None,
        parity_preview_dir=parity_dir,
        out_path=rev_dir / 'review-master.png',
        repo_root=repo_root,
    )
    set_card = render_set_review_card(
        spec,
        preview_dir,
        model=active_model,
        preflight=preflight,
        parity_preview_dir=parity_dir,
        out_path=rev_dir / 'review-sheet.png',
    )
    anim_gif = render_review_gif(
        spec,
        preview_dir,
        parity_preview_dir=parity_dir,
        out_path=rev_dir / 'review-anim.gif',
    )

    out_payload = {
        'ok': True,
        'unitId': uid,
        'stage': stage,
        'model': active_model,
        'backend': active_backend,
        'styleRef': style_ref_id,
        'previewDir': str(preview_dir),
        'originalsDir': str(originals_dir),
        'provenancePath': str(preview_dir / 'provenance.json'),
        'reviewImages': {
            'master': str(master_card),
            'sheet': str(set_card),
            'animGif': str(anim_gif),
            'rigReview': str(rig_review_path) if rig_review_path.is_file() else None,
        },
        'preflight': preflight,
        'qc': _compact_qc(qc_results, resolved_sizes),
        'regenerations': prov.get('regenerations'),
        'nextAction': (
            f'Show {set_card} (and {anim_gif}) to the user for sign-off. If approved, run: '
            f'./scripts/sprite-nano-banana.sh approve {uid} --json'
        ),
    }
    if failover_reason:
        out_payload['failoverReason'] = failover_reason
    return out_payload


def approve_unit(
    spec_path: Path,
    *,
    scale: float = 0.75,
    wire: bool = True,
    originals_override: str | None = None,
    preview_override: str | None = None,
    repo_root: Path = REPO,
) -> dict:
    """Export approved preview, finalize provenance, and optionally wire all game/test/ledger files."""
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    uid = spec['id']
    family = spec.get('family', 'biped')
    jobs = list_sheet_jobs(spec)
    originals_dir = default_originals_dir(uid, originals_override)
    preview_dir = Path(preview_override) if preview_override else repo_root / 'design' / 'png-sprites' / 'previews' / uid

    export_unit(spec, preview_dir, scale=scale, repo_root=repo_root)

    existing = _load_existing_provenance(preview_dir)
    if existing:
        existing['status'] = 'shipped: registered in STRIP_UNITS and exported with strips.py export (Nano Banana pipeline)'
        existing['signed_off_on'] = existing.get('signed_off_on') or build_provenance_record(
            spec, jobs, originals_dir, model=existing.get('model', DEFAULT_MODEL),
            sheet_prompts=existing.get('sheet_prompts') or {}, scan_summaries={}, regenerations=[], shipped=True,
        )['signed_off_on']
        write_provenance(preview_dir, existing)
    else:
        record = build_provenance_record(
            spec, jobs, originals_dir, model=resolve_model(None),
            sheet_prompts={}, scan_summaries={}, regenerations=[], shipped=True,
        )
        write_provenance(preview_dir, record)

    wiring_info = wire_all_game_files(uid, family, repo_root) if wire else {'touchedFiles': [], 'nanoBananaLedgerCount': None}
    msg = (
        f'Signed off and shipped "{uid}": exported public/images/units/{uid}/{{sheet,mask}}.png, '
        f'generated {uid}.manifest.ts, finalized provenance.json'
        + (f', and wired {len(wiring_info["touchedFiles"])} repo file(s).' if wire else ' (wiring skipped).')
    )
    print(msg)
    return {'ok': True, 'unitId': uid, 'message': msg, 'wiring': wiring_info}


def launch_signoff_studio(
    spec_path: Path,
    *,
    model: str | None = None,
    backend: str = 'auto',
    image_size: str | None = 'auto',
    max_retries: int = 3,
    style_ref_arg: str | None = None,
    theme_note: str | None = None,
    scale: float = 0.75,
    originals_override: str | None = None,
    preview_override: str | None = None,
    port: int = 0,
    open_browser: bool = True,
    repo_root: Path = REPO,
) -> dict:
    """Open the optional local browser Sign-Off Studio and block until the owner approves or closes."""
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    uid = spec['id']
    family = spec.get('family', 'biped')
    jobs = list_sheet_jobs(spec)
    originals_dir = default_originals_dir(uid, originals_override)
    preview_dir = Path(preview_override) if preview_override else repo_root / 'design' / 'png-sprites' / 'previews' / uid
    rig_review_path = repo_root / '.verification' / 'strips' / uid / 'rig-review.png'

    exemplar_id = pick_exemplar_id(family, repo_root, exclude_unit=uid)
    parity_dir = (repo_root / 'design' / 'png-sprites' / 'previews' / exemplar_id) if exemplar_id else None
    resolved_model = resolve_model(model)

    def _build_state() -> dict:
        manifest = json.loads((preview_dir / 'manifest.json').read_text(encoding='utf-8'))
        preflight = preflight_export_check(spec, preview_dir, scale=scale, repo_root=repo_root)
        master_tint: float | None = None
        sheets_info = []
        for job in jobs:
            img_path = originals_dir / f'{job.file_key}.png'
            size = None
            errs, warns, tint = [], [], None
            if img_path.is_file():
                with Image.open(img_path) as im:
                    size = [im.size[0], im.size[1]]
                q = validate_sheet(
                    spec, job.state_spec, img_path,
                    is_master=job.is_master, master_tint=master_tint, repo_root=repo_root,
                )
                errs, warns, tint = q.errors, q.warnings, q.tint_fraction
                if job.is_master:
                    master_tint = q.tint_fraction
            sheets_info.append({
                'file': job.file_key,
                'state': job.state,
                'role': job.role_label,
                'aspectRatio': job.aspect_ratio,
                'isMaster': job.is_master,
                'size': size,
                'tintFraction': tint,
                'errors': errs,
                'warnings': warns,
            })
        parity = None
        if parity_dir and (parity_dir / 'manifest.json').is_file():
            parity = {'unitId': exemplar_id, 'manifest': json.loads((parity_dir / 'manifest.json').read_text(encoding='utf-8'))}
        return {
            'unitId': uid,
            'unitName': (spec.get('prompt') or {}).get('name', uid),
            'family': family,
            'model': resolved_model,
            'originalsDir': str(originals_dir),
            'manifest': manifest,
            'preflight': preflight,
            'parity': parity,
            'hasRigReview': rig_review_path.is_file(),
            'sheets': sheets_info,
        }

    def _on_regenerate(file_key: str, note: str, cascade: bool) -> dict:
        valid_keys = [j.file_key for j in jobs]
        if file_key not in valid_keys:
            raise SpecUsageError(f'Unknown sheet "{file_key}" (expected one of {", ".join(valid_keys)})')
        targets = valid_keys if (file_key == 'a' and cascade) else [file_key]
        produce_unit(
            spec_path,
            stage='all',
            model=resolved_model,
            backend=backend,
            image_size=image_size,
            max_retries=max_retries,
            style_ref_arg=style_ref_arg,
            theme_note=theme_note,
            originals_override=str(originals_dir),
            preview_override=str(preview_dir),
            only_files=targets,
            owner_note=note,
            repo_root=repo_root,
        )
        return {'message': f'Regenerated {", ".join(f + ".png" for f in targets)} and rebuilt preview.'}

    def _on_approve(wire: bool) -> dict:
        return approve_unit(
            spec_path,
            scale=scale,
            wire=wire,
            originals_override=str(originals_dir),
            preview_override=str(preview_dir),
            repo_root=repo_root,
        )

    server, url, _, outcome = start_review_server(
        get_state=_build_state,
        preview_dir=preview_dir,
        originals_dir=originals_dir,
        rig_review_path=rig_review_path,
        parity_preview_dir=parity_dir,
        on_regenerate=_on_regenerate,
        on_approve=_on_approve,
        port=port,
        open_browser=open_browser,
    )
    print(f'\nSign-Off Studio running at: {url}')
    print('Inspect the animations, parity comparison, and source sheets, then click "Sign Off & Ship" (or Ctrl+C to exit).')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nReview closed by Ctrl+C.')
    finally:
        server.server_close()
    return {'ok': True, 'decision': outcome.decision, 'details': outcome.details}


def scaffold_spec(
    unit_id: str,
    family: str,
    *,
    theme: str | None = None,
    draft_with_gemini: bool = False,
    backend: str = 'auto',
    force: bool = False,
    repo_root: Path = REPO,
) -> Path:
    """Create a canonical `scripts/sprite-puppet/strip-rigs/<unit_id>.json` with exact family parity."""
    dest = repo_root / 'scripts' / 'sprite-puppet' / 'strip-rigs' / f'{unit_id}.json'
    if dest.exists() and not force:
        raise SpecUsageError(f'Spec already exists: {dest} (use --force to overwrite)')

    pretty = unit_id.replace('_', ' ').title()
    prompt_block: dict = {
        'name': pretty,
        'look': f'TODO: describe {pretty} in clean hand-painted historical 2D strategy style.',
        'team_area': 'his tunic' if family == 'biped' else 'the broad band along the hull side',
        'identity': f'the same {pretty.lower()} outfit, headgear, weapon, and red team-colour area',
        'damage_gear': 'scuffed armour and gear',
        'damage_gear_critical': 'cracked gear and torn cloth',
    }
    if theme:
        prompt_block['theme'] = theme

    if family == 'biped':
        prompt_block.update({
            'weapon_pose': 'He holds his weapon ready at chest height, completely above the garment hem and clear of the boots.',
            'attack_frames': 6,
            'attack': '(1) ready stance; (2) wind-up; (3) stepping forward; (4) full strike to the right; (5) follow-through; (6) back to ready.',
            'defeat_prop': 'his weapon still touching him at rest',
        })
        frame = {'height': 192, 'baseline': 176, 'restHeight': 140}
        states = [
            {'state': 'idle', 'file': 'a', 'cells': 1, 'fps': 4},
            {'state': 'damage', 'file': 'b', 'cells': 4, 'grid': [2, 2], 'fps': 1, 'loop': False, 'note': 'idle pose at damage tiers 0-3'},
            {
                'state': 'walkrig', 'cells': 8, 'fps': 10, 'anchor': 'torso',
                'note': 'walk built in code from the master and from each damage drawing; the legs alternate by construction',
                'rig': {'sources': ['a', 'b#0', 'b#1', 'b#2', 'b#3'], 'shafts': 0, 'stride_deg': 24, 'knee_bend': 14, 'foot_level': 0.7},
            },
            {'state': 'attack', 'file': 'c', 'cells': 6, 'grid': [3, 3], 'fps': 9, 'loop': False, 'restFrames': [0, 5]},
            {'state': 'hit', 'file': 'd', 'cells': 5, 'grid': [3, 2], 'fps': 8, 'restFrames': [0, 4], 'loop': False},
            {'state': 'defeat', 'file': 'e', 'cells': 5, 'grid': [3, 2], 'fps': 5, 'restFrames': [0], 'loop': False},
        ]
    elif family == 'mounted':
        prompt_block.update({
            'team_area': "the rider's tunic and the saddle cloth",
            'coat': 'The mount has a warm orange-chestnut or dapple-grey coat (never red-brown or mahogany, so it does not trigger the red team-colour key).',
            'weapon_pose': "He holds his weapon upright in his right hand, clear of the mount's knees.",
            'attack_frames': 6,
            'attack': '(1) ready; (2) raising weapon; (3) wind-up; (4) forward strike; (5) follow-through; (6) recover to ready.',
            'defeat_prop': 'his weapon touching him beside the resting mount',
        })
        frame = {'height': 192, 'baseline': 176, 'restHeight': 150}
        states = [
            {'state': 'idle', 'file': 'a', 'cells': 1, 'fps': 4, 'anchor': 'torso'},
            {'state': 'damage', 'file': 'b', 'cells': 4, 'grid': [2, 2], 'fps': 1, 'loop': False, 'anchor': 'torso'},
            {
                'state': 'walkrig', 'cells': 8, 'fps': 10, 'anchor': 'torso',
                'rig': {'kind': 'mounted', 'sources': ['a', 'b#0', 'b#1', 'b#2', 'b#3']},
            },
            {'state': 'attack', 'file': 'c', 'cells': 6, 'grid': [3, 3], 'fps': 9, 'loop': False, 'restFrames': [0, 5]},
            {'state': 'hit', 'file': 'd', 'cells': 4, 'grid': [2, 2], 'fps': 8, 'restFrames': [0, 3], 'loop': False},
            {'state': 'defeat', 'file': 'e', 'cells': 4, 'grid': [2, 2], 'fps': 5, 'restFrames': [0], 'loop': False},
        ]
    elif family == 'vehicle':
        prompt_block.update({
            'running_gear': 'Clear round wheels or caterpillar tracks resting level on one straight ground line.',
            'running_gear_check': 'wheels/tracks clearly drawn and level on one ground line',
        })
        frame = {'height': 192, 'baseline': 176, 'restHeight': 86}
        states = [
            {'state': 'idle', 'file': 'a', 'cells': 1, 'fps': 4},
            {'state': 'damage', 'file': 'b', 'cells': 4, 'grid': [2, 2], 'fps': 1, 'loop': False, 'restFrames': [0, 1]},
            {'state': 'move', 'cells': 8, 'fps': 12, 'rig': {'kind': 'vehicle', 'action': 'move', 'tread': {}, 'sources': ['a', 'b#0', 'b#1', 'b#2', 'b#3']}},
            {'state': 'fire', 'cells': 8, 'fps': 8, 'loop': False, 'rig': {'kind': 'vehicle', 'action': 'fire', 'source': 'a'}},
            {'state': 'hit', 'cells': 4, 'fps': 8, 'loop': False, 'rig': {'kind': 'vehicle', 'action': 'hit', 'source': 'a'}},
            {'state': 'wreck', 'file': 'c', 'cells': 3, 'fps': 4, 'loop': False, 'restFrames': [0]},
        ]
    elif family == 'naval':
        prompt_block.update({
            'running_gear': 'The hull sits above one perfectly straight horizontal waterline that is the bottom edge of the drawing, with bow pointing right.',
            'running_gear_check': 'masts/superstructure upright above a straight waterline',
        })
        frame = {'height': 192, 'baseline': 176, 'restHeight': 76}
        states = [
            {'state': 'idle', 'file': 'a', 'cells': 1, 'fps': 4},
            {'state': 'damage', 'file': 'b', 'cells': 4, 'grid': [2, 2], 'fps': 1, 'loop': False, 'restFrames': [0, 1]},
            {'state': 'move', 'cells': 8, 'fps': 12, 'rig': {'kind': 'naval', 'action': 'move', 'sources': ['a', 'b#0', 'b#1', 'b#2', 'b#3']}},
            {'state': 'fire', 'cells': 8, 'fps': 8, 'loop': False, 'rig': {'kind': 'naval', 'action': 'fire', 'source': 'a'}},
            {'state': 'hit', 'cells': 4, 'fps': 8, 'loop': False, 'rig': {'kind': 'naval', 'action': 'hit', 'source': 'a'}},
            {'state': 'sinking', 'file': 'c', 'cells': 3, 'fps': 4, 'loop': False, 'restFrames': [0]},
        ]
    elif family == 'aircraft':
        prompt_block.update({
            'team_area': 'the fuselage band and tail fin',
            'gear': 'Level flight, wings level, nothing hanging below except normal landing gear if applicable.',
        })
        frame = {'height': 192, 'baseline': 176, 'restHeight': 72}
        states = [
            {'state': 'idle', 'file': 'a', 'cells': 1, 'fps': 4},
            {'state': 'damage', 'file': 'b', 'cells': 4, 'grid': [2, 2], 'fps': 1, 'loop': False, 'restFrames': [0, 1]},
            {'state': 'move', 'cells': 8, 'fps': 12, 'rig': {'kind': 'flight', 'action': 'move', 'sources': ['a', 'b#0', 'b#1', 'b#2', 'b#3']}},
            {'state': 'fire', 'cells': 8, 'fps': 8, 'loop': False, 'rig': {'kind': 'flight', 'action': 'fire', 'source': 'a'}},
            {'state': 'hit', 'cells': 4, 'fps': 8, 'loop': False, 'rig': {'kind': 'flight', 'action': 'hit', 'source': 'a'}},
            {'state': 'down', 'file': 'c', 'cells': 3, 'fps': 4, 'loop': False, 'restFrames': [0]},
        ]
    else:
        raise SpecUsageError(f'Unknown family "{family}": choose biped, mounted, vehicle, naval, or aircraft')

    if draft_with_gemini:
        client = NanoBananaClient(backend=backend)
        draft_req = (
            f'Draft a JSON object filling every key of this Conquestoria unit sprite prompt block for unit "{unit_id}" '
            f'(family "{family}"{", theme: " + theme if theme else ""}). Keep the historical family-friendly 2D strategy '
            'style used by warrior.json and swordsman.json, ensure NO red-brown or red tones outside team_area, and return '
            f'ONLY valid JSON with keys: {json.dumps(list(prompt_block.keys()))}.'
        )
        drafted = json.loads(client.generate_text(draft_req))
        for k in prompt_block:
            if k in drafted and drafted[k]:
                prompt_block[k] = drafted[k]

    spec = {'id': unit_id, 'family': family, 'prompt': prompt_block, 'frame': frame, 'tint': DEFAULT_TINT, 'states': states}
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(spec, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {dest.relative_to(repo_root)}')
    return dest


def get_status(repo_root: Path = REPO) -> dict:
    catalog_text = (repo_root / 'src' / 'renderer' / 'sprites' / 'png' / 'png-sprite-catalog.ts').read_text(encoding='utf-8')
    m = re.search(r'const STRIP_UNITS: readonly PngUnitSprite\[\] = \[([^\]]*)\];', catalog_text)
    shipped = sorted(item.strip() for item in (m.group(1) if m else '').split(',') if item.strip())

    all_catalog = (repo_root / 'src' / 'renderer' / 'sprites' / 'sprite-catalog.ts').read_text(encoding='utf-8')
    unit_block = all_catalog.split('export const UNIT_SPRITE_CATALOG')[1].split('export const BUILDING_SPRITE_CATALOG')[0]
    all_units = sorted(set(re.findall(r'^\s+([a-z0-9_]+)\s*:', unit_block, re.M)))

    previews_dir = repo_root / 'design' / 'png-sprites' / 'previews'
    drafts = sorted(
        d.name for d in previews_dir.iterdir()
        if d.is_dir() and (d / 'manifest.json').is_file() and d.name not in shipped
    ) if previews_dir.is_dir() else []

    specs_dir = repo_root / 'scripts' / 'sprite-puppet' / 'strip-rigs'
    specs_ready = sorted(
        p.stem for p in specs_dir.glob('*.json') if p.stem not in shipped
    ) if specs_dir.is_dir() else []

    remaining = [u for u in all_units if u not in shipped]
    return {
        'ok': True,
        'shippedCount': len(shipped),
        'shipped': shipped,
        'awaitingSignOff': drafts,
        'specsReady': specs_ready,
        'remainingCount': len(remaining),
        'remaining': remaining,
    }


def status_command(repo_root: Path = REPO, *, as_json: bool = False) -> int:
    info = get_status(repo_root)
    if as_json:
        print(json.dumps(info))
        return 0
    print(f'Shipped strip units ({info["shippedCount"]}): {", ".join(info["shipped"])}')
    print(f'Previews awaiting sign-off ({len(info["awaitingSignOff"])}): {", ".join(info["awaitingSignOff"]) or "(none)"}')
    print(f'Unshipped specs ready to run ({len(info["specsReady"])}): {", ".join(info["specsReady"]) or "(none)"}')
    print(f'Remaining SVG-only units ({info["remainingCount"]}): {", ".join(info["remaining"])}')
    return 0


def _add_generation_flags(p: argparse.ArgumentParser) -> None:
    p.add_argument('--model', default=None, help=f'AI Studio model ID or alias ({", ".join(MODEL_ALIASES)}); default {DEFAULT_MODEL}')
    p.add_argument('--vertex-model', default=None, help=f'Vertex AI model ID or alias (default {DEFAULT_VERTEX_MODEL})')
    p.add_argument('--backend', choices=['auto', 'aistudio', 'vertex', 'rest', 'cli'], default=None, help='Backend: auto (AI Studio -> Vertex AI failover), aistudio, vertex, rest, or cli')
    p.add_argument('--image-size', default='auto', help='Output resolution: auto (1K for 1-4 figures, 2K for 5-6 figures), 1K, 2K, or 4K')
    p.add_argument('--max-retries', type=int, default=3, help='Max automated QC retries per sheet (default 3)')
    p.add_argument('--style-ref', default=None, help='Shipped unit id, PNG path, or "none" (default: auto family exemplar)')
    p.add_argument('--theme', default=None, help='Optional era/visual theme directive appended to prompts')
    p.add_argument('--originals', default=None, help='Directory for raw generated PNGs (default ~/conquestoria-art-originals/strips/<id>)')
    p.add_argument('--preview', default=None, help='Preview output directory (default design/png-sprites/previews/<id>)')
    p.add_argument('--skip-existing', action='store_true', help='Reuse existing PNGs in originals dir instead of regenerating them')
    p.add_argument('--dry-run', action='store_true', help='Print exact Nano Banana prompts and exit without calling the API')
    p.add_argument('--json', dest='as_json', action='store_true', help='Emit one compact JSON object on stdout (logs redirected to run.log)')


def _run_captured(as_json: bool, log_file: Path | None, fn):
    """When `--json` is enabled, route verbose progress prints to `log_file` so stdout is pure JSON."""
    if not as_json:
        return fn()
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            return fn()
    finally:
        if log_file is not None:
            log_file.parent.mkdir(parents=True, exist_ok=True)
            log_file.write_text(buf.getvalue(), encoding='utf-8')


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    p_run = sub.add_parser('run', help='Interactive browser flow: produce -> local Sign-Off Studio -> ship on click')
    p_run.add_argument('spec', help='Unit id (e.g. axeman) or path to strip-rig JSON')
    _add_generation_flags(p_run)
    p_run.add_argument('--scale', type=float, default=0.75, help='Export scale (default 0.75)')
    p_run.add_argument('--port', type=int, default=0, help='Local Sign-Off Studio port (default: ephemeral)')
    p_run.add_argument('--no-open', action='store_true', help='Do not auto-open the browser')

    p_prod = sub.add_parser('produce', help='Agent-friendly production: generate, auto-QC/retry, build compact review cards/GIF')
    p_prod.add_argument('spec', help='Unit id or path to strip-rig JSON')
    p_prod.add_argument('--stage', choices=['master', 'set', 'all'], default='all', help='Two-stage flow: master (a.png only), set (b..e from approved a.png), or all')
    _add_generation_flags(p_prod)

    p_regen = sub.add_parser('regenerate', help='Regenerate one sheet (with optional feedback note) and rebuild review card/preview')
    p_regen.add_argument('spec', help='Unit id or path to strip-rig JSON')
    p_regen.add_argument('file', help='Sheet file key to redraw (a, b, c, d, e...)')
    p_regen.add_argument('--note', default='', help='Optional owner visual feedback note')
    p_regen.add_argument('--cascade', action='store_true', help='When redrawing master "a", also redraw b..e from the new master')
    _add_generation_flags(p_regen)

    p_rev = sub.add_parser('review', help='Launch optional local browser Sign-Off Studio for an existing preview')
    p_rev.add_argument('spec', help='Unit id or path to strip-rig JSON')
    _add_generation_flags(p_rev)
    p_rev.add_argument('--scale', type=float, default=0.75, help='Export scale (default 0.75)')
    p_rev.add_argument('--port', type=int, default=0, help='Local Sign-Off Studio port (default: ephemeral)')
    p_rev.add_argument('--no-open', action='store_true', help='Do not auto-open the browser')

    p_app = sub.add_parser('approve', help='Sign off & ship: export, finalize provenance, and wire game/test/ledger files')
    p_app.add_argument('spec', help='Unit id or path to strip-rig JSON')
    p_app.add_argument('--scale', type=float, default=0.75, help='Export scale (default 0.75)')
    p_app.add_argument('--no-wire', action='store_true', help='Export + finalize provenance only')
    p_app.add_argument('--originals', default=None)
    p_app.add_argument('--preview', default=None)
    p_app.add_argument('--json', dest='as_json', action='store_true', help='Emit compact JSON on stdout')

    p_scaf = sub.add_parser('scaffold', help='Create a new strip-rig JSON spec with proper family actions and rig defaults')
    p_scaf.add_argument('unit_id', help='Unit id from src/core/types.ts (e.g. axeman, knight, galley)')
    p_scaf.add_argument('--family', required=True, choices=['biped', 'mounted', 'vehicle', 'naval', 'aircraft'])
    p_scaf.add_argument('--theme', default=None, help='Optional era/visual theme note stored in prompt.theme')
    p_scaf.add_argument('--draft', action='store_true', help='Use Gemini 4 Hydrogen to auto-draft prompt fields')
    p_scaf.add_argument('--backend', choices=['auto', 'aistudio', 'vertex', 'rest', 'cli'], default=None)
    p_scaf.add_argument('--force', action='store_true', help='Overwrite an existing spec')
    p_scaf.add_argument('--json', dest='as_json', action='store_true', help='Emit compact JSON on stdout')

    p_st = sub.add_parser('status', help='Show shipped units, previews awaiting sign-off, and remaining SVG-only units')
    p_st.add_argument('--json', dest='as_json', action='store_true', help='Emit compact JSON on stdout')

    args = ap.parse_args(argv)
    as_json = bool(getattr(args, 'as_json', False))

    def _emit_error(code: int, message: str) -> int:
        if as_json:
            print(json.dumps({'ok': False, 'exitCode': code, 'error': message}))
        else:
            print(f'ERROR: {message}', file=sys.stderr)
        return code

    try:
        if args.cmd == 'status':
            return status_command(REPO, as_json=as_json)

        if args.cmd == 'scaffold':
            log_path = _review_dir(args.unit_id, REPO) / 'scaffold.log'
            dest = _run_captured(
                as_json, log_path,
                lambda: scaffold_spec(
                    args.unit_id, args.family, theme=args.theme, draft_with_gemini=args.draft,
                    backend=args.backend, force=args.force, repo_root=REPO,
                ),
            )
            if as_json:
                print(json.dumps({
                    'ok': True, 'unitId': args.unit_id, 'family': args.family, 'specPath': str(dest),
                    'nextAction': f'./scripts/sprite-nano-banana.sh produce {args.unit_id} --stage master --json',
                }))
            return 0

        spec_path = resolve_spec_path(args.spec, REPO)
        spec_id = json.loads(spec_path.read_text(encoding='utf-8'))['id']
        log_path = _review_dir(spec_id, REPO) / 'run.log'

        if args.cmd == 'approve':
            res = _run_captured(
                as_json, log_path,
                lambda: approve_unit(
                    spec_path, scale=args.scale, wire=not args.no_wire,
                    originals_override=args.originals, preview_override=args.preview, repo_root=REPO,
                ),
            )
            if as_json:
                res['logPath'] = str(log_path)
                print(json.dumps(res))
            return 0

        if args.cmd == 'produce':
            res = _run_captured(
                as_json, log_path,
                lambda: produce_unit(
                    spec_path, stage=args.stage, model=args.model, vertex_model=args.vertex_model, backend=args.backend,
                    image_size=args.image_size, max_retries=args.max_retries, style_ref_arg=args.style_ref,
                    theme_note=args.theme, originals_override=args.originals, preview_override=args.preview,
                    skip_existing=args.skip_existing, dry_run=args.dry_run, repo_root=REPO,
                ),
            )
            if as_json:
                res['logPath'] = str(log_path)
                print(json.dumps(res))
            return 0

        if args.cmd == 'regenerate':
            spec = json.loads(spec_path.read_text(encoding='utf-8'))
            jobs = list_sheet_jobs(spec)
            keys = [j.file_key for j in jobs]
            if args.file not in keys:
                raise SpecUsageError(f'Unknown sheet "{args.file}" for {spec["id"]} (expected one of {", ".join(keys)})')
            orig_dir = default_originals_dir(spec_id, args.originals)
            has_full_set = all((orig_dir / f'{k}.png').is_file() for k in keys if k != 'a')
            if args.file == 'a' and not args.cascade and not has_full_set:
                stage_mode = 'master'
                targets = ['a']
            else:
                stage_mode = 'all'
                targets = keys if (args.file == 'a' and args.cascade) else [args.file]
            res = _run_captured(
                as_json, log_path,
                lambda: produce_unit(
                    spec_path, stage=stage_mode, model=args.model, vertex_model=args.vertex_model, backend=args.backend,
                    image_size=args.image_size, max_retries=args.max_retries, style_ref_arg=args.style_ref,
                    theme_note=args.theme, originals_override=args.originals, preview_override=args.preview,
                    only_files=targets, owner_note=args.note, dry_run=args.dry_run, repo_root=REPO,
                ),
            )
            if as_json:
                res['logPath'] = str(log_path)
                print(json.dumps(res))
            return 0

        if args.cmd == 'review':
            launch_signoff_studio(
                spec_path, model=args.model, backend=args.backend, image_size=args.image_size,
                max_retries=args.max_retries, style_ref_arg=args.style_ref, theme_note=args.theme,
                scale=args.scale, originals_override=args.originals, preview_override=args.preview,
                port=args.port, open_browser=not args.no_open, repo_root=REPO,
            )
            return 0

        # `run`: produce all -> launch browser Sign-Off Studio
        res = produce_unit(
            spec_path, stage='all', model=args.model, backend=args.backend, image_size=args.image_size,
            max_retries=args.max_retries, style_ref_arg=args.style_ref, theme_note=args.theme,
            originals_override=args.originals, preview_override=args.preview,
            skip_existing=args.skip_existing, dry_run=args.dry_run, repo_root=REPO,
        )
        if args.dry_run:
            return 0
        print(f'[{res["unitId"]}] preview built. Export preflight: {json.dumps(res["preflight"])}')
        launch_signoff_studio(
            spec_path, model=args.model, backend=args.backend, image_size=args.image_size,
            max_retries=args.max_retries, style_ref_arg=args.style_ref, theme_note=args.theme,
            scale=args.scale, originals_override=args.originals, preview_override=args.preview,
            port=args.port, open_browser=not args.no_open, repo_root=REPO,
        )
        return 0

    except NanoBananaAuthError as exc:
        return _emit_error(3, str(exc))
    except SpecUsageError as exc:
        return _emit_error(2, str(exc))
    except (NanoBananaError, ValueError) as exc:
        return _emit_error(1, str(exc))
    except SystemExit as exc:
        if isinstance(exc.code, int):
            return exc.code
        return _emit_error(1, str(exc.code))


if __name__ == '__main__':
    sys.exit(main())
