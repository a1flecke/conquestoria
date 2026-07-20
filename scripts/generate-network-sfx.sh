#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SFX="$ROOT/public/audio/sfx"
OUT="$ROOT/public/audio/stinger/network"
mkdir -p "$OUT"

render() {
  local name="$1" duration="$2" frequency="$3" color="$4" seed="$5" source="$6"
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=${frequency}:duration=${duration}:sample_rate=44100" \
    -f lavfi -i "anoisesrc=color=${color}:duration=${duration}:sample_rate=44100:seed=${seed}" \
    -stream_loop -1 -i "$SFX/$source" \
    -filter_complex "[0:a]volume=0.13[t];[1:a]volume=0.04[n];[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.30[s];[t][n][s]amix=inputs=3:duration=first,highpass=f=35,lowpass=f=6500,afade=t=in:st=0:d=0.02,afade=t=out:st=$(awk -v d="$duration" 'BEGIN { printf "%.3f", d-0.08 }'):d=0.08,volume=17dB,alimiter=limit=0.80:level=false" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a libvorbis -q:a 4 "$OUT/$name.ogg"
}

render constructive-resolution 0.72 392 pink 16001 transport-load.ogg
render hostile-warning          0.82 174 brown 16002 ballista-siege-fire.ogg
render hostile-consequence      0.76 126 brown 16003 stealth-bomber-impact.ogg
render surge                    0.70 523 white 16004 transport-unload.ogg
render recovery                 0.78 294 pink 16005 worker-death.ogg

for clip in "$OUT"/*.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$clip" >/dev/null
done
