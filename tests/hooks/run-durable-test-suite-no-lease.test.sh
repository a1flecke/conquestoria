#!/usr/bin/env bash
# #1133 item C. run-durable-test-suite.sh's --no-lease flag lets a caller get
# durable evidence + job-pid liveness tracking without being forced into the
# shared push-verification lease -- needed because run-ai-long-horizon.sh and
# run-ai-playability-regressions.sh deliberately stay outside it (see their
# own header comments): wrapping them in the durable layer must not change
# that. This proves --no-lease never touches the shared lease at all (a
# concurrent holder of it is never made to wait), while the default (no flag)
# behavior -- used by the "full" scope -- still acquires it exactly as before.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-durable-test-suite.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
lease_root="$tmpdir/shared-lease-root"
mkdir -p "$lease_root"
export HOST_VERIFICATION_LEASE_ROOT="$lease_root"

repo="$tmpdir/worktree-a"
mkdir -p "$repo/scripts"
cp "$RUNNER" "$ROOT/scripts/read-durable-test-result.sh" "$ROOT/scripts/host-verification-lease.sh" "$ROOT/scripts/run-under-host-lease.sh" "$repo/scripts/"
cp "$ROOT/.gitignore" "$repo/.gitignore"

git -C "$repo" init -q
git -C "$repo" config user.email durable-test@example.invalid
git -C "$repo" config user.name durable-test
touch "$repo/initial"
git -C "$repo" add initial .gitignore
git -C "$repo" commit -qm initial
git -C "$repo" add scripts
git -C "$repo" commit -qm runner

# --- 1. --no-lease never touches the shared lease: a concurrent holder is
#        not made to wait, and the run still succeeds immediately ---------

holder_log="$tmpdir/holder.log"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    exec sh "$ROOT/scripts/run-under-host-lease.sh" unrelated-holder -- sh -c 'sleep 3'
) > "$holder_log" 2>&1 &
holder_pid=$!
attempts=0
while [ ! -f "$lease_root/active/owner" ]; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || { echo "unrelated holder never acquired the shared lease" >&2; exit 1; }
  sleep 0.1
done

start_epoch="$(date +%s)"
set +e
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh no-lease-scope --no-lease -- sh -c 'exit 0'
) > "$tmpdir/no-lease-run.log" 2>&1
no_lease_status=$?
set -e
elapsed=$(( $(date +%s) - start_epoch ))

wait "$holder_pid" 2>/dev/null || true

[ "$no_lease_status" -eq 0 ] || {
  echo "--no-lease run failed unexpectedly: $no_lease_status" >&2
  cat "$tmpdir/no-lease-run.log" >&2
  exit 1
}
[ "$elapsed" -lt 2 ] || {
  echo "--no-lease run waited ${elapsed}s -- it must never contend for the shared lease" >&2
  exit 1
}
grep -Fxq 'exit_code=0' "$repo/.verification/no-lease-scope-suite.status" || {
  echo "--no-lease run did not persist a successful status" >&2
  exit 1
}

# --- 2. the default (no flag) still acquires the shared lease as before --

rm -rf "$lease_root"; mkdir -p "$lease_root"
holder_log2="$tmpdir/holder2.log"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    exec sh "$ROOT/scripts/run-under-host-lease.sh" unrelated-holder-2 -- sh -c 'sleep 2'
) > "$holder_log2" 2>&1 &
holder_pid2=$!
attempts=0
while [ ! -f "$lease_root/active/owner" ]; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || { echo "second unrelated holder never acquired the shared lease" >&2; exit 1; }
  sleep 0.1
done

start_epoch2="$(date +%s)"
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh leased-scope -- sh -c 'exit 0'
) > "$tmpdir/leased-run.log" 2>&1
elapsed2=$(( $(date +%s) - start_epoch2 ))
wait "$holder_pid2" 2>/dev/null || true

[ "$elapsed2" -ge 1 ] || {
  echo "default (leased) run did not wait behind a concurrent holder of the shared lease (elapsed ${elapsed2}s)" >&2
  cat "$tmpdir/leased-run.log" >&2
  exit 1
}

echo "all run-durable-test-suite --no-lease scenarios passed"
