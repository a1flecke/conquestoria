#!/usr/bin/env python3
"""strips: PROTOTYPE intake for AI-generated animation strips (not wired into the game).

    python3 -I scripts/sprite-puppet/strips.py build scripts/sprite-puppet/strip-rigs/spearman.json --sources <dir>

puppet.py animates ONE painted still with a rig. This is the other way round: the art already contains the frames (an
image generator drew a walk cycle, an attack, damage tiers ...), so the tool only has to *cut, normalise and pack* them:

  1. key the flat magenta field out and cut each strip into its figures (one connected component per frame),
  2. give every frame of a strip the same scale (taken from the strip's rest-pose frames, matched to the master idle),
  3. put every frame's boots on one baseline and its feet centre on one vertical line,
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


def load_figures(path: Path, expected: int):
    """Return [(rgba float32 crop, mask bool crop)] for the `expected` figures in the image, left to right."""
    rgb = np.array(Image.open(path).convert('RGB'))
    fig = ndi.binary_opening(~field_mask(rgb), iterations=2)
    labels, n = ndi.label(fig)
    if n == 0:
        raise SystemExit(f'{path.name}: no figure found (is the background magenta?)')
    areas = ndi.sum(fig, labels, range(1, n + 1))
    order = np.argsort(areas)[::-1]
    if len(order) < expected:
        raise SystemExit(f'{path.name}: expected {expected} figures, found {len(order)}')
    if len(order) > expected and areas[order[expected]] > 0.02 * areas[order[expected - 1]]:
        raise SystemExit(f'{path.name}: expected {expected} figures but a {areas[order[expected]]:.0f}px piece is left over '
                         '(figures touching, or a detached part)')
    chosen = [int(i) + 1 for i in order[:expected]]
    figures = []
    for lab in chosen:
        m = labels == lab
        ys, xs = np.where(m)
        figures.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, m))
    figures.sort(key=lambda f: (f[0] + f[2]) / 2)
    out = []
    for x0, y0, x1, y1, m in figures:
        out.append((rgb, m, (x0, y0, x1, y1)))
    return out


def clean_rgba(rgb: np.ndarray, m: np.ndarray, box) -> tuple[np.ndarray, np.ndarray]:
    """RGBA float crop with the magenta spill removed: edge colours are replaced by the nearest interior colour."""
    x0, y0, x1, y1 = box
    inner = ndi.binary_erosion(m, iterations=2)
    idx = ndi.distance_transform_edt(~inner, return_indices=True)[1]
    filled = rgb[idx[0], idx[1]]
    alpha = ndi.gaussian_filter(m.astype(np.float32), 0.8)
    alpha = np.where(m, np.maximum(alpha, 0.0), alpha)
    rgba = np.dstack([filled.astype(np.float32) / 255.0, alpha])[y0:y1, x0:x1]
    return rgba, m[y0:y1, x0:x1]


def feet_x(mask: np.ndarray) -> float:
    """Horizontal centre of the boots: centroid of the lowest 10% of the figure."""
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


def build(spec_path: Path, sources: Path, out_dir: Path) -> None:
    spec = json.loads(spec_path.read_text())
    uid = spec['id']
    fr = spec['frame']
    rest_h = float(fr['restHeight'])
    base_y = int(fr['baseline'])
    H = int(fr['height'])
    key = spec['tint']

    # frames[row] = list of (rgba, mask, scale, feet_x)
    rows: list[dict] = []
    for st in spec['states']:
        figs = load_figures(sources / (st['file'] + '.bin'), st['cells'])
        prepared = [clean_rgba(*f) for f in figs]
        heights = [m.shape[0] for _, m in prepared]
        ref = st.get('restFrames') or list(range(len(prepared)))
        scale = rest_h / float(np.mean([heights[i] for i in ref]))
        frames = [(rgba, m, scale, feet_x(m)) for rgba, m in prepared]
        rows.append({'state': st['state'], 'fps': st['fps'], 'loop': st.get('loop', True), 'frames': frames,
                     'scale': scale, 'note': st.get('note', '')})

    # one cell width for the whole sheet: the widest reach of any frame from its feet centre
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
        print(f'  {r["state"]:7s} {len(r["frames"])} frames  scale {r["scale"]:.4f}')

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

    kb = (out_dir / 'sheet.png').stat().st_size / 1024 + (out_dir / 'mask.png').stat().st_size / 1024
    print(f'{uid}: {cols}x{len(rows)} cells of {W}x{H}px ({len(rows) * cols} slots), vref {vref:.3f}, {kb:.0f} KB (sheet+mask)')
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
    ap.add_argument('--sources', required=True, help='directory with the generated strips named in the spec (<file>.bin)')
    ap.add_argument('--out', help='output directory (default design/png-sprites/previews/<id>)')
    args = ap.parse_args()
    spec_path = Path(args.spec)
    spec_path = spec_path if spec_path.is_absolute() else REPO / spec_path
    uid = json.loads(spec_path.read_text())['id']
    out = Path(args.out) if args.out else REPO / 'design' / 'png-sprites' / 'previews' / uid
    build(spec_path, Path(args.sources), out)


if __name__ == '__main__':
    sys.exit(main())
