#!/usr/bin/env bash
# The lease library is sourced by sh scripts AND by scripts that run under `set -euo pipefail`
# (scripts/run-ai-long-horizon.sh). Its value helpers are pipelines or reads that fail when the thing they read has
# just vanished (an owner pid that exited, a metadata file that was released). Under `sh` that failure is invisible
# (a pipeline's status is its last command's); under pipefail+errexit an assignment such as
#   fresh="$(hvl_start_marker "$owner_pid")"
# aborts the WHOLE script with exit 1. That is the CI flake behind scenario 12 of the scheduler benchmark
# ("AI-long still completed after its backoff", `ai=1`): the owner of the slot AI-long was waiting for exited between
# `hvl_pid_is_live` and the marker read.
#
# Contract pinned here:
#   1. every value-returning helper is TOTAL: it returns 0 (and prints nothing) for a dead pid / missing file;
#   2. a real budget wait under `set -euo pipefail` survives the owner vanishing mid-poll and then acquires;
#   3. no new `$(hvl_<helper> ...)` assignment may appear for a helper this test does not know is total.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"
tmp="$(mktemp -d)"
cleanup_pids=""
cleanup() {
  for p in $cleanup_pids; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# --- 1. totality of the value helpers under pipefail + errexit ---------------------------------------------------
bash -c '
set -euo pipefail
. "$1"
dead=99999999
out="$(hvl_start_marker "$dead")";            [ -z "$out" ]
out="$(hvl_field "/nonexistent/owner" pid)";  [ -z "$out" ]
out="$(hvl_mtime_epoch "/nonexistent/dir")";  [ "$out" = 0 ]
out="$(hvl_job_tree_pids "$dead")";           [ "$out" = "$dead" ]
out="$(hvl_hostname)";                        [ -n "$out" ]
out="$(hvl_cpu_count)";                       [ -n "$out" ]
out="$(hvl_path_hash "x")";                   [ -n "$out" ]
echo reached-end
' _ "$LIB" | grep -q '^reached-end$' || fail "a value helper is not total under set -euo pipefail"

# --- 2. a budget wait survives its slot owner vanishing between the liveness check and the marker read ------------
# `ps -o lstart=` (the marker read) fails; `kill -0` still says the owner is alive. Under the old helper that aborted
# the waiting script with exit 1; the inconclusive read must instead mean "still alive, keep waiting".
mkdir -p "$tmp/bin" "$tmp/lease/budget/slot-0"
cat > "$tmp/bin/ps" <<'SHIM'
#!/bin/sh
case "$*" in *lstart=*) exit 1 ;; esac
exec /bin/ps "$@"
SHIM
chmod +x "$tmp/bin/ps"
sleep 30 &
owner=$!
cleanup_pids="$cleanup_pids $owner"
printf 'pid=%s\nstart_marker=%s\ncommand=held\nlane=background\nworktree=x\nacquired_at=0\n' "$owner" "Thu Jan  1 00:00:00 1970" > "$tmp/lease/budget/slot-0/owner"

cat > "$tmp/waiter.sh" <<'WAITER'
#!/usr/bin/env bash
set -euo pipefail
. "$LIB"
export HOST_VERIFICATION_LEASE_ROOT="$LEASE_SCOPE/push-verification-lease"
export HOST_VERIFICATION_BACKGROUND_BUDGET=1
export HVL_CAPACITY_LANE=background
unset CI HOST_VERIFICATION_LEASE_DISABLE
hvl_acquire_budget_slot waiter
echo acquired > "$ACQUIRED_FILE"
hvl_release_budget_slot
WAITER
chmod +x "$tmp/waiter.sh"

LIB="$LIB" LEASE_SCOPE="$tmp/lease" ACQUIRED_FILE="$tmp/acquired" PATH="$tmp/bin:$PATH" bash "$tmp/waiter.sh" >"$tmp/waiter.out" 2>&1 &
waiter=$!
cleanup_pids="$cleanup_pids $waiter"

sleep 4
kill -0 "$waiter" 2>/dev/null || { cat "$tmp/waiter.out" >&2; fail "the waiting script aborted while the slot owner was still alive (exit $(wait "$waiter" || true))"; }
[ ! -f "$tmp/acquired" ] || fail "the waiter acquired a slot that is still held by a live owner"

# The owner finishes; the waiter must now take the slot and exit cleanly.
kill "$owner" 2>/dev/null || true
wait "$owner" 2>/dev/null || true
status=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  kill -0 "$waiter" 2>/dev/null || break
  sleep 1
done
wait "$waiter" || status=$?
[ "$status" -eq 0 ] || { cat "$tmp/waiter.out" >&2; fail "the waiter exited $status after the owner finished"; }
[ -f "$tmp/acquired" ] || fail "the waiter never acquired the slot after the owner finished"

# --- 3. structural guard: only known-total helpers may feed an unguarded `$(...)` assignment ---------------------
TOTAL="hvl_start_marker hvl_field hvl_mtime_epoch hvl_job_tree_pids hvl_hostname hvl_cpu_count hvl_path_hash hvl_now hvl_resolve_host_scope_dir hvl_resolve_root hvl_capacity_lane hvl_lane_budget_dir hvl_lane_capacity"
# Lines that already guard the substitution with `||` are safe whatever the helper does.
unguarded_helpers() {
  grep -h '\$(hvl_' "$@" | grep -v '||' | grep -ohE '\$\((hvl_[a-z_]+)' | sed 's/^\$(//' | sort -u
}
unknown_helpers() {
  for helper in $(unguarded_helpers "$@"); do
    case " $TOTAL " in *" $helper "*) ;; *) echo "$helper" ;; esac
  done
}

# Earned control: the guard must flag a new, unguarded, unlisted helper (and accept a guarded one).
printf 'x="$(hvl_brand_new_reader "$1")"\ny="$(hvl_other "$1" || true)"\n' > "$tmp/new.sh"
[ "$(unknown_helpers "$tmp/new.sh")" = "hvl_brand_new_reader" ] || fail "the structural guard did not flag a new unguarded helper"

unknown="$(unknown_helpers "$LIB" "$ROOT"/scripts/*.sh)"
[ -z "$unknown" ] || fail "unguarded \$(...) use of a helper that is not on the totality list ($unknown): make it total under pipefail and add it to TOTAL in this test"

echo "all host-verification-lease pipefail scenarios passed"
