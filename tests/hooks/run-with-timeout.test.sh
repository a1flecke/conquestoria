#!/usr/bin/env bash
# Functional tests for the process-group timeout runner.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-with-timeout.mjs"

[ -f "$RUNNER" ] || {
  echo "timeout runner is missing"
  exit 1
}

run_node() {
  if command -v node >/dev/null 2>&1; then
    node "$@"
  else
    "$ROOT/scripts/run-with-mise.sh" node "$@"
  fi
}

run_node "$RUNNER" 2 success -- sh -c 'exit 0'

set +e
run_node "$RUNNER" 2 failure -- sh -c 'exit 7'
failure_status=$?
set -e
[ "$failure_status" -eq 7 ] || {
  echo "timeout runner changed child failure status: $failure_status"
  exit 1
}

started="$(date +%s)"
set +e
timeout_output="$(run_node "$RUNNER" 1 sleeper -- sh -c 'sleep 10' 2>&1)"
timeout_status=$?
set -e
elapsed="$(( $(date +%s) - started ))"

[ "$timeout_status" -eq 124 ] || {
  echo "timed out child returned $timeout_status instead of 124"
  exit 1
}
[ "$elapsed" -le 4 ] || {
  echo "timed out child was not terminated promptly: ${elapsed}s"
  exit 1
}
printf '%s' "$timeout_output" | grep -Fq 'sleeper timed out after 1s' || {
  echo "timeout output did not identify the phase and deadline"
  exit 1
}

# Stall watchdog: a process producing zero CPU progress must be killed by the
# stall path (distinct exit code 125, distinct message) well before the
# absolute ceiling, once the tight boot/stall grace windows below elapse.
started="$(date +%s)"
set +e
stall_output="$(
  STALL_BOOT_GRACE_SECONDS=1 STALL_GRACE_SECONDS=1 STALL_CHECK_INTERVAL_SECONDS=1 \
    run_node "$RUNNER" 30 stall-sleeper -- sh -c 'sleep 30' 2>&1
)"
stall_status=$?
set -e
elapsed="$(( $(date +%s) - started ))"

[ "$stall_status" -eq 125 ] || {
  echo "stalled child returned $stall_status instead of 125"
  exit 1
}
[ "$elapsed" -le 10 ] || {
  echo "stalled child was not terminated promptly: ${elapsed}s (ceiling was 30s -- the stall path should fire long before it)"
  exit 1
}
printf '%s' "$stall_output" | grep -Fq 'STALL: stall-sleeper produced zero CPU progress' || {
  echo "stall output did not identify the phase as a stall"
  exit 1
}

# False-positive guard: a process that is genuinely burning CPU the whole time
# must NOT be killed by the stall watchdog, even with the same tight grace
# windows -- only a true zero-progress stall may trigger it.
set +e
STALL_BOOT_GRACE_SECONDS=1 STALL_GRACE_SECONDS=1 STALL_CHECK_INTERVAL_SECONDS=1 \
  run_node "$RUNNER" 5 busy-spinner -- \
  node -e 'const end = Date.now() + 3000; while (Date.now() < end) { /* spin */ }'
busy_status=$?
set -e
[ "$busy_status" -eq 0 ] || {
  echo "a genuinely CPU-busy child was wrongly treated as stalled (exit $busy_status)"
  exit 1
}

# Disable switch: STALL_WATCHDOG_DISABLE=1 must suppress the stall path even
# when the grace windows would otherwise fire, falling back to the absolute
# ceiling only.
started="$(date +%s)"
set +e
disabled_output="$(
  STALL_WATCHDOG_DISABLE=1 STALL_BOOT_GRACE_SECONDS=1 STALL_GRACE_SECONDS=1 STALL_CHECK_INTERVAL_SECONDS=1 \
    run_node "$RUNNER" 2 disabled-sleeper -- sh -c 'sleep 10' 2>&1
)"
disabled_status=$?
set -e
elapsed="$(( $(date +%s) - started ))"
[ "$disabled_status" -eq 124 ] || {
  echo "STALL_WATCHDOG_DISABLE=1 did not fall back to the plain ceiling (exit $disabled_status)"
  exit 1
}
printf '%s' "$disabled_output" | grep -Fq 'STALL:' && {
  echo "STALL_WATCHDOG_DISABLE=1 still emitted a stall message"
  exit 1
}
[ "$elapsed" -ge 2 ] || {
  echo "disabled-watchdog child was terminated before its own 2s ceiling: ${elapsed}s"
  exit 1
}
