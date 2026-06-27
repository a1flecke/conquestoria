#!/bin/sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN="$REPO_ROOT/scripts/run-with-mise.sh"
TIMEOUT_RUNNER="$REPO_ROOT/scripts/run-with-timeout.mjs"
USE_MISE=1

case "${1:-}" in
  --no-mise)
    USE_MISE=0
    shift
    ;;
  '')
    ;;
  *)
    echo "Usage: verify-before-push.sh [--no-mise]" >&2
    exit 2
    ;;
esac

[ "$#" -eq 0 ] || {
  echo "Usage: verify-before-push.sh [--no-mise]" >&2
  exit 2
}

TEST_TIMEOUT_SECONDS="${VERIFY_TEST_TIMEOUT_SECONDS:-600}"
BUILD_TIMEOUT_SECONDS="${VERIFY_BUILD_TIMEOUT_SECONDS:-300}"

run_phase() {
  timeout_seconds="$1"
  label="$2"
  shift 2

  if [ "$USE_MISE" -eq 1 ]; then
    "$RUN" node "$TIMEOUT_RUNNER" "$timeout_seconds" "$label" -- "$@"
  else
    node "$TIMEOUT_RUNNER" "$timeout_seconds" "$label" -- "$@"
  fi
}

echo "Running pre-push verification: tests"
if [ "$USE_MISE" -eq 1 ]; then
  run_phase "$TEST_TIMEOUT_SECONDS" "test suite" "$RUN" yarn test
else
  run_phase "$TEST_TIMEOUT_SECONDS" "test suite" yarn test
fi

echo "Running pre-push verification: build"
if [ "$USE_MISE" -eq 1 ]; then
  run_phase "$BUILD_TIMEOUT_SECONDS" "production build" "$RUN" yarn build
else
  run_phase "$BUILD_TIMEOUT_SECONDS" "production build" yarn build
fi
