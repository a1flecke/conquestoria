#!/usr/bin/env bash
# #889: the Great General command cues.
#
# Four cues, each its own event and none of them a unit death or a combat hit:
#   general-rally          a warm rising three-note chime (steadied, healed)
#   general-seize          a quick rising whoosh with a blade-edge swish (one more action)
#   general-last-stand     a low, heavy brace: iron plate plus a hollow fifth (hold the line)
#   general-final-command  the longest and weightiest: a slow swell over a deep impact (a last order; also retirement)
#
# Same provenance path as scripts/generate-combat-outcome-sfx.sh and scripts/generate-pirate-sfx.sh: each cue is a
# deterministic derivative of an existing Kenney CC0 recording already carried in public/audio/sfx/, layered with
# in-project ffmpeg lavfi sine tones, then filtered and re-encoded to OGG Vorbis. The sources and licence are recorded in
# src/audio/general-command-audio-sources.ts and AUDIO-CREDITS.md. No downloads, no third-party audio added.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/audio/stinger/general"
mkdir -p "$OUT"

need() {
  if [[ ! -f "$ROOT/public/$1" ]]; then
    printf 'Missing general-command SFX source asset: %s\n' "$ROOT/public/$1" >&2
    exit 1
  fi
}

encode() {
  # $1 output, $2 duration; remaining args: ffmpeg inputs then -filter_complex graph (ending in [out])
  local output="$1"; shift
  local duration="$1"; shift
  ffmpeg -hide_banner -loglevel error -y "$@" \
    -map "[out]" -t "$duration" -ar 44100 -ac 1 \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
    -c:a libvorbis -q:a 4 "$output"
}

# Rally: C5 - E5 - G5, each note a soft bell (fast attack, long decay), staggered 120 ms, over a faint hand-over rustle.
need audio/sfx/transport-unload.ogg
encode "$OUT/general-rally.ogg" 1.05 \
  -f lavfi -i "sine=frequency=523.25:duration=1.05:sample_rate=44100" \
  -f lavfi -i "sine=frequency=659.25:duration=1.05:sample_rate=44100" \
  -f lavfi -i "sine=frequency=783.99:duration=1.05:sample_rate=44100" \
  -i "$ROOT/public/audio/sfx/transport-unload.ogg" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.01,afade=t=out:st=0.04:d=0.6,volume=0.5[n1];\
[1:a]adelay=120,afade=t=in:st=0.12:d=0.01,afade=t=out:st=0.16:d=0.65,volume=0.45[n2];\
[2:a]adelay=240,afade=t=in:st=0.24:d=0.01,afade=t=out:st=0.28:d=0.75,volume=0.42[n3];\
[3:a]atrim=0:0.5,asetpts=PTS-STARTPTS,aresample=44100,volume=0.10[rustle];\
[n1][n2][n3][rustle]amix=inputs=4:duration=longest:normalize=0,highpass=f=120,lowpass=f=6500,volume=12dB,alimiter=limit=0.70:level=false[out]"

# Seize the Moment: a sine sweep rising fast under a blade swish.
need audio/sfx/swordsman-attack-swing.ogg
encode "$OUT/general-seize.ogg" 0.55 \
  -f lavfi -i "aevalsrc='0.5*sin(2*PI*(380*t+1500*t*t))':d=0.55:s=44100" \
  -i "$ROOT/public/audio/sfx/swordsman-attack-swing.ogg" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.03,afade=t=out:st=0.25:d=0.28,volume=0.35[sweep];\
[1:a]atrim=0:0.55,asetpts=PTS-STARTPTS,aresample=44100,volume=0.7[swish];\
[sweep][swish]amix=inputs=2:duration=longest:normalize=0,highpass=f=200,lowpass=f=7500,afade=t=out:st=0.45:d=0.1,volume=12dB,alimiter=limit=0.70:level=false[out]"

# Last Stand: iron plate struck over a hollow open fifth (A2 + E3); a brace, not a hit.
need audio/sfx/hull-iron.ogg
encode "$OUT/general-last-stand.ogg" 0.95 \
  -f lavfi -i "sine=frequency=110:duration=0.95:sample_rate=44100" \
  -f lavfi -i "sine=frequency=164.81:duration=0.95:sample_rate=44100" \
  -i "$ROOT/public/audio/sfx/hull-iron.ogg" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.02,afade=t=out:st=0.2:d=0.7,volume=0.55[root];\
[1:a]afade=t=in:st=0:d=0.02,afade=t=out:st=0.2:d=0.7,volume=0.35[fifth];\
[2:a]atrim=0:0.7,asetpts=PTS-STARTPTS,aresample=44100,volume=0.5[plate];\
[root][fifth][plate]amix=inputs=3:duration=longest:normalize=0,highpass=f=45,lowpass=f=5200,afade=t=out:st=0.85:d=0.1,volume=10dB,alimiter=limit=0.70:level=false[out]"

# Final Command: a slow swell (D3 - A3 - D4) over a deep siege impact. The longest cue in the family on purpose.
need audio/sfx/catapult-siege-impact.ogg
encode "$OUT/general-final-command.ogg" 1.7 \
  -f lavfi -i "sine=frequency=146.83:duration=1.7:sample_rate=44100" \
  -f lavfi -i "sine=frequency=220:duration=1.7:sample_rate=44100" \
  -f lavfi -i "sine=frequency=293.66:duration=1.7:sample_rate=44100" \
  -i "$ROOT/public/audio/sfx/catapult-siege-impact.ogg" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.5,afade=t=out:st=1.0:d=0.7,volume=0.5[d3];\
[1:a]adelay=250,afade=t=in:st=0.25:d=0.5,afade=t=out:st=1.05:d=0.65,volume=0.4[a3];\
[2:a]adelay=500,afade=t=in:st=0.5:d=0.5,afade=t=out:st=1.1:d=0.6,volume=0.32[d4];\
[3:a]atrim=0:1.0,asetpts=PTS-STARTPTS,aresample=44100,volume=0.45[impact];\
[d3][a3][d4][impact]amix=inputs=4:duration=longest:normalize=0,highpass=f=40,lowpass=f=5800,afade=t=out:st=1.55:d=0.15,volume=12dB,alimiter=limit=0.70:level=false[out]"

for file in "$OUT"/*.ogg; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" >/dev/null
  peak="$(ffmpeg -hide_banner -i "$file" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  if ! awk -v peak="$peak" 'BEGIN { exit !(peak <= -1.0 && peak >= -12.0) }'; then
    printf 'Unsafe general-command audio peak %s dBFS: %s\n' "$peak" "$file" >&2
    exit 1
  fi
  printf '  %s  peak=%s dBFS\n' "$(basename "$file")" "$peak"
done

printf 'Generated 4 general-command audio files.\n'
