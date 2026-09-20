#!/bin/sh
# Run one command while holding the host verification lease (#892). See
# scripts/host-verification-lease.sh for the lease design.
#
# Usage: run-under-host-lease.sh <label> -- <command> [arguments...]
#
# Exit code is the wrapped command's exit code. If the wrapped command is
# killed by SIGINT/SIGTERM (forwarded from a signal this wrapper receives),
# exit is 130/143 respectively, matching normal shell signal-exit
# convention. A lease infrastructure failure (cannot create the lease
# directory) exits 2, distinct from any real command failure.

set -eu

usage() {
  echo 'Usage: run-under-host-lease.sh <label> -- <command> [arguments...]' >&2
  exit 2
}

label="${1:-}"
[ "$#" -ge 3 ] && [ "${2:-}" = '--' ] || usage
[ -n "$label" ] || usage
shift 2

script_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./host-verification-lease.sh
. "$script_dir/host-verification-lease.sh"

hvl_acquire "$label"
trap hvl_release EXIT

# #1133 items B/E: hvl_run_registering_job registers "$@"'s pid into the
# lease metadata (so a later hvl_is_stale check can see the real job is
# still alive even if this wrapper process itself is gone) and, on
# cancellation, walks the live process table from that pid so every
# descendant is signaled, not just the immediate child.
set +e
hvl_run_registering_job "$@"
run_status=$?
set -e

exit "$run_status"
