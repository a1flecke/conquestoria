#!/usr/bin/env bash
# #1133 cross-context status-visibility report (issue comment, 2026-09-21):
# from a restricted Codex command context, `yarn verify:local:status`
# reported a lease as fully idle while the same command run from the
# privileged execution context found two genuinely live holders on disk.
# Root cause: `hvl_pid_is_live` trusted `kill -0` alone as authoritative.
# POSIX kill(2) returns EPERM (not ESRCH) when the target process genuinely
# exists but the caller lacks permission to signal it -- a real condition
# across a sandbox/privilege boundary that can still allow a read-only
# process listing. `kill -0 2>/dev/null` collapses both outcomes into the
# same "not live" result, so a permission-denied signal was silently
# misread as "process is dead" everywhere `hvl_pid_is_live` gates a
# reclaim-or-report decision (the mutex, the budget semaphore, every
# `yarn verify:local:status` row, and durable-scope RUNNING/ABANDONED
# classification).
#
# This test proves the fix without needing real privilege separation: it
# fakes ONLY the `kill -0` outcome (by shadowing the `kill` builtin with a
# shell function -- both bash and dash resolve a user-defined function
# before falling back to a builtin) while leaving a REAL, genuinely live
# background process in place, so the fallback `ps -p` probe has something
# true to find.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"

# shellcheck source=../../scripts/host-verification-lease.sh
. "$LIB"

cleanup_pids=""
cleanup() {
  for p in $cleanup_pids; do
    kill "$p" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT

# --- 1. baseline: kill -0 alone still reports a real live process live --

sleep 30 &
live_pid=$!
cleanup_pids="$cleanup_pids $live_pid"

hvl_pid_is_live "$live_pid" || {
  echo "scenario 1: a genuinely live process was reported not-live" >&2
  exit 1
}

# --- 2. baseline: a genuinely dead pid is still reported dead -----------

sh -c 'exit 0' &
dead_pid=$!
wait "$dead_pid" 2>/dev/null || true
# Give the OS a moment past reaping; on a busy host a just-reaped pid can
# still transiently satisfy `ps -p` for a tick, so poll briefly rather than
# asserting instantly.
dead_confirmed=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! hvl_pid_is_live "$dead_pid"; then
    dead_confirmed=1
    break
  fi
  sleep 0.2
done
[ "$dead_confirmed" -eq 1 ] || {
  echo "scenario 2: a genuinely dead pid was still reported live after polling" >&2
  exit 1
}

# --- 3. the actual fix: kill -0 denied, but the process still exists ----
# (simulates the reported cross-context scenario: a sandbox boundary that
# blocks signal-sending but not read-only process listing)

sleep 30 &
live_pid2=$!
cleanup_pids="$cleanup_pids $live_pid2"

# shellcheck disable=SC2317  # invoked indirectly via the shadowed `kill` name
kill() { return 1; }

hvl_pid_is_live "$live_pid2" || {
  unset -f kill
  echo "scenario 3: kill -0 denial (simulated EPERM) was wrongly treated as proof of death for a process ps can still see" >&2
  exit 1
}

unset -f kill

# --- 4. kill -0 denied AND ps also can't see it -> correctly reported dead

sh -c 'exit 0' &
dead_pid2=$!
wait "$dead_pid2" 2>/dev/null || true
sleep 0.5

# shellcheck disable=SC2317
kill() { return 1; }

still_alive=1
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! hvl_pid_is_live "$dead_pid2"; then
    still_alive=0
    break
  fi
  sleep 0.2
done
unset -f kill
[ "$still_alive" -eq 0 ] || {
  echo "scenario 4: with kill denied AND the process genuinely gone, hvl_pid_is_live never reported it dead" >&2
  exit 1
}

echo "all host-verification-lease pid-visibility scenarios passed"
