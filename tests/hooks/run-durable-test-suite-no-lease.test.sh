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
# CI always sets CI=true, which the lease library treats as "do not
# coordinate at all" (by design -- CI runs on isolated hardware and must
# not know this exists). This test specifically exercises real host-lease
# coordination between two concurrent processes, so it must unset CI first
# to get that real behavior regardless of the ambient environment -- same
# as host-verification-lease.test.sh and
# host-verification-lease-process-group.test.sh already do.
unset CI || true

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
  if [ "$attempts" -ge 200 ]; then
    echo "unrelated holder never acquired the shared lease" >&2
    echo "--- holder log ---" >&2
    cat "$holder_log" >&2
    echo "--- is holder_pid ($holder_pid) still alive? ---" >&2
    kill -0 "$holder_pid" 2>/dev/null && echo yes >&2 || echo no >&2
    echo "--- lease_root contents ---" >&2
    find "$lease_root" >&2
    exit 1
  fi
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
  if [ "$attempts" -ge 200 ]; then
    echo "second unrelated holder never acquired the shared lease" >&2
    echo "--- holder log ---" >&2
    cat "$holder_log2" >&2
    exit 1
  fi
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

# --- 3. a FAILING wrapped command still records its real exit code (#1133
#        MR6) -----------------------------------------------------------
#
# hvl_run_registering_job used to unconditionally `set -e` at its own end,
# regardless of what errexit state the caller had before calling it. Both
# --no-lease callers here (this script, and run-under-host-lease.sh's own
# trailer) deliberately `set +e` around this call specifically so they can
# capture "$?" or write it to a file immediately afterward -- but under
# `set -e`, a function call returning non-zero is itself a triggering
# command, so with errexit forced back on before control returned, the
# caller's very next statement (its own exit-code capture) never ran.
# --no-lease runs this inside a `{ ...; echo "$?" > exit_file; } | tee`
# pipeline specifically, so the abort happened inside that subshell with no
# outer `set -e` to visibly report it -- the only symptom was `exit_file`
# staying empty, corrupting `exit_code=` in the durable `.status` file with
# an empty string instead of a real number. Neither scenario above ever
# exercised a FAILING wrapped command, so this regressed silently until a
# real failed --no-lease durable run (while building this MR's own status
# view) surfaced "integer expression expected" / "numeric argument
# required" errors from run-durable-test-suite.sh itself.

rm -rf "$repo/.verification"
set +e
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh failing-scope --no-lease -- sh -c 'exit 7'
) > "$tmpdir/failing-run.log" 2>&1
failing_run_status=$?
set -e

[ "$failing_run_status" -ne 0 ] || {
  echo "a failing --no-lease wrapped command did not propagate a non-zero exit" >&2
  cat "$tmpdir/failing-run.log" >&2
  exit 1
}
grep -Fxq 'exit_code=7' "$repo/.verification/failing-scope-suite.status" || {
  echo "a failing --no-lease wrapped command's real exit code (7) was not persisted -- got: $(sed -n 's/^exit_code=//p' "$repo/.verification/failing-scope-suite.status" 2>/dev/null)" >&2
  cat "$tmpdir/failing-run.log" >&2
  exit 1
}
grep -Fxq 'failure_kind=command-failed' "$repo/.verification/failing-scope-suite.status" || {
  echo "a failing --no-lease wrapped command did not persist a failure_kind" >&2
  cat "$repo/.verification/failing-scope-suite.status" >&2
  exit 1
}

echo "all run-durable-test-suite --no-lease scenarios passed"
