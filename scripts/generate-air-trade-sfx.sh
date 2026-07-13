#!/usr/bin/env bash
set -euo pipefail

# Trade Routes Overhaul (#553 MR3/4) — death SFX for the 3 Air trade line tiers
# (Air Freighter, Jet Freighter, Global Air Cargo). Follows the same synth pattern as
# scripts/generate-naval-trader-sfx.sh: a sine tone + colored noise, mixed with a
# trimmed slice of an existing air-domain death sound (stealth-bomber-death.ogg — the
# only air-domain death sound currently on disk) so the new units sound related to
# the air fleet without being exact duplicates.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SFX_DIR="$ROOT/public/audio/sfx"
mkdir -p "$SFX_DIR"

render() {
  local output="$1" duration="$2" frequency="$3" noise="$4" seed="$5" source_path="$6" source_volume="$7"
  local source="$ROOT/public/$source_path"
  if [[ ! -f "$source" ]]; then
    printf 'Missing SFX source asset: %s\n' "$source" >&2
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

units=(air_freighter jet_freighter global_air_cargo)
durations=(0.50 0.55 0.60)
frequencies=(80 90 100)
death_sources=(
  audio/sfx/stealth-bomber-death.ogg
  audio/sfx/stealth-bomber-death.ogg
  audio/sfx/stealth-bomber-death.ogg
)

for i in "${!units[@]}"; do
  unit="${units[$i]}"
  seed="$((6000 + i * 10))"
  render "$SFX_DIR/$unit-death.ogg" "${durations[$i]}" "${frequencies[$i]}" brown "$seed" "${death_sources[$i]}" 0.60
done

for file in "${units[@]/%/-death.ogg}"; do
  path="$SFX_DIR/$file"
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$path" >/dev/null
  peak="$(ffmpeg -hide_banner -i "$path" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  if ! awk -v peak="$peak" 'BEGIN { exit !(peak <= -1.0 && peak >= -12.0) }'; then
    printf 'Unsafe audio peak %s dBFS: %s\n' "$peak" "$path" >&2
    exit 1
  fi
done

printf 'Generated 3 Air trade line death SFX files.\n'
