#!/usr/bin/env bash
# #1377 (race found via the #1166 scheduler benchmark harness, scenario 12).
#
# Both acquire functions in scripts/host-verification-lease.sh self-register a
# "waiting" record (`.../waiting/<pid>`) so `yarn verify:local:status` can show
# QUEUED rows from durable files. The contract is that this record is withdrawn
# ON acquire. The bug: the withdrawal happened at the function's tail, AFTER the
# win branch had already published ownership (`slot-N/owner` for the budget
# semaphore, `active/owner` for the mutex). For the interval between those two
# writes, durable state simultaneously said "this pid holds capacity" and "this
# pid is queued for admission" -- and the scheduler harness's invariant "a job
# waiting for admission never holds capacity" (checked from ~100ms samples of
# exactly those files) flaked in CI whenever a sample landed in the window.
#
# The fix withdraws the waiting record in the win branch, BEFORE publishing
# ownership, so the inconsistent state is impossible rather than rarer.
#
# Why this test is deterministic rather than a polling race: it sources the
# library into THIS shell and shadows `rm` with a function that, at the exact
# moment our waiting record is removed, inspects whether an owner file already
# names this pid. The contending holder below holds its slot/lease until our
# waiting record exists (a real wait -> win transition is guaranteed, never
# skipped), so:
#   - pre-fix: the tail `rm` runs after the owner write -> violation, always;
#   - post-fix: the win-branch `rm` runs before the owner write -> clean, always.
# No wall-clock window is part of the assertion.

set -eu
unset CI HVL_CAPACITY_LANE HOST_VERIFICATION_FOREGROUND_BUDGET HOST_VERIFICATION_BACKGROUND_BUDGET HOST_VERIFICATION_LEASE_BUDGET VERIFY_REUSE_PROOF || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"

tmpdir="$(mktemp -d)"
child_pids=""
trap 'for p in $child_pids; do kill "$p" 2>/dev/null || true; done; rm -rf "$tmpdir"' EXIT

lease_root="$tmpdir/lease-root"
budget_dir="$tmpdir/budget" # resolved as dirname(lease_root)/budget; see hvl_resolve_host_scope_dir
mkdir -p "$lease_root"
export HOST_VERIFICATION_LEASE_ROOT="$lease_root"

# The waiting-record paths both functions will use for THIS shell's pid.
BUDGET_WAITING="$budget_dir/waiting/$$"
MUTEX_WAITING="$lease_root/waiting/$$"
VIOLATION="$tmpdir/violation"

# watch_violation <path-being-removed>: if <path> is one of our waiting records
# and it still exists, a withdrawal is happening right now -- so no owner file
# may already name us.
watch_violation() {
  case "$1" in
    "$BUDGET_WAITING")
      for owner in "$budget_dir"/slot-*/owner; do
        [ -f "$owner" ] || continue
        if [ "$(sed -n 's/^pid=//p' "$owner" | head -n 1)" = "$$" ]; then
          echo "budget waiting record withdrawn AFTER ownership was published ($owner)" > "$VIOLATION"
        fi
      done
      ;;
    "$MUTEX_WAITING")
      owner="$lease_root/active/owner"
      if [ -f "$owner" ] && [ "$(sed -n 's/^pid=//p' "$owner" | head -n 1)" = "$$" ]; then
        echo "mutex waiting record withdrawn AFTER ownership was published ($owner)" > "$VIOLATION"
      fi
      ;;
  esac
}

# Shadow rm so we can observe the exact state at each waiting-record withdrawal.
rm() {
  for arg in "$@"; do
    case "$arg" in
      "$BUDGET_WAITING" | "$MUTEX_WAITING")
        [ -f "$arg" ] && watch_violation "$arg"
        ;;
    esac
  done
  command rm "$@"
}

. "$LIB"

wait_for_marker() {
  # wait_for_marker <marker-file>
  attempts=0
  while [ ! -e "$1" ]; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 200 ]; then
      echo "marker $1 never appeared within 20s" >&2
      exit 1
    fi
    sleep 0.1
  done
}

# --- 1. budget semaphore: a waiter's waiting record must be withdrawn BEFORE
#        its slot ownership is published -----------------------------------

export HOST_VERIFICATION_BACKGROUND_BUDGET=1
marker1="$tmpdir/m1"
holder1="$tmpdir/holder1.sh"
cat > "$holder1" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot holder
: > "$marker1"
# Hold until the waiter has actually registered as waiting, so the wait->win
# transition under test can never be skipped by fast scheduling.
n=0
while [ ! -e "$BUDGET_WAITING" ]; do
  n=\$((n + 1))
  [ "\$n" -lt 200 ] || { echo "waiter never registered" >&2; exit 1; }
  sleep 0.1
done
hvl_release_budget_slot
EOF
chmod +x "$holder1"

sh "$holder1" &
child_pids="$child_pids $!"
wait_for_marker "$marker1"

# This blocks: slot-0 is held until the holder above sees our waiting record.
hvl_acquire_budget_slot waiter

if [ -f "$VIOLATION" ]; then
  echo "budget race: $(cat "$VIOLATION")" >&2
  exit 1
fi
[ ! -e "$BUDGET_WAITING" ] || {
  echo "budget waiting record was left behind after a successful acquire" >&2
  exit 1
}
[ -f "$budget_dir/slot-0/owner" ] || {
  echo "budget acquire returned without owning slot-0" >&2
  exit 1
}
grep -Fxq "pid=$$" "$budget_dir/slot-0/owner" || {
  echo "budget slot-0 owner does not name this process" >&2
  exit 1
}
hvl_release_budget_slot
unset HOST_VERIFICATION_BACKGROUND_BUDGET

# --- 2. mkdir mutex: same ordering contract for hvl_acquire -----------------

rm -rf "$lease_root" "$budget_dir"
mkdir -p "$lease_root"
marker2="$tmpdir/m2"
holder2="$tmpdir/holder2.sh"
cat > "$holder2" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire holder-mutex
: > "$marker2"
n=0
while [ ! -e "$MUTEX_WAITING" ]; do
  n=\$((n + 1))
  [ "\$n" -lt 200 ] || { echo "waiter never registered" >&2; exit 1; }
  sleep 0.1
done
hvl_release
EOF
chmod +x "$holder2"

sh "$holder2" &
child_pids="$child_pids $!"
wait_for_marker "$marker2"

hvl_acquire waiter-mutex

if [ -f "$VIOLATION" ]; then
  echo "mutex race: $(cat "$VIOLATION")" >&2
  exit 1
fi
[ ! -e "$MUTEX_WAITING" ] || {
  echo "mutex waiting record was left behind after a successful acquire" >&2
  exit 1
}
grep -Fxq "pid=$$" "$lease_root/active/owner" || {
  echo "mutex owner does not name this process" >&2
  exit 1
}
hvl_release

# --- 3. structural pins: the withdrawal must precede the publication in the
#        source, so a future refactor cannot silently reorder them -----------

line_of() { # line_of <pattern> -- first matching line number on stdin
  grep -n "$1" | head -n 1 | cut -d: -f1
}

budget_fn="$(awk '/^hvl_acquire_budget_slot\(\) \{/,/^\}/' "$LIB")"
b_mkdir="$(printf '%s\n' "$budget_fn" | line_of 'if mkdir "\$hvl_budget_slot_dir"')"
b_withdraw="$(printf '%s\n' "$budget_fn" | line_of 'rm -f "\$hvl_budget_waiting_file"')"
b_publish="$(printf '%s\n' "$budget_fn" | line_of '> "\$hvl_budget_owner_file"')"
[ -n "$b_mkdir" ] && [ -n "$b_withdraw" ] && [ -n "$b_publish" ] || {
  echo "structural pin: could not locate mkdir/withdraw/publish in hvl_acquire_budget_slot" >&2
  exit 1
}
[ "$b_mkdir" -lt "$b_withdraw" ] && [ "$b_withdraw" -lt "$b_publish" ] || {
  echo "structural pin: hvl_acquire_budget_slot must withdraw the waiting record (line $b_withdraw) after winning the mkdir ($b_mkdir) but before publishing the owner file ($b_publish)" >&2
  exit 1
}

mutex_fn="$(awk '/^hvl_acquire\(\) \{/,/^\}/' "$LIB")"
m_mkdir="$(printf '%s\n' "$mutex_fn" | line_of 'if mkdir "\$HVL_LEASE_DIR"')"
m_withdraw="$(printf '%s\n' "$mutex_fn" | line_of 'rm -f "\$hvl_waiting_file"')"
m_publish="$(printf '%s\n' "$mutex_fn" | line_of 'hvl_write_metadata')"
[ -n "$m_mkdir" ] && [ -n "$m_withdraw" ] && [ -n "$m_publish" ] || {
  echo "structural pin: could not locate mkdir/withdraw/publish in hvl_acquire" >&2
  exit 1
}
[ "$m_mkdir" -lt "$m_withdraw" ] && [ "$m_withdraw" -lt "$m_publish" ] || {
  echo "structural pin: hvl_acquire must withdraw the waiting record (line $m_withdraw) after winning the mkdir ($m_mkdir) but before writing metadata ($m_publish)" >&2
  exit 1
}

echo "all wait/hold publication-ordering scenarios passed"
