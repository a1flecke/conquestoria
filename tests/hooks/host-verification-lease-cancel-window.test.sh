#!/usr/bin/env bash
# A signal that lands after the lease is claimed must release it, whatever the scheduler does.
#
# The failure this pins (seen as "lease was left behind after the owner was cancelled" in host-verification-lease.test.sh on
# a busy host, which failed a real push): `hvl_acquire` published `active/owner`, then reset INT/TERM to the default
# disposition, and only afterwards did the caller (`run-under-host-lease.sh`) install the trap that releases the lease. A
# TERM in that gap killed the shell (exit 143) with the lease still published. There was a second, shorter gap before it:
# between the winning claim and leaving the wait loop, the trap was `hvl_wait_cancel`, which released nothing.
#
# Each scenario forces its window instead of hoping a loaded host finds it: a shadowed function sends the signal at exactly
# that point. No timing is involved, so this fails on the old code every time and passes on the fixed code every time.

set -eu
unset CI HOST_VERIFICATION_LEASE_DISABLE HVL_CAPACITY_LANE || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# HVL_LIB_UNDER_TEST points the scenarios at another copy of the library (to prove they fail on the unfixed one).
LIB="${HVL_LIB_UNDER_TEST:-$ROOT/scripts/host-verification-lease.sh}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

# A copy of the library with the real claim renamed, so a scenario can shadow `hvl_owner_claim` and still call it.
sed 's/^hvl_owner_claim()/hvl_owner_claim_real()/' "$LIB" > "$tmpdir/lib-claim-renamed.sh"

# run_scenario <name> <shell program run after sourcing the library>
# Prints the exit status of the program; the lease root is $tmpdir/<name>.
run_scenario() {
  name="$1"
  program="$2"
  root="$tmpdir/$name"
  mkdir -p "$root"
  status=0
  HOST_VERIFICATION_LEASE_ROOT="$root" LEASE_ROOT="$root" LIB="$3" sh -c "$program" >"$tmpdir/$name.out" 2>&1 || status=$?
  echo "$status"
}

# --- 1. the signal lands in the gap after hvl_acquire returns ownership, before the caller's own traps ----------------
# `hvl_now` is called right after ownership is taken; the shadow signals this shell once the owner record exists.
status="$(run_scenario after-claim '
  . "$LIB"
  hvl_now() { [ ! -f "$LEASE_ROOT/active/owner" ] || kill -TERM $$; date +%s; }
  hvl_acquire window-after
  echo "survived: the signal never took effect"
' "$LIB")"
[ "$status" -eq 143 ] || fail "after the claim: expected exit 143, got $status ($(cat "$tmpdir/after-claim.out"))"
[ ! -e "$tmpdir/after-claim/active/owner" ] || fail "after the claim: the lease was left behind"

# --- 2. the signal lands between the winning claim and the end of the wait loop ---------------------------------------
status="$(run_scenario in-loop '
  . "$LIB"
  hvl_owner_claim() { hvl_owner_claim_real "$@" || return $?; kill -TERM $$; }
  hvl_acquire window-in-loop
  echo "survived: the signal never took effect"
' "$tmpdir/lib-claim-renamed.sh")"
[ "$status" -eq 143 ] || fail "in the wait loop: expected exit 143, got $status ($(cat "$tmpdir/in-loop.out"))"
[ ! -e "$tmpdir/in-loop/active/owner" ] || fail "in the wait loop: the lease was left behind"

# --- 2b. the same window for a capacity slot: the claim wins, the signal lands before the wait loop is left ----------------
status="$(run_scenario slot-in-loop '
  . "$LIB"
  hvl_owner_claim() { hvl_owner_claim_real "$@" || return $?; kill -TERM $$; }
  hvl_acquire_budget_slot window-slot
  echo "survived: the signal never took effect"
' "$tmpdir/lib-claim-renamed.sh")"
[ "$status" -eq 143 ] || fail "slot in the wait loop: expected exit 143, got $status ($(cat "$tmpdir/slot-in-loop.out"))"
# With the lease root injected, the capacity slots live beside it ($tmpdir/budget), not under it.
[ -d "$tmpdir/budget" ] || fail "slot in the wait loop: expected the slots under $tmpdir/budget"
[ -z "$(find "$tmpdir/budget" -name owner 2>/dev/null)" ] || fail "slot in the wait loop: the slot was left behind"

# --- 3. a cancelled wait that never won releases nothing (a live holder is never disturbed) -----------------------------
root="$tmpdir/waiter-only"
mkdir -p "$root"
(
  HOST_VERIFICATION_LEASE_ROOT="$root" LIB="$LIB" exec sh -c '. "$LIB"; hvl_acquire holder; sleep 30'
) >/dev/null 2>&1 &
holder_pid=$!
i=0
while [ ! -f "$root/active/owner" ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
[ -f "$root/active/owner" ] || fail "the holder never acquired"
(
  HOST_VERIFICATION_LEASE_ROOT="$root" LIB="$LIB" HOST_VERIFICATION_LEASE_REPORT_SECONDS=1 \
    exec sh -c '. "$LIB"; hvl_acquire waiter'
) >/dev/null 2>&1 &
waiter_pid=$!
sleep 1
kill -TERM "$waiter_pid"
waiter_status=0
wait "$waiter_pid" || waiter_status=$?
[ "$waiter_status" -eq 143 ] || fail "waiter: expected exit 143, got $waiter_status"
[ -f "$root/active/owner" ] || fail "cancelling a waiter released the live holder's lease"
kill "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true

echo "host-verification-lease cancel-window scenarios passed"
