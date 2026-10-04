#!/usr/bin/env bash
# #1132: the canonical AI verification commands must produce durable,
# stream-independent evidence.
#
# This pins two things:
#   1. the package-script wiring makes `yarn test:ai-long` /
#      `yarn test:ai-playability` themselves the durable path, each with a
#      paired `:status` reader and no redundant `:durable` alias;
#   2. a durable result is recoverable with NO live output consumer,
#      distinguishes pass from fail, records the exact wrapped command (so a
#      targeted scenario is identifiable), and keeps the two scopes
#      independent.

set -eu
unset CI HVL_CAPACITY_LANE HOST_VERIFICATION_FOREGROUND_BUDGET HOST_VERIFICATION_BACKGROUND_BUDGET HOST_VERIFICATION_LEASE_BUDGET || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-durable-test-suite.sh"
READER="$ROOT/scripts/read-durable-test-result.sh"
PKG="$ROOT/package.json"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -x "$RUNNER" ] || fail "run-durable-test-suite.sh is missing or not executable"
[ -x "$READER" ] || fail "read-durable-test-result.sh is missing or not executable"

# --- 1. canonical package-script wiring ------------------------------------
grep -Fq '"test:ai-playability": "sh scripts/run-durable-test-suite.sh ai-playability --no-lease -- bash scripts/run-ai-playability-regressions.sh"' "$PKG" \
  || fail "1: test:ai-playability is not the durable wrapper"
grep -Fq '"test:ai-playability:status": "sh scripts/read-durable-test-result.sh ai-playability"' "$PKG" \
  || fail "1: test:ai-playability:status does not read the ai-playability scope"
grep -Fq '"test:ai-long": "sh scripts/run-durable-test-suite.sh ai-long --no-lease -- bash scripts/run-ai-long-horizon.sh"' "$PKG" \
  || fail "1: test:ai-long is not the durable wrapper"
grep -Fq '"test:ai-long:status": "sh scripts/read-durable-test-result.sh ai-long"' "$PKG" \
  || fail "1: test:ai-long:status does not read the ai-long scope"
if grep -Fq '"test:ai-long:durable"' "$PKG" || grep -Fq '"test:ai-playability:durable"' "$PKG"; then
  fail "1: redundant :durable aliases remain; the canonical command is already durable"
fi
echo "ok 1: canonical AI commands wrap the durable runner and expose :status readers"

# --- fixture: a tiny git worktree carrying the real durable machinery -------
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
# Keep host-lease state out of the real one; --no-lease never touches it anyway.
export HOST_VERIFICATION_LEASE_ROOT="$tmpdir/host-lease-root"
repo="$tmpdir/worktree"
mkdir -p "$repo/scripts"
cp "$RUNNER" "$READER" "$ROOT/scripts/host-verification-lease.sh" "$ROOT/scripts/run-under-host-lease.sh" "$repo/scripts/"
cp "$ROOT/.gitignore" "$repo/.gitignore"
git -C "$repo" init -q
git -C "$repo" config user.email ai-durable-test@example.invalid
git -C "$repo" config user.name ai-durable-test
touch "$repo/initial"
git -C "$repo" add initial .gitignore
git -C "$repo" commit -qm initial
git -C "$repo" add scripts
git -C "$repo" commit -qm scripts

read_status() {
  # read_status <scope> -> prints the reader's STATUS word; discards its prose
  ( cd "$repo" && sh scripts/read-durable-test-result.sh "$1" 2>/dev/null ) | sed -n 's/^STATUS: //p'
}

# --- 2. a result is recoverable with NO live output consumer ----------------
# stdout and stderr are dropped entirely: durability must not depend on anyone
# watching the stream, only on the persisted status/log pair.
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh ai-playability --no-lease -- \
    sh -c 'echo simulated-live-output' >/dev/null 2>&1
)
[ "$(read_status ai-playability)" = 'passed' ] || fail "2: a passed run was not recoverable after its stream was discarded"
grep -Fxq 'command=sh -c echo simulated-live-output' "$repo/.verification/ai-playability-suite.status" \
  || fail "2: the durable status did not record the exact wrapped command"
echo "ok 2: a passed result is recoverable without a live stream and records its command"

# --- 3. failure reads failure -----------------------------------------------
set +e
( cd "$repo" && sh scripts/run-durable-test-suite.sh ai-playability --no-lease -- sh -c 'exit 7' >/dev/null 2>&1 )
run_fail=$?
set -e
[ "$run_fail" -eq 7 ] || fail "3: failing wrapped command exit $run_fail (want 7)"
[ "$(read_status ai-playability)" = 'failed' ] || fail "3: a failed run did not read failed"
echo "ok 3: a failure is recoverable and reads failed"

# --- 4. scopes cannot overwrite each other ----------------------------------
rm -rf "$repo/.verification"
( cd "$repo" && sh scripts/run-durable-test-suite.sh ai-long --no-lease -- sh -c 'sleep 1' >/dev/null 2>&1 ) &
long_pid=$!
( cd "$repo" && sh scripts/run-durable-test-suite.sh ai-playability --no-lease -- sh -c 'sleep 1' >/dev/null 2>&1 ) &
play_pid=$!
wait "$long_pid" || fail "4: concurrent ai-long run failed"
wait "$play_pid" || fail "4: concurrent ai-playability run failed"
[ -f "$repo/.verification/ai-long-suite.status" ] || fail "4: ai-long status missing"
[ -f "$repo/.verification/ai-playability-suite.status" ] || fail "4: ai-playability status missing"
[ "$(read_status ai-long)" = 'passed' ] || fail "4: ai-long result was clobbered"
[ "$(read_status ai-playability)" = 'passed' ] || fail "4: ai-playability result was clobbered"
echo "ok 4: the two scopes run concurrently and keep independent evidence"

echo "all #1132 AI durable-command scenarios passed"
