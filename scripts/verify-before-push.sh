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
    --regular)
      TEST_SCOPE=regular
      shift
      ;;
    *)
      echo "Usage: verify-before-push.sh [--no-mise] [--regular]" >&2
      exit 2
      ;;
  esac
done

# --regular (#608) runs `yarn test:regular` instead of the full `yarn test`,
# skipping the heavy multi-city/era/seed simulation tests tracked in
# scripts/run-tests-by-local-tier.sh so the local push gate stays quick and
# doesn't add CPU pressure on top of whatever else is running on this
# machine. Only the local git pre-push hook and the Claude Code push-gate
# hook pass --regular. CI's `yarn verify:push` never does — it always runs the
# full suite as the required merge gate, on isolated hardware where
# contention isn't a factor.
case "$TEST_SCOPE" in
  regular) TEST_YARN_SCRIPT=test:regular ;;
  *) TEST_YARN_SCRIPT=test ;;
esac

TEST_TIMEOUT_SECONDS="${VERIFY_TEST_TIMEOUT_SECONDS:-600}"
BUILD_TIMEOUT_SECONDS="${VERIFY_BUILD_TIMEOUT_SECONDS:-300}"

# Follow-up to #1133: run-with-timeout.mjs's stall watchdog already proves,
# by direct CPU-progress measurement rather than a guess, that a STALL (exit
# 125) is host contention, not a code problem -- its own message already
# says "safe to retry immediately." Before this, that only meant a human (or
# an agent) had to notice the "STALL:" line in the log and re-run the push
# by hand. run_phase now does that retry itself, bounded and backed off, so
# every caller (the real .githooks/pre-push hook, the Claude Code push-gate
# hook, and CI's --no-mise path alike -- this is agent-framework-agnostic by
# construction, same as the lease/budget mechanism it sits on) gets it for
# free.
VERIFY_STALL_MAX_RETRIES="${VERIFY_STALL_MAX_RETRIES:-2}"
VERIFY_STALL_RETRY_BACKOFF_SECONDS="${VERIFY_STALL_RETRY_BACKOFF_SECONDS:-20}"

run_phase() {
  timeout_seconds="$1"
  label="$2"
  shift 2

  attempt=0
  while :; do
    attempt=$((attempt + 1))

    # #1133 items B/E: run via the shared job-registering helper (see
    # host-verification-lease.sh) instead of directly in the foreground, so
    # this phase's pid is registered into the held lease metadata for the
    # duration of the INT/TERM traps installed below.
    #
    # set +e around this one call, restoring the caller's own errexit
    # afterward -- the exact pattern hvl_run_registering_job itself already
    # uses internally (see its own doc comment) and for the identical
    # reason: under `set -e`, a non-zero return here would abort the script
    # before the retry decision below ever runs.
    case "$-" in
      *e*) run_phase_errexit_was_set=1 ;;
      *) run_phase_errexit_was_set=0 ;;
    esac
    set +e
    if [ "$USE_MISE" -eq 1 ]; then
      hvl_run_registering_job "$RUN" node "$TIMEOUT_RUNNER" "$timeout_seconds" "$label" -- "$@"
    else
      hvl_run_registering_job node "$TIMEOUT_RUNNER" "$timeout_seconds" "$label" -- "$@"
    fi
    run_phase_status=$?
    [ "$run_phase_errexit_was_set" -eq 0 ] || set -e

    [ "$run_phase_status" -eq 0 ] && return 0

    # Only exit 125 (STALL) is safe to retry -- a machine-checked claim of
    # zero CPU progress, not a guess. A plain timeout (124: the work is
    # genuinely slow, not stalled) or any other non-zero (a real test/build
    # failure) must fail immediately: retrying either wastes time, and
    # retrying a real failure risks hiding a flake as "fixed" instead of
    # reporting it.
    if [ "$run_phase_status" -ne 125 ] || [ "$attempt" -gt "$VERIFY_STALL_MAX_RETRIES" ]; then
      return "$run_phase_status"
    fi

    echo "verify-before-push: '$label' stalled (attempt $attempt/$((VERIFY_STALL_MAX_RETRIES + 1))) -- host contention, not a code problem. Backing off ${VERIFY_STALL_RETRY_BACKOFF_SECONDS}s before retrying." >&2
    sleep "$VERIFY_STALL_RETRY_BACKOFF_SECONDS"
  done
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
trap 'hvl_cancel_and_release INT 130' INT
trap 'hvl_cancel_and_release TERM 143' TERM

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
