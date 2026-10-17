#!/usr/bin/env python3
"""codex-image: turn one vetted generated (or public-domain) image into a Legendary Wonder Codex illustration.

Dev-time only (needs Python 3.11+, `pillow`); nothing here ships. Run it isolated: `python3 -I <this file> ...`.

    scan    <image>          security-validate an untrusted download (read-only, JSON report, exit 1 on failure)
    preview <spec.json>      crop and grade, then write a contact sheet to $CODEX_SOURCES_DIR/<id>.preview.png showing the
                             desktop (2:1) and phone (9:5) crops the codex really shows (it is `object-fit: cover`, 280 px tall)
    build   <spec.json>      scan, crop, grade, write public/images/wonders/codex/<id>.jpg and its provenance record, and print
                             the registry line and ledger rows to paste

The security scan is the same one the General portrait tool uses (`scripts/portrait-pixelate/portrait_pixelate.py`, loaded by
path so there is one implementation): size cap, plain PNG/JPEG by magic bytes, clean decode, pixel limit, one frame, nothing
appended after the image, ClamAV when installed. The game ships ONLY the fresh JPEG this tool writes from decoded pixels,
which discards every metadata block (EXIF, XMP, ICC, C2PA/provenance manifests, text chunks) and anything hidden. The downloaded
original is never copied into the repository; its SHA-256 is recorded instead.

Spec (JSON):
  { "id": "eiffel-tower",                      // file name stem; also the default image-source id suffix
    "sourceFile": "eiffel.png",                // looked up inside $CODEX_SOURCES_DIR
    "wonderIds": ["eiffel-tower"],             // the legendary wonders that show this image
    "alt": "A wrought-iron lattice tower ...", // accessible description (also the source title)
    "crop": {"x": 0.0, "y": 0.05, "w": 1.0},   // fractions of the image WIDTH; the window is 16:9
    "size": [960, 540], "quality": 82,
    "grade": {"brightness": 1.0, "contrast": 1.04, "saturation": 1.0, "warmth": 0.0, "vignette": 0.0},
    "retouch": [{"x": 0.57, "y": 0.61, "w": 0.035, "h": 0.022, "blur": 6}],   // optional: blur invented lettering (source fractions)
    "provenance": {"generator": "ChatGPT image generation (OpenAI)", "generatorUrl": "https://chatgpt.com/",
                   "plan": "paid ChatGPT plan (owner statement)", "generatedOn": "2026-10-17", "prompt": "...", "notes": "..."} }
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / 'public' / 'images' / 'wonders' / 'codex'
PROV_DIR = REPO / 'design' / 'wonder-codex-images'
MAX_OUTPUT_BYTES = 220 * 1024
ASPECT = 16 / 9
DESKTOP = (560, 280)  # codex card width x max-height, object-fit: cover
PHONE = (360, 200)


def _load_portrait_tool():
    path = REPO / 'scripts' / 'portrait-pixelate' / 'portrait_pixelate.py'
    spec = importlib.util.spec_from_file_location('portrait_pixelate', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


_portrait = _load_portrait_tool()
scan = _portrait.scan


def _cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """What `object-fit: cover` shows for a box of `size`: scale to fill, centre-crop the overflow."""
    w, h = img.size
    scale = max(size[0] / w, size[1] / h)
    scaled = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    left = (scaled.width - size[0]) // 2
    top = (scaled.height - size[1]) // 2
    return scaled.crop((left, top, left + size[0], top + size[1]))


def process(src: Path, spec: dict) -> Image.Image:
    with Image.open(src) as opened:
        img = opened.convert('RGB')
    w, h = img.size
    # Local retouch on the full-resolution source, before cropping: blur away small pseudo-lettering the generator invented
    # (a ship's name, a plate). Rectangles are fractions of the source width/height; "blur" is the Gaussian radius in source px.
    for patch in spec.get('retouch', []):
        left, top = round(patch['x'] * w), round(patch['y'] * h)
        right, bottom = min(w, left + round(patch['w'] * w)), min(h, top + round(patch['h'] * h))
        if right <= left or bottom <= top:
            raise SystemExit(f'retouch rectangle {patch} is empty or outside the image')
        region = img.crop((left, top, right, bottom)).filter(ImageFilter.GaussianBlur(patch.get('blur', 6)))
        img.paste(region, (left, top))
    crop = spec.get('crop', {'x': 0.0, 'y': 0.0, 'w': 1.0})
    cw = max(1, min(w, round(crop['w'] * w)))
    ch = max(1, round(cw / ASPECT))
    if ch > h:
        raise SystemExit(f'crop window {cw}x{ch} does not fit the {w}x{h} image: lower crop.w or give a wider source')
    x0 = max(0, min(w - cw, round(crop['x'] * w)))
    y0 = max(0, min(h - ch, round(crop['y'] * w)))
    out_w, out_h = spec.get('size', [960, 540])
    out = img.crop((x0, y0, x0 + cw, y0 + ch)).resize((out_w, out_h), Image.LANCZOS)

    grade = spec.get('grade', {})
    if grade.get('brightness', 1.0) != 1.0:
        out = ImageEnhance.Brightness(out).enhance(grade['brightness'])
    out = ImageEnhance.Contrast(out).enhance(grade.get('contrast', 1.0))
    out = ImageEnhance.Color(out).enhance(grade.get('saturation', 1.0))
    warmth = grade.get('warmth', 0.0)
    if warmth:
        r, g, b = out.split()
        r = r.point(lambda v: min(255, round(v * (1 + 0.08 * warmth))))
        b = b.point(lambda v: min(255, round(v * (1 - 0.08 * warmth))))
        out = Image.merge('RGB', (r, g, b))
    vignette = grade.get('vignette', 0.0)
    if vignette:
        mask = Image.new('L', out.size, 255)
        draw = ImageDraw.Draw(mask)
        steps = 40
        for i in range(steps):
            inset = int(min(out.size) * 0.5 * (i / steps))
            shade = round(255 - 255 * vignette * (1 - i / steps) ** 2)
            draw.rectangle((inset, inset, out.width - inset, out.height - inset), outline=shade)
        out = Image.composite(out, Image.new('RGB', out.size, (0, 0, 0)), mask)
    return out


def preview(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    sources_dir = os.environ.get('CODEX_SOURCES_DIR')
    if not sources_dir:
        raise SystemExit('set CODEX_SOURCES_DIR to the folder holding the downloaded originals (they are never kept in the repo)')
    src = Path(sources_dir) / spec['sourceFile']
    report = scan(src)
    if not report['ok']:
        raise SystemExit(f'refusing {spec["id"]}: image failed the security scan: {report.get("error")}')
    out = process(src, spec)
    desk, phone = _cover(out, DESKTOP), _cover(out, PHONE)
    sheet = Image.new('RGB', (DESKTOP[0] + PHONE[0] + out.width // 2 + 40, max(DESKTOP[1], PHONE[1], out.height // 2) + 20), (20, 22, 30))
    sheet.paste(desk, (10, 10))
    sheet.paste(phone, (DESKTOP[0] + 20, 10))
    sheet.paste(out.resize((out.width // 2, out.height // 2), Image.LANCZOS), (DESKTOP[0] + PHONE[0] + 30, 10))
    target = Path(sources_dir) / f'{spec["id"]}.preview.png'
    sheet.save(target)
    print(f'preview: {target}  (left: desktop 2:1 crop, middle: phone crop, right: the whole 16:9 image)')


def build(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    gid = spec['id']
    sources_dir = os.environ.get('CODEX_SOURCES_DIR')
    if not sources_dir:
        raise SystemExit('set CODEX_SOURCES_DIR to the folder holding the downloaded originals (they are never kept in the repo)')
    src = Path(sources_dir) / spec['sourceFile']
    report = scan(src)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if not report['ok']:
        raise SystemExit(f'refusing {gid}: image failed the security scan')
    out = process(src, spec)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f'{gid}.jpg'
    quality = spec.get('quality', 82)
    out.save(out_path, 'JPEG', quality=quality, optimize=True, progressive=True)  # fresh JPEG from decoded pixels: no metadata
    size = out_path.stat().st_size
    if size > MAX_OUTPUT_BYTES:
        out_path.unlink()
        raise SystemExit(f'{gid}: {size} bytes exceeds {MAX_OUTPUT_BYTES}; lower "quality" or "size" in the spec')
    check = scan(out_path)
    if not check['ok'] or check['metadataDroppedOnReencode']:
        out_path.unlink()
        raise SystemExit(f'output failed its own scan: {check}')
    PROV_DIR.mkdir(parents=True, exist_ok=True)
    prov = spec['provenance']
    record = {
        'id': gid,
        'imageSourceId': spec.get('imageSourceId', f'image-{gid}'),
        'file': f'public/images/wonders/codex/{gid}.jpg',
        'tool': 'scripts/codex-image/codex_image.py',
        'wonderIds': spec['wonderIds'],
        'alt': spec['alt'],
        'processing': {'crop': spec.get('crop'), 'size': spec.get('size', [960, 540]), 'quality': quality, 'grade': spec.get('grade', {}), 'retouch': spec.get('retouch', [])},
        'original': {'sha256': report['sha256'], 'bytes': report['bytes'], 'pixels': report['size'], 'scan': report['checks'], 'notRedistributed': True},
        'output': {'sha256': check['sha256'], 'bytes': check['bytes']},
        'origin': spec.get('origin', 'generated-image'),
        **prov,
    }
    (PROV_DIR / f'{gid}.provenance.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
    sid = record['imageSourceId']
    creator = f"Generated by {prov['generator']}"
    print(f'{gid}: wrote {out_path.relative_to(REPO)} ({check["bytes"]} bytes) and its provenance record\n')
    print('Paste into src/systems/wonder-codex/sources.ts (WONDER_CODEX_IMAGE_SOURCES):')
    print(f"  generatedImage('{sid}', {json.dumps(spec['alt'])}, {json.dumps(prov['generator'])}, {json.dumps(prov['generatorUrl'])}, '/images/wonders/codex/{gid}.jpg'),")
    print('\nLedger rows for docs/wonder-codex-source-ledger.md:')
    print(f"  baseline: | `{sid}` | {prov['generatorUrl']} | `/images/wonders/codex/{gid}.jpg` | AI-generated image, non-commercial project | {creator}. Provenance: `design/wonder-codex-images/{gid}.provenance.json` (#609). |")
    for wid in spec['wonderIds']:
        print(f"  per-entry: set the image columns of `{wid}` to `{sid}` | `/images/wonders/codex/{gid}.jpg` | AI-generated image, non-commercial project | {creator} |")


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('scan', 'preview', 'build'):
        raise SystemExit(__doc__)
    if sys.argv[1] == 'scan':
        result = scan(Path(sys.argv[2]))
        print(json.dumps(result, indent=2, ensure_ascii=False))
        raise SystemExit(0 if result['ok'] else 1)
    (preview if sys.argv[1] == 'preview' else build)(Path(sys.argv[2]))
