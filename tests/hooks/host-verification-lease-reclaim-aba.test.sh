#!/usr/bin/env bash
# #1612: a waiter must never delete a lock record other than the one it judged abandoned.
#
# The CI failure: 10 holders racing for 3 budget slots let a 4th in. The mechanism was an ABA race in the reclaim
# path. A waiter read slot-N/owner (owner D), the owner released and exited, a new holder W won slot-N, and the waiter
# -- now finding D dead -- ran `rm owner; rmdir slot-N`, deleting W's live record, and took the slot: W and the waiter
# both held slot-N. The mutex (`active/owner`) and the durable worktree lock had the same read-judge-delete-by-name
# shape.
#
# Every scenario here forces the exact interleaving instead of hoping the scheduler produces it: the liveness probe
# `hvl_pid_is_live` is shadowed with a shell function (the technique host-verification-lease-pid-visibility.test.sh
# uses for `kill`) that, the first time it is asked about the old owner D, performs D's release and W's claim before
# answering "D is dead". No timing or load is involved.

set -eu
unset CI HVL_CAPACITY_LANE HOST_VERIFICATION_FOREGROUND_BUDGET HOST_VERIFICATION_BACKGROUND_BUDGET HOST_VERIFICATION_LEASE_BUDGET || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"

tmpdir="$(mktemp -d)"
w_pid=""
cleanup() {
  [ -z "$w_pid" ] || kill "$w_pid" 2>/dev/null || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

dead_pid() { sh -c 'exit 0' & p=$!; wait "$p" 2>/dev/null || true; echo "$p"; }

wait_for() { # wait_for <file> <tenths>
  i=0
  while [ ! -e "$1" ] && [ "$i" -lt "$2" ]; do sleep 0.1; i=$((i + 1)); done
  [ -e "$1" ]
}

# race_scenario <budget|mutex>
#
# Slot (or lease) starts owned by dead D. The waiter's first liveness probe of D swaps in live W. Correct behaviour:
# the waiter keeps waiting while W is alive, W's record is untouched, and the waiter acquires once W is gone.
race_scenario() {
  mode="$1"
  dir="$tmpdir/$mode"
  rm -rf "$dir"; mkdir -p "$dir/lease-root"
  export HOST_VERIFICATION_LEASE_ROOT="$dir/lease-root" HOST_VERIFICATION_LEASE_BUDGET=1
  host="$(uname -n)"
  if [ "$mode" = budget ]; then owner="$dir/budget/slot-0/owner"; else owner="$dir/lease-root/active/owner"; fi
  mkdir -p "$(dirname "$owner")"

  d="$(dead_pid)"
  sleep 300 & w_pid=$!
  w_marker="$(sh -c '. "$1"; hvl_start_marker "$2"' _ "$LIB" "$w_pid")"
  printf 'pid=%s\nhostname=%s\nstart_marker=long gone\ncommand=D\n' "$d" "$host" > "$owner"
  w_record="$(printf 'pid=%s\nhostname=%s\nstart_marker=%s\ncommand=W' "$w_pid" "$host" "$w_marker")"
  printf '%s\n' "$w_record" > "$dir/w-record"

  cat > "$dir/waiter.sh" <<EOF
. "$LIB"
hvl_pid_is_live() {
  if [ "\$1" = "$d" ] && [ ! -e "$dir/swapped" ]; then
    : > "$dir/swapped"
    # D releases (its own release path: rm owner, rmdir) and W wins the same name, all between the waiter's read
    # of D's record and anything it does about it.
    rm -f "$owner"; rmdir "$(dirname "$owner")" 2>/dev/null || true
    mkdir -p "$(dirname "$owner")"; cp "$dir/w-record" "$owner"
  fi
  kill -0 "\$1" 2>/dev/null || ps -p "\$1" >/dev/null 2>&1
}
if [ "$mode" = budget ]; then hvl_acquire_budget_slot waiter; else hvl_acquire waiter; fi
: > "$dir/acquired"
cp "$owner" "$dir/waiter-saw"
if [ "$mode" = budget ]; then hvl_release_budget_slot; else hvl_release; fi
EOF
  HVL_DEBUG_TRACE=1 sh "$dir/waiter.sh" > "$dir/waiter.log" 2>&1 &
  waiter=$!

  wait_for "$dir/swapped" 50 || fail "$mode: the waiter never probed the old owner's liveness ($(cat "$dir/waiter.log"))"
  # The waiter has seen D "die". Give it ample opportunity to act on that stale judgement; any acquisition while W
  # is alive is the #1612 bug, whatever the timing.
  sleep 2
  [ ! -e "$dir/acquired" ] || fail "$mode: the waiter acquired while live W held it -- it deleted W's record ($(cat "$dir/waiter.log"))"
  [ "$(cat "$owner" 2>/dev/null)" = "$w_record" ] || fail "$mode: W's owner record was modified or removed: [$(cat "$owner" 2>/dev/null)]"

  # Liveness: once W is really gone, the waiter reclaims W's record and acquires.
  kill "$w_pid"; wait "$w_pid" 2>/dev/null || true; w_pid=""
  wait_for "$dir/acquired" 100 || fail "$mode: the waiter never acquired after W exited ($(cat "$dir/waiter.log"))"
  wait "$waiter" || fail "$mode: the waiter exited non-zero ($(cat "$dir/waiter.log"))"
  grep -q "^command=waiter\$" "$dir/waiter-saw" || fail "$mode: the acquired record does not name the waiter: $(cat "$dir/waiter-saw")"
  [ ! -e "$owner" ] || fail "$mode: release left the record behind"
}

# --- 1 / 2. the reported race, budget slot and mutex ---------------------------------------------------------------
race_scenario budget
race_scenario mutex

# --- 3. a live owner whose own `ps` failed when it acquired (empty recorded marker) is never reclaimed ------------
# Before #1612 the budget treated "live pid + empty recorded marker" as dead, and the mutex compared the empty marker
# with a readable current one and called it PID reuse; both stole a live holder's slot.
for mode in budget mutex; do
  dir="$tmpdir/empty-marker-$mode"; mkdir -p "$dir/lease-root"
  export HOST_VERIFICATION_LEASE_ROOT="$dir/lease-root" HOST_VERIFICATION_LEASE_BUDGET=1
  if [ "$mode" = budget ]; then owner="$dir/budget/slot-0/owner"; else owner="$dir/lease-root/active/owner"; fi
  mkdir -p "$(dirname "$owner")"
  sleep 300 & w_pid=$!
  printf 'pid=%s\nhostname=%s\nstart_marker=\ncommand=W\n' "$w_pid" "$(uname -n)" > "$owner"
  sh -c '. "$1"; if [ "$2" = budget ]; then hvl_acquire_budget_slot; else hvl_acquire x; fi; : > "$3"' _ "$LIB" "$mode" "$dir/acquired" > "$dir/log" 2>&1 &
  waiter=$!
  sleep 2
  [ ! -e "$dir/acquired" ] || fail "$mode: a live owner with an empty recorded start marker was reclaimed ($(cat "$dir/log"))"
  grep -q "^pid=$w_pid\$" "$owner" || fail "$mode: the live owner's record was removed"
  kill "$waiter" 2>/dev/null || true; wait "$waiter" 2>/dev/null || true
  kill "$w_pid"; wait "$w_pid" 2>/dev/null || true; w_pid=""
done

# --- 4. the primitives directly ------------------------------------------------------------------------------------
dir="$tmpdir/primitives"; mkdir -p "$dir/lock"
owner="$dir/lock/owner"
(
  set -eu
  . "$LIB"
  rec_a="$(printf 'pid=1\nclaim_id=a')"
  rec_b="$(printf 'pid=2\nclaim_id=b')"

  hvl_owner_claim "$owner" "$rec_a" || fail "claim on a free lock did not win"
  [ "$(hvl_owner_read "$owner")" = "$rec_a" ] || fail "the claimed record is not what was written"
  st=0; hvl_owner_claim "$owner" "$rec_b" || st=$?
  [ "$st" -eq 1 ] || fail "a second claim did not lose (status $st)"
  [ "$(hvl_owner_read "$owner")" = "$rec_a" ] || fail "a losing claim changed the record"
  [ -z "$(ls -A "$dir/lock" | grep -v '^owner$' || true)" ] || fail "a claim left staging files: $(ls -A "$dir/lock")"

  # Reclaiming with an out-of-date snapshot never deletes the current record.
  hvl_owner_reclaim "$owner" "$rec_b" && fail "reclaim deleted a record other than the one it was given"
  [ "$(hvl_owner_read "$owner")" = "$rec_a" ] || fail "an out-of-date reclaim changed the record"

  # Exactly one waiter gets the right to reclaim one record: a live holder of that record's token blocks the rest.
  sleep 300 & holder=$!
  token="$dir/lock/.reclaim.$(hvl_path_hash "$rec_a")"
  printf 'pid=%s\nstart_marker=\n' "$holder" > "$token"
  hvl_owner_reclaim "$owner" "$rec_a" && fail "a second waiter reclaimed a record another live waiter was already reclaiming"
  [ "$(hvl_owner_read "$owner")" = "$rec_a" ] || fail "the blocked reclaim changed the record"
  kill "$holder"; wait "$holder" 2>/dev/null || true

  # ...and a waiter that died holding the token does not wedge the lock: the next one takes over.
  hvl_owner_reclaim "$owner" "$rec_a" || fail "a token left by a dead waiter blocked reclaim forever"
  [ ! -e "$owner" ] || fail "the reclaim did not remove the record"
  [ ! -e "$dir/lock" ] || fail "the reclaim left its tokens behind: $(ls -A "$dir/lock")"
) || exit 1

# --- 5. the durable worktree lock uses the same primitives ---------------------------------------------------------
grep -q 'hvl_owner_claim "\$lock_dir/pid"' "$ROOT/scripts/run-durable-test-suite.sh" \
  && grep -q 'hvl_owner_reclaim "\$lock_dir/pid"' "$ROOT/scripts/run-durable-test-suite.sh" \
  || fail "run-durable-test-suite.sh acquire_lock must claim and reclaim through hvl_owner_claim/hvl_owner_reclaim"
! grep -n 'rmdir "\$lock_dir" 2>/dev/null || ! mkdir' "$ROOT/scripts/run-durable-test-suite.sh" \
  || fail "run-durable-test-suite.sh still replaces a stale lock by name"

echo "all host-verification-lease reclaim (ABA) scenarios passed"
