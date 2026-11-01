"""strips_export: turn an approved strip preview (`strips.py build`) into the files the game plays (#1627).

    python3 -I scripts/sprite-puppet/strips.py export scripts/sprite-puppet/strip-rigs/spearman.json [--scale 0.75]

The preview sheet holds every row the viewer shows: the drawn walk, the master walk, every tier, and so on. The game plays a
subset, so this repacks it:

  row 0        the standing pose at each damage tier (idle frame 0, then column 1..3 of the damage row)
  next rows    the walk, one row per damage tier when the preview has tiers (else one row, used at every tier)
  then         attack, hurt and death: one-shots, one row each

then scales every cell, quantises the sheet to a 256-colour palette (no dither), writes the mask as grey + alpha, and writes
`src/renderer/sprites/png/generated/<id>.manifest.ts` as a `PngUnitSprite`. It refuses, naming the unit and row, rather than
ship something the game would draw wrongly: a missing role, a one-shot longer than the game's hold for it, a rest-pose row
anchored differently from the idle pose, a rest pose that reaches outside the unit box, or a sheet over the size budget.
Nothing is written unless every check passes.

Dependencies: Python 3.11+, Pillow, numpy (dev-time only).
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

# Mirrored from the game; tests/scripts/sprite-strips-export.test.ts fails if either drifts.
HOLD_SECONDS = {'attack': 1.5, 'hurt': 0.7, 'death': 1.2}  # ATTACK/HURT/DEATH_STATE_MS in src/renderer/pirate-sprite-state.ts
FEET_LINE = 0.8  # PNG_STRIP_FEET_LINE in src/renderer/sprites/png/png-sprite-layout.ts

# The preview state each game role is built from; the first one the unit has wins.
GAME_ROLES = {
    'walk': ('walkrig', 'move', 'walk'),
    'attack': ('attack', 'fire'),
    'hurt': ('hit',),
    'death': ('defeat', 'wreck', 'sinking', 'down'),
}

MAX_DISK_KB = 640
MAX_DECODED_MIB = 24
CENTRE_TOLERANCE_PX = 12  # exported pixels; a walk swings its legs, so this is looser than the one-shots would need
COLOUR_ERROR_LIMIT = 32  # 99th percentile, 0..255, on opaque pixels after palette quantisation
ALPHA_ERROR_LIMIT = 48
TIERS = 4


def _fail(uid: str, message: str) -> None:
    raise SystemExit(f'{uid}: {message}')


def _resize(cell: np.ndarray, w: int, h: int) -> np.ndarray:
    """Lanczos resize of a straight-alpha float RGBA cell, done on premultiplied colour so edges do not darken."""
    a = cell.copy()
    a[..., :3] *= a[..., 3:4]
    chans = [np.asarray(Image.fromarray(a[..., c]).resize((w, h), Image.LANCZOS)) for c in range(4)]
    out = np.dstack(chans)
    alpha = np.clip(out[..., 3:4], 1e-6, 1.0)
    out[..., :3] = np.clip(out[..., :3] / alpha, 0.0, 1.0)
    out[..., 3] = np.clip(out[..., 3], 0.0, 1.0)
    return out


def _resize_alpha(cell: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.clip(np.asarray(Image.fromarray(cell).resize((w, h), Image.LANCZOS)), 0.0, 1.0)


def _bbox(alpha: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(alpha > 0.5)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1


def export(
    spec: dict,
    preview: Path,
    scale: float,
    public_dir: Path,
    generated_dir: Path,
    max_kb: float = MAX_DISK_KB,
    max_mib: float = MAX_DECODED_MIB,
) -> None:
    uid = spec['id']
    man = json.loads((preview / 'manifest.json').read_text())
    W, H = int(man['cellWidth']), int(man['cellHeight'])
    states: dict = man['states']
    tiers: dict = man.get('tiers', {})
    sheet = np.asarray(Image.open(preview / 'sheet.png').convert('RGBA'), dtype=np.float32) / 255.0
    mask = np.asarray(Image.open(preview / 'mask.png').convert('RGBA'), dtype=np.float32)[..., 3] / 255.0

    def role(name: str) -> str:
        for candidate in GAME_ROLES[name]:
            if candidate in states:
                return candidate
        _fail(uid, f'no {name} row: the preview has none of {", ".join(GAME_ROLES[name])}')
        raise AssertionError  # unreachable

    def row_frames(state: str) -> list[tuple[int, int]]:
        return [(states[state]['row'], c) for c in range(states[state]['frames'])]

    for needed in ('idle', 'damage'):
        if needed not in states:
            _fail(uid, f'no {needed} row in the preview')
    if states['damage']['frames'] < TIERS:
        _fail(uid, f'the damage row has {states["damage"]["frames"]} frames, the game needs {TIERS} (one per tier)')

    # --- which preview rows the game plays, in sheet order
    rows: list[dict] = [{
        'name': 'poses',
        'src': [(states['idle']['row'], 0)] + [(states['damage']['row'], t) for t in range(1, TIERS)],
        'fps': states['idle']['fps'], 'loop': True,
    }]
    walk = role('walk')
    group = tiers.get(walk) or []
    walk_names = [group[t + len(group) - TIERS] for t in range(TIERS)] if len(group) >= TIERS else [walk] * TIERS
    walk_index: dict[str, int] = {}
    for name in walk_names:
        if name not in walk_index:
            walk_index[name] = len(rows)
            rows.append({'name': name, 'src': row_frames(name), 'fps': states[name]['fps'], 'loop': True})
    shots: dict[str, int] = {}
    for kind in ('attack', 'hurt', 'death'):
        state = role(kind)
        frames, fps = states[state]['frames'], states[state]['fps']
        if fps <= 0 or frames / fps > HOLD_SECONDS[kind]:
            _fail(uid, f'{state} ({kind}) lasts {frames / max(fps, 1e-9):.2f}s ({frames} frames at {fps} fps); the game holds it '
                       f'for {HOLD_SECONDS[kind]}s, so it would be cut off. Fewer frames or a higher fps')
        shots[kind] = len(rows)
        rows.append({'name': state, 'src': row_frames(state), 'fps': fps, 'loop': False})

    # --- scale every cell
    W2, H2 = round(W * scale), round(H * scale)
    cols = max(len(r['src']) for r in rows)
    out = np.zeros((len(rows) * H2, cols * W2, 4), np.float32)
    mout = np.zeros((len(rows) * H2, cols * W2), np.float32)
    for ri, r in enumerate(rows):
        for ci, (srow, scol) in enumerate(r['src']):
            ys, xs = slice(srow * H, (srow + 1) * H), slice(scol * W, (scol + 1) * W)
            out[ri * H2:(ri + 1) * H2, ci * W2:(ci + 1) * W2] = _resize(sheet[ys, xs], W2, H2)
            mout[ri * H2:(ri + 1) * H2, ci * W2:(ci + 1) * W2] = _resize_alpha(mask[ys, xs], W2, H2)
    baseline = round(float(man['baseline']) * scale, 2)

    # --- the rest-pose rows (standing poses and the walk) must sit where the idle pose does, inside the unit box
    def cell(ri: int, ci: int) -> np.ndarray:
        return out[ri * H2:(ri + 1) * H2, ci * W2:(ci + 1) * W2, 3]

    idle_box = _bbox(cell(0, 0))
    if idle_box is None:
        _fail(uid, 'the idle pose is empty')
    idle_centre = (idle_box[0] + idle_box[1]) / 2
    if abs(idle_centre - W2 / 2) > CENTRE_TOLERANCE_PX:
        _fail(uid, f'the idle pose is centred {idle_centre - W2 / 2:+.0f}px from the middle of its cell (limit {CENTRE_TOLERANCE_PX}); '
                   f'the rows built in code are centred in theirs, so the unit would jump when it starts to move. '
                   f'Anchor the idle pose on its bounding box in strips.py build')
    top_limit = baseline - FEET_LINE * H2  # a pixel above this row would sit above the unit box
    for ri, r in enumerate(rows):
        if r['name'] not in ('poses', *walk_index):
            continue
        for ci in range(len(r['src'])):
            box = _bbox(cell(ri, ci))
            if box is None:
                _fail(uid, f'{r["name"]} frame {ci} is empty')
            delta = (box[0] + box[1]) / 2 - idle_centre
            if abs(delta) > CENTRE_TOLERANCE_PX:
                _fail(uid, f'{r["name"]} frame {ci} is centred {delta:+.0f}px from the idle pose (limit {CENTRE_TOLERANCE_PX}); '
                           f'it was built on a different anchor, so the unit would jump when it starts to move')
            if box[2] < top_limit or box[0] < W2 / 2 - H2 / 2 or box[1] > W2 / 2 + H2 / 2:
                _fail(uid, f'{r["name"]} frame {ci} reaches outside the unit box (x {box[0]}..{box[1]} of {W2}, top {box[2]}, '
                           f'limit {top_limit:.0f}); lower --scale or redraw it smaller')

    # --- encode, then check the budget before anything is written
    rgba = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
    rgba[rgba[..., 3] == 0] = 0
    quant = Image.fromarray(rgba, 'RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    back = np.asarray(quant.convert('RGBA')).astype(np.int32)
    opaque = rgba[..., 3] >= 128
    colour_err = float(np.percentile(np.abs(back[..., :3] - rgba[..., :3].astype(np.int32))[opaque], 99))
    alpha_err = float(np.percentile(np.abs(back[..., 3] - rgba[..., 3].astype(np.int32)), 99))
    if colour_err > COLOUR_ERROR_LIMIT or alpha_err > ALPHA_ERROR_LIMIT:
        _fail(uid, f'palette quantisation is too lossy (99th percentile colour error {colour_err:.0f}, alpha {alpha_err:.0f})')
    sheet_png, mask_png = io.BytesIO(), io.BytesIO()
    quant.save(sheet_png, format='PNG', optimize=True)
    m8 = (np.clip(mout, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.merge('LA', (Image.new('L', (cols * W2, len(rows) * H2), 255), Image.fromarray(m8))).save(mask_png, format='PNG', optimize=True)
    kb = (sheet_png.tell() + mask_png.tell()) / 1024
    mib = cols * W2 * len(rows) * H2 * 4 * 2 / 2 ** 20
    if kb > max_kb:
        _fail(uid, f'sheet and mask are {kb:.0f} KB on disk; the budget is {max_kb:.0f} KB. Lower --scale or drop frames')
    if mib > max_mib:
        _fail(uid, f'the decoded sheets would take {mib:.1f} MiB; the budget is {max_mib:.0f} MiB. Lower --scale or drop frames')

    # --- write
    def clip(row: int, first: int, frames: int, fps: float, loop: bool) -> dict:
        return {'row': row, 'firstCol': first, 'frames': frames, 'fps': fps, 'loop': loop}

    by_row = {r['name']: (i, r) for i, r in enumerate(rows)}
    clips = {
        'idle': [clip(0, t, 1, rows[0]['fps'], True) for t in range(TIERS)],
        'walk': [clip(by_row[n][0], 0, len(by_row[n][1]['src']), by_row[n][1]['fps'], True) for n in walk_names],
    }
    for kind, index in shots.items():
        r = rows[index]
        clips[kind] = [clip(index, 0, len(r['src']), r['fps'], False)] * TIERS
    sprite = {
        'id': uid, 'cellWidth': W2, 'cellHeight': H2, 'cols': cols, 'rows': len(rows), 'baseline': baseline, 'clips': clips,
        'sheet': f'images/units/{uid}/sheet.png', 'mask': f'images/units/{uid}/mask.png', 'facing': man.get('facing', 'right'),
    }
    public_dir.mkdir(parents=True, exist_ok=True)
    generated_dir.mkdir(parents=True, exist_ok=True)
    (public_dir / 'sheet.png').write_bytes(sheet_png.getvalue())
    (public_dir / 'mask.png').write_bytes(mask_png.getvalue())
    (generated_dir / f'{uid}.manifest.ts').write_text(
        '// Auto-generated by scripts/sprite-puppet/strips.py export — do not edit manually.\n'
        f'// Source: design/png-sprites/previews/{uid}/ (spec scripts/sprite-puppet/strip-rigs/{uid}.json). '
        f'Re-run: python3 -I scripts/sprite-puppet/strips.py export scripts/sprite-puppet/strip-rigs/{uid}.json\n'
        "import type { PngUnitSprite } from '../png-sprite-types';\n\n"
        f'export const sprite: PngUnitSprite = {json.dumps(sprite, indent=2)};\n')
    for i, r in enumerate(rows):
        print(f'  row {i}: {r["name"]:9s} {len(r["src"])} frames{"" if r["loop"] else "  (once)"}')
    print(f'{uid}: {cols}x{len(rows)} cells of {W2}x{H2}px at scale {scale}, {kb:.0f} KB on disk '
          f'(budget {max_kb:.0f}), {mib:.1f} MiB decoded (budget {max_mib:.0f}), '
          f'palette error p99 colour {colour_err:.0f} alpha {alpha_err:.0f}')
