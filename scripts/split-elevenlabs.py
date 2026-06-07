#!/usr/bin/env python3
"""
Split a single ElevenLabs civ audio file into 10 individual OGG voice lines.

Usage:
  python scripts/split-elevenlabs.py <pack> <input.mp3>

Examples:
  python scripts/split-elevenlabs.py egypt ~/Downloads/egypt-all.mp3
  python scripts/split-elevenlabs.py rome  ~/Downloads/rome-all.mp3

Expects exactly 9 silence gaps (producing 10 segments). Fails loudly if the
count is wrong — re-download and try again.

Output: public/audio/voice/<pack>/era-advance.ogg ... peace-signed.ogg
"""

import subprocess
import sys
import re
import tempfile
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

EVENTS = [
    "era-advance",
    "city-founded",
    "war-declared",
    "tech-completed",
    "wonder-built",
    "wonder-lost",
    "city-lost",
    "near-defeat",
    "victory",
    "peace-signed",
]

SILENCE_THRESHOLD_DB = "-35dB"
SILENCE_MIN_DURATION  = 1.5   # seconds — gaps shorter than this are ignored


def detect_silences(input_path: str) -> list[tuple[float, float]]:
    """Return list of (start, end) silence intervals in seconds."""
    result = subprocess.run(
        [
            "ffmpeg", "-i", input_path,
            "-af", f"silencedetect=noise={SILENCE_THRESHOLD_DB}:d={SILENCE_MIN_DURATION}",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    output = result.stderr

    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", output)]
    ends   = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", output)]

    if len(starts) != len(ends):
        # Last silence may reach end of file without a silence_end line
        ends.append(None)  # will be handled as end-of-file

    return list(zip(starts, ends))


def get_duration(input_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", input_path],
        capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def extract_segment(input_path: str, start: float, end: float, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ss", str(start),
        "-to", str(end),
        "-vn", "-c:a", "libvorbis", "-q:a", "4",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: python scripts/split-elevenlabs.py <pack> <input.mp3>")

    pack, input_path = sys.argv[1], sys.argv[2]

    if pack not in ("egypt", "rome", "china", "england", "france",
                    "viking", "zulu", "aztec", "mongolia", "gondor"):
        sys.exit(f"Unknown pack: {pack}")

    if not os.path.exists(input_path):
        sys.exit(f"File not found: {input_path}")

    print(f"Analysing {input_path}…")
    silences = detect_silences(input_path)
    duration = get_duration(input_path)

    print(f"  Duration:       {duration:.2f}s")
    print(f"  Silence gaps:   {len(silences)}")
    for i, (s, e) in enumerate(silences):
        e_str = f"{e:.2f}s" if e is not None else "EOF"
        print(f"    gap {i+1}: {s:.2f}s → {e_str}")

    if len(silences) != 9:
        sys.exit(
            f"\nError: expected 9 silence gaps (for 10 lines) but found {len(silences)}.\n"
            f"Re-download the file or adjust SILENCE_THRESHOLD_DB / SILENCE_MIN_DURATION."
        )

    # Build segment boundaries: speech runs between silence ends and silence starts
    boundaries: list[tuple[float, float]] = []
    seg_start = 0.0
    for i, (sil_start, sil_end) in enumerate(silences):
        boundaries.append((seg_start, sil_start))
        seg_start = sil_end if sil_end is not None else duration
    boundaries.append((seg_start, duration))

    print(f"\nSegments:")
    for i, (s, e) in enumerate(boundaries):
        print(f"  {EVENTS[i]}: {s:.2f}s → {e:.2f}s  ({e-s:.2f}s)")

    print(f"\nExtracting {len(EVENTS)} OGGs to public/audio/voice/{pack}/…")
    for i, (event, (seg_start, seg_end)) in enumerate(zip(EVENTS, boundaries), 1):
        out = PROJECT_ROOT / "public" / "audio" / "voice" / pack / f"{event}.ogg"
        print(f"  [{i}/{len(EVENTS)}] {event}.ogg…", end=" ", flush=True)
        extract_segment(input_path, seg_start, seg_end, out)
        print(f"OK ({out.stat().st_size // 1024} KB)")

    print("\nDone. Verify with:")
    print(f"  find public/audio/voice/{pack} -name '*.ogg' | sort")


if __name__ == "__main__":
    main()
