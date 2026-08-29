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

run_status=0
run_child_pid=''

forward_and_wait() {
  fwd_signal="$1"
  fwd_exit_code="$2"
  if [ -n "$run_child_pid" ]; then
    kill -"$fwd_signal" "$run_child_pid" 2>/dev/null || true
    wait "$run_child_pid" 2>/dev/null || true
  fi
  [ -n "${DURABLE_FAILURE_KIND_FILE:-}" ] && printf 'cancelled\n' > "$DURABLE_FAILURE_KIND_FILE"
  exit "$fwd_exit_code"
}

trap 'forward_and_wait INT 130' INT
trap 'forward_and_wait TERM 143' TERM

set +e
"$@" &
run_child_pid=$!
wait "$run_child_pid"
run_status=$?
set -e

trap - INT TERM
run_child_pid=''

exit "$run_status"
