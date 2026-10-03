#!/usr/bin/env bash
set -euo pipefail

# #612: reproducible unit SFX. Two kinds of cue, both deterministic ffmpeg graphs:
#   * synthetic: seeded anoisesrc + aevalsrc envelopes/tones (no external audio);
#   * derived: cut, pitch-shifted, filtered and layered from three CC0 OpenGameArt recordings that
#     scripts/fetch-unit-sfx-sources.sh downloads, hash-verifies and extracts (never committed).
# Each cue is rendered to a float WAV, peak-normalised to a per-cue target, then encoded as mono
# 44.1 kHz Ogg Vorbis with metadata stripped (see `finish`).
#
# Usage: scripts/fetch-unit-sfx-sources.sh        (once; verifies pinned SHA-256s)
#        scripts/generate-unit-sfx.sh              (writes public/audio/sfx)
#        UNIT_SFX_OUT=/tmp/out scripts/generate-unit-sfx.sh   (audition without touching the repo)
#
# Cross-cut note: the SFX bus is one-shot with a 200 ms cross-cut (audio-mixer.ts playOneShot), so an
# attacker cue is normally heard for ~200 ms before the defender's impact replaces it. Every attack
# cue therefore puts its identifying transient in the first ~150 ms.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${UNIT_SFX_OUT:-$ROOT/public/audio/sfx}"
SR=44100
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

SRC="${UNIT_SFX_SOURCES:-$HOME/.cache/conquestoria-unit-sfx-sources}"
FIRE="$SRC/firearms/Prepared SFX Library"
NAV="$SRC/naval/qubodup-NavalBattleSoundSet-cc0"
RTS="$SRC/rts/qubodup-rts_warsounds_v2"
VOICE="$SRC/voices/yelling sounds"
PROP="$SRC/prop/airplane_prop_0.ogg"
JET="$SRC/jet/engine_takeoff.wav"
[[ -d "$FIRE" && -d "$NAV" && -d "$RTS" && -d "$VOICE" && -f "$PROP" && -f "$JET" ]] || { echo "missing CC0 sources under $SRC; run scripts/fetch-unit-sfx-sources.sh first" >&2; exit 1; }

# nz LABEL COLOR SEED DUR "FILTERS" "ENVELOPE"  -> seeded noise shaped by a sample-accurate envelope
nz() {
  printf "anoisesrc=color=%s:seed=%s:duration=%s:sample_rate=%s:amplitude=1,%s[%s_n];aevalsrc='%s':d=%s:s=%s[%s_e];[%s_n][%s_e]amultiply[%s]" \
    "$2" "$3" "$4" "$SR" "$5" "$1" "$6" "$4" "$SR" "$1" "$1" "$1" "$1"
}
# tone LABEL DUR "EXPRESSION" -> synthesized waveform
tone() { printf "aevalsrc='%s':d=%s:s=%s[%s]" "$3" "$2" "$SR" "$1"; }
# mix OUTLABEL LABEL... -> sum of already-shaped layers (gains live in the envelopes)
mix() {
  local out="$1"; shift
  local ins="" l
  for l in "$@"; do ins+="[$l]"; done
  printf "%samix=inputs=%s:normalize=0:duration=longest[%s]" "$ins" "$#" "$out"
}
join() { local IFS=';'; printf '%s' "$*"; }

# Loudness policy (matches the existing Kenney-derived cues, which sit at ~-1 dBTP and -14..-22 LUFS):
#   * peak target per cue (PEAK_DB), then the *encoded* file is re-measured and trimmed until its
#     true peak is <= TP_LIMIT_DB (lossy encoding overshoots a float peak by up to ~1 dB);
#   * long, dense cues (explosions, rockets) are additionally capped at LUFS_CAP so they do not
#     out-shout a crisp gunshot. Cues shorter than 400 ms are below EBU R128's gating block and are
#     controlled by peak only.
TP_LIMIT_DB=-1.2
LUFS_CAP=-16.5

measure() { # FILE -> "<integrated LUFS or empty> <true peak dBTP>"
  local e; e="$(ffmpeg -hide_banner -nostats -i "$1" -af ebur128=peak=true -f null - 2>&1)"
  printf '%s %s' "$(awk '/^ +I:/{print $2}' <<<"$e" | tail -1)" "$(awk '/^ +Peak:/{print $2}' <<<"$e" | tail -1)"
}

# cut LABEL INPUT_INDEX SOURCE_RATE START DUR PITCH "FILTERS"
#   one slice of an input file: mono, optionally pitched (varispeed: PITCH 0.3 = 1.7 octaves down and 3.3x longer)
cut() {
  printf "[%s:a]atrim=start=%s:duration=%s,asetpts=PTS-STARTPTS,pan=mono|c0=0.5*c0+0.5*c1,asetrate=%s,aresample=%s,%s[%s]" \
    "$2" "$4" "$5" "$(awk -v r="$3" -v p="$6" 'BEGIN { printf "%d", r * p }')" "$SR" "$7" "$1"
}
# gain LABEL SRC_LABEL DB DELAY_MS -> level + optional delay of an already-cut layer
layer() { printf "[%s]volume=%sdB,adelay=%s:all=1[%s]" "$2" "$3" "$4" "$1"; }

# finish NAME DUR PEAK_DB "POSTFILTER" "GRAPH(...;[mix])" [ffmpeg input args for [0:a], [1:a] ...]
finish() {
  local name="$1" dur="$2" peak="$3" post="$4" graph="$5"
  shift 5
  local wav="$WORK/$name.wav" ogg="$OUT/$name.ogg"
  ffmpeg -hide_banner -loglevel error -y "$@" -filter_complex "${graph};[mix]${post},atrim=0:${dur},asetpts=PTS-STARTPTS[out]" \
    -map "[out]" -ac 1 -ar "$SR" -c:a pcm_f32le "$wav"
  local max gain fade_start attempt lufs tp
  max="$(ffmpeg -hide_banner -nostats -i "$wav" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}')"
  gain="$(awk -v p="$peak" -v m="$max" 'BEGIN { printf "%.2f", p - m }')"
  fade_start="$(awk -v d="$dur" 'BEGIN { printf "%.3f", d - 0.03 }')"
  for attempt in 1 2 3 4 5 6; do
    ffmpeg -hide_banner -loglevel error -y -i "$wav" \
      -af "volume=${gain}dB,afade=t=in:st=0:d=0.002,afade=t=out:st=${fade_start}:d=0.03,alimiter=limit=0.89:level=false" \
      -map_metadata -1 -metadata:s:a:0 encoder= -fflags +bitexact -ac 1 -ar "$SR" -c:a libvorbis -q:a 4 "$ogg"
    read -r lufs tp <<<"$(measure "$ogg")"
    local cut
    cut="$(awk -v tp="$tp" -v l="${lufs:--99}" -v tl="$TP_LIMIT_DB" -v lc="$LUFS_CAP" \
      'BEGIN { a = tp - tl; b = (l > -60) ? l - lc : 0; c = (a > b) ? a : b; printf "%.2f", (c > 0.05) ? c : 0 }')"
    [[ "$cut" == "0.00" ]] && return 0
    gain="$(awk -v g="$gain" -v c="$cut" 'BEGIN { printf "%.2f", g - c - 0.05 }')"
  done
  printf 'FAILED to reach loudness policy for %s (LUFS %s, TP %s)\n' "$name" "$lufs" "$tp" >&2
  return 1
}

ECHO_SHORT="aecho=0.7:0.5:55|130:0.28|0.14"

# ───────────── synthetic cues (approved) ─────────────
finish machine-gun-burst 0.72 -2.0 "$ECHO_SHORT" "$(join \
  "$(nz crack white 61221 0.8 'highpass=f=1500,lowpass=f=8000' '1.0*exp(-mod(t,0.075)*150)*lt(t,0.6)*(0.88+0.12*sin(t*91))')" \
  "$(nz body pink 61222 0.8 'highpass=f=150,lowpass=f=2400' '0.7*exp(-mod(t,0.075)*40)*lt(t,0.6)')" \
  "$(tone thump 0.8 '0.5*sin(2*PI*85*t)*exp(-mod(t,0.075)*45)*lt(t,0.6)')" \
  "$(mix mix crack body thump)")"

finish autocannon-burst 0.55 -2.0 "$ECHO_SHORT" "$(join \
  "$(nz crack white 61231 0.6 'highpass=f=1100,lowpass=f=6500' '1.0*exp(-mod(t,0.042)*170)*lt(t,0.4)')" \
  "$(nz body pink 61232 0.6 'highpass=f=120,lowpass=f=1800' '0.9*exp(-mod(t,0.042)*60)*lt(t,0.4)')" \
  "$(tone thump 0.6 '0.7*sin(2*PI*68*t)*exp(-mod(t,0.042)*55)*lt(t,0.4)')" \
  "$(mix mix crack body thump)")"

finish cannon-fire 1.00 -1.5 "aecho=0.8:0.55:90|210|380:0.4|0.25|0.15" "$(join \
  "$(nz crack white 61301 1.1 'highpass=f=700,lowpass=f=6000' '1.0*exp(-t*55)')" \
  "$(nz boom brown 61302 1.1 'lowpass=f=500' '0.9*exp(-t*4.5)')" \
  "$(tone thump 1.1 '1.0*sin(2*PI*(62*t-60*t*t))*exp(-t*7)')" \
  "$(mix mix crack boom thump)")"

finish shell-blast 0.80 -2.0 "aecho=0.7:0.5:70|160:0.3|0.18" "$(join \
  "$(nz crack white 61341 0.9 'highpass=f=600,lowpass=f=7000' '0.8*exp(-t*22)')" \
  "$(nz boom brown 61342 0.9 'lowpass=f=800' '1.0*exp(-t*6)')" \
  "$(tone thump 0.9 '0.9*sin(2*PI*(70*t-90*t*t))*exp(-t*9)')" \
  "$(nz debris white 61343 0.9 'highpass=f=2000' '0.25*exp(-t*9)*(0.55+0.45*sin(t*140))')" \
  "$(mix mix crack boom thump debris)")"

finish rocket-launch 1.00 -2.0 "anull" "$(join \
  "$(nz hiss white 61401 1.1 'highpass=f=2500' '0.6*min(t/0.12,1)*exp(-max(t-0.12,0)*2.2)')" \
  "$(nz rumble brown 61402 1.1 'lowpass=f=900' '1.0*min(t/0.05,1)*exp(-max(t-0.05,0)*1.6)')" \
  "$(tone sweep 1.1 '0.25*sin(2*PI*(220*t+420*t*t))*min(t/0.1,1)*exp(-t*2.5)')" \
  "$(mix mix hiss rumble sweep)")"

# ───────────── derived from the CC0 recordings ─────────────
# Real single shots (Free Firearm Sound Library, near-distance takes). Onsets measured at 5 ms resolution.
finish rifle-bolt 0.60 -1.5 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,afade=t=out:st=0.4:d=0.2" "$(cut mix 0 96000 1.029 0.65 1.0 'highpass=f=40')" \
  -i "$FIRE/Mosin Nagant/M_21P.wav"
finish rifle-semi 0.50 -1.5 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,afade=t=out:st=0.32:d=0.18" "$(cut mix 0 96000 0.699 0.55 1.0 'highpass=f=40')" \
  -i "$FIRE/AR-15/D_32P.wav"
# 12-gauge blast dropped to a hollow launcher "thump" for the Grenadier.
finish grenade-launch 0.60 -2.0 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,afade=t=out:st=0.4:d=0.2" "$(cut mix 0 96000 0.426 0.5 0.6 'lowpass=f=4000,highpass=f=50')" \
  -i "$FIRE/Nova/O_21P.wav"
# Big guns: the same real transients varispeeded down so the crack keeps its natural texture.
finish field-gun-fire 1.10 -1.5 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,aecho=0.8:0.55:140|300:0.35|0.2,afade=t=out:st=0.8:d=0.3" \
  "$(cut mix 0 96000 0.426 0.5 0.30 'lowpass=f=5000,highpass=f=35')" -i "$FIRE/Nova/O_21P.wav"
finish naval-gun-fire 1.30 -1.5 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,aecho=0.8:0.6:160|340|560:0.4|0.28|0.16,afade=t=out:st=0.9:d=0.4" \
  "$(cut mix 0 96000 1.029 0.5 0.24 'lowpass=f=6000,highpass=f=30')" -i "$FIRE/Mosin Nagant/M_21P.wav"
finish tank-gun-fire 0.70 -1.5 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,aecho=0.7:0.4:45|95:0.3|0.15,afade=t=out:st=0.5:d=0.2" \
  "$(cut mix 0 96000 0.519 0.45 0.55 'highpass=f=90,equalizer=f=2500:t=q:w=1:g=4')" -i "$FIRE/Arisaka/E_25P.wav"

# Torpedo: a muffled compressed-air launch and water rush, then the underwater explosion of the strike.
finish torpedo-launch 1.40 -2.0 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,afade=t=out:st=1.0:d=0.4" "$(join \
  "$(cut w 0 96000 0.426 0.3 0.20 'lowpass=f=260')" \
  "$(cut s 1 44100 0.0 0.8 1.0 'lowpass=f=2200')" \
  "$(layer sl s -3 90)" \
  "$(cut x 2 44100 0.0 1.2 1.0 'lowpass=f=1800')" \
  "$(layer xl x -3 420)" \
  "$(mix mix w sl xl)")" -i "$FIRE/Nova/O_21P.wav" -i "$NAV/Splash.wav" -i "$NAV/WaterSurfaceExplosion07.wav"

# Blasts and wrecks (real explosions from the Naval Battle and RTS War Unit sets).
# Sharp metal strikes on an airframe: the debris clanks from the metal explosion, without its blast.
finish aircraft-hit 0.30 -3.0 "afade=t=out:st=0.16:d=0.14" "$(cut mix 0 44100 0.52 0.32 1.0 'highpass=f=1200')" -i "$NAV/ExplosionMetal.wav"
finish heavy-blast 1.30 -2.0 "afade=t=out:st=0.9:d=0.4" "$(cut mix 0 44100 0.0 1.4 1.0 'anull')" -i "$NAV/WaterSurfaceExplosion05.wav"
finish vehicle-destroyed 1.20 -2.0 "afade=t=out:st=0.8:d=0.4" "$(cut mix 0 44100 0.0 1.3 1.0 'equalizer=f=90:t=q:w=1:g=3')" -i "$NAV/ExplosionMetal.wav"
finish aircraft-crash 1.40 -2.0 "afade=t=out:st=1.0:d=0.4" "$(join \
  "$(cut a 0 44100 0.0 1.6 0.85 'anull')" \
  "$(cut b 1 44100 0.0 0.95 1.0 'anull')" \
  "$(layer bl b -3 80)" \
  "$(mix mix a bl)")" -i "$NAV/ExplosionMetalGverb.wav" -i "$RTS/artil/artil.die.wav"
finish cannon-wreck 0.80 -2.0 "afade=t=out:st=0.5:d=0.3" "$(cut mix 0 44100 0.0 0.9 1.0 'lowpass=f=4500')" -i "$RTS/artil/artil.die.wav"

# Bomber: a real heavy explosion (bombs landing), dropped in pitch for weight.
finish bomb-blast 1.20 -2.0 "afade=t=out:st=0.8:d=0.4" "$(cut mix 0 44100 0.0 0.95 0.75 'anull')" -i "$RTS/artil/artil.die.wav"

# Hull losses: three different recorded water blasts so wooden, iron and modern ships do not sound alike.
finish hull-wood 1.20 -2.0 "afade=t=out:st=0.8:d=0.4" "$(cut mix 0 44100 0.0 1.4 0.9 'lowpass=f=3500')" -i "$NAV/WaterSurfaceExplosion08.wav"
finish hull-iron 1.40 -2.0 "afade=t=out:st=1.0:d=0.4" "$(join \
  "$(cut a 0 44100 0.0 1.5 1.0 'anull')" \
  "$(cut b 1 44100 0.0 1.2 1.0 'anull')" \
  "$(layer bl b -6 100)" \
  "$(mix mix a bl)")" -i "$NAV/WaterSurfaceExplosion02.wav" -i "$NAV/ExplosionMetal.wav"
finish hull-modern 1.30 -2.0 "afade=t=out:st=0.9:d=0.4" "$(join \
  "$(cut a 0 44100 0.0 1.18 1.0 'anull')" \
  "$(cut b 1 44100 0.0 1.3 1.0 'anull')" \
  "$(layer bl b -3 60)" \
  "$(mix mix a bl)")" -i "$RTS/destroyer/destroyer.die.wav" -i "$NAV/WaterSurfaceExplosion06.wav"

# Infantry: a sharp strike (a clipped real rifle snap) with a real male grunt (hit) or cry (defeat).
finish infantry-hit 0.27 -2.0 "afade=t=out:st=0.16:d=0.11" "$(join \
  "$(cut k 0 96000 0.476 0.06 1.0 'highpass=f=1500,lowpass=f=6500')" \
  "$(cut g 1 44100 0.25 0.3 1.0 'highpass=f=100')" \
  "$(layer kl k -6 0)" \
  "$(layer gl g 0 25)" \
  "$(mix mix kl gl)")" -i "$FIRE/Ruger Mark III/R_35P.wav" -i "$VOICE/3grunt4.wav"
finish soldier-defeat 0.79 -2.0 "afade=t=out:st=0.5:d=0.29" "$(join \
  "$(cut k 0 96000 0.699 0.07 1.0 'highpass=f=800,lowpass=f=6000')" \
  "$(cut c 1 44100 0.17 0.75 1.0 'highpass=f=100')" \
  "$(layer kl k -7 0)" \
  "$(layer cl c 0 40)" \
  "$(mix mix kl cl)")" -i "$FIRE/AR-15/D_32P.wav" -i "$VOICE/yell7.wav"
finish civilian-defeat 0.50 -4.0 "afade=t=out:st=0.3:d=0.2" "$(join \
  "$(cut t 0 96000 0.426 0.1 0.18 'lowpass=f=160')" \
  "$(nz dust pink 61701 0.5 'bandpass=f=900:width_type=q:w=0.5' 'gt(t,0.05)*0.25*exp(-(t-0.05)*8)')" \
  "$(layer tl t -2 0)" \
  "$(mix mix tl dust)")" -i "$FIRE/Nova/O_21P.wav"

# Balloon: a real small-calibre pop, then the escaping gas.
finish balloon-burst 0.80 -2.5 "volume=10dB,alimiter=limit=0.7:attack=0.5:release=40:level=false,afade=t=out:st=0.5:d=0.3" "$(join \
  "$(cut p 0 96000 0.476 0.15 1.0 'highpass=f=1200')" \
  "$(nz rush pink 61522 0.9 'bandpass=f=1300:width_type=q:w=0.5' 'gt(t,0.03)*1.0*exp(-(t-0.03)*5.5)')" \
  "$(mix mix p rush)")" -i "$FIRE/Ruger Mark III/R_35P.wav"

# ───────────── air travel ─────────────
# One cue per way of flying (AIR_PROPULSION in sfx-catalog.ts), played ONCE per move by SfxDirector. Each is a
# ~1.3 s sustained swell: soft attack, steady body, long release, so successive moves leave a clear pause.
# Balloon / generic air: engine-free fluttering airflow, swelling in and out.
finish air-move-step 1.20 -11.0 "afade=t=in:d=0.25,afade=t=out:st=0.55:d=0.65" \
  "anoisesrc=color=pink:seed=61611:duration=1.3:sample_rate=44100:amplitude=1,bandpass=f=650:width_type=q:w=0.6,tremolo=f=9:d=0.45[body];anoisesrc=color=white:seed=61612:duration=1.3:sample_rate=44100:amplitude=0.25,highpass=f=2200,lowpass=f=6500[hiss];[body][hiss]amix=inputs=2:normalize=0:duration=longest[mix]"
# Piston-engine propeller (real prop recording, steady part).
finish air-move-prop 1.30 -11.0 "afade=t=in:d=0.2,afade=t=out:st=0.7:d=0.6" "$(cut mix 0 44100 0.8 1.4 1.0 'highpass=f=60')" -i "$PROP"
# Jet engine (real recording, steady part of the takeoff run): a sustained roar.
finish air-move-jet 1.40 -11.0 "afade=t=in:d=0.25,afade=t=out:st=0.75:d=0.65" "$(cut mix 0 44100 1.2 1.5 1.0 'highpass=f=60')" -i "$JET"
# Helicopter rotor (RTS helicopter loop, low-passed to keep the chop and lose the hiss).
finish air-move-rotor 1.30 -11.0 "afade=t=in:d=0.15,afade=t=out:st=0.7:d=0.6" "$(cut mix 0 44100 0.0 1.4 1.0 'highpass=f=50,lowpass=f=3500')" -i "$RTS/heli/heli.template.wav"
# Drone: the propeller recording pitched up into a steady light electric whine (small fast rotors).
finish air-move-drone 1.30 -11.0 "afade=t=in:d=0.25,afade=t=out:st=0.7:d=0.6" "$(cut mix 0 44100 0.5 2.6 2.0 'highpass=f=350,lowpass=f=7000')" -i "$PROP"
