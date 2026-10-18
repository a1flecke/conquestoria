#!/usr/bin/env python3
"""building-sprite: turn one vetted generated image into a building art PNG (#620).

Dev-time only (needs Python 3.11+, `pillow`); nothing here ships. Run it isolated: `python3 -I <this file> ...`.

    scan    <image>          security-validate an untrusted download (read-only, JSON report, exit 1 on failure)
    preview <spec.json>      key, trim and shrink, then write $BUILDING_SOURCES_DIR/<id>.preview.png: the sprite at 36 / 72 / 192 px
                             on a map-green and a dark panel background
    build   <spec.json>      scan, key, trim, shrink, quantise, write public/images/buildings/art/<id>.png and its provenance
                             record, and print the ledger line to update

The image is generated on a flat magenta (#FF00FF) background. This tool keys that colour to transparency (a soft edge, with the
magenta spill pulled out of the outline), trims to the building, pads to a square and shrinks. The scan is the one shared with
the General portrait tool (`scripts/portrait-pixelate/portrait_pixelate.py`, loaded by path so there is one implementation). The
game ships ONLY the fresh PNG this tool writes from decoded pixels, which discards every metadata block. The downloaded original
is never copied into the repository; its SHA-256 is recorded instead.

Spec (JSON):
  { "id": "royal_mint",                  // file name stem; the building id the art is for
    "sourceFile": "royal_mint.png",      // looked up inside $BUILDING_SOURCES_DIR
    "buildingIds": ["royal_mint"],       // every catalog id that shows this image
    "alt": "A stone mint ...",           // accessible description
    "size": 256, "colors": 160,          // output pixels per side; palette size for the quantiser
    "provenance": {"generator": "ChatGPT image generation (OpenAI)", "generatorUrl": "https://chatgpt.com/",
                   "plan": "paid ChatGPT plan (owner statement)", "generatedOn": "2026-10-18", "prompt": "...", "notes": "..."} }
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / 'public' / 'images' / 'buildings' / 'art'
PROV_DIR = REPO / 'design' / 'building-art'
MAX_OUTPUT_BYTES = 70 * 1024
KEY_SOLID = 150   # min(r, b) - g above this is pure background
KEY_EDGE = 70     # below this is pure foreground; between the two is a soft edge
PAD = 0.03


def _load_portrait_tool():
    path = REPO / 'scripts' / 'portrait-pixelate' / 'portrait_pixelate.py'
    spec = importlib.util.spec_from_file_location('portrait_pixelate', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


scan = _load_portrait_tool().scan


def key_out(img: Image.Image) -> Image.Image:
    """Chroma-key the magenta background: full transparency, a soft edge, and spill pulled out of the outline."""
    rgb = img.convert('RGB')
    w, h = rgb.size
    src = rgb.load()
    out = Image.new('RGBA', (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = min(r, b) - g
            if m > KEY_SOLID:
                dst[x, y] = (0, 0, 0, 0)
            elif m > KEY_EDGE:
                alpha = round(255 * (KEY_SOLID - m) / (KEY_SOLID - KEY_EDGE))
                dst[x, y] = (max(0, r - m // 2), g, max(0, b - m // 2), alpha)
            else:
                dst[x, y] = (r, g, b, 255)
    return out


def square_trim(rgba: Image.Image) -> Image.Image:
    box = rgba.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if box is None:
        raise SystemExit('nothing left after keying: is the background really flat magenta?')
    cropped = rgba.crop(box)
    side = round(max(cropped.size) * (1 + 2 * PAD))
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    return square


def process(src: Path, spec: dict) -> Image.Image:
    with Image.open(src) as opened:
        keyed = key_out(opened)
    size = spec.get('size', 256)
    return square_trim(keyed).resize((size, size), Image.LANCZOS)


def quantise(img: Image.Image, colors: int) -> Image.Image:
    return img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)


def _sources_dir() -> Path:
    sources = os.environ.get('BUILDING_SOURCES_DIR')
    if not sources:
        raise SystemExit('set BUILDING_SOURCES_DIR to the folder holding the downloaded originals (they are never kept in the repo)')
    return Path(sources)


def preview(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    sources = _sources_dir()
    src = sources / spec['sourceFile']
    report = scan(src)
    if not report['ok']:
        raise SystemExit(f'refusing {spec["id"]}: image failed the security scan: {report.get("error")}')
    sprite = process(src, spec)
    sheet = Image.new('RGB', (2 * 210, 36 + 72 + 192 + 40), (0, 0, 0))
    for col, bg in enumerate([(88, 140, 70), (30, 32, 40)]):
        tile = Image.new('RGB', (210, sheet.height), bg)
        y = 6
        for px in (36, 72, 192):
            small = sprite.resize((px, px), Image.LANCZOS)
            tile.paste(small, ((210 - px) // 2, y), small)
            y += px + 10
        sheet.paste(tile, (col * 210, 0))
    target = sources / f'{spec["id"]}.preview.png'
    sheet.save(target)
    print(f'preview: {target}  (36 / 72 / 192 px; left on map green, right on a dark panel)')


def build(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    bid = spec['id']
    src = _sources_dir() / spec['sourceFile']
    report = scan(src)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if not report['ok']:
        raise SystemExit(f'refusing {bid}: image failed the security scan')
    flat = process(src, spec)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f'{bid}.png'
    colors = spec.get('colors', 160)
    quantise(flat, colors).save(out_path, 'PNG', optimize=True)  # fresh PNG from decoded pixels: no metadata
    size = out_path.stat().st_size
    if size > MAX_OUTPUT_BYTES:
        out_path.unlink()
        raise SystemExit(f'{bid}: {size} bytes exceeds {MAX_OUTPUT_BYTES}; lower "colors" or "size" in the spec')
    check = scan(out_path)
    if not check['ok'] or check['metadataDroppedOnReencode']:
        out_path.unlink()
        raise SystemExit(f'output failed its own scan: {check}')
    PROV_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        'id': bid,
        'file': f'public/images/buildings/art/{bid}.png',
        'tool': 'scripts/building-sprite/building_sprite.py',
        'buildingIds': spec['buildingIds'],
        'alt': spec['alt'],
        'processing': {'key': 'magenta chroma key', 'size': spec.get('size', 256), 'colors': colors},
        'original': {'sha256': report['sha256'], 'bytes': report['bytes'], 'pixels': report['size'], 'scan': report['checks'], 'notRedistributed': True},
        'output': {'sha256': check['sha256'], 'bytes': check['bytes']},
        'origin': 'generated-image',
        **spec['provenance'],
    }
    (PROV_DIR / f'{bid}.provenance.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
    count = len(list(PROV_DIR.glob('*.provenance.json')))
    print(f'{bid}: wrote {out_path.relative_to(REPO)} ({check["bytes"]} bytes) and its provenance record')
    print(f'Update docs/asset-rights-ledger.md: `ChatGPT image generation (building sprites)` count -> {count}')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('scan', 'preview', 'build'):
        raise SystemExit(__doc__)
    if sys.argv[1] == 'scan':
        result = scan(Path(sys.argv[2]))
        print(json.dumps(result, indent=2, ensure_ascii=False))
        raise SystemExit(0 if result['ok'] else 1)
    (preview if sys.argv[1] == 'preview' else build)(Path(sys.argv[2]))
