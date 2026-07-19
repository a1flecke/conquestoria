#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELIGION_DIR="$ROOT/public/audio/stinger/religion"
FAMINE_DIR="$ROOT/public/audio/stinger/famine"
mkdir -p "$RELIGION_DIR" "$FAMINE_DIR"

render() {
  local output="$1" duration="$2" frequency="$3" noise="$4" seed="$5" source_path="$6" source_volume="$7"
  local source="$ROOT/public/$source_path"
  if [[ ! -f "$source" ]]; then
    printf 'Missing religion/famine SFX source asset: %s\n' "$source" >&2
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

# Religion cues: warm ascending tones for positive events (founded, city-converted),
# a soft plucked cue for preach, a tense mid tone for loyalty-warning, a minor/falling
# tone for city-defected (a loss for the civ losing the city).
render "$RELIGION_DIR/founded.ogg"          1.60 392 pink   4001 audio/sfx/transport-load.ogg          0.28
render "$RELIGION_DIR/city-converted.ogg"   1.10 349 pink   4002 audio/sfx/worker-death.ogg             0.22
render "$RELIGION_DIR/preach.ogg"           0.90 440 white  4003 audio/sfx/archer-ranged-loose.ogg      0.24
render "$RELIGION_DIR/loyalty-warning.ogg"  1.00 220 brown  4004 audio/sfx/ballista-siege-fire.ogg      0.26
render "$RELIGION_DIR/city-defected.ogg"    1.30 165 brown  4005 audio/sfx/knight-death.ogg             0.30

# Famine cues: onset is a low, dissonant descending tone (bad news); resolved is a
# warmer ascending tone (relief), matching the founded/city-defected polarity above.
render "$FAMINE_DIR/onset.ogg"    1.20 130 brown 4006 audio/sfx/settler-death.ogg      0.28
render "$FAMINE_DIR/resolved.ogg" 1.30 294 pink  4007 audio/sfx/transport-unload.ogg   0.26

for file in "$RELIGION_DIR"/*.ogg "$FAMINE_DIR"/*.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" >/dev/null
  peak="$(ffmpeg -hide_banner -i "$file" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  if ! awk -v peak="$peak" 'BEGIN { exit !(peak <= -1.0 && peak >= -12.0) }'; then
    printf 'Unsafe religion/famine audio peak %s dBFS: %s\n' "$peak" "$file" >&2
    exit 1
  fi
done

printf 'Generated 7 religion/famine audio files.\n'
