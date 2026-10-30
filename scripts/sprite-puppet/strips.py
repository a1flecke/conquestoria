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
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
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


@dataclass
class Finding:
    """One thing `probe` noticed about an image or a rig. `level` is 'error' (the build cannot proceed), 'warn' or 'info'."""
    level: str
    image: str
    code: str
    message: str

    def line(self) -> str:
        return f'{self.level:5s} {self.code:10s} {self.image}: {self.message}'


class FigureError(Exception):
    """An image that cannot be cut into the expected figures; `code` is the Finding code `probe` reports it under."""

    def __init__(self, code: str, image: str, message: str):
        super().__init__(f'{image}: {message}')
        self.code, self.image, self.message = code, image, message


SMALL_FIGURE_PX = 300  # a figure shorter than this has too little detail to rig or to scale down cleanly


def background_kind(rgba: np.ndarray) -> str:
    """'transparent' (a real cut-out), 'magenta' (a flat #FF00FF-ish field) or 'unknown' (white, grey, a scene ...)."""
    if (rgba[..., 3] < 250).mean() > 0.2:
        return 'transparent'
    border = np.concatenate([rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]])[:, :3]
    return 'magenta' if field_mask(border).mean() > 0.9 else 'unknown'


def load_figures(path: Path, expected: int, grid: list[int] | None = None, findings: list[Finding] | None = None):
    """Return [(rgb, mask, (x0, y0, x1, y1))] for the `expected` figures in the image, in reading order.

    `grid` lists how many figures sit in each row, top to bottom (e.g. [4, 4]); without it the figures are ordered left to
    right. Real transparency is used when the image has it (the generator's own cut-out, where a faint glow can sit at
    alpha <= 20, so only strongly opaque pixels count); a flat magenta field is keyed out otherwise. Raises FigureError when
    the image cannot be cut; a figure touching the image edge is appended to `findings` (or printed when none is given).
    """
    rgba = np.array(Image.open(path).convert('RGBA'))
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    kind = background_kind(rgba)
    if kind == 'unknown':
        raise FigureError('background', path.name, 'background is neither transparent nor flat magenta (a white, grey or '
                          'scenic background cannot be keyed out): ask for a transparent background')
    if kind == 'transparent':
        fig = ndi.binary_opening(alpha >= 200, iterations=1)
    else:
        fig = ndi.binary_opening(~field_mask(rgb), iterations=2)
    labels, n = ndi.label(fig)
    if n == 0:
        raise FigureError('count', path.name, f'expected {expected} figures, found 0')
    areas = ndi.sum(fig, labels, range(1, n + 1))
    order = np.argsort(areas)[::-1]
    if len(order) < expected:
        raise FigureError('count', path.name, f'expected {expected}, found {len(order)}')
    if len(order) > expected and areas[order[expected]] > 0.02 * areas[order[expected - 1]]:
        raise FigureError('leftover', path.name, f'expected {expected} figures but a {areas[order[expected]]:.0f}px piece is '
                          'left over (figures touching, or a detached part)')
    figures = []
    for i in order[:expected]:
        m = labels == int(i) + 1
        ys, xs = np.where(m)
        figures.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, m))
    if grid:
        if sum(grid) != expected:
            raise FigureError('count', path.name, f'grid {grid} does not add up to {expected} figures')
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
            msg = f'a figure touches the image edge (it may be cut off): box {x0},{y0},{x1},{y1}'
            if findings is None:
                print(f'  note: {path.name} {msg}')
            else:
                findings.append(Finding('warn', path.name, 'edge', msg))
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


class RigCutError(Exception):
    """The drawing cannot be cut into body and legs where the rig needs it (legs touching, a limb over a leg ...)."""


REF_FIGURE_PX = 1216  # the Spearman master's height; LegRig's pixel constants were tuned on it


def figure_scale(alpha: np.ndarray) -> float:
    """How big this drawing is against the figure the rig constants were tuned on (1.0 = the Spearman master)."""
    rows = np.where(alpha.any(1))[0]
    return float(rows.max() - rows.min() + 1) / REF_FIGURE_PX


def min_piece(u: float) -> int:
    """Smallest area (px) that counts as a piece of the figure rather than a speck."""
    return max(30, round(300 * u * u))


def calibrate(rgba: np.ndarray, rig: dict) -> dict:
    """Find where to cut a drawing into body and legs: absolute `cut_y`, `overlap_top`, `hip_y` and `knee_y` (source px).

    Keys already in `rig` win unchanged. Otherwise the cut is the highest row, inside the band `rig['hem']` (fractions of the
    figure's height up from its lowest opaque row; default [0.22, 0.40]), from which the number of pieces below stays exactly
    `legs + shafts` (defaults 2 and 1) all the way down to the feet. Requiring it all the way down is what rejects a cloak or
    a hem that briefly splits into the right number of pieces, and what lets the cut sit below a bow tip. The others follow
    from it: `overlap_top` 2% of the height above the cut, `hip_y` 1% below it, `knee_y` a quarter (`rig['knee']`) of the way
    from the cut to the feet. Raises RigCutError when no row qualifies.
    """
    alpha = rgba[..., 3] > 40
    rows = np.where(alpha.any(1))[0]
    top, bottom = int(rows.min()), int(rows.max())
    h = bottom - top + 1
    u = h / REF_FIGURE_PX
    legs, shafts = rig.get('legs', 2), rig.get('shafts', 1)
    want = legs + shafts
    if 'cut_y' in rig:
        cut = int(rig['cut_y'])
    else:
        lo, hi = rig.get('hem', [0.22, 0.40])
        step = max(1, h // 200)
        seen: dict[int, int] = {}

        def count(y: int) -> int:
            if y not in seen:
                lab, n = ndi.label(alpha[y:])
                seen[y] = int((ndi.sum(alpha[y:], lab, range(1, n + 1)) > min_piece(u)).sum()) if n else 0
            return seen[y]

        floor = bottom - max(1, round(0.05 * h))  # the soles themselves can merge; the last 5% is not judged
        cut = None
        for y in range(bottom - int(hi * h), bottom - int(lo * h) + 1, step):
            if all(count(yy) == want for yy in range(y, floor + 1, step)):
                cut = y
                break
        if cut is None:
            raise RigCutError(f'expected {legs} legs below the hem (plus {shafts} shaft) at some row between '
                              f'{bottom - int(hi * h)} and {bottom - int(lo * h)}, found '
                              f'{sorted(set(seen.values()))} pieces there: the legs touch, merge with a cloak, shield or '
                              'weapon, or the hem is outside the search band; redraw the master with the legs apart '
                              'and nothing hanging in front of them')
    out = {'cut_y': cut}
    out['overlap_top'] = int(rig['overlap_top']) if 'overlap_top' in rig else cut - round(0.02 * h)
    out['hip_y'] = int(rig['hip_y']) if 'hip_y' in rig else cut + round(0.01 * h)
    out['knee_y'] = int(rig['knee_y']) if 'knee_y' in rig else cut + round(rig.get('knee', 0.25) * (bottom - cut))
    return out


class LegRig:
    """A walk built in code from the idle drawing, for when drawn frames do not alternate their legs.

    A generated walk cycle often draws the second step as a copy of the first, so the same leg leads every time (a "gallop
    shuffle"). This rig cannot: it cuts the idle figure into body and two legs below `cut_y` (plus the spear shaft, which
    stays with the body) and swings the two legs in opposite directions about one shared hip line, lifting each foot as it
    swings forward. Each leg is two bones (thigh, and shin with boot) joined at the knee, so it is still plainer than a
    drawn walk but not stiff. Keys (source pixels): cut_y (just below
    the hem, where there are exactly three pieces: shaft, back leg, front leg), overlap_top (top of the band of body pixels
    each leg carries so the join stays closed), hip_y, stride_deg, lift (px a swinging foot rises), bob (px the body drops
    at each contact). Optional knee: knee_y (the boot top, where the shin starts), knee_bend (degrees the shin swings back at
    the passing pose) and knee_overlap (px of leg the shin keeps above the knee); without knee_y the legs are rigid.
    """

    def __init__(self, rgba: np.ndarray, rig: dict):
        H, W = rgba.shape[:2]
        alpha = rgba[..., 3] > 40
        u = figure_scale(alpha)  # the pixel constants below were tuned on a 1216 px tall figure
        self.cut_y, self.hip_y = rig['cut_y'], rig['hip_y']
        self.stride, self.lift, self.bob = rig.get('stride_deg', 20.0), rig.get('lift', 36.0) * u, rig.get('bob', 14.0) * u
        self.cv = puppet.Canvas((W, H), int(max(W, H) * 0.14))
        shafts = rig.get('shafts', 1)  # straight pieces that stay with the body (a spear shaft); the leftmost piece
        low = alpha.copy()
        low[:self.cut_y, :] = False
        lab, n = ndi.label(low)
        comps = []
        for i in range(1, n + 1):
            m = lab == i
            if m.sum() > min_piece(u):
                xs = np.where(m.any(0))[0]
                comps.append({'mask': m, 'x0': int(xs.min()), 'x1': int(xs.max())})
        comps.sort(key=lambda d: d['x0'])
        if len(comps) != 2 + shafts:
            raise RigCutError(f'expected 2 legs below the hem (plus {shafts} shaft) at cut_y={self.cut_y}, found '
                              f'{len(comps)} pieces {[(d["x0"], d["x1"]) for d in comps]}: the legs touch or merge; '
                              'redraw the master with the legs apart')
        shaft = comps[0] if shafts else None
        back, front = comps[-2:]
        self.legs, self.shins, self.rest = [], [], []
        m6, f60 = max(1, round(6 * u)), round(60 * u)
        self.knee_y = rig.get('knee_y')  # absent: rigid legs
        self.knee_bend = rig.get('knee_bend', 0.0)
        rows = np.arange(H)[:, None]
        for d in (back, front):
            band = np.zeros((H, W), bool)
            band[rig['overlap_top']:self.cut_y, max(0, d['x0'] - m6):d['x1'] + m6 + 1] = True
            top = d['mask'].copy()
            top[self.cut_y + f60:, :] = False
            px = float(np.where(top)[1].mean())
            ys, xs = np.where(d['mask'])
            foot = ys > ys.max() - f60
            self.rest.append(float(np.degrees(np.arctan2(xs[foot].mean() - px, ys[foot].mean() - self.hip_y))))
            if self.knee_y is None:
                self.legs.append(puppet.Layer(puppet.layer_from(rgba, d['mask'] | (band & alpha)), pivot=(px, self.hip_y)))
                continue
            # two bones: the thigh (hip to knee) and the shin and boot (below knee_y), the shin keeping a short band of
            # leg above the knee so the joint stays closed while it bends
            overlap = rig.get('knee_overlap', round(30 * u))
            thigh = (d['mask'] & (rows < self.knee_y)) | (band & alpha)
            shin = d['mask'] & (rows >= self.knee_y - overlap)
            kx = float(np.where(d['mask'] & (np.abs(rows - self.knee_y) < round(20 * u)))[1].mean())
            self.legs.append(puppet.Layer(puppet.layer_from(rgba, thigh), pivot=(px, self.hip_y)))
            self.shins.append(puppet.Layer(puppet.layer_from(rgba, shin), pivot=(kx, self.knee_y)))
        mid = sum(leg.pivot[0] for leg in self.legs) / 2
        self.shift = [mid - leg.pivot[0] for leg in self.legs]  # one hip line, as in a side view
        body = alpha.copy()
        body[self.cut_y:, :] = False
        if shaft is not None:
            body |= shaft['mask']
        self.body = puppet.Layer(puppet.layer_from(rgba, body), pivot=(W * 0.5, H * 0.97))

    def frame(self, i: int, n: int) -> Image.Image:
        t = i / n
        s, c = np.sin(2 * np.pi * t), np.cos(2 * np.pi * t)
        lean = (-self.stride * s, self.stride * s)  # the legs always swing in opposite directions
        swing = (max(0.0, -c), max(0.0, c))  # how far through its forward swing each leg is (peaks at the passing pose)
        dy = -self.bob * (1 - np.cos(4 * np.pi * t)) / 2
        parts = []
        for k in (0, 1):
            hip_angle = self.rest[k] - lean[k]
            thigh = self.cv.place(self.legs[k], self.shift[k], dy - self.lift * swing[k], hip_angle)
            if self.knee_y is None:
                parts.append(thigh)
                continue
            # bend the knee (the shin swings back about the knee), then carry the shin with the thigh about the hip
            bent = self.cv.place(self.shins[k], 0, 0, self.knee_bend * swing[k])
            hip = (self.legs[k].pivot[0] + self.cv.pad, self.hip_y + self.cv.pad)
            shin = bent.rotate(-hip_angle, resample=Image.BICUBIC, center=hip, translate=(self.shift[k], dy - self.lift * swing[k]))
            parts.extend([shin, thigh])  # shin behind the thigh so the knee stays closed
        parts.append(self.cv.place(self.body, 0, dy, 0))
        return self.cv.compose(parts)


def rig_source_image(spec: dict, sources: Path, ref: str) -> np.ndarray:
    """uint8 RGBA drawing a rig is cut from. A plain name is the whole image when it has real transparency (the rig's
    coordinates then refer to that image); a '<image>#<index>' reference, or an image on a magenta field, is one keyed figure."""
    if '#' not in ref:
        whole = np.array(Image.open(find_source(sources, ref)).convert('RGBA'))
        if background_kind(whole) == 'transparent':
            return whole
    return load_source_figure(spec, sources, ref)


def walk_frames(rgba: np.ndarray, rig: dict, n: int):
    """`n` frames of a LegRig walk as (rgba float crop, mask crop), cut from one drawing (uint8 RGBA). Cut positions not
    given in `rig` are calibrated from the drawing."""
    r = LegRig(rgba, {**rig, **calibrate(rgba, rig)})
    out = []
    for i in range(n):
        im = np.array(r.frame(i, n)).astype(np.float32) / 255.0
        ys, xs = np.where(im[..., 3] > 0.02)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out.append((im[y0:y1, x0:x1], im[y0:y1, x0:x1, 3] > 0.5))
    return out


def load_source_figure(spec: dict, sources: Path, ref: str) -> np.ndarray:
    """uint8 RGBA crop of one drawn figure. `ref` is an image name ('a', a one-figure image) or '<image>#<index>' (figure
    `index`, in reading order, of the strip that uses that image: 'd#2' is the third damage tier)."""
    name, _, idx = ref.partition('#')
    for st in spec['states']:
        if st.get('file') == name:
            figs = load_figures(find_source(sources, name), st['cells'], st.get('grid'))
            rgba, _ = clean_rgba(*figs[int(idx or 0)])
            return (rgba * 255 + 0.5).astype(np.uint8)
    raise SystemExit(f'source reference "{ref}": no state in the spec uses image "{name}"')


def tint_fraction(path: Path, figures, key: dict) -> float:
    """Share of the figures' pixels that the civ-tint key picks up (about a tenth of a healthy tunic-and-cloak figure)."""
    img = np.array(Image.open(path).convert('RGBA'))
    inside = np.zeros(img.shape[:2], bool)
    for _, m, _ in figures:
        inside |= m
    mem = puppet.tint_membership(img, key) > 0.5
    return float((mem & inside).sum()) / max(1, int(inside.sum()))


def check_rigs(spec: dict, sources: Path, cuts: dict | None = None) -> list[Finding]:
    """Can every drawing a rig is cut from be cut? The master must (error); a damage tier that cannot is only a warning,
    because that tier then walks like its neighbour. The cut positions found are stored in `cuts[ref]` when given."""
    findings: list[Finding] = []
    for st in spec['states']:
        rig = st.get('rig')
        if not rig:
            continue
        for k, ref in enumerate(rig.get('sources') or [rig['source']]):
            try:
                cut = calibrate(rig_source_image(spec, sources, ref), rig)
            except (RigCutError, FigureError) as e:
                findings.append(Finding('error' if k == 0 else 'warn', ref, 'rig_cut', str(e)))
                continue
            if cuts is not None:
                cuts[ref] = cut
    return findings


def probe(spec: dict, sources: Path) -> list[Finding]:
    """Everything worth knowing about the source images before a build: can each be cut into the expected figures, are they
    big enough, do any run off the edge, and does any carry more team colour than the master (a leak)."""
    findings: list[Finding] = []
    key = spec['tint']
    fractions: dict[str, float] = {}
    for st in spec['states']:
        if not st.get('file'):
            continue  # a state built in code from another image
        path = find_source(sources, st['file'])
        try:
            figs = load_figures(path, st['cells'], st.get('grid'), findings)
        except FigureError as e:
            findings.append(Finding('error', e.image, e.code, e.message))
            continue
        for _, m, (x0, y0, x1, y1) in figs:
            if y1 - y0 < SMALL_FIGURE_PX:
                findings.append(Finding('warn', path.name, 'small', f'a figure is only {y1 - y0}px tall (under '
                                        f'{SMALL_FIGURE_PX}): ask for fewer figures per row or a bigger image'))
                break
        fractions[st['file']] = tint_fraction(path, figs, key)
    findings.extend(check_rigs(spec, sources))
    master = next((st['file'] for st in spec['states'] if st.get('file') in fractions), None)
    if master is not None:
        base = fractions[master]
        for name, frac in fractions.items():
            if name != master and frac > 1.5 * base and frac - base > 0.02:
                findings.append(Finding('warn', name, 'tint_leak', f'{frac:.0%} of the figure takes the team colour against '
                                        f'{base:.0%} in the master "{master}": a colour other than the tunic or cloak is '
                                        'close to red'))
    return findings


def build(spec_path: Path, sources: Path, out_dir: Path) -> None:
    spec = json.loads(spec_path.read_text())
    uid = spec['id']
    fr = spec['frame']
    rest_h = float(fr['restHeight'])
    base_y = int(fr['baseline'])
    H = int(fr['height'])
    key = spec['tint']

    # pass 1: cut every drawn strip and, where it has rest frames, give it a scale from their height. A rig state is built
    # afterwards (it needs the scale of the drawing it is cut from) and fills the slot it holds here, so rows keep spec order
    slots: list[list[dict]] = []
    by_state: dict[str, dict] = {}
    rig_states: list[tuple[dict, list[dict]]] = []
    for st in spec['states']:
        if st.get('rig'):
            group: list[dict] = []
            slots.append(group)
            rig_states.append((st, group))
            continue
        try:
            figs = load_figures(find_source(sources, st['file']), st['cells'], st.get('grid'))
        except FigureError as e:
            raise SystemExit(str(e))
        prepared = [clean_rgba(*f) for f in figs]
        heights = [m.shape[0] for _, m in prepared]
        steel = [steel_area(rgba, m) for rgba, m in prepared]
        scale = None
        if not st.get('matchSteelTo'):
            ref = st.get('restFrames') or list(range(len(prepared)))
            scale = rest_h / float(np.median([heights[i] for i in ref]))
        row = {'state': st['state'], 'fps': st['fps'], 'loop': st.get('loop', True), 'prepared': prepared,
               'steel': float(np.median(steel)), 'scale': scale, 'note': st.get('note', ''),
               'anchor': st.get('anchor', 'feet'), 'match': st.get('matchSteelTo'), 'tier_group': None}
        slots.append([row])
        by_state[st['state']] = row

    # pass 2: a strip with no upright frame takes its scale from the steel area of another strip
    for group in slots:
        for r in group:
            if r['match']:
                ref = by_state[r['match']]
                r['scale'] = ref['scale'] * float(np.sqrt(ref['steel'] / r['steel']))
                print(f'  {r["state"]}: scale from the steel area of "{r["match"]}" ({r["scale"]:.4f})')

    # pass 3: rig states. One row per drawing in rig['sources'] (the master, then e.g. each damage tier), each at the scale
    # of the strip it was cut from, so a wounded unit moves wounded. A drawing the rig cannot cut walks as its neighbour does
    for st, group in rig_states:
        rig = st['rig']
        refs = rig.get('sources') or [rig['source']]
        for k, ref in enumerate(refs):
            name = st['state'] if k == 0 else f'{st["state"]}@{k}'
            origin = st.get('scaleFrom') if k == 0 and st.get('scaleFrom') else next(
                (s['state'] for s in spec['states'] if s.get('file') == ref.partition('#')[0]), None)
            if origin is None:
                raise SystemExit(f'rig source "{ref}" of {st["state"]}: no drawn state uses that image')
            try:
                prepared = walk_frames(rig_source_image(spec, sources, ref), rig, st['cells'])
            except RigCutError as e:
                if k == 0:
                    raise SystemExit(f'{ref}: {e}')
                print(Finding('warn', ref, 'rig_cut', f'{e}; {name} walks like {group[-1]["state"]}').line())
                prepared = group[-1]['prepared']
            group.append({'state': name, 'fps': st['fps'], 'loop': st.get('loop', True), 'prepared': prepared,
                          'steel': 1.0, 'scale': by_state[origin]['scale'], 'note': st.get('note', ''),
                          'anchor': st.get('anchor', 'feet'), 'match': None, 'tier_group': st['state']})
    rows = [r for group in slots for r in group]

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
    tiers: dict[str, list[str]] = {}
    for r in rows:
        if r['tier_group']:
            tiers.setdefault(r['tier_group'], []).append(r['state'])
    tiers = {k: v for k, v in tiers.items() if len(v) > 1}
    if tiers:  # a rigged loop built from several drawings (the master, then each damage tier): the rows to choose between
        manifest['tiers'] = tiers
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


PROMPT_DIR = REPO / 'scripts' / 'sprite-puppet' / 'strip-prompts'
OPTIONAL_PROMPT_KEYS = {'extra_images': ''}  # spec `prompt` keys a family may use but a unit need not give


def template_parts(path: Path) -> tuple[str, dict[str, dict[str, str]]]:
    """Split a prompt template into its '## Prompt' body and, per '## Family: <name>', its '### <key>' sections."""
    _, _, rest = path.read_text().partition('\n## Prompt\n')
    body, *families = re.split(r'\n## Family: ', rest)
    parsed: dict[str, dict[str, str]] = {}
    for chunk in families:
        name, _, section = chunk.partition('\n')
        parsed[name.strip()] = {m.group(1): m.group(2).strip()
                                for m in re.finditer(r'^### (\w+)\n(.*?)(?=^### |\Z)', section, re.S | re.M)}
    return body.strip(), parsed


def build_prompts(spec: dict, template_dir: Path = PROMPT_DIR) -> tuple[str, str]:
    """The two ChatGPT prompts for a unit: conversation A (the master) and conversation B (damage tiers and one-shot
    actions). The family's sections supply the pose rules and image list; the spec's `prompt` block fills the rest."""
    templates = {kind: template_parts(template_dir / f'{kind}.md') for kind in ('master', 'set')}
    families = sorted(set(templates['master'][1]) & set(templates['set'][1]))
    family = spec.get('family')
    if family not in families:
        raise SystemExit(f'unknown family "{family}": choose one of {", ".join(families)}')
    values = {**OPTIONAL_PROMPT_KEYS, **spec.get('prompt', {})}
    texts, missing = [], []
    for kind in ('master', 'set'):
        body, by_family = templates[kind]
        fields = {**by_family[family], **{k: str(v) for k, v in values.items()}}
        text = body
        for _ in range(4):  # a family section can itself hold placeholders
            text = re.sub(r'\{\{(\w+)\}\}', lambda m: fields.get(m.group(1), m.group(0)), text)
        missing += [k for k in re.findall(r'\{\{(\w+)\}\}', text) if k not in missing]
        texts.append(text)
    if missing:
        raise SystemExit('the spec is missing ' + ', '.join(f'prompt.{k}' for k in missing))
    return texts[0], texts[1]


def prompt_command(spec: dict) -> int:
    a, b = build_prompts(spec)
    out = REPO / '.verification' / 'strips' / spec['id']
    out.mkdir(parents=True, exist_ok=True)
    (out / 'prompt-a.txt').write_text(a + '\n')
    (out / 'prompt-b.txt').write_text(b + '\n')
    print(f'=== CONVERSATION A: the master (a fresh ChatGPT conversation, no attachment) ===\n\n{a}\n')
    print(f'=== CONVERSATION B: the set (a fresh conversation with the approved master attached) ===\n\n{b}\n')
    print(f'saved to {out / "prompt-a.txt"} and {out / "prompt-b.txt"}')
    return 0


def calibrate_command(spec: dict, sources: Path) -> int:
    """Print the cut found for every drawing a rig uses, save it as .verification/strips/<id>/rig.json and draw the cut (red),
    hip (green) and knee (blue) lines on each source in rig-review.png so a wrong cut is visible at a glance."""
    cuts: dict[str, dict] = {}
    findings = check_rigs(spec, sources, cuts)
    for f in findings:
        print(f.line())
    out = REPO / '.verification' / 'strips' / spec['id']
    out.mkdir(parents=True, exist_ok=True)
    (out / 'rig.json').write_text(json.dumps(cuts, indent=2) + '\n')
    tiles = []
    for st in spec['states']:
        rig = st.get('rig')
        for ref in (rig.get('sources') or [rig['source']]) if rig else []:
            if ref not in cuts:
                continue
            print(f'{ref}: ' + ', '.join(f'{k} {v}' for k, v in cuts[ref].items()))
            img = Image.fromarray(rig_source_image(spec, sources, ref))
            bg = Image.new('RGBA', img.size, (200, 200, 200, 255))
            bg.alpha_composite(img)
            d = ImageDraw.Draw(bg)
            for key, colour in (('cut_y', (220, 30, 30)), ('hip_y', (30, 160, 30)), ('knee_y', (30, 60, 220))):
                d.line([(0, cuts[ref][key]), (img.size[0], cuts[ref][key])], fill=colour, width=max(2, img.size[1] // 300))
            tiles.append(bg.convert('RGB'))
    if tiles:
        height = 700
        tiles = [t.resize((max(1, round(t.size[0] * height / t.size[1])), height)) for t in tiles]
        sheet = Image.new('RGB', (sum(t.size[0] for t in tiles), height), (255, 255, 255))
        x = 0
        for t in tiles:
            sheet.paste(t, (x, 0))
            x += t.size[0]
        sheet.save(out / 'rig-review.png')
        print(f'review image: {out / "rig-review.png"}')
    return 1 if any(f.level == 'error' for f in findings) else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['build', 'probe', 'calibrate', 'prompt'])
    ap.add_argument('spec')
    ap.add_argument('--sources', help='directory with the generated images named in the spec (not needed for prompt)')
    ap.add_argument('--out', help='output directory (default design/png-sprites/previews/<id>)')
    args = ap.parse_args()
    spec_path = Path(args.spec)
    spec_path = spec_path if spec_path.is_absolute() else REPO / spec_path
    spec = json.loads(spec_path.read_text())
    if args.cmd == 'prompt':
        return prompt_command(spec)
    if not args.sources:
        ap.error(f'{args.cmd} needs --sources')
    if args.cmd == 'probe':
        findings = probe(spec, Path(args.sources))
        for f in findings:
            print(f.line())
        errors = sum(f.level == 'error' for f in findings)
        print(f'{spec["id"]}: {errors} errors, {sum(f.level == "warn" for f in findings)} warnings')
        return 1 if errors else 0
    if args.cmd == 'calibrate':
        return calibrate_command(spec, Path(args.sources))
    out = Path(args.out) if args.out else REPO / 'design' / 'png-sprites' / 'previews' / spec['id']
    build(spec_path, Path(args.sources), out)


if __name__ == '__main__':
    sys.exit(main())
