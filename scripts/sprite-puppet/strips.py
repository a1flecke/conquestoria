#!/usr/bin/env python3
"""strips: PROTOTYPE intake for AI-generated animation strips (not wired into the game).

    python3 -I scripts/sprite-puppet/strips.py build scripts/sprite-puppet/strip-rigs/spearman.json --sources <dir>

puppet.py animates ONE painted still with a rig. This is the other way round: the art already contains the frames (an
image generator drew a walk cycle, an attack, damage tiers ...), so the tool only has to *cut, normalise and pack* them:

  1. find the figures: from the alpha channel when the image has real transparency, otherwise by keying out a flat magenta
     field. One connected component is one frame, so strips and grids (rows of frames) both work and cell borders are
     never trusted,
  2. give every frame of a strip one scale (from its upright rest frames, or, for a strip with none, from the area of the
     steel shield and spear head matched to another strip), anchored to the master idle,
  3. put every frame's boots on one baseline and its anchor on one vertical line,
  4. split the red cloth into a civ-tint mask with the same keying puppet.py uses,
  5. pack frames into a sheet + mask sheet and write a manifest the preview page (or a future player) reads.

Cells are W x H (not square): a spear thrust is wider than a standing figure is tall. The game's player and manifest type
assume square cells today; see design/png-sprites/previews/spearman/README.md for what that means.

Dependencies: Python 3.11+, Pillow, numpy, scipy (dev-time only).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REPO = Path(__file__).resolve().parents[2]


def _load_puppet():
    spec = importlib.util.spec_from_file_location('puppet', REPO / 'scripts' / 'sprite-puppet' / 'puppet.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


puppet = _load_puppet()


def field_mask(rgb: np.ndarray) -> np.ndarray:
    """True where a pixel is the flat magenta field. The generator's magenta is close to, not exactly, #FF00FF."""
    a = rgb.astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 150) & (b > 150) & (g < 130) & (np.abs(r - b) < 70)


def find_source(sources: Path, name: str) -> Path:
    for suffix in ('', '.png', '.bin'):
        p = sources / (name + suffix)
        if p.is_file():
            return p
    raise SystemExit(f'source image "{name}" not found in {sources} (tried {name}, {name}.png, {name}.bin)')


def load_figures(path: Path, expected: int, grid: list[int] | None = None):
    """Return [(rgb, mask, (x0, y0, x1, y1))] for the `expected` figures in the image, in reading order.

    `grid` lists how many figures sit in each row, top to bottom (e.g. [4, 4]); without it the figures are ordered left to
    right. Real transparency is used when the image has it (the generator's own cut-out, where a faint glow can sit at
    alpha <= 20, so only strongly opaque pixels count); a flat magenta field is keyed out otherwise.
    """
    rgba = np.array(Image.open(path).convert('RGBA'))
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    if (alpha < 250).mean() > 0.2:
        fig = ndi.binary_opening(alpha >= 200, iterations=1)
    else:
        fig = ndi.binary_opening(~field_mask(rgb), iterations=2)
    labels, n = ndi.label(fig)
    if n == 0:
        raise SystemExit(f'{path.name}: no figure found')
    areas = ndi.sum(fig, labels, range(1, n + 1))
    order = np.argsort(areas)[::-1]
    if len(order) < expected:
        raise SystemExit(f'{path.name}: expected {expected} figures, found {len(order)}')
    if len(order) > expected and areas[order[expected]] > 0.02 * areas[order[expected - 1]]:
        raise SystemExit(f'{path.name}: expected {expected} figures but a {areas[order[expected]]:.0f}px piece is left over '
                         '(figures touching, or a detached part)')
    figures = []
    for i in order[:expected]:
        m = labels == int(i) + 1
        ys, xs = np.where(m)
        figures.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, m))
    if grid:
        if sum(grid) != expected:
            raise SystemExit(f'{path.name}: grid {grid} does not add up to {expected} figures')
        figures.sort(key=lambda f: (f[1] + f[3]) / 2)
        ordered, at = [], 0
        for count in grid:
            row = sorted(figures[at:at + count], key=lambda f: (f[0] + f[2]) / 2)
            ordered.extend(row)
            at += count
        figures = ordered
    else:
        figures.sort(key=lambda f: (f[0] + f[2]) / 2)
    h, w = alpha.shape
    for x0, y0, x1, y1, _ in figures:
        if x0 <= 0 or y0 <= 0 or x1 >= w or y1 >= h:
            print(f'  note: {path.name} has a figure touching the image edge (it may be cut off): box {x0},{y0},{x1},{y1}')
    return [(rgb, m, (x0, y0, x1, y1)) for x0, y0, x1, y1, m in figures]


def clean_rgba(rgb: np.ndarray, m: np.ndarray, box) -> tuple[np.ndarray, np.ndarray]:
    """RGBA float crop with the background spill removed: edge colours are replaced by the nearest interior colour."""
    x0, y0, x1, y1 = box
    inner = ndi.binary_erosion(m, iterations=2)
    idx = ndi.distance_transform_edt(~inner, return_indices=True)[1]
    filled = rgb[idx[0], idx[1]]
    alpha = ndi.gaussian_filter(m.astype(np.float32), 0.8)
    alpha = np.where(m, np.maximum(alpha, 0.0), alpha)
    rgba = np.dstack([filled.astype(np.float32) / 255.0, alpha])[y0:y1, x0:x1]
    return rgba, m[y0:y1, x0:x1]


def steel_area(rgba: np.ndarray, m: np.ndarray) -> int:
    """Pixels of grey metal (shield rim and boss, spear head): a size reference that is the same in every pose."""
    rgb = rgba[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    return int((m & (sat < 0.22) & (mx > 0.22) & (mx < 0.9)).sum())


def anchor_x(mask: np.ndarray, how: str) -> float:
    """Horizontal anchor of a frame: the boots ('feet'), the whole body ('mass') or the torso ('torso').

    'torso' (the band between 30% and 60% of the figure's height) keeps the body still while the legs swing, which is what a
    walk in place needs; 'feet' lets the body lunge or stagger while the boots stay planted, which suits an attack."""
    if how == 'mass':
        xs = np.where(mask)[1]
        return float(xs.mean())
    if how == 'torso':
        h = mask.shape[0]
        band = mask[int(h * 0.30):int(h * 0.60)]
        xs = np.where(band)[1]
        return float(xs.mean()) if xs.size else mask.shape[1] / 2
    h = mask.shape[0]
    band = mask[int(h * 0.90):]
    xs = np.where(band)[1]
    return float(xs.mean()) if xs.size else mask.shape[1] / 2


def scale_premult(img: np.ndarray, scale: float) -> np.ndarray:
    a = img.copy()
    a[..., :3] *= a[..., 3:4]
    h, w = a.shape[:2]
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    chans = [np.array(Image.fromarray(a[..., c]).resize((nw, nh), Image.LANCZOS)) for c in range(4)]
    small = np.dstack(chans)
    al = np.clip(small[..., 3:4], 1e-6, 1)
    small[..., :3] = np.clip(small[..., :3] / al, 0, 1)
    return small


def paste(cell: np.ndarray, small: np.ndarray, ox: int, oy: int) -> None:
    h, w = small.shape[:2]
    H, W = cell.shape[:2]
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(W, ox + w), min(H, oy + h)
    if x1 > x0 and y1 > y0:
        cell[y0:y1, x0:x1] = small[y0 - oy:y1 - oy, x0 - ox:x1 - ox]


class LegRig:
    """A walk built in code from the idle drawing, for when drawn frames do not alternate their legs.

    A generated walk cycle often draws the second step as a copy of the first, so the same leg leads every time (a "gallop
    shuffle"). This rig cannot: it cuts the idle figure into body and two legs below `cut_y` (plus the spear shaft, which
    stays with the body) and swings the two legs in opposite directions about one shared hip line, lifting each foot as it
    swings forward. Rigid legs, no knee bend, so it is plainer than a drawn walk. Keys (source pixels): cut_y (just below
    the hem, where there are exactly three pieces: shaft, back leg, front leg), overlap_top (top of the band of body pixels
    each leg carries so the join stays closed), hip_y, stride_deg, lift (px a swinging foot rises), bob (px the body drops
    at each contact).
    """

    def __init__(self, rgba: np.ndarray, rig: dict):
        H, W = rgba.shape[:2]
        alpha = rgba[..., 3] > 40
        self.cut_y, self.hip_y = rig['cut_y'], rig['hip_y']
        self.stride, self.lift, self.bob = rig.get('stride_deg', 20.0), rig.get('lift', 36.0), rig.get('bob', 14.0)
        self.cv = puppet.Canvas((W, H), int(max(W, H) * 0.14))
        low = alpha.copy()
        low[:self.cut_y, :] = False
        lab, n = ndi.label(low)
        comps = []
        for i in range(1, n + 1):
            m = lab == i
            if m.sum() > 300:
                xs = np.where(m.any(0))[0]
                comps.append({'mask': m, 'x0': int(xs.min()), 'x1': int(xs.max())})
        comps.sort(key=lambda d: d['x0'])
        if len(comps) != 3:
            raise SystemExit(f'LegRig: expected 3 pieces below cut_y={self.cut_y} (spear shaft, back leg, front leg), '
                             f'found {[(d["x0"], d["x1"]) for d in comps]}')
        shaft, back, front = comps
        self.legs, self.rest = [], []
        for d in (back, front):
            band = np.zeros((H, W), bool)
            band[rig['overlap_top']:self.cut_y, max(0, d['x0'] - 6):d['x1'] + 7] = True
            top = d['mask'].copy()
            top[self.cut_y + 60:, :] = False
            px = float(np.where(top)[1].mean())
            self.legs.append(puppet.Layer(puppet.layer_from(rgba, d['mask'] | (band & alpha)), pivot=(px, self.hip_y)))
            ys, xs = np.where(d['mask'])
            foot = ys > ys.max() - 60
            self.rest.append(float(np.degrees(np.arctan2(xs[foot].mean() - px, ys[foot].mean() - self.hip_y))))
        mid = sum(leg.pivot[0] for leg in self.legs) / 2
        self.shift = [mid - leg.pivot[0] for leg in self.legs]  # one hip line, as in a side view
        body = alpha.copy()
        body[self.cut_y:, :] = False
        body |= shaft['mask']
        self.body = puppet.Layer(puppet.layer_from(rgba, body), pivot=(W * 0.5, H * 0.97))

    def frame(self, i: int, n: int) -> Image.Image:
        t = i / n
        s, c = np.sin(2 * np.pi * t), np.cos(2 * np.pi * t)
        lean = (-self.stride * s, self.stride * s)  # the legs always swing in opposite directions
        lift = (self.lift * max(0.0, -c), self.lift * max(0.0, c))
        dy = -self.bob * (1 - np.cos(4 * np.pi * t)) / 2
        parts = [self.cv.place(self.legs[k], self.shift[k], dy - lift[k], self.rest[k] - lean[k]) for k in (0, 1)]
        parts.append(self.cv.place(self.body, 0, dy, 0))
        return self.cv.compose(parts)


def rig_frames(sources: Path, rig: dict, n: int):
    """Frames of a LegRig walk as (rgba float crop, mask crop), cut from the idle source named in `rig['source']`."""
    r = LegRig(np.array(Image.open(find_source(sources, rig['source'])).convert('RGBA')), rig)
    out = []
    for i in range(n):
        im = np.array(r.frame(i, n)).astype(np.float32) / 255.0
        ys, xs = np.where(im[..., 3] > 0.02)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out.append((im[y0:y1, x0:x1], im[y0:y1, x0:x1, 3] > 0.5))
    return out


def build(spec_path: Path, sources: Path, out_dir: Path) -> None:
    spec = json.loads(spec_path.read_text())
    uid = spec['id']
    fr = spec['frame']
    rest_h = float(fr['restHeight'])
    base_y = int(fr['baseline'])
    H = int(fr['height'])
    key = spec['tint']

    # pass 1: cut every strip and, where it has rest frames, give it a scale from their height
    rows: list[dict] = []
    by_state: dict[str, dict] = {}
    for st in spec['states']:
        if st.get('rig'):  # built in code from the idle drawing; drawn at the idle's scale
            prepared = rig_frames(sources, st['rig'], st['cells'])
            steel, scale = [1], by_state[st['scaleFrom']]['scale']
        else:
            figs = load_figures(find_source(sources, st['file']), st['cells'], st.get('grid'))
            prepared = [clean_rgba(*f) for f in figs]
            heights = [m.shape[0] for _, m in prepared]
            steel = [steel_area(rgba, m) for rgba, m in prepared]
            scale = None
            if not st.get('matchSteelTo'):
                ref = st.get('restFrames') or list(range(len(prepared)))
                scale = rest_h / float(np.median([heights[i] for i in ref]))
        row = {'state': st['state'], 'fps': st['fps'], 'loop': st.get('loop', True), 'prepared': prepared,
               'steel': float(np.median(steel)), 'scale': scale, 'note': st.get('note', ''),
               'anchor': st.get('anchor', 'feet'), 'match': st.get('matchSteelTo')}
        rows.append(row)
        by_state[st['state']] = row

    # pass 2: a strip with no upright frame takes its scale from the steel area of another strip
    for r in rows:
        if r['match']:
            ref = by_state[r['match']]
            r['scale'] = ref['scale'] * float(np.sqrt(ref['steel'] / r['steel']))
            print(f'  {r["state"]}: scale from the steel area of "{r["match"]}" ({r["scale"]:.4f})')

    for r in rows:
        r['frames'] = [(rgba, m, r['scale'], anchor_x(m, r['anchor'])) for rgba, m in r['prepared']]

    # one cell width for the whole sheet: the widest reach of any frame from its anchor
    reach = 0.0
    for r in rows:
        for rgba, m, s, fx in r['frames']:
            w = rgba.shape[1]
            reach = max(reach, fx * s, (w - fx) * s)
    W = int(np.ceil((2 * reach + 8) / 16.0) * 16)
    cols = max(len(r['frames']) for r in rows)

    # tint reference value: p90 of V over every red pixel of every frame
    vals = []
    for r in rows:
        for rgba, m, s, fx in r['frames']:
            u8 = (rgba * 255).astype(np.uint8)
            mem = puppet.tint_membership(u8, key)
            _, _, v = puppet.rgb_to_hsv_arrays(rgba[..., :3])
            vals.append(v[mem > 0.5])
    vref = float(np.percentile(np.concatenate(vals), 90))

    sheet = np.zeros((len(rows) * H, cols * W, 4), np.float32)
    msheet = np.zeros_like(sheet)
    report = []
    for ri, r in enumerate(rows):
        for ci, (rgba, m, s, fx) in enumerate(r['frames']):
            u8 = (rgba * 255 + 0.5).astype(np.uint8)
            base, mask = puppet.split_base_and_mask(u8, key, vref)
            sb, sm = scale_premult(base, s), scale_premult(mask, s)
            ox = round(W / 2 - fx * s)
            oy = base_y - sb.shape[0]
            cell, mcell = np.zeros((H, W, 4), np.float32), np.zeros((H, W, 4), np.float32)
            paste(cell, sb, ox, oy)
            paste(mcell, sm, ox, oy)
            sheet[ri * H:(ri + 1) * H, ci * W:(ci + 1) * W] = cell
            msheet[ri * H:(ri + 1) * H, ci * W:(ci + 1) * W] = mcell
            if oy < 0 or ox < 0 or ox + sb.shape[1] > W:
                report.append(f'  CLIPPED {r["state"]} frame {ci}: ox={ox} oy={oy} size={sb.shape[1]}x{sb.shape[0]} cell={W}x{H}')
        print(f'  {r["state"]:7s} {len(r["frames"])} frames  scale {r["scale"]:.4f}  anchor {r["anchor"]}')

    out_dir.mkdir(parents=True, exist_ok=True)
    to_img = lambda a: Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    to_img(sheet).save(out_dir / 'sheet.png', optimize=True)
    to_img(msheet).save(out_dir / 'mask.png', optimize=True)
    manifest = {
        'id': uid, 'cellWidth': W, 'cellHeight': H, 'cols': cols, 'rows': len(rows), 'baseline': base_y,
        'states': {r['state']: {'row': i, 'frames': len(r['frames']), 'fps': r['fps'], 'loop': r['loop'], 'note': r['note']}
                   for i, r in enumerate(rows)},
        'sheet': 'sheet.png', 'mask': 'mask.png', 'facing': 'right',
    }
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (out_dir / 'manifest.js').write_text('window.STRIP_MANIFEST = ' + json.dumps(manifest, indent=2) + ';\n')

    used = sum(len(r['frames']) for r in rows)
    kb = (out_dir / 'sheet.png').stat().st_size / 1024 + (out_dir / 'mask.png').stat().st_size / 1024
    print(f'{uid}: {cols}x{len(rows)} cells of {W}x{H}px ({used} drawn frames in {len(rows) * cols} slots), vref {vref:.3f}, '
          f'{kb:.0f} KB (sheet+mask)')
    for line in report:
        print(line)

    # human review sheet: civ colour applied, on map green
    prev = REPO / '.verification' / 'strips' / uid
    prev.mkdir(parents=True, exist_ok=True)
    col = np.array([0x1d, 0x4a, 0x8c]) / 255.0
    tinted = sheet.copy()
    tinted[..., :3] = sheet[..., :3] * (1 - msheet[..., 3:4]) + sheet[..., :3] * col * msheet[..., 3:4]
    bg = Image.new('RGBA', to_img(tinted).size, (143, 191, 106, 255))
    bg.alpha_composite(to_img(tinted))
    bg.convert('RGB').save(prev / 'preview.png')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['build'])
    ap.add_argument('spec')
    ap.add_argument('--sources', required=True, help='directory with the generated images named in the spec')
    ap.add_argument('--out', help='output directory (default design/png-sprites/previews/<id>)')
    args = ap.parse_args()
    spec_path = Path(args.spec)
    spec_path = spec_path if spec_path.is_absolute() else REPO / spec_path
    uid = json.loads(spec_path.read_text())['id']
    out = Path(args.out) if args.out else REPO / 'design' / 'png-sprites' / 'previews' / uid
    build(spec_path, Path(args.sources), out)


if __name__ == '__main__':
    sys.exit(main())
