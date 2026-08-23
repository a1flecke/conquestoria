#!/bin/sh
# Canonical implementation for package test scripts. Keeping the composition
# here means focused Vitest filters reach Vitest instead of being appended to a
# later `&&` command by the package-manager shell.

set -eu

record_failure_kind() {
  [ -n "${DURABLE_FAILURE_KIND_FILE:-}" ] || return 0
  printf '%s\n' "$1" > "$DURABLE_FAILURE_KIND_FILE"
}

mode="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$mode" in
  full)
    if ! yarn vitest run "$@"; then
      record_failure_kind product-test
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
