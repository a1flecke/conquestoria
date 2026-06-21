#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SFX_DIR="$ROOT/public/audio/sfx/pirates"
STINGER_DIR="$ROOT/public/audio/stinger/pirates"
mkdir -p "$SFX_DIR" "$STINGER_DIR"

render() {
  local output="$1" duration="$2" frequency="$3" noise="$4"
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=${frequency}:duration=${duration}:sample_rate=44100" \
    -f lavfi -i "anoisesrc=color=${noise}:duration=${duration}:sample_rate=44100" \
    -filter_complex "[0:a]volume=0.22[tone];[1:a]volume=0.07[noise];[tone][noise]amix=inputs=2:duration=shortest,highpass=f=35,lowpass=f=6500,afade=t=in:st=0:d=0.02,afade=t=out:st=$(awk -v d="$duration" 'BEGIN { printf "%.3f", d-0.08 }'):d=0.08,volume=24dB,alimiter=limit=0.80:level=false" \
    -c:a libvorbis -q:a 4 "$output"
}

units=(galley corsair frigate ironclad fast-attack-craft mothership)
frequencies=(92 118 76 61 164 48)
for i in "${!units[@]}"; do
  unit="${units[$i]}"; base="${frequencies[$i]}"
  render "$SFX_DIR/$unit-movement.ogg" 0.60 "$base" brown
  render "$SFX_DIR/$unit-fire.ogg" 0.70 "$((base * 4))" white
  render "$SFX_DIR/$unit-impact.ogg" 0.55 "$((base * 2))" pink
  render "$SFX_DIR/$unit-death.ogg" 1.10 "$base" brown
done

render "$SFX_DIR/enclave-ambience.ogg" 8.00 44 brown
render "$SFX_DIR/enclave-defense.ogg" 0.80 240 white
render "$SFX_DIR/enclave-collapse.ogg" 1.40 52 brown

strategic=(sighting raid blockade tribute contract-accepted contract-exposed)
strategic_frequencies=(330 196 110 440 523 147)
for i in "${!strategic[@]}"; do
  render "$STINGER_DIR/${strategic[$i]}.ogg" 1.20 "${strategic_frequencies[$i]}" pink
done

for file in "$SFX_DIR"/*.ogg "$STINGER_DIR"/*.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" >/dev/null
  peak="$(ffmpeg -hide_banner -i "$file" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  if ! awk -v peak="$peak" 'BEGIN { exit !(peak <= -1.0 && peak >= -12.0) }'; then
    printf 'Unsafe pirate audio peak %s dBFS: %s\n' "$peak" "$file" >&2
    exit 1
  fi
done

printf 'Generated 33 pirate audio files.\n'
