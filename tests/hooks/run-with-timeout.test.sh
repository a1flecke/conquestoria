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
