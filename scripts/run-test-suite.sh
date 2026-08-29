#!/bin/sh
# Canonical implementation for package test scripts. Keeping the composition
# here means focused Vitest filters reach Vitest instead of being appended to a
# later `&&` command by the package-manager shell.

set -eu

record_failure_kind() {
  [ -n "${DURABLE_FAILURE_KIND_FILE:-}" ] || return 0
  printf '%s\n' "$1" > "$DURABLE_FAILURE_KIND_FILE"
}

# Distinguish a real product-test failure (Vitest collected and reported
# failing assertions) from a runner/pool-infrastructure failure (Vitest's
# own worker pool never got that far -- see #892: "Timeout waiting for
# worker to respond" observed under host contention, misclassified as a
# product regression because nothing previously inspected the log).
#
# A non-zero exit alone is never enough signal (`if exit != 0 =>
# infrastructure` would hide real product failures), so this greps the
# captured output for narrow, stable markers instead of guessing from the
# exit code:
#   - Vitest's own reporter prints "Failed Tests <N>" only when it actually
#     collected N failing assertions -- this is the positive signal that
#     real product-test failures are present.
#   - Vitest 4's custom worker-pool runner tags its own internal errors
#     with a stable "[vitest-pool-runner]:" prefix (verified against the
#     installed vitest@4.1.9 package, chunks/cli-api.*.js); "Worker exited
#     unexpectedly" and Node's own out-of-memory crash banner are two more
#     recognizable pool/process-startup failure shapes.
# If both are present, real product failures still win (a runner issue
# happening alongside genuine failures must not hide them).
classify_vitest_log() {
  log_path="$1"
  if grep -Eq 'Failed Tests [0-9]+' "$log_path"; then
    printf 'product-test\n'
    return
  fi
  if grep -Fq '[vitest-pool-runner]:' "$log_path" \
    || grep -Fq 'Worker exited unexpectedly' "$log_path" \
    || grep -Fq 'FATAL ERROR' "$log_path"; then
    printf 'runner-infrastructure\n'
    return
  fi
  printf 'product-test\n'
}

mode="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$mode" in
  full)
    vitest_log="$(mktemp)"
    vitest_exit_file="$(mktemp)"
    trap 'rm -f "$vitest_log" "$vitest_exit_file"' EXIT
    # `set -e` must be off across this pipeline: it runs in a subshell as a
    # non-last pipeline stage, and with errexit on, `yarn vitest run`
    # failing would abort that subshell before it ever reaches the `echo
    # "$?"` line -- leaving vitest_exit_file empty and silently skipping
    # classification (and, worse, falling through to run the hook-test
    # step as if Vitest had passed).
    set +e
    { yarn vitest run "$@"; echo "$?" > "$vitest_exit_file"; } | tee "$vitest_log"
    set -e
    vitest_status="$(cat "$vitest_exit_file")"
    case "$vitest_status" in
      ''|*[!0-9]*)
        echo "ERROR: could not determine the Vitest exit code (captured: '${vitest_status}')" >&2
        record_failure_kind runner-infrastructure
        exit 1
        ;;
    esac
    if [ "$vitest_status" -ne 0 ]; then
      record_failure_kind "$(classify_vitest_log "$vitest_log")"
      exit 1
    fi
    if ! bash tests/hooks/run.sh; then
      record_failure_kind hook-test
      exit 1
    fi
    ;;
  fast)
    sh scripts/run-tests-by-tier.sh fast "$@"
    exec bash tests/hooks/run.sh
    ;;
  slow)
    exec sh scripts/run-tests-by-tier.sh slow "$@"
    ;;
  *)
    echo 'Usage: run-test-suite.sh full|fast|slow [-- vitest arguments]' >&2
    exit 2
    ;;
esac
