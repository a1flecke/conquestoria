#!/usr/bin/env bash
# #1133 regression guard. host-verification-lease.sh and its `#!/bin/sh`
# callers are meant to run under ANY POSIX /bin/sh, but this MR's own CI run
# proved that assumption false in practice: `trap -p` is syntactically valid
# POSIX and works fine under macOS's bash-as-/bin/sh (so it passed every
# local test), but `dash` -- the actual `/bin/sh` on the GitHub Actions
# Ubuntu runner this repo's CI uses -- does not implement the `-p` option at
# all and fails at RUNTIME ("trap: Illegal option -p"), silently breaking
# every caller there. A syntax check alone (`dash -n`) would not have caught
# this, since the failure only appears when the line actually executes.
#
# This test runs the real acquire -> register-job -> cancel -> release cycle
# under dash specifically (not the developer machine's own /bin/sh, whatever
# that resolves to), so a reintroduced dash-incompatible builtin/option
# fails here instead of only in CI.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-under-host-lease.sh"
LIB="$ROOT/scripts/host-verification-lease.sh"

command -v dash >/dev/null 2>&1 || {
  echo "dash is not installed on this host -- skipping (nothing to verify)" >&2
  exit 0
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
lease_root="$tmpdir/lease-root"
mkdir -p "$lease_root"

for f in "$RUNNER" "$LIB" "$ROOT/scripts/verify-before-push.sh"; do
  dash -n "$f" || {
    echo "$f is not valid dash syntax" >&2
    exit 1
  }
done

# --- 1. a plain run under dash succeeds with the right output/exit code ---

log1="$tmpdir/basic.log"
set +e
HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
  dash "$RUNNER" dash-basic -- dash -c 'echo ran-under-dash; exit 9' > "$log1" 2>&1
status1=$?
set -e
[ "$status1" -eq 9 ] || {
  echo "expected exit 9 from a plain dash run, got $status1" >&2
  cat "$log1" >&2
  exit 1
}
grep -Fq 'ran-under-dash' "$log1" || {
  echo "wrapped command output missing under dash" >&2
  cat "$log1" >&2
  exit 1
}
! grep -Fq 'Illegal option' "$log1" || {
  echo "a dash-incompatible construct (e.g. 'trap -p') resurfaced -- see file header" >&2
  cat "$log1" >&2
  exit 1
}

# --- 2. cancellation under dash reaps a nested child+grandchild tree ------

rm -rf "$lease_root"; mkdir -p "$lease_root"
log2="$tmpdir/cancel.log"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    exec dash "$RUNNER" dash-cancel -- dash -c 'dash -c "sleep 20" & wait'
) > "$log2" 2>&1 &
holder_pid=$!

attempts=0
while [ ! -f "$lease_root/active/owner" ]; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || { echo "dash holder never acquired the lease" >&2; exit 1; }
  sleep 0.1
done
attempts=0
job_pid=""
while [ -z "$job_pid" ]; do
  job_pid="$(sed -n 's/^job_pid=//p' "$lease_root/active/owner" 2>/dev/null | head -n 1)"
  [ -n "$job_pid" ] && break
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || { echo "job_pid never appeared under dash" >&2; exit 1; }
  sleep 0.1
done

kill -TERM "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
sleep 0.3

! grep -Fq 'Illegal option' "$log2" || {
  echo "a dash-incompatible construct resurfaced during cancellation" >&2
  cat "$log2" >&2
  exit 1
}
kill -0 "$job_pid" 2>/dev/null && {
  echo "cancellation under dash left job_pid $job_pid alive" >&2
  exit 1
}

echo "all host-verification-lease dash-compat scenarios passed"
