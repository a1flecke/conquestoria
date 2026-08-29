#!/bin/sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN="$REPO_ROOT/scripts/run-with-mise.sh"
TIMEOUT_RUNNER="$REPO_ROOT/scripts/run-with-timeout.mjs"
# shellcheck source=./host-verification-lease.sh
. "$REPO_ROOT/scripts/host-verification-lease.sh"
USE_MISE=1
TEST_SCOPE=full

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-mise)
      USE_MISE=0
      shift
      ;;
    --fast)
      TEST_SCOPE=fast
      shift
      ;;
    *)
      echo "Usage: verify-before-push.sh [--no-mise] [--fast]" >&2
      exit 2
      ;;
  esac
done

# --fast (#608) runs `yarn test:fast` instead of the full `yarn test`,
# skipping the heavy multi-city/era/seed simulation tests tracked in
# scripts/run-tests-by-tier.sh so the local push gate stays quick and
# doesn't add CPU pressure on top of whatever else is running on this
# machine. Only the local git pre-push hook and the Claude Code push-gate
# hook pass --fast. CI's `yarn verify:push` never does — it always runs the
# full suite as the required merge gate, on isolated hardware where
# contention isn't a factor.
case "$TEST_SCOPE" in
  fast) TEST_YARN_SCRIPT=test:fast ;;
  *) TEST_YARN_SCRIPT=test ;;
esac

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

# This is the local, heavyweight test+build verification gate (#892): both
# phases below run under one host-wide verification lease acquisition, so
# an overlapping durable/pre-push run on another linked worktree on this
# same machine waits rather than oversubscribing the host's Vitest worker
# pools together with this one. In CI (yarn verify:push --no-mise, always
# with CI=true) hvl_acquire is a no-op; ordinary `yarn test`/`yarn build`
# run directly by a developer are unaffected -- only this orchestrated
# verify-before-push.sh entrypoint acquires it.
hvl_acquire "pre-push verification"
trap hvl_release EXIT
trap 'hvl_release; exit 130' INT
trap 'hvl_release; exit 143' TERM

echo "Running pre-push verification: tests"
if [ "$USE_MISE" -eq 1 ]; then
  run_phase "$TEST_TIMEOUT_SECONDS" "test suite" "$RUN" yarn "$TEST_YARN_SCRIPT"
else
  run_phase "$TEST_TIMEOUT_SECONDS" "test suite" yarn "$TEST_YARN_SCRIPT"
fi

echo "Running pre-push verification: build"
if [ "$USE_MISE" -eq 1 ]; then
  run_phase "$BUILD_TIMEOUT_SECONDS" "production build" "$RUN" yarn build
else
  run_phase "$BUILD_TIMEOUT_SECONDS" "production build" yarn build
fi
