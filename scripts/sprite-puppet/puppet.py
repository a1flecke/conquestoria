#!/usr/bin/env python3
"""sprite-puppet: turn ONE painted PNG of a unit into an animated, civ-tintable spritesheet.

    python3 -I scripts/sprite-puppet/puppet.py build scripts/sprite-puppet/rigs/horseman.json

Reads a rig spec (JSON) that names the source image, the rig profile and its cut coordinates, then writes

    public/images/units/<id>/sheet.png   base sheet (tint-keyed pixels desaturated to a luminance ramp)
    public/images/units/<id>/mask.png    tint mask sheet (alpha = how much of the pixel takes the civ colour)
    src/renderer/sprites/png/generated/<id>.manifest.ts   typed manifest consumed by the game
    .verification/puppet/<id>/preview.png                 contact sheet for human review (git-ignored)

Profiles:
    static   no rig. Idle breathes, walk bobs/squashes, attack lunges. Works for ANY single image, no cut coordinates.
    mounted  quadruped mount + rider (horse). Four legs, tail and a rider arm/weapon swing about pivots.

See scripts/sprite-puppet/README.md for the recipe (how to pick cut coordinates, how to add a profile).
Dependencies: Python 3.11+, Pillow, numpy, scipy (dev-time only; the game ships only the generated files).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

REPO = Path(__file__).resolve().parents[2]
COLS = 8


# ----------------------------------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------------------------------
def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def rgb_to_hsv_arrays(rgb: np.ndarray):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    s = d / (mx + 1e-6)
    return h, s, mx


class Layer:
    """An RGBA layer that can be rotated about a pivot and translated, in a padded canvas."""

    def __init__(self, image: Image.Image, pivot=(0.0, 0.0)):
        self.image = image
        self.pivot = pivot


class Canvas:
    def __init__(self, size, pad):
        self.size, self.pad = size, pad
        self.can = (size[0] + 2 * pad, size[1] + 2 * pad)

    def place(self, layer: Layer, dx=0.0, dy=0.0, ang=0.0) -> Image.Image:
        canvas = Image.new('RGBA', self.can, (0, 0, 0, 0))
        canvas.paste(layer.image, (self.pad, self.pad), layer.image)
        cx, cy = layer.pivot[0] + self.pad, layer.pivot[1] + self.pad
        return canvas.rotate(-ang, resample=Image.BICUBIC, center=(cx, cy), translate=(dx, dy))

    def compose(self, parts) -> Image.Image:
        out = Image.new('RGBA', self.can, (0, 0, 0, 0))
        for p in parts:
            out.alpha_composite(p)
        return out


def layer_from(rgba: np.ndarray, mask: np.ndarray) -> Image.Image:
    out = np.zeros_like(rgba)
    out[mask] = rgba[mask]
    return Image.fromarray(out)


def ease(u: float) -> float:
    return u * u * (3 - 2 * u)


def keyframes(t: float, keys):
    """keys: [(t, *values)] sorted by t, t in [0,1]. Smoothstep between neighbours; returns tuple of values."""
    for k0, k1 in zip(keys, keys[1:]):
        if k0[0] <= t <= k1[0]:
            u = ease((t - k0[0]) / (k1[0] - k0[0]))
            return tuple(a + (b - a) * u for a, b in zip(k0[1:], k1[1:]))
    return tuple(keys[-1][1:])


# ----------------------------------------------------------------------------------------------------------------------
# profiles: each yields a function frame(state, i, n) -> RGBA image on the padded canvas
# ----------------------------------------------------------------------------------------------------------------------
class StaticRig:
    """No cut coordinates: whole-image motion only. The migration floor for any new painted unit."""

    def __init__(self, rgba: np.ndarray, rig: dict):
        self.rgba = rgba
        h, w = rgba.shape[:2]
        self.cv = Canvas((w, h), int(max(w, h) * 0.12))
        self.layer = Layer(Image.fromarray(rgba), pivot=(w * 0.5, h * 0.97))  # pivot at the feet
        self.amp = rig.get('bob', 0.012) * h

    def frame(self, state: str, i: int, n: int) -> Image.Image:
        t = i / n
        if state == 'idle':
            dy = -0.5 * self.amp * (1 - math.cos(2 * math.pi * t))
            return self.cv.place(self.layer, 0, dy, 0.4 * math.sin(2 * math.pi * t))
        if state == 'walk':
            dy = -self.amp * 1.6 * abs(math.sin(2 * math.pi * t * 2))
            return self.cv.place(self.layer, 0, dy, 1.6 * math.sin(2 * math.pi * t))
        # attack: wind back, lunge forward, recover
        sh, rot = keyframes(t, [(0, 0, 0), (0.25, -0.02, -3), (0.55, 0.06, 5), (0.8, 0.02, 1), (1, 0, 0)])
        w = self.rgba.shape[1]
        return self.cv.place(self.layer, sh * w, 0, rot)


class MountedRig:
    """Horse + rider. Legs are the four components below `cut_y`; tail and rider arm are polygons.

    Every moving layer carries a copy of the body pixels it overlaps so joints stay closed for small angles. Legs are
    drawn BEHIND the body, fully opaque; the body's bottom edge fades over them so no flat ledge shows when a leg swings.
    """

    LEG_NAMES = ['A_hind_far', 'B_hind_near', 'C_fore_far', 'D_fore_near']  # left->right in the source image
    DRAW_ORDER = ['A_hind_far', 'C_fore_far', 'B_hind_near', 'D_fore_near']
    GAIT = {'A_hind_far': 0.0, 'B_hind_near': 0.5, 'C_fore_far': 0.75, 'D_fore_near': 0.25}  # lateral-sequence walk

    def __init__(self, rgba: np.ndarray, rig: dict):
        self.rgba = rgba
        H, W = rgba.shape[:2]
        self.cv = Canvas((W, H), 160)
        alpha = rgba[..., 3] > 40
        yy, xx = np.mgrid[0:H, 0:W]
        cut_y = rig.get('cut_y', 740)
        overlap_top = rig.get('overlap_top', 620)
        leg_pivot_dy = rig.get('leg_pivot_dy', 30)
        fade_px = rig.get('body_fade_px', 60)
        band_margin = rig.get('overlap_margin_x', 26)
        self.cut_y = cut_y

        # -- legs: connected components below the cut line -----------------------------------------------------------
        low = alpha.copy()
        low[:cut_y, :] = False
        lab, n = ndi.label(low)
        found = []
        for i in range(1, n + 1):
            m = lab == i
            ys, xs = np.where(m)
            if m.sum() > rig.get('min_leg_pixels', 3000) and xs.min() >= rig.get('tail_x_max', 120):
                found.append(dict(mask=m, x0=int(xs.min()), x1=int(xs.max())))
        found.sort(key=lambda d: d['x0'])
        if len(found) != 4:
            raise SystemExit(f'expected 4 legs below cut_y={cut_y}, found {[(d["x0"], d["x1"]) for d in found]}: adjust cut_y')
        self.legs = {}
        for name, leg in zip(self.LEG_NAMES, found):
            band = alpha & (yy >= overlap_top) & (yy < cut_y) & (xx >= leg['x0'] - band_margin) & (xx <= leg['x1'] + band_margin)
            lay = layer_from(rgba, leg['mask'] | band)
            pivot = ((leg['x0'] + leg['x1']) / 2 + 20, overlap_top + leg_pivot_dy)
            self.legs[name] = (Layer(lay, pivot), leg['mask'], leg)

        # -- tail --------------------------------------------------------------------------------------------------
        t = rig['tail']
        low2 = alpha.copy()
        low2[:t['low_cut_y'], :] = False
        lab2, n2 = ndi.label(low2)
        tail_low = np.zeros_like(alpha)
        for i in range(1, n2 + 1):
            m = lab2 == i
            ys, xs = np.where(m)
            if m.sum() > 3000 and xs.max() < t['x_max_low']:
                tail_low |= m
        line = t['line_x0'] - (yy - t['line_y0']) * t['line_slope']
        tail_up = alpha & (yy >= t['line_y0']) & (yy < t['low_cut_y']) & (xx < line)
        tail_mask = tail_up | tail_low
        dist = ndi.distance_transform_edt(~((yy < t['line_y0']) | (xx >= line)))
        tarr = layer_from(rgba, tail_mask)
        tarr = np.array(tarr)
        tarr[..., 3] = (tarr[..., 3] * np.clip(dist / t['fade'], 0, 1)).astype(np.uint8)
        self.tail = Layer(Image.fromarray(tarr), tuple(t['pivot']))
        tail_erase = tail_mask & (dist >= t['fade'])

        # -- rider arm + weapon --------------------------------------------------------------------------------------
        a = rig['arm']
        poly = Image.new('L', (W, H), 0)
        ImageDraw.Draw(poly).polygon([tuple(p) for p in a['polygon']], fill=255)
        arm_mask = alpha & (np.array(poly) > 0)
        keep = (xx >= a['keep_x']) & (yy >= a['keep_y'])
        self.arm = Layer(layer_from(rgba, arm_mask), tuple(a['pivot']))

        # -- body ----------------------------------------------------------------------------------------------------
        erase = tail_erase.copy()
        for _, mask, _ in self.legs.values():
            erase |= mask
        erase |= arm_mask & ~keep
        erase_all = erase | (ndi.binary_dilation(erase, iterations=7) & ~alpha)
        base = rgba.copy()
        base[erase_all] = 0
        legx = np.zeros((H, W), bool)
        for _, _, leg in self.legs.values():
            legx[:, max(0, leg['x0'] - 6):leg['x1'] + 7] = True
        fade = np.where(legx & (yy >= cut_y - fade_px), np.clip((cut_y - yy) / float(fade_px), 0, 1), 1.0)
        base[..., 3] = (base[..., 3] * fade).astype(np.uint8)
        self.base = Layer(Image.fromarray(base), (0, 0))
        self.g = rig.get('gait', {})

    def frame(self, state: str, i: int, n: int) -> Image.Image:
        t = i / n
        cv = self.cv
        g = self.g
        if state == 'idle':
            bob = -4 * (1 - math.cos(2 * math.pi * t)) / 2
            tail_ang = 4 * math.sin(2 * math.pi * (t - 0.15))
            arm_ang = 1.6 * math.sin(2 * math.pi * (t + 0.1))
            legs = {nm: (0.0, 0.0) for nm in self.LEG_NAMES}
            shift = 0.0
        elif state == 'walk':
            bob = -9 * abs(math.sin(2 * math.pi * t * 2)) + 4
            tail_ang = 7 * math.sin(2 * math.pi * (t - 0.15))
            arm_ang = 2.5 * math.sin(2 * math.pi * (t + 0.1))
            legs = {}
            for nm in self.LEG_NAMES:
                ph = t + self.GAIT[nm]
                legs[nm] = (15 * math.sin(2 * math.pi * ph), -16 * max(0.0, math.cos(2 * math.pi * ph)))
            shift = 0.0
        else:  # attack: javelin wind-up, thrust, recover; the horse leans into it
            ang, shift = keyframes(t, [(0.0, 0, 0), (0.15, -14, -10), (0.35, -24, -16), (0.5, 6, 14),
                                       (0.62, 30, 22), (0.75, 18, 12), (0.9, 4, 3), (1.0, 0, 0)])
            bob = -6 * math.sin(math.pi * t)
            tail_ang = -0.5 * shift
            arm_ang = ang
            legs = {nm: ((-1 if nm.startswith(('A', 'B')) else 1) * 0.45 * abs(shift), 0.0) for nm in self.LEG_NAMES}
        parts = [cv.place(self.tail, shift, bob, tail_ang)]
        for nm in self.DRAW_ORDER:
            layer = self.legs[nm][0]
            a, lift = legs[nm]
            parts.append(cv.place(layer, shift, bob + lift, a))
        parts.append(cv.place(self.base, shift, bob))
        parts.append(cv.place(self.arm, shift, bob, arm_ang))
        return cv.compose(parts)


class FirearmRig:
    """A standing shooter (#621 rifleman): two legs that stride, a body that bobs, and a firing recoil with muzzle flash.

    Legs are the two connected components below `cut_y`; each carries a copy of the body pixels it overlaps (the band
    `overlap_top`..`cut_y`) and is drawn BEHIND the body so the hip joint stays closed through a small swing. The muzzle
    flash and smoke are drawn procedurally at `muzzle` (source pixels) in yellow/white/grey, never red, so the tint key
    cannot pick them up. Rig keys (all source pixels): cut_y, overlap_top, hip_y, muzzle [x, y], stride_deg, recoil_px.
    """

    def __init__(self, rgba: np.ndarray, rig: dict):
        self.rgba = rgba
        H, W = rgba.shape[:2]
        self.cv = Canvas((W, H), int(max(W, H) * 0.14))
        alpha = rgba[..., 3] > 40
        cut_y = rig.get('cut_y')  # absent: a crew-served or seated unit with no legs to stride (whole figure is the body)
        overlap_top = rig.get('overlap_top', 0)
        self.hip_y = rig.get('hip_y', 0)
        self.muzzle = tuple(rig['muzzle'])
        self.stride = rig.get('stride_deg', 15.0)
        self.recoil = rig.get('recoil_px', 7.0)
        self.amp = rig.get('bob', 0.012) * H
        comps = []
        if cut_y is not None:
            low = alpha.copy()
            low[:cut_y, :] = False
            lab, n = ndi.label(low)
            for i in range(1, n + 1):
                m = lab == i
                if m.sum() >= rig.get('min_leg_pixels', 150):
                    xs = np.where(m.any(0))[0]
                    comps.append(dict(mask=m, x0=int(xs.min()), x1=int(xs.max())))
            comps.sort(key=lambda d: d['x0'])
            if len(comps) != 2:
                raise SystemExit(f'expected 2 legs below cut_y={cut_y}, found {[(d["x0"], d["x1"]) for d in comps]}: adjust cut_y')
        self.legs = []
        for k, d in enumerate(comps):  # k == 0: far/back leg (left), k == 1: near/front leg (right)
            band = np.zeros((H, W), bool)
            band[overlap_top:cut_y, max(0, d['x0'] - 6):d['x1'] + 7] = True
            keep = d['mask'] | (band & alpha)
            cx = (d['x0'] + d['x1']) / 2
            self.legs.append(Layer(layer_from(rgba, keep), pivot=(cx, rig['hip_y'])))
        body = alpha.copy()
        if cut_y is not None:
            body[cut_y:, :] = False
        self.body = Layer(layer_from(rgba, body), pivot=(W * 0.5, H * 0.97))

    def _flash(self, strength: float, smoke: float, dx: float, dy: float) -> Image.Image:
        out = Image.new('RGBA', self.cv.can, (0, 0, 0, 0))
        d = ImageDraw.Draw(out)
        mx, my = self.muzzle[0] + self.cv.pad + dx, self.muzzle[1] + self.cv.pad + dy
        if strength > 0:
            r = 26 * strength
            star = []
            for j in range(16):  # 8-point starburst
                rr = r if j % 2 == 0 else r * 0.38
                ang = j * math.pi / 8
                star.append((mx + 6 + math.cos(ang) * rr * (1.35 if j % 4 == 0 else 1.0), my + math.sin(ang) * rr))
            d.polygon(star, fill=(255, 214, 92, 235))
            d.ellipse([mx + 6 - r * 0.45, my - r * 0.45, mx + 6 + r * 0.45, my + r * 0.45], fill=(255, 250, 220, 255))
        if smoke > 0:
            for j, (ox, oy, rad) in enumerate([(10, -2, 9), (24, -8, 12), (40, -13, 14)]):
                a = round(150 * smoke * (1 - j * 0.22))
                d.ellipse([mx + ox - rad, my + oy - rad, mx + ox + rad, my + oy + rad], fill=(205, 205, 205, a))
        return out.filter(ImageFilter.GaussianBlur(0.8))

    def frame(self, state: str, i: int, n: int) -> Image.Image:
        t = i / n
        dx = dy = 0.0
        rot = 0.0
        far = near = 0.0
        flash = smoke = 0.0
        if state == 'idle':
            dy = -0.5 * self.amp * (1 - math.cos(2 * math.pi * t))
        elif state == 'walk':
            far = self.stride * math.sin(2 * math.pi * t)
            near = -far
            dy = -self.amp * 1.4 * abs(math.sin(2 * math.pi * t))
            rot = 0.8 * math.sin(2 * math.pi * t)
        else:  # attack = fire: settle aim, flash + kick back, recover; smoke drifts off
            kick, rot = keyframes(t, [(0, 0, 0), (0.2, 0, 0.3), (0.3, -1, -2.2), (0.55, -0.35, -0.8), (1, 0, 0)])
            dx = kick * self.recoil
            flash = max(0.0, 1 - abs(t - 0.3) / 0.14) if 0.16 <= t <= 0.45 else 0.0
            smoke = max(0.0, min(1.0, (t - 0.28) / 0.1)) * (1 - max(0.0, (t - 0.65) / 0.35)) if t >= 0.28 else 0.0
            near = -0.8 * kick * 2
        parts = [self.cv.place(leg, dx * 0.5, dy, ang) for leg, ang in zip(self.legs, (far, near))]
        parts.append(self.cv.place(self.body, dx, dy, rot))
        if flash > 0 or smoke > 0:
            parts.append(self._flash(flash, smoke, dx, dy))
        return self.cv.compose(parts)


PROFILES = {'static': StaticRig, 'mounted': MountedRig, 'firearm': FirearmRig}


# ----------------------------------------------------------------------------------------------------------------------
# tint key + packing
# ----------------------------------------------------------------------------------------------------------------------
def tint_membership(rgba: np.ndarray, key: dict) -> np.ndarray:
    """0..1 per pixel: how strongly this pixel is part of the civ-tinted region (soft edges)."""
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    h, s, v = rgb_to_hsv_arrays(rgb)
    in_hue = np.zeros(h.shape, bool)
    for lo, hi in key['hue_ranges']:
        in_hue |= (h >= lo) & (h <= hi)
    sat = smoothstep(key['min_sat'] - 0.10, key['min_sat'] + 0.10, s)
    val = smoothstep(key['min_val'] - 0.05, key['min_val'] + 0.05, v)
    return np.where(in_hue, sat * val, 0.0) * (rgba[..., 3] > 0)


def split_base_and_mask(rgba: np.ndarray, key: dict, vref: float):
    """base: tint pixels become grey (v/vref); mask: tint membership * alpha. Both premultiplication-safe (straight alpha)."""
    m = tint_membership(rgba, key).astype(np.float32)
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    _, _, v = rgb_to_hsv_arrays(rgb)
    grey = np.clip(v / vref, 0, 1)[..., None] * np.ones(3, np.float32)
    out = rgb * (1 - m[..., None]) + grey * m[..., None]
    base = np.dstack([out, rgba[..., 3:4].astype(np.float32) / 255.0])
    mask = np.dstack([np.ones_like(out), (m * rgba[..., 3] / 255.0)[..., None]])
    return base, mask


def to_cell(img: np.ndarray, crop, scale: float, size: int, ox: int, oy: int) -> Image.Image:
    """Crop, scale (premultiplied to avoid halos) and place into a size x size transparent cell at (ox, oy)."""
    x0, y0, x1, y1 = crop
    a = img[y0:y1, x0:x1].copy()
    a[..., :3] *= a[..., 3:4]  # premultiply
    h, w = a.shape[:2]
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    chans = [Image.fromarray(a[..., c]).resize((nw, nh), Image.LANCZOS) for c in range(4)]
    small = np.dstack([np.array(c) for c in chans])
    al = np.clip(small[..., 3:4], 1e-6, 1)
    small[..., :3] = np.clip(small[..., :3] / al, 0, 1)
    out = np.zeros((size, size, 4), np.float32)
    px0, py0 = max(0, ox), max(0, oy)
    sx0, sy0 = px0 - ox, py0 - oy
    ex, ey = min(size, ox + nw), min(size, oy + nh)
    out[py0:ey, px0:ex] = small[sy0:sy0 + (ey - py0), sx0:sx0 + (ex - px0)]
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))


def build(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    uid = spec['id']
    src = np.array(Image.open(REPO / spec['source']).convert('RGBA'))
    prof = PROFILES[spec['profile']](src, spec.get('rig', {}))
    anims = spec['animations']  # {state: frames}
    fr = spec['frame']
    S = fr['size']

    # 1) render every frame at source resolution on the padded canvas, as float RGBA
    raw = {}
    for state, n in anims.items():
        raw[state] = [np.array(prof.frame(state, i, n)).astype(np.float32) / 255.0 for i in range(n)]

    # 2) one crop + one scale for the whole sheet so frames never jitter
    all_a = np.maximum.reduce([f[..., 3] for fs in raw.values() for f in fs])
    ys, xs = np.where(all_a > 0.03)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    rest = raw['idle'][0][..., 3]
    ry, _ = np.where(rest > 0.03)
    feet_y = int(ry.max()) + 1
    base_y = fr['baseline'] * S
    scale = min(fr['fit_width'] * S / (x1 - x0), (base_y - fr.get('top_margin', 0.03) * S) / (feet_y - y0))
    ox = round((S - (x1 - x0) * scale) / 2)
    oy = round(base_y - (feet_y - y0) * scale)
    below = round((y1 - feet_y) * scale)  # content below the feet line (bobbing hooves)
    assert oy >= 0, 'content exceeds the frame top; raise top_margin or lower fit_height'

    # 3) tint key reference value from the source (p90 of V in the keyed region)
    key = spec['tint']
    m0 = tint_membership(src, key)
    _, _, v0 = rgb_to_hsv_arrays(src[..., :3].astype(np.float32) / 255.0)
    vref = float(np.percentile(v0[m0 > 0.5], 90))

    rows = list(anims.keys())
    sheet = Image.new('RGBA', (COLS * S, len(rows) * S), (0, 0, 0, 0))
    msheet = Image.new('RGBA', (COLS * S, len(rows) * S), (0, 0, 0, 0))
    sh = fr.get('shadow')
    for r, state in enumerate(rows):
        for c, f in enumerate(raw[state]):
            base, mask = split_base_and_mask((f * 255).astype(np.uint8), key, vref)
            cell = to_cell(base, (x0, y0, x1, y1), scale, S, ox, oy)
            mcell = to_cell(mask, (x0, y0, x1, y1), scale, S, ox, oy)
            if sh:  # soft ground shadow baked under the feet (not tinted)
                shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
                d = ImageDraw.Draw(shadow)
                rx, ry_ = sh['rx'] * S, sh['ry'] * S
                cx, cy = S * 0.5, base_y - ry_ * 0.4
                d.ellipse([cx - rx, cy - ry_, cx + rx, cy + ry_], fill=(0, 0, 0, round(255 * sh['opacity'])))
                shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.008))
                shadow.alpha_composite(cell)
                cell = shadow
            sheet.paste(cell, (c * S, r * S))
            msheet.paste(mcell, (c * S, r * S))

    out_dir = REPO / 'public' / 'images' / 'units' / uid
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out_dir / 'sheet.png', optimize=True)
    msheet.save(out_dir / 'mask.png', optimize=True)

    states = {st: {'row': r, 'frames': anims[st], 'fps': spec['fps'][st]} for r, st in enumerate(rows)}
    manifest = {
        'id': uid, 'frameSize': S, 'cols': COLS, 'rows': len(rows), 'states': states,
        'sheet': f'images/units/{uid}/sheet.png', 'mask': f'images/units/{uid}/mask.png',
        'facing': spec.get('facing', 'right'),
    }
    ts_dir = REPO / 'src' / 'renderer' / 'sprites' / 'png' / 'generated'
    ts_dir.mkdir(parents=True, exist_ok=True)
    body = json.dumps(manifest, indent=2)
    (ts_dir / f'{uid}.manifest.ts').write_text(
        '// Auto-generated by scripts/sprite-puppet/puppet.py — do not edit manually.\n'
        f'// Source: {spec["source"]} (profile "{spec["profile"]}"). Re-run: python3 -I scripts/sprite-puppet/puppet.py build {spec_path.relative_to(REPO)}\n'
        "import type { PngSpriteManifest } from '../png-sprite-types';\n\n"
        f'export const manifest: PngSpriteManifest = {body};\n'
    )

    # 4) human review contact sheet: tinted frames on map green, idle/walk/attack rows
    prev_dir = REPO / '.verification' / 'puppet' / uid
    prev_dir.mkdir(parents=True, exist_ok=True)
    bg = Image.new('RGBA', sheet.size, (143, 191, 106, 255))
    tinted = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    tinted.alpha_composite(sheet)
    col = np.array([0x1d, 0x4a, 0x8c]) / 255.0
    ta, ma = np.array(tinted).astype(np.float32) / 255.0, np.array(msheet).astype(np.float32) / 255.0
    ta[..., :3] = ta[..., :3] * (1 - ma[..., 3:4]) + ta[..., :3] * col * ma[..., 3:4]
    bg.alpha_composite(Image.fromarray((ta * 255 + 0.5).astype(np.uint8)))
    bg.convert('RGB').save(prev_dir / 'preview.png')
    kb = (out_dir / 'sheet.png').stat().st_size / 1024 + (out_dir / 'mask.png').stat().st_size / 1024
    print(f'{uid}: {COLS}x{len(rows)} cells of {S}px, scale {scale:.4f}, vref {vref:.3f}, {kb:.0f} KB total (sheet+mask)')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] != 'build':
        raise SystemExit(__doc__)
    build(REPO / sys.argv[2] if not Path(sys.argv[2]).is_absolute() else Path(sys.argv[2]))
