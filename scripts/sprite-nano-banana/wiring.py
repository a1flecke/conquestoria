#!/usr/bin/env python3
"""Post-sign-off provenance, export, and idempotent game/test/ledger wiring for Nano Banana strips.

Every edit function is idempotent and scoped to a given `repo_root` so automated tests can run
the entire shipping sequence against a temporary copy of the repository files.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

_HERE = str(Path(__file__).resolve().parent)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from prompts import SheetJob
from qc import load_strips_export

REPO = Path(__file__).resolve().parents[2]
LEDGER_FAMILY = 'Nano Banana (unit strips)'


def _today_iso() -> str:
    return dt.date.today().isoformat()


def _sha256_and_size(path: Path) -> tuple[str, list[int]]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    with Image.open(path) as im:
        size = [int(im.size[0]), int(im.size[1])]
    return digest, size


def build_provenance_record(
    spec: dict,
    jobs: list[SheetJob],
    originals_dir: Path,
    *,
    model: str,
    sheet_prompts: dict[str, str],
    scan_summaries: dict[str, list[str]],
    regenerations: list[str],
    shipped: bool = False,
    style_ref_id: str | None = None,
    existing: dict | None = None,
) -> dict:
    """Build a `design/png-sprites/previews/<id>/provenance.json` matching every repo test."""
    uid = spec['id']
    today = _today_iso()
    originals: list[dict] = []
    for job in jobs:
        img_path = originals_dir / f'{job.file_key}.png'
        if not img_path.is_file():
            continue
        digest, size = _sha256_and_size(img_path)
        originals.append({
            'role': job.role_label,
            'file': job.file_key,
            'size': size,
            'sha256': digest,
        })

    clam_ran = any(
        any('ClamAV: clean' in c for c in checks) for checks in scan_summaries.values()
    )
    scan_note = (
        f'python3 -I scripts/portrait-pixelate/portrait_pixelate.py scan: all {len(originals)} passed '
        '(PNG magic bytes, nothing after the image stream, clean decode, one frame). '
        + ('ClamAV: clean.' if clam_ran else 'ClamAV was not installed, so only the structural checks ran.')
    )

    style_phrase = (
        f' Style-reference exemplar: {style_ref_id} (reconstructed idle frame 0 with pure red #E01010 on #FF00FF).'
        if style_ref_id
        else ''
    )
    prompts_summary = (
        f'Generated directly via Google Gemini Nano Banana ({model}) from scripts/sprite-puppet/strip-rigs/{uid}.json '
        f'using scripts/sprite-nano-banana/pipeline.py. Master (a.png) was generated first on flat #FF00FF magenta '
        f'with pure red (#E01010) restricted to the designated team-colour area.{style_phrase} '
        'Each subsequent sheet (damage, attack/hit/defeat or wreck/sinking/down) was generated in an independent '
        'single-image call with a.png attached as the sole authoritative reference. Exact per-sheet prompts are '
        'captured verbatim in sheet_prompts below.'
    )

    status = (
        'shipped: registered in STRIP_UNITS and exported with strips.py export (Nano Banana pipeline)'
        if shipped
        else 'draft preview: awaiting owner sign-off (not shipped, not registered in STRIP_UNITS)'
    )

    record: dict = {
        'id': uid,
        'status': status,
        'generator': f'Nano Banana (Google Gemini {model}, project owner)',
        'model': model,
        'generated_on': (existing or {}).get('generated_on') or today,
        'prompts': prompts_summary,
        'sheet_prompts': sheet_prompts,
        'licence_note': (
            "Covered by the project's non-commercial posture (docs/asset-rights-ledger.md). "
            f"Generated via the project owner's Gemini API key using Nano Banana ({model}); "
            f"counted in the ledger family '{LEDGER_FAMILY}' once shipped."
        ),
        'originals_committed': False,
        'originals_note': (
            f'The generated originals are not committed (kept under ~/conquestoria-art-originals/strips/{uid}). '
            'Only the re-encoded sheet.png and mask.png are committed, built by scripts/sprite-puppet/strips.py '
            'from decoded pixels (no EXIF/XMP/ICC or C2PA survives; Google SynthID watermark applies to model output).'
        ),
        'scan': scan_note,
        'regenerations': '; '.join(regenerations) if regenerations else 'None: every sheet passed QC on its first draw.',
        'originals': originals,
    }
    if shipped:
        record['signed_off_on'] = today
    return record


def write_provenance(preview_dir: Path, record: dict) -> Path:
    preview_dir.mkdir(parents=True, exist_ok=True)
    path = preview_dir / 'provenance.json'
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return path


def export_unit(spec: dict, preview_dir: Path, *, scale: float = 0.75, repo_root: Path = REPO) -> None:
    """Run the canonical `strips_export.export` into `public/images/units/<id>` and `src/renderer/sprites/png/generated/`."""
    exporter = load_strips_export(repo_root)
    uid = spec['id']
    exporter.export(
        spec,
        preview_dir,
        scale,
        repo_root / 'public' / 'images' / 'units' / uid,
        repo_root / 'src' / 'renderer' / 'sprites' / 'png' / 'generated',
    )


def wire_png_sprite_catalog(unit_id: str, repo_root: Path = REPO) -> bool:
    """Idempotently register `unit_id` in `src/renderer/sprites/png/png-sprite-catalog.ts`."""
    path = repo_root / 'src' / 'renderer' / 'sprites' / 'png' / 'png-sprite-catalog.ts'
    text = path.read_text(encoding='utf-8')
    changed = False

    import_line = f"import {{ sprite as {unit_id} }} from './generated/{unit_id}.manifest';"
    if import_line not in text:
        # Insert after the last generated manifest import.
        matches = list(re.finditer(r"^import \{ sprite as \w+ \} from '\./generated/[^']+';\r?$", text, re.M))
        if not matches:
            raise ValueError(f'Could not find generated manifest imports in {path}')
        pos = matches[-1].end()
        text = text[:pos] + '\n' + import_line + text[pos:]
        changed = True

    arr_match = re.search(r'(const STRIP_UNITS: readonly PngUnitSprite\[\] = \[)([^\]]*)(\];)', text)
    if not arr_match:
        raise ValueError(f'Could not find STRIP_UNITS array in {path}')
    items = [item.strip() for item in arr_match.group(2).split(',') if item.strip()]
    if unit_id not in items:
        items.append(unit_id)
        items.sort()
        replacement = f'{arr_match.group(1)}{", ".join(items)}{arr_match.group(3)}'
        text = text[:arr_match.start()] + replacement + text[arr_match.end():]
        changed = True

    if changed:
        path.write_text(text, encoding='utf-8')
    return changed


def _find_two_free_hexes(showcase_block: str, family: str) -> tuple[tuple[int, int], tuple[int, int]]:
    used: set[tuple[int, int]] = set()
    for m in re.finditer(r'position:\s*\{\s*q:\s*(-?\d+),\s*r:\s*(-?\d+)\s*\}', showcase_block):
        used.add((int(m.group(1)), int(m.group(2))))

    rows = [3, 8, 9, 10] if family == 'naval' else [5, 6, 7, 8, 9, 10]
    found: list[tuple[int, int]] = []
    for r in rows:
        q_start = 4 if (family == 'naval' and r == 3) else 0
        for q in range(q_start, 15):
            if (q, r) not in used:
                found.append((q, r))
                used.add((q, r))
                if len(found) == 2:
                    return found[0], found[1]
    raise ValueError('No free hex coordinates available in strip-units-showcase')


def wire_showcase_scenario(unit_id: str, family: str, repo_root: Path = REPO) -> bool:
    """Idempotently add healthy + 30-HP `unit_id` to `strip-units-showcase` in `src/testing/scenarios.ts`."""
    path = repo_root / 'src' / 'testing' / 'scenarios.ts'
    text = path.read_text(encoding='utf-8')
    slug = unit_id.replace('_', '-')
    if f"id: 'showcase-{slug}'" in text:
        return False

    start = text.find("'strip-units-showcase':")
    if start < 0:
        raise ValueError(f"Could not find 'strip-units-showcase' in {path}")
    anchor = "      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },"
    end = text.find(anchor, start)
    if end < 0:
        raise ValueError(f'Could not find diplomacy anchor inside strip-units-showcase in {path}')

    block = text[start:end]
    (q1, r1), (q2, r2) = _find_two_free_hexes(block, family)
    terrain = 'ocean' if family == 'naval' else 'plains'
    insertion = (
        f"      {{ kind: 'terrain', position: {{ q: {q1}, r: {r1} }}, terrain: '{terrain}' }},\n"
        f"      {{ kind: 'unit', civId: 'player', type: '{unit_id}', position: {{ q: {q1}, r: {r1} }}, "
        f"overrides: {{ id: 'showcase-{slug}' }} }},\n"
        f"      {{ kind: 'terrain', position: {{ q: {q2}, r: {r2} }}, terrain: '{terrain}' }},\n"
        f"      {{ kind: 'unit', civId: 'player', type: '{unit_id}', position: {{ q: {q2}, r: {r2} }}, "
        f"overrides: {{ id: 'showcase-{slug}-hurt', health: 30 }} }},\n"
    )
    path.write_text(text[:end] + insertion + text[end:], encoding='utf-8')
    return True


def wire_scenarios_test(unit_id: str, repo_root: Path = REPO) -> bool:
    """Idempotently add the `strip-units-showcase` unit assertion in `tests/testing/scenarios.test.ts`."""
    path = repo_root / 'tests' / 'testing' / 'scenarios.test.ts'
    text = path.read_text(encoding='utf-8')
    slug = unit_id.replace('_', '-')
    if f"showcase-{slug}" in text:
        return False

    label = unit_id.replace('_', ' ')
    anchor = "  it('places a player observation balloon so the strip e2e can find its root'"
    pos = text.find(anchor)
    if pos < 0:
        # Fallback: insert right before the final `});` of the file.
        pos = text.rfind('});')
        if pos < 0:
            raise ValueError(f'Could not find insertion anchor in {path}')

    snippet = (
        f"  it('places a player {label} at full health and a wounded one so the strip e2e can find their roots', () => {{\n"
        f"    const state = buildScenario(SCENARIOS['strip-units-showcase']);\n"
        f"    expect(state.units['showcase-{slug}']).toMatchObject({{ type: '{unit_id}', owner: 'player', health: 100 }});\n"
        f"    expect(state.units['showcase-{slug}-hurt']).toMatchObject({{ type: '{unit_id}', owner: 'player', health: 30 }});\n"
        f"  }});\n\n"
    )
    path.write_text(text[:pos] + snippet + text[pos:], encoding='utf-8')
    return True


def wire_strip_e2e_spec(unit_id: str, repo_root: Path = REPO) -> bool:
    """Idempotently append `unit_id` to both unit arrays in `tests/e2e/issue-1627-strip-units.spec.ts`."""
    path = repo_root / 'tests' / 'e2e' / 'issue-1627-strip-units.spec.ts'
    text = path.read_text(encoding='utf-8')
    changed = False

    def _add_to_array(m: re.Match) -> str:
        nonlocal changed
        inner = m.group(2)
        if f"'{unit_id}'" in inner:
            return m.group(0)
        changed = True
        return f"{m.group(1)}{inner}, '{unit_id}'{m.group(3)}"

    updated = re.sub(r"(for \(const unit of \[)([^\]]+)(\]\))", _add_to_array, text)
    if changed:
        path.write_text(updated, encoding='utf-8')
    return changed


def count_shipped_nano_banana_units(repo_root: Path = REPO) -> int:
    """Count shipped strip units in `STRIP_UNITS` whose provenance generator starts with 'Nano Banana'."""
    catalog = (repo_root / 'src' / 'renderer' / 'sprites' / 'png' / 'png-sprite-catalog.ts').read_text(encoding='utf-8')
    arr_match = re.search(r'const STRIP_UNITS: readonly PngUnitSprite\[\] = \[([^\]]*)\];', catalog)
    if not arr_match:
        return 0
    ids = [item.strip() for item in arr_match.group(1).split(',') if item.strip()]
    count = 0
    for uid in ids:
        prov_path = repo_root / 'design' / 'png-sprites' / 'previews' / uid / 'provenance.json'
        if not prov_path.is_file():
            continue
        prov = json.loads(prov_path.read_text(encoding='utf-8'))
        if str(prov.get('generator', '')).startswith('Nano Banana'):
            count += 1
    return count


def update_asset_rights_ledger(repo_root: Path = REPO) -> tuple[bool, int]:
    """Sync the `Nano Banana (unit strips)` row count in `docs/asset-rights-ledger.md`."""
    path = repo_root / 'docs' / 'asset-rights-ledger.md'
    text = path.read_text(encoding='utf-8')
    count = count_shipped_nano_banana_units(repo_root)
    pattern = re.compile(r'^(\|\s*Nano Banana \(unit strips\)\s*\|\s*)(\d+)(\s*\|.*)$', re.M)
    m = pattern.search(text)
    if not m:
        raise ValueError(f'Ledger row "| {LEDGER_FAMILY} |" not found in {path}')
    if int(m.group(2)) == count:
        return False, count
    updated = text[:m.start()] + f'{m.group(1)}{count}{m.group(3)}' + text[m.end():]
    path.write_text(updated, encoding='utf-8')
    return True, count


def wire_all_game_files(unit_id: str, family: str, repo_root: Path = REPO) -> dict:
    """Run all post-export game, test, and asset-rights-ledger wiring idempotently."""
    touched: list[str] = []
    if wire_png_sprite_catalog(unit_id, repo_root):
        touched.append('src/renderer/sprites/png/png-sprite-catalog.ts')
    if wire_showcase_scenario(unit_id, family, repo_root):
        touched.append('src/testing/scenarios.ts')
    if wire_scenarios_test(unit_id, repo_root):
        touched.append('tests/testing/scenarios.test.ts')
    if wire_strip_e2e_spec(unit_id, repo_root):
        touched.append('tests/e2e/issue-1627-strip-units.spec.ts')
    ledger_changed, nb_count = update_asset_rights_ledger(repo_root)
    if ledger_changed:
        touched.append('docs/asset-rights-ledger.md')
    return {'touchedFiles': touched, 'nanoBananaLedgerCount': nb_count}
