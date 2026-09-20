#!/usr/bin/env bash
# #1133 P2 / MR6. `yarn verify:local:status` gives an agent/human one durable
# view of every tracked heavyweight verification class: the host-wide mutex
# and resource-budget's live holders/waiters, and each durable scope's last
# known result -- all from files (lease/budget metadata,
# .verification/<scope>-suite.*), never from `ps` heuristics, so a caller
# that lost its terminal/tool stream can recover without guessing or
# retrying (see the script's own header for the full state-to-guidance
# mapping this exists to support).

set -eu
# Same reason every other host-lease test unsets CI: GitHub Actions always
# sets CI=true, which the coordination layer treats as "do not coordinate at
# all" by design, defeating every live-holder/waiter scenario below.
unset CI || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"
STATUS_SCRIPT="$ROOT/scripts/verify-local-status.sh"
# shellcheck source=../../scripts/host-verification-lease.sh
. "$LIB"

[ -x "$STATUS_SCRIPT" ] || {
  echo "verify-local-status.sh is missing or not executable" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
lease_root="$tmpdir/lease-root"
mkdir -p "$lease_root"
export HOST_VERIFICATION_LEASE_ROOT="$lease_root"

# Durable-scope evidence needs a real git repo (read-durable-test-result.sh
# resolves HEAD/worktree state from it) -- a private copy of just the
# scripts this exercises, same pattern
# run-durable-test-suite-no-lease.test.sh already uses.
repo="$tmpdir/repo"
mkdir -p "$repo/scripts"
cp "$ROOT/scripts/verify-local-status.sh" "$ROOT/scripts/read-durable-test-result.sh" \
  "$ROOT/scripts/run-durable-test-suite.sh" "$ROOT/scripts/host-verification-lease.sh" \
  "$repo/scripts/"
cp "$ROOT/.gitignore" "$repo/.gitignore"
git -C "$repo" init -q
git -C "$repo" config user.email verify-local-status-test@example.invalid
git -C "$repo" config user.name verify-local-status-test
touch "$repo/initial"
git -C "$repo" add -A
git -C "$repo" commit -qm initial

wait_for() {
  # wait_for <path>
  attempts=0
  while [ ! -e "$1" ]; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 100 ]; then
      echo "$1 never appeared within 10s" >&2
      exit 1
    fi
    sleep 0.1
  done
}

# --- 1. a fully idle host: all NONE, idle mutex, 0/N budget --------------

out1="$(cd "$repo" && sh scripts/verify-local-status.sh)"
printf '%s\n' "$out1" | grep -Fq 'push-verification lease: idle' || {
  echo "idle mutex was not reported as idle:" >&2
  printf '%s\n' "$out1" >&2
  exit 1
}
printf '%s\n' "$out1" | grep -Eq 'resource budget: 0/[0-9]+ slots in use' || {
  echo "idle budget was not reported as 0 in use:" >&2
  printf '%s\n' "$out1" >&2
  exit 1
}
for scope in full ai-long ai-playability perf; do
  printf '%s\n' "$out1" | grep -Eq "^NONE +$scope " || {
    echo "scope $scope was not reported NONE on a fresh worktree:" >&2
    printf '%s\n' "$out1" >&2
    exit 1
  }
done

# --- 2. durable DONE (passed) and DONE (failed) --------------------------

( cd "$repo" && sh scripts/run-durable-test-suite.sh ai-playability --no-lease -- true ) > /dev/null 2>&1
( cd "$repo" && sh scripts/run-durable-test-suite.sh perf --no-lease -- sh -c 'exit 1' ) > /dev/null 2>&1 || true

out2="$(cd "$repo" && sh scripts/verify-local-status.sh)"
printf '%s\n' "$out2" | grep -Eq '^DONE +ai-playability .*passed' || {
  echo "a passed durable run was not reported DONE/passed:" >&2
  printf '%s\n' "$out2" >&2
  exit 1
}
printf '%s\n' "$out2" | grep -Eq '^DONE +perf .*failed' || {
  echo "a failed durable run was not reported DONE/failed:" >&2
  printf '%s\n' "$out2" >&2
  exit 1
}

# --- 3. durable RUNNING, then ABANDONED once both the supervisor and the
#        real registered job are gone -------------------------------------
#
# The supervisor's own recorded pid (from .running's pid= field) is used
# for the kill, NOT this backgrounded subshell's own $! -- `(cd "$repo" &&
# sh ...) &` backgrounds a wrapper subshell whose child is the actual
# run-durable-test-suite.sh process, so killing $! only kills the wrapper
# and leaves the real supervisor free to run its own EXIT trap normally
# (observed directly: it caught the job's death via `wait` and wrote an
# ordinary DONE/failed(137) result instead of ever being abandoned).

( cd "$repo" && sh scripts/run-durable-test-suite.sh full --no-lease -- sleep 30 ) > /dev/null 2>&1 &
wrapper_pid=$!
wait_for "$repo/.verification/full-suite.job-pid"
wait_for "$repo/.verification/full-suite.running"
real_job_pid="$(cat "$repo/.verification/full-suite.job-pid")"
supervisor_pid="$(sed -n 's/^pid=//p' "$repo/.verification/full-suite.running" | head -n 1)"

out3="$(cd "$repo" && sh scripts/verify-local-status.sh)"
printf '%s\n' "$out3" | grep -Eq '^RUNNING +full ' || {
  echo "an active durable run was not reported RUNNING:" >&2
  printf '%s\n' "$out3" >&2
  exit 1
}

# Kill the real supervisor before it can react to the job's death, THEN
# kill the (now-orphaned, still-running) job separately -- killing both at
# once races the supervisor's own `wait` reaping the job first and exiting
# cleanly, which is not the abandonment scenario this asserts.
kill -9 "$supervisor_pid" 2>/dev/null || true
attempts=0
while hvl_pid_is_live "$supervisor_pid" 2>/dev/null; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 50 ] || { echo "supervisor pid $supervisor_pid never died" >&2; exit 1; }
  sleep 0.1
done
kill -9 "$real_job_pid" 2>/dev/null || true
wait "$wrapper_pid" 2>/dev/null || true

attempts=0
while :; do
  out4="$(cd "$repo" && sh scripts/verify-local-status.sh)"
  printf '%s\n' "$out4" | grep -Eq '^ABANDONED +full ' && break
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 30 ]; then
    echo "a durable run whose supervisor and real job are both dead was never reported ABANDONED:" >&2
    printf '%s\n' "$out4" >&2
    exit 1
  fi
  sleep 0.2
done
rm -rf "$repo/.verification"

# --- 4. a live mutex holder is ACTIVE; a second, blocked acquirer is
#        QUEUED -------------------------------------------------------

mutex_holder_script="$tmpdir/mutex_holder.sh"
cat > "$mutex_holder_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire status-view-holder
: > "\$1"
sleep 6
hvl_release
EOF
chmod +x "$mutex_holder_script"
mutex_marker="$tmpdir/mutex-marker"
sh "$mutex_holder_script" "$mutex_marker" &
mutex_holder_pid=$!
wait_for "$mutex_marker"

mutex_waiter_script="$tmpdir/mutex_waiter.sh"
cat > "$mutex_waiter_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire status-view-waiter
hvl_release
EOF
chmod +x "$mutex_waiter_script"
sh "$mutex_waiter_script" &
mutex_waiter_pid=$!
sleep 1

out5="$(sh "$STATUS_SCRIPT")"
printf '%s\n' "$out5" | grep -Eq '^ACTIVE +status-view-holder .*worktree=' || {
  echo "a live mutex holder was not reported ACTIVE:" >&2
  printf '%s\n' "$out5" >&2
  exit 1
}
printf '%s\n' "$out5" | grep -Eq '^QUEUED +status-view-waiter .*waited=' || {
  echo "a live mutex waiter was not reported QUEUED:" >&2
  printf '%s\n' "$out5" >&2
  exit 1
}

kill "$mutex_holder_pid" "$mutex_waiter_pid" 2>/dev/null || true
wait "$mutex_holder_pid" 2>/dev/null || true
wait "$mutex_waiter_pid" 2>/dev/null || true

# --- 5. live budget holders are ACTIVE with the right N/M count; a blocked
#        acquirer is QUEUED ------------------------------------------------

rm -rf "$lease_root"; mkdir -p "$lease_root"
export HOST_VERIFICATION_LEASE_BUDGET=1
budget_holder_script="$tmpdir/budget_holder.sh"
cat > "$budget_holder_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot status-view-budget-holder
: > "\$1"
sleep 6
hvl_release_budget_slot
EOF
chmod +x "$budget_holder_script"
budget_marker="$tmpdir/budget-marker"
sh "$budget_holder_script" "$budget_marker" &
budget_holder_pid=$!
wait_for "$budget_marker"

budget_waiter_script="$tmpdir/budget_waiter.sh"
cat > "$budget_waiter_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot status-view-budget-waiter
hvl_release_budget_slot
EOF
chmod +x "$budget_waiter_script"
sh "$budget_waiter_script" &
budget_waiter_pid=$!
sleep 1

out6="$(HOST_VERIFICATION_LEASE_BUDGET=1 sh "$STATUS_SCRIPT")"
printf '%s\n' "$out6" | grep -Eq '^ACTIVE +status-view-budget-holder .*slot=0' || {
  echo "a live budget holder was not reported ACTIVE with its slot:" >&2
  printf '%s\n' "$out6" >&2
  exit 1
}
printf '%s\n' "$out6" | grep -Eq '^QUEUED +status-view-budget-waiter .*waited=' || {
  echo "a live budget waiter was not reported QUEUED:" >&2
  printf '%s\n' "$out6" >&2
  exit 1
}
printf '%s\n' "$out6" | grep -Fxq 'resource budget: 1/1 slots in use' || {
  echo "budget in-use count did not reflect the one live holder:" >&2
  printf '%s\n' "$out6" >&2
  exit 1
}

kill "$budget_holder_pid" "$budget_waiter_pid" 2>/dev/null || true
wait "$budget_holder_pid" 2>/dev/null || true
wait "$budget_waiter_pid" 2>/dev/null || true

echo "all verify-local-status scenarios passed"
