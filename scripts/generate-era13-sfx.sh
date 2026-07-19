#!/usr/bin/env bash
set -euo pipefail

# Era 13 MR5: reproducible local SFX. Each clip layers deterministic lavfi tone/noise
# with a repository-owned base clip; no downloaded or opaque audio is introduced.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/audio/sfx"
mkdir -p "$OUT"

render() {
  local name="$1" duration="$2" frequency="$3" color="$4" seed="$5" source="$6"
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=${frequency}:duration=${duration}:sample_rate=44100" \
    -f lavfi -i "anoisesrc=color=${color}:duration=${duration}:sample_rate=44100:seed=${seed}" \
    -stream_loop -1 -i "$OUT/$source" \
    -filter_complex "[0:a]volume=0.15[t];[1:a]volume=0.045[n];[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.34[s];[t][n][s]amix=inputs=3:duration=first,highpass=f=35,lowpass=f=6500,afade=t=in:st=0:d=0.02,afade=t=out:st=$(awk -v d="$duration" 'BEGIN { printf "%.3f", d-0.08 }'):d=0.08,volume=18dB,alimiter=limit=0.80:level=false" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a libvorbis -q:a 4 "$OUT/$name.ogg"
}

render combat-drone-fire       0.52 640 white 13001 stealth-bomber-drop.ogg
render combat-drone-impact     0.46 180 pink  13002 stealth-bomber-impact.ogg
render combat-drone-death      0.72 90 brown 13003 stealth-bomber-death.ogg
render autonomous-frigate-fire 0.62 210 white 13004 trireme-attack-swing.ogg
render autonomous-frigate-hit  0.56 120 brown 13005 trireme-attack-impact.ogg
render autonomous-frigate-death 0.88 70 brown 13006 steamship-death.ogg
render exosuit-fire            0.48 300 white 13007 crossbowman-ranged-loose.ogg
render exosuit-impact          0.42 160 pink  13008 crossbowman-ranged-impact.ogg
render exosuit-death           0.64 90 brown 13009 warrior-death.ogg
render propagandist-death      0.46 140 brown 13010 spy_hacker-death.ogg
render drone-controller-death  0.46 240 brown 13011 spy_hacker-death.ogg

for clip in "$OUT"/{combat-drone-fire,combat-drone-impact,combat-drone-death,autonomous-frigate-fire,autonomous-frigate-hit,autonomous-frigate-death,exosuit-fire,exosuit-impact,exosuit-death,propagandist-death,drone-controller-death}.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$clip" >/dev/null
done
