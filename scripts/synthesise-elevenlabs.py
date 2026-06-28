#!/usr/bin/env python3
"""
ElevenLabs voice synthesis for Conquestoria hero civ packs.

Usage:
  python scripts/synthesise-elevenlabs.py --dry-run        # preview only
  python scripts/synthesise-elevenlabs.py                  # generate files

Reads ELEVEN_API_KEY from .env at project root (two levels up from scripts/).
Saves OGGs to public/audio/voice/<pack>/<event>.ogg.
Skips files that already contain real speech (> 4 KB).
"""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load .env from project root (not worktree)
REPO_ROOT = Path("/Users/aaronfleckenstein/development/github/conquestoria")
env_path = REPO_ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("ELEVEN_API_KEY", "")
if not API_KEY:
    sys.exit("Error: ELEVEN_API_KEY not set in .env or environment.")

BASE_URL = "https://api.elevenlabs.io/v1"
HEADERS = {"xi-api-key": API_KEY}

# Voice name → ElevenLabs voice ID (resolved at runtime via /voices)
VOICE_NAMES = {
    "egypt": "Mohamed - Optimistic, Clear and Hopeful",
    "rome":  "Luke Cala - Realistic and Direct",
    "aztec": "Aztec Cheiftain",
}

SCRIPTS = {
    "aztec": {
        "era-advance":    "The sun demands tribute. We answer with a new age.",
        "city-founded":   "The gods smile on this place. Build the temples.",
        "war-declared":   "The sacred flowery war begins. Capture them for the sun.",
        "tech-completed": "Our priests have unlocked new sacred knowledge.",
        "wonder-built":   "The gods are pleased. The pyramid rises.",
        "wonder-lost":    "They have defiled what the gods gave us.",
        "city-lost":      "A sacred city has fallen. We will retake it.",
        "near-defeat":    "We are still here. The sun has not abandoned us.",
        "victory":        "The fifth sun shines on our empire. It is our time.",
        "peace-signed":   "The war rests. For now.",
    },
    "egypt": {
        "era-advance":    "The Nile rises. Our age is reborn.",
        "city-founded":   "Another monument to eternity is placed.",
        "war-declared":   "The gods demand our enemies fall.",
        "tech-completed": "The scribes have revealed a new truth.",
        "wonder-built":   "It shall stand when empires are dust.",
        "wonder-lost":    "Others have stolen our glory.",
        "city-lost":      "A jewel of the Nile has been seized.",
        "near-defeat":    "Pharaoh does not yield. Not now.",
        "victory":        "Egypt endures. As it always has.",
        "peace-signed":   "The desert is calm again.",
    },
    "rome": {
        "era-advance":    "Rome advances. None shall stand in our way.",
        "city-founded":   "Another city joins the eternal empire.",
        "war-declared":   "Rome does not tolerate insolence.",
        "tech-completed": "Our engineers have surpassed themselves.",
        "wonder-built":   "A marvel worthy of Rome.",
        "wonder-lost":    "We will build something greater.",
        "city-lost":      "This insult will be answered.",
        "near-defeat":    "Rome has survived worse. We endure.",
        "victory":        "All roads lead here. Because we made them.",
        "peace-signed":   "A temporary arrangement.",
    },
}

REAL_SPEECH_MIN_BYTES = 4096  # placeholder stubs are ~4 KB silent OGGs

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_voice_ids() -> dict[str, str]:
    """Return {voice_name: voice_id} for all voices in the account."""
    r = requests.get(f"{BASE_URL}/voices", headers=HEADERS, timeout=10)
    r.raise_for_status()
    return {v["name"]: v["voice_id"] for v in r.json().get("voices", [])}


def get_remaining_credits() -> int:
    r = requests.get(f"{BASE_URL}/user/subscription", headers=HEADERS, timeout=10)
    r.raise_for_status()
    data = r.json()
    used = data.get("character_count", 0)
    limit = data.get("character_limit", 0)
    return limit - used


def synthesise(voice_id: str, text: str, out_path: Path) -> None:
    """Generate speech via ElevenLabs TTS v1, encode to OGG, save to out_path."""
    url = f"{BASE_URL}/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    r = requests.post(url, headers={**HEADERS, "Content-Type": "application/json"},
                      json=payload, timeout=30)
    r.raise_for_status()

    # ElevenLabs returns MP3 by default; convert to OGG via ffmpeg
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(r.content)
        tmp_path = tmp.name

    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", tmp_path, "-vn", "-c:a", "libvorbis", "-q:a", "4",
         str(out_path)],
        check=True, capture_output=True,
    )
    os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan without calling the API")
    parser.add_argument("--pack", choices=list(SCRIPTS), default=None,
                        help="Synthesise only one pack (default: all)")
    args = parser.parse_args()

    packs = [args.pack] if args.pack else list(SCRIPTS)

    # --- resolve voice IDs ---
    print("Fetching voice list…")
    try:
        voice_ids = get_voice_ids()
    except Exception as e:
        sys.exit(f"Error fetching voices: {e}")

    resolved: dict[str, str] = {}
    for pack in packs:
        name = VOICE_NAMES[pack]
        # exact match first, then prefix match
        vid = voice_ids.get(name)
        if not vid:
            matches = [v for n, v in voice_ids.items() if n.startswith(name[:12])]
            vid = matches[0] if matches else None
        if not vid:
            print(f"  WARNING: voice '{name}' not found in account — skipping {pack}")
        else:
            resolved[pack] = vid
            print(f"  {pack}: '{name}' → {vid}")

    # --- credit check ---
    print("\nChecking subscription credits…")
    try:
        remaining = get_remaining_credits()
        print(f"  Remaining credits: {remaining:,}")
    except Exception as e:
        print(f"  WARNING: could not fetch credit balance: {e}")
        remaining = None

    total_chars = sum(
        sum(len(t) for t in SCRIPTS[p].values())
        for p in packs if p in resolved
    )
    print(f"  Characters to generate: {total_chars}")
    if remaining is not None:
        print(f"  Credits after run:      {remaining - total_chars:,}")
        if total_chars > remaining:
            sys.exit("Error: insufficient credits.")

    # --- job list ---
    jobs = []
    for pack in packs:
        if pack not in resolved:
            continue
        for event, text in SCRIPTS[pack].items():
            out = PROJECT_ROOT / "public" / "audio" / "voice" / pack / f"{event}.ogg"
            skip = out.exists() and out.stat().st_size > REAL_SPEECH_MIN_BYTES
            jobs.append((pack, event, text, resolved[pack], out, skip))

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}Jobs ({len(jobs)} total):\n")
    for pack, event, text, vid, out, skip in jobs:
        status = "SKIP (exists)" if skip else "GENERATE"
        print(f"  [{status}] {pack}/{event}.ogg  ({len(text)} chars)")
        print(f"           \"{text}\"")

    to_generate = [(p, e, t, v, o) for p, e, t, v, o, s in jobs if not s]
    print(f"\n  Will generate: {len(to_generate)} files  |  skip: {len(jobs) - len(to_generate)}")

    if args.dry_run:
        print("\nDry run complete. Pass no flags to generate.")
        return

    # --- generate ---
    print()
    for i, (pack, event, text, vid, out) in enumerate(to_generate, 1):
        print(f"[{i}/{len(to_generate)}] {pack}/{event}.ogg…", end=" ", flush=True)
        try:
            synthesise(vid, text, out)
            print(f"OK ({out.stat().st_size // 1024} KB)")
        except Exception as e:
            print(f"ERROR: {e}")

    print("\nDone.")


if __name__ == "__main__":
    main()
