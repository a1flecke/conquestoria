#!/usr/bin/env python3
"""Compact visual review cards and animated GIF builder for in-Antigravity human sign-off.

Designed to minimize both agent vision-token usage and human review friction:
  - `review-master.png`: one compact image (~960px wide) showing the new master in 3 faction tints,
    side-by-side with a recent shipped family exemplar at identical scale, plus rig cut lines.
  - `review-sheet.png`: one compact contact sheet (~1120px wide) showing parity comparison, all 4
    damage tiers, 48px/72px readability checks, 4 faction swatches, and every action's keyframes.
  - `review-anim.gif`: a small looping animated GIF playing Walk -> Attack -> Hurt -> Defeat beside
    the recent shipped family exemplar so motion parity can be verified directly in Antigravity.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

_HERE = str(Path(__file__).resolve().parent)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from qc import load_strips

BG_BY_FAMILY: dict[str, tuple[int, int, int]] = {
    'biped': (143, 191, 106),
    'mounted': (143, 191, 106),
    'vehicle': (143, 191, 106),
    'naval': (61, 123, 179),
    'aircraft': (134, 191, 232),
}

FACTIONS: tuple[tuple[str, tuple[int, int, int]], ...] = (
    ('Blue', (0x1D, 0x4A, 0x8C)),
    ('Red', (0xB8, 0x25, 0x2A)),
    ('Gold', (0xC9, 0x97, 0x28)),
    ('Green', (0x2F, 0x7A, 0x3E)),
)

ROLE_LOOKUP: dict[str, tuple[str, ...]] = {
    'walk': ('walkrig', 'move', 'walk'),
    'attack': ('attack', 'fire'),
    'hurt': ('hit',),
    'death': ('defeat', 'wreck', 'sinking', 'down'),
    'work': ('work',),
}


def _tint_cell(sheet_cell: np.ndarray, mask_alpha: np.ndarray, rgb: tuple[int, int, int]) -> Image.Image:
    col = np.array(rgb, dtype=np.float32) / 255.0
    out = sheet_cell.copy()
    m = mask_alpha[..., None]
    out[..., :3] = out[..., :3] * (1.0 - m) + out[..., :3] * col * m
    u8 = (np.clip(out, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    return Image.fromarray(u8, 'RGBA')


def _extract_preview_frame(
    preview_dir: Path,
    state_name: str,
    col_idx: int,
    tint_rgb: tuple[int, int, int],
) -> tuple[Image.Image, dict] | None:
    man_path = preview_dir / 'manifest.json'
    if not man_path.is_file():
        return None
    man = json.loads(man_path.read_text(encoding='utf-8'))
    st = (man.get('states') or {}).get(state_name)
    if not st:
        return None
    cw, ch = int(man['cellWidth']), int(man['cellHeight'])
    row = int(st['row'])
    col = int(col_idx) % max(1, int(st['frames']))
    sheet = np.asarray(Image.open(preview_dir / 'sheet.png').convert('RGBA'), dtype=np.float32) / 255.0
    mask = np.asarray(Image.open(preview_dir / 'mask.png').convert('RGBA'), dtype=np.float32)[..., 3] / 255.0
    y0, y1 = row * ch, (row + 1) * ch
    x0, x1 = col * cw, (col + 1) * cw
    return _tint_cell(sheet[y0:y1, x0:x1], mask[y0:y1, x0:x1], tint_rgb), man


def _fit_sprite(img: Image.Image, box_w: int, box_h: int) -> Image.Image:
    bbox = img.getbbox()
    cropped = img.crop(bbox) if bbox else img
    scale = min((box_w - 16) / max(1, cropped.width), (box_h - 16) / max(1, cropped.height))
    nw = max(1, round(cropped.width * scale))
    nh = max(1, round(cropped.height * scale))
    return cropped.resize((nw, nh), Image.LANCZOS)


def _paste_grounded(canvas: Image.Image, sprite: Image.Image, cx: int, bottom_y: int) -> None:
    x = cx - sprite.width // 2
    y = bottom_y - sprite.height
    canvas.alpha_composite(sprite, (x, y))


def _draw_header(canvas: Image.Image, title: str, subtitle: str) -> None:
    d = ImageDraw.Draw(canvas)
    w = canvas.width
    d.rectangle((0, 0, w, 54), fill=(36, 31, 26, 255))
    d.text((14, 9), title, fill=(245, 238, 224, 255))
    d.text((14, 30), subtitle, fill=(195, 184, 164, 255))


def render_master_review_card(
    spec: dict,
    master_path: Path,
    *,
    model: str,
    tint_fraction: float | None,
    qc_ok: bool,
    warnings: list[tuple[str, str]],
    rig_review_path: Path | None,
    parity_preview_dir: Path | None,
    out_path: Path,
    repo_root: Path,
) -> Path:
    """Render one compact review card for Stage 1 (master `a.png`) sign-off in Antigravity."""
    strips = load_strips(repo_root)
    family = spec.get('family', 'biped')
    bg_rgb = BG_BY_FAMILY.get(family, (143, 191, 106))

    figs = strips.load_figures(master_path, 1)
    rgba_f, _ = strips.clean_rgba(*figs[0])
    u8 = (np.clip(rgba_f, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    key = spec['tint']
    mem = strips.puppet.tint_membership(u8, key)
    _, _, v = strips.puppet.rgb_to_hsv_arrays(rgba_f[..., :3])
    vref = float(np.percentile(v[mem > 0.5], 90)) if (mem > 0.5).any() else 0.75
    base, mask = strips.puppet.split_base_and_mask(u8, key, vref)
    mask_a = mask[..., 3]

    panels = 4 if (rig_review_path and rig_review_path.is_file()) else 3
    pw, ph = 230, 310
    pad = 14
    W = panels * pw + (panels + 1) * pad
    H = 54 + ph + 2 * pad + 26
    canvas = Image.new('RGBA', (W, H), (243, 239, 230, 255))
    d = ImageDraw.Draw(canvas)

    tint_str = f'{tint_fraction * 100:.1f}%' if tint_fraction is not None else 'n/a'
    warn_str = f' | {len(warnings)} warn' if warnings else ' | 0 warnings'
    status_str = 'QC PASS' if qc_ok else 'QC ISSUES'
    _draw_header(
        canvas,
        f'MASTER REVIEW: {spec["prompt"]["name"]} ({spec["id"]}) — {status_str}',
        f'Family: {family} | Model: {model} | Team tint: {tint_str}{warn_str} | Sign off master before generating b..e',
    )

    def _tile_rect(idx: int, label: str, fill_rgb: tuple[int, int, int] = bg_rgb) -> tuple[int, int, int, int]:
        x0 = pad + idx * (pw + pad)
        y0 = 54 + pad
        d.rectangle((x0, y0, x0 + pw, y0 + ph), fill=(*fill_rgb, 255), outline=(180, 170, 152, 255))
        d.rectangle((x0, y0 + ph, x0 + pw, y0 + ph + 24), fill=(255, 253, 248, 255), outline=(180, 170, 152, 255))
        d.text((x0 + 8, y0 + ph + 6), label, fill=(43, 38, 32, 255))
        return x0, y0, x0 + pw, y0 + ph

    # Tile 0: Blue tint (primary)
    x0, y0, _, y1 = _tile_rect(0, 'New Master (Rome Blue)')
    sp_blue = _fit_sprite(_tint_cell(base, mask_a, FACTIONS[0][1]), pw, ph - 12)
    _paste_grounded(canvas, sp_blue, x0 + pw // 2, y1 - 16)

    # Tile 1: Red + Gold tint verification (stacked side-by-side)
    x0, y0, _, y1 = _tile_rect(1, 'Tint Check (Red / Gold)')
    sp_red = _fit_sprite(_tint_cell(base, mask_a, FACTIONS[1][1]), pw // 2, ph - 40)
    sp_gold = _fit_sprite(_tint_cell(base, mask_a, FACTIONS[2][1]), pw // 2, ph - 40)
    _paste_grounded(canvas, sp_red, x0 + pw // 4, y1 - 24)
    _paste_grounded(canvas, sp_gold, x0 + (3 * pw) // 4, y1 - 24)

    # Tile 2: Parity vs shipped family exemplar
    ex_label = f'Parity vs {parity_preview_dir.name}' if parity_preview_dir else 'Size Check (48px / 72px)'
    x0, y0, _, y1 = _tile_rect(2, ex_label)
    if parity_preview_dir and (parity_preview_dir / 'manifest.json').is_file():
        ex_res = _extract_preview_frame(parity_preview_dir, 'idle', 0, FACTIONS[0][1])
        if ex_res is not None:
            ex_img, _ = ex_res
            left_sp = _fit_sprite(_tint_cell(base, mask_a, FACTIONS[0][1]), pw // 2, ph - 46)
            right_sp = _fit_sprite(ex_img, pw // 2, ph - 46)
            _paste_grounded(canvas, left_sp, x0 + pw // 4, y1 - 28)
            _paste_grounded(canvas, right_sp, x0 + (3 * pw) // 4, y1 - 28)
            d.text((x0 + 26, y1 - 18), 'NEW', fill=(25, 35, 20, 255))
            d.text((x0 + pw // 2 + 12, y1 - 18), parity_preview_dir.name.upper()[:10], fill=(25, 35, 20, 255))
    else:
        for idx_s, target_h in enumerate((48, 72)):
            s_img = _fit_sprite(_tint_cell(base, mask_a, FACTIONS[0][1]), pw // 2, target_h + 16)
            _paste_grounded(canvas, s_img, x0 + (idx_s * 2 + 1) * pw // 4, y1 - 24)

    # Tile 3: Rig calibration cut lines
    if panels == 4 and rig_review_path and rig_review_path.is_file():
        x0, y0, _, y1 = _tile_rect(3, 'Rig Cut Calibration', fill_rgb=(215, 215, 215))
        rig_im = Image.open(rig_review_path).convert('RGBA')
        # Crop first tile if rig-review contains multiple tiles horizontally
        if rig_im.width > rig_im.height * 1.4:
            rig_im = rig_im.crop((0, 0, min(rig_im.width, rig_im.height), rig_im.height))
        fitted = _fit_sprite(rig_im, pw, ph)
        _paste_grounded(canvas, fitted, x0 + pw // 2, y1 - 8)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(out_path, format='PNG', optimize=True)
    return out_path


def render_set_review_card(
    spec: dict,
    preview_dir: Path,
    *,
    model: str,
    preflight: dict,
    parity_preview_dir: Path | None,
    out_path: Path,
) -> Path:
    """Render one compact full-unit review contact sheet for final sign-off in Antigravity."""
    man = json.loads((preview_dir / 'manifest.json').read_text(encoding='utf-8'))
    states = man.get('states') or {}
    family = spec.get('family', 'biped')
    bg_rgb = BG_BY_FAMILY.get(family, (143, 191, 106))

    cw, ch = int(man['cellWidth']), int(man['cellHeight'])
    sheet = np.asarray(Image.open(preview_dir / 'sheet.png').convert('RGBA'), dtype=np.float32) / 255.0
    mask = np.asarray(Image.open(preview_dir / 'mask.png').convert('RGBA'), dtype=np.float32)[..., 3] / 255.0

    def get_cell(st_name: str, col: int, tint: tuple[int, int, int] = FACTIONS[0][1]) -> Image.Image:
        st = states[st_name]
        r = int(st['row'])
        c = col % max(1, int(st['frames']))
        return _tint_cell(sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], mask[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], tint)

    # Collect action strips to render in rows.
    action_rows: list[tuple[str, str, list[int]]] = []
    for role, candidates in ROLE_LOOKUP.items():
        st_name = next((c for c in candidates if c in states), None)
        if not st_name:
            continue
        n_frames = int(states[st_name]['frames'])
        if role == 'walk' and n_frames > 6:
            indices = [round(i * (n_frames - 1) / 5) for i in range(6)]
        else:
            indices = list(range(min(n_frames, 8)))
        action_rows.append((role.upper(), st_name, indices))

    W = 1120
    pad = 12
    top_row_h = 175
    act_row_h = 132
    H = 54 + pad + top_row_h + pad + len(action_rows) * (act_row_h + pad) + pad
    canvas = Image.new('RGBA', (W, H), (243, 239, 230, 255))
    d = ImageDraw.Draw(canvas)

    if preflight.get('ok'):
        budget = f'Export OK: {preflight["diskKb"]}/{preflight["maxDiskKb"]} KB, {preflight["decodedMib"]}/{preflight["maxDecodedMib"]} MiB'
    else:
        budget = f'EXPORT BLOCKED: {preflight.get("error", "unknown")}'
    _draw_header(
        canvas,
        f'FINAL SIGN-OFF SHEET: {spec["prompt"]["name"]} ({spec["id"]})',
        f'Family: {family} | Model: {model} | {budget}',
    )

    # --- Top row: Parity (left), 4 Damage Tiers (middle), 4 Faction Tints (right) ---
    y_top = 54 + pad
    # 1) Parity box
    bx0, bw = pad, 240
    d.rectangle((bx0, y_top, bx0 + bw, y_top + top_row_h), fill=(*bg_rgb, 255), outline=(170, 160, 142, 255))
    d.text((bx0 + 8, y_top + 6), 'Parity vs Shipped', fill=(25, 35, 20, 255))
    new_idle = _fit_sprite(get_cell('idle', 0), bw // 2, top_row_h - 38)
    _paste_grounded(canvas, new_idle, bx0 + bw // 4, y_top + top_row_h - 22)
    d.text((bx0 + 28, y_top + top_row_h - 16), 'NEW', fill=(25, 35, 20, 255))
    if parity_preview_dir and (parity_preview_dir / 'manifest.json').is_file():
        ex_res = _extract_preview_frame(parity_preview_dir, 'idle', 0, FACTIONS[0][1])
        if ex_res is not None:
            ex_sp = _fit_sprite(ex_res[0], bw // 2, top_row_h - 38)
            _paste_grounded(canvas, ex_sp, bx0 + (3 * bw) // 4, y_top + top_row_h - 22)
            d.text((bx0 + bw // 2 + 12, y_top + top_row_h - 16), parity_preview_dir.name[:12], fill=(25, 35, 20, 255))

    # 2) Damage tiers T0..T3
    tx0, tw = bx0 + bw + pad, 460
    d.rectangle((tx0, y_top, tx0 + tw, y_top + top_row_h), fill=(*bg_rgb, 255), outline=(170, 160, 142, 255))
    d.text((tx0 + 8, y_top + 6), 'Damage Tiers (T0 Healthy -> T3 Critical)', fill=(25, 35, 20, 255))
    if 'damage' in states:
        slot = tw // 4
        for t in range(min(4, int(states['damage']['frames']))):
            sp = _fit_sprite(get_cell('damage', t), slot, top_row_h - 38)
            _paste_grounded(canvas, sp, tx0 + t * slot + slot // 2, y_top + top_row_h - 22)
            d.text((tx0 + t * slot + slot // 2 - 8, y_top + top_row_h - 16), f'T{t}', fill=(25, 35, 20, 255))

    # 3) Faction tints (Blue, Red, Gold, Green)
    fx0 = tx0 + tw + pad
    fw = W - fx0 - pad
    d.rectangle((fx0, y_top, fx0 + fw, y_top + top_row_h), fill=(*bg_rgb, 255), outline=(170, 160, 142, 255))
    d.text((fx0 + 8, y_top + 6), 'Faction Colours', fill=(25, 35, 20, 255))
    fslot = fw // len(FACTIONS)
    for idx_f, (fname, frgb) in enumerate(FACTIONS):
        sp = _fit_sprite(get_cell('idle', 0, frgb), fslot, top_row_h - 38)
        _paste_grounded(canvas, sp, fx0 + idx_f * fslot + fslot // 2, y_top + top_row_h - 22)
        d.text((fx0 + idx_f * fslot + 14, y_top + top_row_h - 16), fname, fill=(25, 35, 20, 255))

    # --- Action rows ---
    y_cur = y_top + top_row_h + pad
    for label, st_name, indices in action_rows:
        d.rectangle((pad, y_cur, W - pad, y_cur + act_row_h), fill=(*bg_rgb, 255), outline=(170, 160, 142, 255))
        d.rectangle((pad, y_cur, pad + 115, y_cur + act_row_h), fill=(255, 253, 248, 255), outline=(170, 160, 142, 255))
        d.text((pad + 10, y_cur + 14), label, fill=(43, 38, 32, 255))
        d.text((pad + 10, y_cur + 34), f'({st_name})', fill=(109, 101, 86, 255))
        d.text((pad + 10, y_cur + 54), f'{states[st_name]["frames"]}f @ {states[st_name]["fps"]}fps', fill=(109, 101, 86, 255))

        area_x0 = pad + 120
        area_w = (W - pad) - area_x0
        slot = area_w // max(1, len(indices))
        for i, fi in enumerate(indices):
            sp = _fit_sprite(get_cell(st_name, fi), slot, act_row_h - 24)
            _paste_grounded(canvas, sp, area_x0 + i * slot + slot // 2, y_cur + act_row_h - 16)
            d.text((area_x0 + i * slot + 6, y_cur + act_row_h - 14), f'#{fi + 1}', fill=(25, 35, 20, 255))
        y_cur += act_row_h + pad

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(out_path, format='PNG', optimize=True)
    return out_path


def render_review_gif(
    spec: dict,
    preview_dir: Path,
    *,
    parity_preview_dir: Path | None,
    out_path: Path,
) -> Path:
    """Render a compact animated GIF playing Walk -> Attack -> Hurt -> Defeat beside the shipped exemplar."""
    man = json.loads((preview_dir / 'manifest.json').read_text(encoding='utf-8'))
    states = man.get('states') or {}
    family = spec.get('family', 'biped')
    bg_rgb = BG_BY_FAMILY.get(family, (143, 191, 106))

    cw, ch = int(man['cellWidth']), int(man['cellHeight'])
    base_y = int(man['baseline'])
    rest_h = float(man.get('restHeight') or 140)
    sheet = np.asarray(Image.open(preview_dir / 'sheet.png').convert('RGBA'), dtype=np.float32) / 255.0
    mask = np.asarray(Image.open(preview_dir / 'mask.png').convert('RGBA'), dtype=np.float32)[..., 3] / 255.0

    ex_man = ex_sheet = ex_mask = None
    ex_walk = None
    if parity_preview_dir and (parity_preview_dir / 'manifest.json').is_file():
        ex_man = json.loads((parity_preview_dir / 'manifest.json').read_text(encoding='utf-8'))
        ex_sheet = np.asarray(Image.open(parity_preview_dir / 'sheet.png').convert('RGBA'), dtype=np.float32) / 255.0
        ex_mask = np.asarray(Image.open(parity_preview_dir / 'mask.png').convert('RGBA'), dtype=np.float32)[..., 3] / 255.0
        ex_walk = next((c for c in ROLE_LOOKUP['walk'] if c in ex_man['states']), 'idle')

    W, H = 460, 220
    scale = 110.0 / max(1.0, rest_h)
    ground_y = 186

    sequence: list[tuple[str, str, int, int]] = []  # (label, state_name, frame_idx, duration_ms)
    for role in ('walk', 'attack', 'hurt', 'death'):
        st_name = next((c for c in ROLE_LOOKUP[role] if c in states), None)
        if not st_name:
            continue
        n = int(states[st_name]['frames'])
        fps = max(1.0, float(states[st_name].get('fps') or 8))
        dur = max(70, min(260, round(1000.0 / fps)))
        for fi in range(n):
            sequence.append((role.upper(), st_name, fi, dur))
        # Brief hold on last frame of one-shots
        if role != 'walk' and n > 0:
            sequence.append((role.upper(), st_name, n - 1, 350))

    if not sequence:
        sequence.append(('IDLE', 'idle', 0, 400))

    frames: list[Image.Image] = []
    durations: list[int] = []
    for tick, (label, st_name, fi, dur) in enumerate(sequence):
        frame = Image.new('RGBA', (W, H), (*bg_rgb, 255))
        d = ImageDraw.Draw(frame)
        d.rectangle((0, 0, W, 28), fill=(36, 31, 26, 255))
        d.text((10, 7), f'{spec["id"]} — {label}', fill=(245, 238, 224, 255))
        if ex_man:
            d.text((W - 180, 7), f'vs {ex_man["id"]} (shipped)', fill=(195, 184, 164, 255))

        st = states[st_name]
        r = int(st['row'])
        c = fi % max(1, int(st['frames']))
        cell = _tint_cell(sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], mask[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], FACTIONS[0][1])
        sw, sh = max(1, round(cw * scale)), max(1, round(ch * scale))
        scaled = cell.resize((sw, sh), Image.LANCZOS)
        left_cx = 135 if ex_man else W // 2
        frame.alpha_composite(scaled, (left_cx - sw // 2, ground_y - round(base_y * scale)))

        if ex_man and ex_sheet is not None and ex_mask is not None and ex_walk:
            ecw, ech = int(ex_man['cellWidth']), int(ex_man['cellHeight'])
            ebase = int(ex_man['baseline'])
            escale = 110.0 / max(1.0, float(ex_man.get('restHeight') or 140))
            est = ex_man['states'][ex_walk]
            er = int(est['row'])
            ec = tick % max(1, int(est['frames']))
            ecell = _tint_cell(
                ex_sheet[er * ech:(er + 1) * ech, ec * ecw:(ec + 1) * ecw],
                ex_mask[er * ech:(er + 1) * ech, ec * ecw:(ec + 1) * ecw],
                FACTIONS[0][1],
            )
            esw, esh = max(1, round(ecw * escale)), max(1, round(ech * escale))
            escaled = ecell.resize((esw, esh), Image.LANCZOS)
            frame.alpha_composite(escaled, (335 - esw // 2, ground_y - round(ebase * escale)))

        frames.append(frame.convert('P', palette=Image.Palette.ADAPTIVE, colors=128))
        durations.append(dur)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        out_path,
        format='GIF',
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    return out_path
