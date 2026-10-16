#!/usr/bin/env python3
"""portrait-pixelate: turn one vetted public-domain or generated image into a small, softly stylised General portrait.

Dev-time only (needs Python 3.11+, `pillow`); nothing here ships. Run it isolated: `python3 -I <this file> ...`.

    scan  <image>            security-validate an untrusted download (read-only, prints a JSON report, exit 1 on failure)
    build <spec.json>        scan, crop, stylise, write public/images/generals/<id>.png and the provenance record

The game ships ONLY the re-encoded, palette-limited PNG this tool writes. The downloaded original is never copied into
the repository or served; its SHA-256 and source URL are recorded in the provenance file instead. Re-encoding from
decoded pixels also discards every metadata block (EXIF, XMP, ICC, text chunks) and anything appended to the file.

`scan` rejects: a file over MAX_BYTES; anything that is not a plain PNG or JPEG by its magic bytes (no SVG, GIF, WebP, HTML,
archives); a decode error; more than MAX_PIXELS (decompression-bomb guard, Pillow warnings are treated as errors); more
than one frame; and trailing bytes after the image data (the polyglot / appended-payload trick). It reports, but does not
need to reject, metadata that the re-encode will drop. If `clamscan` (ClamAV) is installed it is run too.

Spec (JSON):
  { "id": "gen_caesar", "sourceFile": "caesar.jpg",          // looked up inside $PORTRAIT_SOURCES_DIR
    "crop": {"x": 0.0, "y": 0.03, "side": 1.0},        // fractions of the image WIDTH; a square window
    "size": 96, "colors": 64,
    "provenance": {"sourceUrl": "...", "title": "...", "author": "...", "licence": "Public domain", "licenceUrl": "...",
                   "retrievedOn": "2026-10-15", "notes": "..."} }
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import warnings
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

REPO = Path(__file__).resolve().parents[2]
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)


class ScanError(Exception):
    pass


def _trailing_ok(raw: bytes, fmt: str) -> None:
    if fmt == 'PNG':
        end = raw.rfind(b'IEND')
        if end < 0 or len(raw) - (end + 8) != 0:  # IEND + 4-byte CRC must be the last bytes
            raise ScanError(f'PNG has {len(raw) - (end + 8) if end >= 0 else "?"} bytes after IEND (appended data)')
    else:
        end = raw.rfind(b'\xff\xd9')
        if end < 0 or len(raw) - (end + 2) > 2:  # tolerate a stray newline or two, nothing more
            raise ScanError('JPEG has data after the end-of-image marker (appended data)')


def scan(path: Path) -> dict:
    report: dict = {'file': str(path), 'ok': False, 'checks': []}
    try:
        raw = path.read_bytes()
        report['bytes'] = len(raw)
        report['sha256'] = hashlib.sha256(raw).hexdigest()
        if len(raw) > MAX_BYTES:
            raise ScanError(f'file is {len(raw)} bytes (limit {MAX_BYTES})')
        if raw.startswith(b'\x89PNG\r\n\x1a\n'):
            fmt = 'PNG'
        elif raw.startswith(b'\xff\xd8\xff'):
            fmt = 'JPEG'
        else:
            raise ScanError(f'not a plain PNG/JPEG by magic bytes (starts {raw[:8]!r})')
        report['checks'].append(f'magic bytes: {fmt}')
        _trailing_ok(raw, fmt)
        report['checks'].append('no data after the image stream')

        with Image.open(path) as probe:
            if probe.format != fmt:
                raise ScanError(f'decoder says {probe.format} but magic says {fmt}')
            report['size'] = list(probe.size)
            if probe.size[0] * probe.size[1] > MAX_PIXELS:
                raise ScanError(f'{probe.size[0]}x{probe.size[1]} px exceeds {MAX_PIXELS}')
            probe.verify()  # must come straight after open(); it invalidates the handle
        with Image.open(path) as full:  # decode again: verify() alone does not prove every pixel decodes
            if getattr(full, 'n_frames', 1) != 1 or getattr(full, 'is_animated', False):
                raise ScanError('multi-frame / animated image')
            meta = sorted(set(list(full.info.keys()) + (['exif'] if full.getexif() else [])))
            report['metadataDroppedOnReencode'] = [m for m in meta if m not in ('dpi', 'jfif', 'jfif_version', 'jfif_unit', 'jfif_density', 'progressive', 'progression', 'gamma', 'transparency')]
            full.load()
        report['checks'].append('decodes cleanly, one frame, within pixel limit')

        clam = shutil.which('clamscan')
        if clam:
            result = subprocess.run([clam, '--no-summary', str(path)], capture_output=True, text=True, timeout=120)
            if result.returncode == 1:
                raise ScanError(f'ClamAV: {result.stdout.strip()}')
            report['checks'].append('ClamAV: clean' if result.returncode == 0 else f'ClamAV error (exit {result.returncode}), not a verdict')
        else:
            report['checks'].append('ClamAV: not installed (structural checks only)')
        report['ok'] = True
    except (ScanError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning, SyntaxError, ValueError, RuntimeError) as exc:
        report['error'] = f'{type(exc).__name__}: {exc}'
    return report


def stylise(src: Path, crop: dict, size: int, colors: int, tone: str | None = None) -> Image.Image:
    """Crop to a square, downscale with Lanczos, lift contrast a touch and limit the palette (with dithering).

    Deliberately soft: at the default 96 px / 64 colours the result reads as a painted miniature, not as blocky pixel art.
    """
    with Image.open(src) as opened:
        img = opened.convert('RGB')
    w, h = img.size
    side = max(1, round(crop['side'] * w))
    x0 = max(0, min(w - side, round(crop['x'] * w)))
    y0 = max(0, min(h - side, round(crop['y'] * w)))
    sq = img.crop((x0, y0, x0 + side, y0 + side)).resize((size, size), Image.LANCZOS)
    if tone == 'parchment':  # warm a white-background engraving so it sits with the painted portraits
        paper = Image.new('RGB', sq.size, (232, 214, 176))
        sq = ImageChops.multiply(sq, paper)
    sq = ImageEnhance.Contrast(sq).enhance(1.12)
    sq = ImageEnhance.Color(sq).enhance(1.1)
    sq = sq.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))
    return sq.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).convert('RGB')


def build(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    gid = spec['id']
    sources_dir = os.environ.get('PORTRAIT_SOURCES_DIR')
    if not sources_dir:
        raise SystemExit('set PORTRAIT_SOURCES_DIR to the folder holding the downloaded originals (they are never kept in the repo)')
    src = Path(sources_dir) / spec['sourceFile']
    report = scan(src)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if not report['ok']:
        raise SystemExit(f'refusing {gid}: image failed the security scan')
    out = stylise(src, spec['crop'], spec.get('size', 96), spec.get('colors', 64), spec.get('tone'))
    out_dir = REPO / 'public' / 'images' / 'generals'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f'{gid}.png'
    out.save(out_path, optimize=True)  # fresh PNG from decoded pixels: no metadata, nothing appended
    check = scan(out_path)
    if not check['ok'] or check['metadataDroppedOnReencode']:
        raise SystemExit(f'output failed its own scan: {check}')
    prov_dir = REPO / 'design' / 'general-portraits'
    prov_dir.mkdir(parents=True, exist_ok=True)
    record = {
        'id': gid,
        'file': f'public/images/generals/{gid}.png',
        'tool': 'scripts/portrait-pixelate/portrait_pixelate.py',
        'processing': {'crop': spec['crop'], 'size': spec.get('size', 96), 'colors': spec.get('colors', 64), **({'tone': spec['tone']} if spec.get('tone') else {})},
        'original': {'sha256': report['sha256'], 'bytes': report['bytes'], 'pixels': report['size'], 'scan': report['checks'], 'notRedistributed': True},
        'output': {'sha256': check['sha256'], 'bytes': check['bytes']},
        **spec['provenance'],
        'likenessNote': 'An illustration after a historical artwork, not a verified likeness. Many portraits of historical figures were made long after their lifetimes.',
    }
    (prov_dir / f'{gid}.provenance.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
    print(f'{gid}: wrote {out_path.relative_to(REPO)} ({check["bytes"]} bytes) and its provenance record')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('scan', 'build'):
        raise SystemExit(__doc__)
    if sys.argv[1] == 'scan':
        result = scan(Path(sys.argv[2]))
        print(json.dumps(result, indent=2, ensure_ascii=False))
        raise SystemExit(0 if result['ok'] else 1)
    build(Path(sys.argv[2]))
