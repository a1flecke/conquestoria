#!/bin/sh
# Canonical implementation for package test scripts. Keeping the composition
# here means focused Vitest filters reach Vitest instead of being appended to a
# later `&&` command by the package-manager shell.

set -eu

mode="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$mode" in
  full)
    yarn vitest run "$@"
    exec bash tests/hooks/run.sh
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
