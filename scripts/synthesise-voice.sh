#!/usr/bin/env bash
# scripts/synthesise-voice.sh
#
# Synthesises voice lines for Conquestoria using Piper TTS + ffmpeg.
# Run AFTER generating the manifest:
#   npx tsx scripts/gen-voice-manifest.ts > voice-manifest.json
#   bash scripts/synthesise-voice.sh
#
# Prerequisites:
#   piper   — install: pip install piper-tts
#   ffmpeg  — available via mise on PATH
#   voice-manifest.json  — in repo root

set -euo pipefail

MANIFEST="${1:-voice-manifest.json}"

if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: $MANIFEST not found."
  echo "Generate it first: npx tsx scripts/gen-voice-manifest.ts > $MANIFEST"
  exit 1
fi

if ! command -v piper &>/dev/null; then
  echo "ERROR: piper not found. Install: pip install piper-tts"
  exit 1
fi

if ! command -v ffmpeg &>/dev/null; then
  echo "ERROR: ffmpeg not found. Install via mise."
  exit 1
fi

python3 - "$MANIFEST" <<'PYEOF'
import json, subprocess, os, sys

manifest_path = sys.argv[1]
with open(manifest_path) as f:
    manifest = json.load(f)

errors = []
for i, job in enumerate(manifest):
    wav_path = job['outputPath'].replace('.ogg', '.wav')
    ogg_path = job['outputPath']
    os.makedirs(os.path.dirname(ogg_path), exist_ok=True)

    label = f"[{i+1}/{len(manifest)}] {job['packId']}/{job['eventId']}"
    print(f"{label}: {job['text'][:60]}")

    # Synthesise WAV via Piper
    r = subprocess.run(
        ['piper', '--model', job['piperModel'], '--output_file', wav_path],
        input=job['text'],
        text=True,
        capture_output=True,
    )
    if r.returncode != 0:
        msg = f"  PIPER ERROR: {r.stderr.strip()}"
        print(msg, file=sys.stderr)
        errors.append(f"{label}: {msg}")
        continue

    # Convert WAV → OGG (q:a 4 = ~128 kbps, good quality for speech)
    r = subprocess.run(
        ['ffmpeg', '-y', '-i', wav_path, '-c:a', 'libvorbis', '-q:a', '4', ogg_path],
        capture_output=True,
    )
    if r.returncode != 0:
        msg = f"  FFMPEG ERROR: {r.stderr.decode().strip()}"
        print(msg, file=sys.stderr)
        errors.append(f"{label}: {msg}")
        continue

    os.remove(wav_path)
    print(f"  -> {ogg_path}")

print(f"\nDone. {len(manifest) - len(errors)}/{len(manifest)} succeeded.")
if errors:
    print(f"\nFailed ({len(errors)}):")
    for e in errors:
        print(f"  {e}")
    sys.exit(1)
PYEOF
