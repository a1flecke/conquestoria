#!/usr/bin/env bash
# scripts/launch-local-verification.sh: informed, deduplicated, detached launches.

set -eu
unset CI HVL_CAPACITY_LANE || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAUNCH="$ROOT/scripts/launch-local-verification.sh"

tmpdir="$(mktemp -d)"
pids_to_reap=""
cleanup() {
  for p in $pids_to_reap; do { kill -KILL "$p"; wait "$p"; } 2>/dev/null || true; done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

make_worktree() {
  local repo="$tmpdir/$1"
  mkdir -p "$repo/scripts"
  cp "$LAUNCH" "$ROOT/scripts/host-verification-lease.sh" "$repo/scripts/"
  # Fake host snapshot and result reader: the launcher only shells out to these.
  printf '#!/bin/sh\necho "ACTIVE    ai-long-mutex        worktree=/somewhere/else elapsed=1s pid=1"\necho "background capacity: 1/2 slots in use"\n' > "$repo/scripts/verify-local-status.sh"
  # Faithful stand-in for read-durable-test-result.sh: a live run reads `active`
  # (so a duplicate is still refused), a dirty tree reads `mismatched` (so a dirty
  # tree never reuses), and otherwise FAKE_STATUS decides -- default `none`, as a
  # fresh worktree has no durable evidence yet.
  cat > "$repo/scripts/read-durable-test-result.sh" <<'FAKE_READER'
#!/bin/sh
scope="${1:-full}"
root="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
running="$root/.verification/$scope-suite.running"
if [ -f "$running" ]; then
  pid="$(sed -n 's/^pid=//p' "$running" | head -n 1)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo 'STATUS: active'
    exit 3
  fi
fi
if [ -n "$(git -C "$root" status --porcelain=v1 --untracked-files=all 2>/dev/null)" ]; then
  echo 'STATUS: mismatched'
  exit 1
fi
echo "STATUS: ${FAKE_STATUS:-none}"
FAKE_READER
  printf '.verification/\n' > "$repo/.gitignore"
  git -C "$repo" init -q
  git -C "$repo" config user.email launch-test@example.invalid
  git -C "$repo" config user.name launch-test
  git -C "$repo" add -A
  git -C "$repo" commit -qm init
  printf '%s\n' "$repo"
}

live_marker() {
  # live_marker <repo> <scope> -> writes a .running marker pointing at a live process
  sleep 300 &
  local p=$!
  pids_to_reap="$pids_to_reap $p"
  mkdir -p "$1/.verification"
  printf 'pid=%s\nworktree=%s\nhead=x\nstarted_at=now\n' "$p" "$1" > "$1/.verification/$2-suite.running"
}

# --- 1. launches detached, shows the host snapshot, records pid + log --------
repo="$(make_worktree one)"
LAUNCH_VERIFICATION_COMMAND='echo launched-ok; sleep 2' sh "$repo/scripts/launch-local-verification.sh" ai-long >"$tmpdir/out1" 2>&1 \
  || { cat "$tmpdir/out1" >&2; fail "1: launch failed"; }
grep -q 'ai-long-mutex' "$tmpdir/out1" || fail "1: host snapshot (other agents' runs) was not shown before launching"
pid="$(cat "$repo/.verification/launch-ai-long.pid")"
kill -0 "$pid" 2>/dev/null || fail "1: launched run is not alive after the launcher exited (not detached)"
waited=0
while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 100 ]; do sleep 0.1; waited=$((waited + 1)); done
grep -q launched-ok "$repo/.verification/launch-ai-long.log" || fail "1: run output did not reach the launch log"
echo "ok 1: detached launch, host snapshot shown, pid and log recorded"

# --- 2. a duplicate of the same scope is refused (exit 3) --------------------
repo2="$(make_worktree two)"
live_marker "$repo2" full
set +e
LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo2/scripts/launch-local-verification.sh" full >"$tmpdir/out2" 2>&1
code=$?
set -e
[ "$code" -eq 3 ] || fail "2: duplicate launch exit code $code (want 3)"
grep -q 'already live' "$tmpdir/out2" || fail "2: duplicate not explained"
grep -q 'stop-local-verification.sh full' "$tmpdir/out2" || fail "2: duplicate refusal did not point at the safe stop command"
echo "ok 2: duplicate scope refused with the safe stop hint"

# --- 3. one worktree may not pile on more than --max-mine -------------------
repo3="$(make_worktree three)"
live_marker "$repo3" full
live_marker "$repo3" perf
set +e
LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo3/scripts/launch-local-verification.sh" ai-long >"$tmpdir/out3" 2>&1
code=$?
set -e
[ "$code" -eq 3 ] || fail "3: over-limit launch exit code $code (want 3)"
grep -q 'limit 2' "$tmpdir/out3" || fail "3: limit not explained"
LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo3/scripts/launch-local-verification.sh" --max-mine 3 ai-long >"$tmpdir/out3b" 2>&1 \
  || { cat "$tmpdir/out3b" >&2; fail "3: --max-mine 3 did not allow the third run"; }
echo "ok 3: per-worktree cap enforced and adjustable"

# --- 4. dirty tree refused unless --allow-dirty ------------------------------
repo4="$(make_worktree four)"
echo change > "$repo4/scripts/untracked-edit.txt"
set +e
LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo4/scripts/launch-local-verification.sh" perf >"$tmpdir/out4" 2>&1
code=$?
set -e
[ "$code" -eq 4 ] || fail "4: dirty launch exit code $code (want 4)"
grep -q 'uncommitted changes' "$tmpdir/out4" || fail "4: dirty refusal not explained"
LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo4/scripts/launch-local-verification.sh" --allow-dirty perf >"$tmpdir/out4b" 2>&1 \
  || fail "4: --allow-dirty did not launch"
echo "ok 4: dirty tree refused unless --allow-dirty"

# --- 5. --wait reflects the durable result -----------------------------------
# --force here: without it a `passed` reader result would reuse and short-circuit,
# which is scenario 8's subject, not this one.
repo5="$(make_worktree five)"
FAKE_STATUS=passed LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo5/scripts/launch-local-verification.sh" --force --wait full >"$tmpdir/out5" 2>&1 \
  || fail "5: --wait failed for a passed result"
grep -q 'STATUS: passed' "$tmpdir/out5" || fail "5: --wait did not print the result"
set +e
FAKE_STATUS=failed LAUNCH_VERIFICATION_COMMAND='sleep 1' sh "$repo5/scripts/launch-local-verification.sh" --wait full >"$tmpdir/out5b" 2>&1
code=$?
set -e
[ "$code" -ne 0 ] || fail "5: --wait exited 0 for a failed result"
echo "ok 5: --wait exits 0 only for a passed result"

# --- 6. unknown scope / bad flags are usage errors ---------------------------
set +e
sh "$repo5/scripts/launch-local-verification.sh" nonsense >/dev/null 2>&1
code=$?
set -e
[ "$code" -eq 2 ] || fail "6: unknown scope exit code $code (want 2)"
echo "ok 6: unknown scope is a usage error"

# --- 7. a passing result for the current clean HEAD is reused ---------------
repo7="$(make_worktree seven)"
mkdir -p "$repo7/.verification"
printf 'completed_at=2026-01-01T00:00:00Z\n' > "$repo7/.verification/full-suite.status"
MARKER7="$tmpdir/runner7"
set +e
FAKE_STATUS=passed LAUNCH_VERIFICATION_COMMAND="touch $MARKER7" \
  sh "$repo7/scripts/launch-local-verification.sh" full >"$tmpdir/out7" 2>&1
code=$?
set -e
[ "$code" -eq 0 ] || fail "7: reuse exit code $code (want 0)"
grep -q 'Reusing durable full evidence' "$tmpdir/out7" || fail "7: reuse was not reported"
grep -q '2026-01-01T00:00:00Z' "$tmpdir/out7" || fail "7: reuse did not report completed_at"
[ ! -e "$MARKER7" ] || fail "7: runner was invoked despite a passing same-HEAD result"
[ ! -e "$repo7/.verification/launch-full.pid" ] || fail "7: reuse recorded a launcher pid"
echo "ok 7: passing same-HEAD evidence is reused without launching"

# --- 8. --wait reuses a passing result and exits 0 quickly -------------------
repo8="$(make_worktree eight)"
mkdir -p "$repo8/.verification"
printf 'completed_at=2026-01-01T00:00:00Z\n' > "$repo8/.verification/full-suite.status"
MARKER8="$tmpdir/runner8"
SECONDS=0
set +e
FAKE_STATUS=passed LAUNCH_VERIFICATION_COMMAND="touch $MARKER8" \
  sh "$repo8/scripts/launch-local-verification.sh" --wait full >"$tmpdir/out8" 2>&1
code=$?
set -e
[ "$code" -eq 0 ] || fail "8: wait reuse exit code $code (want 0)"
[ "$SECONDS" -lt 5 ] || fail "8: wait reuse took ${SECONDS}s (want <5s)"
grep -q 'Reusing durable full evidence' "$tmpdir/out8" || fail "8: wait reuse was not reported"
[ ! -e "$MARKER8" ] || fail "8: runner was invoked in wait reuse"
echo "ok 8: --wait reuses a passing result and exits 0 without launching"

# --- 9. --force bypasses reuse and launches ----------------------------------
repo9="$(make_worktree nine)"
mkdir -p "$repo9/.verification"
printf 'completed_at=2026-01-01T00:00:00Z\n' > "$repo9/.verification/full-suite.status"
MARKER9="$tmpdir/runner9"
FAKE_STATUS=passed LAUNCH_VERIFICATION_COMMAND="touch $MARKER9" \
  sh "$repo9/scripts/launch-local-verification.sh" --force full >"$tmpdir/out9" 2>&1 \
  || { cat "$tmpdir/out9" >&2; fail "9: --force launch failed"; }
if grep -q 'Reusing' "$tmpdir/out9"; then fail "9: --force still reported reuse"; fi
waited=0
while [ ! -e "$MARKER9" ] && [ "$waited" -lt 100 ]; do sleep 0.1; waited=$((waited + 1)); done
[ -e "$MARKER9" ] || fail "9: --force did not invoke the runner"
echo "ok 9: --force skips reuse and invokes the runner"

# --- 10. mismatched evidence does not reuse ----------------------------------
repo10="$(make_worktree ten)"
MARKER10="$tmpdir/runner10"
FAKE_STATUS=mismatched LAUNCH_VERIFICATION_COMMAND="touch $MARKER10" \
  sh "$repo10/scripts/launch-local-verification.sh" full >"$tmpdir/out10" 2>&1 \
  || { cat "$tmpdir/out10" >&2; fail "10: mismatched launch failed"; }
waited=0
while [ ! -e "$MARKER10" ] && [ "$waited" -lt 100 ]; do sleep 0.1; waited=$((waited + 1)); done
[ -e "$MARKER10" ] || fail "10: mismatched evidence did not launch"
if grep -q 'Reusing' "$tmpdir/out10"; then fail "10: mismatched evidence was reused"; fi
echo "ok 10: mismatched evidence never reuses"

# --- 11. failed evidence does not reuse --------------------------------------
repo11="$(make_worktree eleven)"
MARKER11="$tmpdir/runner11"
FAKE_STATUS=failed LAUNCH_VERIFICATION_COMMAND="touch $MARKER11" \
  sh "$repo11/scripts/launch-local-verification.sh" full >"$tmpdir/out11" 2>&1 \
  || { cat "$tmpdir/out11" >&2; fail "11: failed-evidence launch failed"; }
waited=0
while [ ! -e "$MARKER11" ] && [ "$waited" -lt 100 ]; do sleep 0.1; waited=$((waited + 1)); done
[ -e "$MARKER11" ] || fail "11: failed evidence did not launch"
if grep -q 'Reusing' "$tmpdir/out11"; then fail "11: failed evidence was reused"; fi
echo "ok 11: failed evidence never reuses"

# --- 12. a dirty tree never reuses a passing result --------------------------
repo12="$(make_worktree twelve)"
mkdir -p "$repo12/.verification"
printf 'completed_at=2026-01-01T00:00:00Z\n' > "$repo12/.verification/full-suite.status"
echo change > "$repo12/untracked-edit.txt"
MARKER12="$tmpdir/runner12"
set +e
FAKE_STATUS=passed LAUNCH_VERIFICATION_COMMAND="touch $MARKER12" \
  sh "$repo12/scripts/launch-local-verification.sh" full >"$tmpdir/out12" 2>&1
code=$?
set -e
[ "$code" -eq 4 ] || fail "12: dirty reuse exit code $code (want 4)"
[ ! -e "$MARKER12" ] || fail "12: a dirty tree reused evidence and invoked the runner"
grep -q 'uncommitted changes' "$tmpdir/out12" || fail "12: dirty refusal not explained"
if grep -q 'Reusing' "$tmpdir/out12"; then fail "12: a dirty tree reported reuse"; fi
echo "ok 12: a dirty tree never reuses a passing result"

echo "all launch-local-verification scenarios passed"
