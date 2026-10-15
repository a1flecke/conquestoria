#!/usr/bin/env bash
# #657: distinctive cues for pillage and unit-capture outcomes.
#
# These are deliberately NOT reused from combat-death or bombardment entries: a
# pillaged improvement, a captured civilian and a captured naval hull must each
# read as its own event, never as a unit dying or a shell landing.
#
# Same provenance path as scripts/generate-pirate-sfx.sh and
# scripts/generate-religion-sfx.sh: each cue is a deterministic derivative of an
# existing Kenney CC0 source recording already carried in public/audio/sfx/,
# layered with in-project ffmpeg lavfi tone + seeded noise, then filtered and
# re-encoded to OGG Vorbis. The source files and licence are recorded in
# src/audio/combat-outcome-audio-sources.ts and AUDIO-CREDITS.md. No downloads.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/audio/stinger/combat"
mkdir -p "$OUT"

render() {
  local output="$1" duration="$2" frequency="$3" noise="$4" seed="$5" source_path="$6" source_volume="$7"
  local source="$ROOT/public/$source_path"
  if [[ ! -f "$source" ]]; then
    printf 'Missing combat-outcome SFX source asset: %s\n' "$source" >&2
    exit 1
  fi
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=${frequency}:duration=${duration}:sample_rate=44100" \
    -f lavfi -i "anoisesrc=color=${noise}:duration=${duration}:sample_rate=44100:seed=${seed}" \
    -stream_loop -1 -i "$source" \
    -filter_complex "[0:a]volume=0.16[tone];[1:a]volume=0.045[noise];[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,aresample=44100,volume=${source_volume}[src];[tone][noise][src]amix=inputs=3:duration=first,highpass=f=35,lowpass=f=6500,afade=t=in:st=0:d=0.02,afade=t=out:st=$(awk -v d="$duration" 'BEGIN { printf "%.3f", d-0.08 }'):d=0.08,volume=18dB,alimiter=limit=0.80:level=false" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
    -c:a libvorbis -q:a 4 "$output"
}

# Improvement pillage: a heavy, crumbling impact — the improvement is torn down.
render "$OUT/pillage.ogg"                 0.70  88 brown 9201 audio/sfx/catapult-siege-impact.ogg 0.42
# Road-only pillage: the same act but lighter and shorter — a scuffing clatter,
# not a structure coming down.
render "$OUT/pillage-road.ogg"            0.45 165 white 9202 audio/sfx/transport-unload.ogg      0.20
# Civilian capture: an intact hand-over — a warm rising loading tone, never a
# strike or a death.
render "$OUT/capture-civilian.ogg"        0.60 392 pink  9203 audio/sfx/transport-load.ogg        0.22
# Age-of-Sail boarding: prize crew taking a wooden hull — timber thunk plus a
# rising swell, distinctly not the metal sink cue.
render "$OUT/capture-naval-boarding.ogg"  0.90 233 pink  9204 audio/sfx/galley-attack-impact.ogg  0.40
# Modern disable-and-capture: a steam/metal hull seized and powered down —
# mechanical, higher and ringing, so it can't be confused with boarding.
render "$OUT/capture-naval-modern.ogg"    0.90 620 brown 9205 audio/sfx/steamship-death.ogg       0.36

for file in "$OUT"/*.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" >/dev/null
  peak="$(ffmpeg -hide_banner -i "$file" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  if ! awk -v peak="$peak" 'BEGIN { exit !(peak <= -1.0 && peak >= -12.0) }'; then
    printf 'Unsafe combat-outcome audio peak %s dBFS: %s\n' "$peak" "$file" >&2
    exit 1
  fi
  printf '  %s  peak=%s dBFS\n' "$(basename "$file")" "$peak"
done

printf 'Generated 5 combat-outcome audio files.\n'
