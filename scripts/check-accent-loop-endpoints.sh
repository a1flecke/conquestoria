#!/usr/bin/env bash
# check-accent-loop-endpoints.sh
#
# Validates that every accent OGG in public/audio/accent/ has:
#   1. A clean loop endpoint — last 200 ms below −35 dBFS (fade-out confirmed).
#   2. An effective loop body — the non-fade region is at least 30 s long.
#   3. A loopEnd value in audio-catalog.ts that sits at or before the fade start
#      (i.e. loopEnd ≤ file_duration − 10), so the engine never loops through
#      the silence tail and causes a periodic fade-dip.
#
# Usage:
#   bash scripts/check-accent-loop-endpoints.sh
#   Exit 0 = all checks pass.  Exit 1 = one or more failures (details on stderr).
#
# Run this after any re-encode of accent files to catch regressions before commit.
# The FADE_DURATION constant must match the value used in the ffmpeg encode step.

set -euo pipefail

ACCENT_DIR="public/audio/accent"
FADE_DURATION=12    # seconds — must match the afade duration used at encode time
MIN_LOOP_BODY=30    # seconds — minimum useful loop length before the fade
SILENCE_THRESH=-35  # dBFS — last-200ms mean must be below this

FAILURES=0

check_file() {
  local ogg="$1"
  local name
  name=$(basename "$ogg" .ogg)

  # --- duration ---
  local dur
  dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$ogg" 2>/dev/null)
  if [[ -z "$dur" ]]; then
    echo "ERROR [$name]: ffprobe could not read duration" >&2
    return 1
  fi

  # --- loop body length ---
  local body
  body=$(python3 -c "print('%.3f' % (float('$dur') - $FADE_DURATION))")
  if python3 -c "import sys; sys.exit(0 if float('$body') >= $MIN_LOOP_BODY else 1)"; then
    : # pass
  else
    echo "FAIL [$name]: loop body only ${body}s — less than ${MIN_LOOP_BODY}s minimum" >&2
    FAILURES=$((FAILURES + 1))
  fi

  # --- last-200ms silence check ---
  local trim_start
  trim_start=$(python3 -c "print('%.4f' % (float('$dur') - 0.2))")
  local mean
  mean=$(ffmpeg -i "$ogg" -af "atrim=start=${trim_start},volumedetect" -f null /dev/null 2>&1 \
         | grep mean_volume | grep -oE '\-[0-9]+\.[0-9]+' | head -1)
  if [[ -z "$mean" ]]; then
    echo "WARN [$name]: volumedetect returned no data for last 200ms" >&2
  elif python3 -c "import sys; sys.exit(0 if float('$mean') < $SILENCE_THRESH else 1)"; then
    : # pass
  else
    echo "FAIL [$name]: last-200ms mean=${mean} dB — not below ${SILENCE_THRESH} dBFS" >&2
    FAILURES=$((FAILURES + 1))
  fi

  # --- catalog loopEnd sanity (loopEnd should be <= dur - 10) ---
  local max_loop_end
  max_loop_end=$(python3 -c "print('%.3f' % (float('$dur') - 10))")
  # Extract loopEnd from audio-catalog.ts for this family
  local loop_end
  loop_end=$(grep -E "'accent-${name}'" src/audio/audio-catalog.ts \
             | grep -oE 'loopEnd:\s*[0-9]+\.[0-9]+' \
             | grep -oE '[0-9]+\.[0-9]+' \
             | head -1)
  if [[ -z "$loop_end" ]]; then
    echo "WARN [$name]: could not find loopEnd in audio-catalog.ts — skipping catalog check" >&2
  elif python3 -c "import sys; sys.exit(0 if float('$loop_end') <= float('$max_loop_end') else 1)"; then
    : # pass
  else
    echo "FAIL [$name]: catalog loopEnd=${loop_end}s > dur-10=${max_loop_end}s — loops into fade tail" >&2
    FAILURES=$((FAILURES + 1))
  fi

  echo "  OK  [$name]: dur=${dur}s body=${body}s last200ms=${mean:-n/a}dB loopEnd=${loop_end:-n/a}s"
}

echo "=== Accent loop endpoint check ==="
for ogg in "$ACCENT_DIR"/*.ogg; do
  check_file "$ogg"
done

echo ""
if [[ $FAILURES -eq 0 ]]; then
  echo "All checks passed."
  exit 0
else
  echo "$FAILURES check(s) failed." >&2
  exit 1
fi
