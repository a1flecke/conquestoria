#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SFX_DIR="$ROOT/public/audio/sfx/pirates"
STINGER_DIR="$ROOT/public/audio/stinger/pirates"
mkdir -p "$SFX_DIR" "$STINGER_DIR"

render() {
  local output="$1" duration="$2" frequency="$3" noise="$4" seed="$5" source_path="$6" source_volume="$7"
  local source="$ROOT/public/$source_path"
  if [[ ! -f "$source" ]]; then
    printf 'Missing pirate SFX source asset: %s\n' "$source" >&2
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

units=(galley corsair frigate ironclad fast-attack-craft mothership)
frequencies=(92 118 76 61 164 48)
movement_sources=(
  audio/sfx/naval-move-step.ogg
  audio/sfx/trireme-attack-swing.ogg
  audio/sfx/naval-move-step.ogg
  audio/sfx/steamship-death.ogg
  audio/sfx/transport-load.ogg
  audio/sfx/galleon-death.ogg
)
fire_sources=(
  audio/sfx/galley-attack-swing.ogg
  audio/sfx/trireme-attack-swing.ogg
  audio/sfx/catapult-siege-fire.ogg
  audio/sfx/ballista-siege-fire.ogg
  audio/sfx/transport-unload.ogg
  audio/sfx/catapult-siege-fire.ogg
)
impact_sources=(
  audio/sfx/galley-attack-impact.ogg
  audio/sfx/trireme-attack-impact.ogg
  audio/sfx/catapult-siege-impact.ogg
  audio/sfx/ballista-siege-impact.ogg
  audio/sfx/transport-death.ogg
  audio/sfx/ballista-siege-impact.ogg
)
death_sources=(
  audio/sfx/carrack-death.ogg
  audio/sfx/transport-death.ogg
  audio/sfx/galleon-death.ogg
  audio/sfx/steamship-death.ogg
  audio/sfx/carrack-death.ogg
  audio/sfx/galleon-death.ogg
)
for i in "${!units[@]}"; do
  unit="${units[$i]}"; base="${frequencies[$i]}"
  seed="$((1000 + i * 10))"
  render "$SFX_DIR/$unit-movement.ogg" 0.60 "$base" brown "$((seed + 1))" "${movement_sources[$i]}" 0.30
  render "$SFX_DIR/$unit-fire.ogg" 0.70 "$((base * 4))" white "$((seed + 2))" "${fire_sources[$i]}" 0.34
  render "$SFX_DIR/$unit-impact.ogg" 0.55 "$((base * 2))" pink "$((seed + 3))" "${impact_sources[$i]}" 0.38
  render "$SFX_DIR/$unit-death.ogg" 1.10 "$base" brown "$((seed + 4))" "${death_sources[$i]}" 0.36
done

render "$SFX_DIR/enclave-ambience.ogg" 8.00 44 brown 2001 audio/sfx/naval-move-step.ogg 0.22
render "$SFX_DIR/enclave-defense.ogg" 0.80 240 white 2002 audio/sfx/ballista-siege-fire.ogg 0.38
render "$SFX_DIR/enclave-collapse.ogg" 1.40 52 brown 2003 audio/sfx/galleon-death.ogg 0.40

strategic=(sighting raid blockade tribute contract-accepted contract-exposed)
strategic_frequencies=(330 196 110 440 523 147)
strategic_sources=(
  audio/sfx/transport-load.ogg
  audio/sfx/catapult-siege-fire.ogg
  audio/sfx/naval-move-step.ogg
  audio/sfx/transport-unload.ogg
  audio/sfx/galley-attack-impact.ogg
  audio/sfx/ballista-siege-impact.ogg
)
for i in "${!strategic[@]}"; do
  render "$STINGER_DIR/${strategic[$i]}.ogg" 1.20 "${strategic_frequencies[$i]}" pink "$((3000 + i))" "${strategic_sources[$i]}" 0.30
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
