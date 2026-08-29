#!/usr/bin/env bash
# Concurrency and correctness contract tests for the host-wide verification
# lease (#892). CI already sets CI=true for the whole job, which the lease
# library treats as "do not coordinate" -- unset it here so these tests
# exercise the real acquire/wait/stale-recovery machinery regardless of the
# ambient environment. A dedicated sub-test below re-enables CI to prove
# the bypass itself.

set -eu
unset CI || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"
RUNNER="$ROOT/scripts/run-under-host-lease.sh"

[ -x "$LIB" ] || {
  echo "host-verification-lease.sh is missing or not executable" >&2
  exit 1
}
[ -x "$RUNNER" ] || {
  echo "run-under-host-lease.sh is missing or not executable" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
lease_root="$tmpdir/lease-root"
mkdir -p "$lease_root"

run_leased() {
  # run_leased <log-file> <label> -- <command...>
  log="$1"
  shift
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    HOST_VERIFICATION_LEASE_REPORT_SECONDS="${TEST_REPORT_SECONDS:-1}" \
    sh "$RUNNER" "$@" > "$log" 2>&1
}

# run_leased_bg <log-file> <label> -- <command...>
#
# Backgrounds the runner as its own process (via `exec`, no wrapping shell
# left in between) so $! is the runner's real pid. Required whenever a test
# sends a signal directly to that pid and needs it to reach the runner's
# own INT/TERM trap -- a plain `( run_leased ... ) &` leaves an extra
# function/subshell layer between $! and the runner that a signal to $!
# alone does not cross.
run_leased_bg() {
  log="$1"
  shift
  (
    exec > "$log" 2>&1
    HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
      HOST_VERIFICATION_LEASE_REPORT_SECONDS="${TEST_REPORT_SECONDS:-1}" \
      exec sh "$RUNNER" "$@"
  ) &
}

# --- 1. basic acquire/run/release -------------------------------------

log1="$tmpdir/basic.log"
run_leased "$log1" basic-run -- sh -c 'echo ran; exit 0'
grep -Fq 'ran' "$log1" || {
  echo "wrapped command did not run" >&2
  exit 1
}
grep -Fq "released 'basic-run'" "$log1" || {
  echo "lease was not released after a normal exit" >&2
  exit 1
}
[ ! -e "$lease_root/active" ] || {
  echo "lease directory was left behind after release" >&2
  exit 1
}

# --- 2. second heavy verification waits; does not start its command ----

rm -rf "$lease_root"
mkdir -p "$lease_root"
marker="$tmpdir/waiter-started"
holder_log="$tmpdir/holder2.log"
waiter_log="$tmpdir/waiter2.log"
rm -f "$marker"

( run_leased "$holder_log" holder -- sh -c 'sleep 2; exit 0' ) &
holder_pid=$!
sleep 0.4

( run_leased "$waiter_log" waiter -- sh -c "touch '$marker'; exit 0" ) &
waiter_pid=$!
sleep 0.6

[ ! -e "$marker" ] || {
  echo "waiter's command started while another heavy verification held the lease" >&2
  exit 1
}

wait "$holder_pid"
wait "$waiter_pid"

[ -e "$marker" ] || {
  echo "waiter never ran its command after the holder released" >&2
  exit 1
}
grep -Fq "acquired 'waiter' after" "$waiter_log" || {
  echo "waiter did not report a wait/acquire" >&2
  exit 1
}

# --- 3. cancelling a waiter does not touch the live holder's lease -----

rm -rf "$lease_root"
mkdir -p "$lease_root"
holder_log="$tmpdir/holder3.log"
waiter_log="$tmpdir/waiter3.log"

run_leased_bg "$holder_log" holder3 -- sh -c 'sleep 5; exit 0'
holder_pid=$!
sleep 0.4

run_leased_bg "$waiter_log" waiter3 -- sh -c 'echo should-not-run; exit 0'
waiter_pid=$!
sleep 0.4
kill -TERM "$waiter_pid"
set +e
wait "$waiter_pid"
waiter_status=$?
set -e
[ "$waiter_status" -eq 143 ] || {
  echo "cancelled waiter did not exit via SIGTERM convention: $waiter_status" >&2
  exit 1
}
! grep -Fq 'should-not-run' "$waiter_log" || {
  echo "cancelled waiter ran its command anyway" >&2
  exit 1
}
[ -d "$lease_root/active" ] && [ -f "$lease_root/active/owner" ] || {
  echo "holder's live lease was disturbed by cancelling a waiter" >&2
  exit 1
}

set +e
wait "$holder_pid"
set -e
grep -Fq "released 'holder3'" "$holder_log" || {
  echo "holder did not complete and release normally" >&2
  exit 1
}

# --- 4. cancelling the owner releases the lease (signal cleanup) -------

rm -rf "$lease_root"
mkdir -p "$lease_root"
holder_log="$tmpdir/holder4.log"

run_leased_bg "$holder_log" holder4 -- sh -c 'sleep 30; exit 0'
holder_pid=$!
sleep 0.4
[ -d "$lease_root/active" ] || {
  echo "holder did not acquire the lease before being cancelled" >&2
  exit 1
}
kill -TERM "$holder_pid"
set +e
wait "$holder_pid"
holder_status=$?
set -e
[ "$holder_status" -eq 143 ] || {
  echo "cancelled owner did not exit via SIGTERM convention: $holder_status" >&2
  exit 1
}
[ ! -e "$lease_root/active" ] || {
  echo "lease was left behind after the owner was cancelled" >&2
  exit 1
}

# A fresh acquisition must succeed immediately now.
log4b="$tmpdir/after-cancel.log"
run_leased "$log4b" after-cancel -- sh -c 'echo ok; exit 0'
grep -Fq 'ok' "$log4b" || {
  echo "lease could not be re-acquired after the prior owner was cancelled" >&2
  exit 1
}

# --- 5. stale lease: pid no longer exists -------------------------------

rm -rf "$lease_root"
mkdir -p "$lease_root/active"
{
  echo 'pid=999999'
  echo "hostname=$(uname -n)"
  echo 'start_marker=dead-marker'
  echo 'command=long-gone'
  echo 'worktree=/nowhere'
  echo 'acquired_at=0'
} > "$lease_root/active/owner"

log5="$tmpdir/dead-pid.log"
HOST_VERIFICATION_LEASE_SHORT_GRACE=10 run_leased "$log5" recovered -- sh -c 'echo recovered; exit 0'
grep -Fq 'recovered' "$log5" || {
  echo "a lease owned by a dead pid was not reclaimed" >&2
  exit 1
}

# --- 6. PID-reuse defense: live pid, mismatched start marker -----------

rm -rf "$lease_root"
mkdir -p "$lease_root/active"
sleep 20 &
reuse_pid=$!
trap 'kill "$reuse_pid" 2>/dev/null || true; rm -rf "$tmpdir"' EXIT
{
  echo "pid=$reuse_pid"
  echo "hostname=$(uname -n)"
  echo 'start_marker=definitely-not-the-real-start-time'
  echo 'command=impersonator'
  echo 'worktree=/nowhere'
  echo 'acquired_at=0'
} > "$lease_root/active/owner"

log6="$tmpdir/pid-reuse.log"
HOST_VERIFICATION_LEASE_SHORT_GRACE=10 run_leased "$log6" reused -- sh -c 'echo reclaimed-despite-live-pid; exit 0'
grep -Fq 'reclaimed-despite-live-pid' "$log6" || {
  echo "a lease was not reclaimed when its recorded pid is live but its start marker does not match (PID reuse)" >&2
  exit 1
}
kill "$reuse_pid" 2>/dev/null || true
trap 'rm -rf "$tmpdir"' EXIT

# --- 7. a genuinely live owner (matching pid + start marker) is never stolen

rm -rf "$lease_root"
mkdir -p "$lease_root"
holder_log="$tmpdir/holder7.log"
( run_leased "$holder_log" real-holder -- sh -c 'sleep 3; exit 0' ) &
holder_pid=$!
sleep 0.4
[ -d "$lease_root/active" ] || {
  echo "real holder did not acquire before the live-owner check" >&2
  exit 1
}

waiter_log="$tmpdir/waiter7.log"
( TEST_REPORT_SECONDS=1 run_leased "$waiter_log" impatient -- sh -c 'echo stole-it; exit 0' ) &
waiter_pid=$!
sleep 1.2
! grep -Fq 'stole-it' "$waiter_log" || {
  echo "a genuinely live owner's lease was stolen by a waiting process" >&2
  exit 1
}
grep -Fq 'Waiting for host verification slot' "$waiter_log" || {
  echo "waiter did not report waiting behind the live holder" >&2
  exit 1
}
wait "$holder_pid"
wait "$waiter_pid"
grep -Fq 'stole-it' "$waiter_log" || {
  echo "waiter never acquired after the live holder legitimately finished" >&2
  exit 1
}

# --- 8. corrupt metadata: missing pid field -----------------------------

rm -rf "$lease_root"
mkdir -p "$lease_root/active"
printf 'not a valid metadata file\n' > "$lease_root/active/owner"

log8_early="$tmpdir/corrupt-early.log"
early_status=0
HOST_VERIFICATION_LEASE_SHORT_GRACE=3 timeout 1 sh -c \
  "HOST_VERIFICATION_LEASE_ROOT='$lease_root' sh '$RUNNER' corrupt-early -- sh -c 'echo too-soon; exit 0'" \
  > "$log8_early" 2>&1 || early_status=$?
[ "$early_status" -ne 0 ] || {
  echo "corrupt metadata was reclaimed before its short grace period elapsed" >&2
  exit 1
}
! grep -Fq 'too-soon' "$log8_early" || {
  echo "corrupt metadata was reclaimed before its short grace period elapsed" >&2
  exit 1
}

log8_late="$tmpdir/corrupt-late.log"
sleep 1.2
HOST_VERIFICATION_LEASE_SHORT_GRACE=1 run_leased "$log8_late" corrupt-late -- sh -c 'echo after-grace; exit 0'
grep -Fq 'after-grace' "$log8_late" || {
  echo "corrupt metadata was never reclaimed after its grace period elapsed" >&2
  exit 1
}

# --- 9. multiple simulated worktrees share the same injected lease root

rm -rf "$lease_root"
mkdir -p "$lease_root" "$tmpdir/worktree-a" "$tmpdir/worktree-b"
holder_log="$tmpdir/mw-holder.log"
waiter_log="$tmpdir/mw-waiter.log"
(
  cd "$tmpdir/worktree-a"
  run_leased "$holder_log" from-a -- sh -c 'sleep 2; exit 0'
) &
holder_pid=$!
sleep 0.4
(
  cd "$tmpdir/worktree-b"
  run_leased "$waiter_log" from-b -- sh -c 'echo from-b-ran; exit 0'
) &
waiter_pid=$!
sleep 0.4
! grep -Fq 'from-b-ran' "$waiter_log" || {
  echo "a different simulated worktree was not coordinated through the shared lease root" >&2
  exit 1
}
wait "$holder_pid"
wait "$waiter_pid"
grep -Fq 'from-b-ran' "$waiter_log" || {
  echo "the other simulated worktree never acquired after the first released" >&2
  exit 1
}

# --- 10. CI mode is a no-op: no wait, no lease directory ----------------

rm -rf "$lease_root"
mkdir -p "$lease_root"
holder_log="$tmpdir/holder10.log"
( run_leased "$holder_log" holder10 -- sh -c 'sleep 2; exit 0' ) &
holder_pid=$!
sleep 0.4

ci_log="$tmpdir/ci.log"
CI=true HOST_VERIFICATION_LEASE_ROOT="$lease_root" sh "$RUNNER" ci-caller -- sh -c 'echo ci-ran-immediately; exit 0' > "$ci_log" 2>&1
grep -Fq 'ci-ran-immediately' "$ci_log" || {
  echo "CI=true still coordinated through the host lease" >&2
  exit 1
}
! grep -Fq 'Waiting for host verification slot' "$ci_log" || {
  echo "CI=true waited for the host lease instead of skipping it" >&2
  exit 1
}
wait "$holder_pid"

# --- 11. this coordination never touches worktree-local cache paths ----

! grep -v '^[[:space:]]*#' "$LIB" | grep -Eq '\.verification|\.vite' || {
  echo "host-verification-lease.sh references worktree-local cache/evidence paths; it must stay host-scoped only" >&2
  exit 1
}

echo "all host-verification-lease scenarios passed"
