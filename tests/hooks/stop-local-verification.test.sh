#!/usr/bin/env bash
# scripts/stop-local-verification.sh must stop THIS worktree's own runs and
# nothing else. The regression it exists for: `pkill -f run-ai-long-horizon.sh`
# killed another agent's multi-hour run in a different worktree. Every scenario
# below keeps a "sibling agent" process with the SAME script name and scope
# alive in a second worktree and asserts it survives.

set -eu
unset CI HVL_CAPACITY_LANE || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STOP="$ROOT/scripts/stop-local-verification.sh"

tmpdir="$(mktemp -d)"
pids_to_reap=""
cleanup() {
  for p in $pids_to_reap; do { kill -KILL "$p"; wait "$p"; } 2>/dev/null || true; done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

make_worktree() {
  # make_worktree <name> -> path of a tiny git repo carrying the stop script + a FAKE durable runner
  local repo="$tmpdir/$1"
  mkdir -p "$repo/scripts" "$repo/.verification"
  cp "$STOP" "$ROOT/scripts/host-verification-lease.sh" "$repo/scripts/"
  git -C "$repo" init -q
  git -C "$repo" config user.email stop-test@example.invalid
  git -C "$repo" config user.name stop-test
  # The fake supervisor has the real one's shape: marker file, a child job, a TERM trap
  # that tears the child down and records a cancelled status. IGNORE_TERM=1 makes it (and
  # its child) ignore SIGTERM to exercise escalation.
  cat > "$repo/scripts/run-durable-test-suite.sh" <<'FAKE'
#!/bin/sh
scope="$1"
repo="$(cd "$(dirname "$0")/.." && pwd)"
prefix="$repo/.verification/${scope}-suite"
printf 'pid=%s\nworktree=%s\nhead=fake\nstarted_at=now\n' "$$" "$repo" > "$prefix.running"
if [ "${IGNORE_TERM:-0}" = 1 ]; then
  trap '' TERM
  sh -c 'trap "" TERM; while :; do sleep 1; done' &
else
  sleep 300 &
fi
job=$!
printf '%s\n' "$job" > "$prefix.job-pid"
on_term() {
  kill "$job" 2>/dev/null
  printf 'exit_code=143\nfailure_kind=cancelled\n' > "$prefix.status"
  rm -f "$prefix.running"
  exit 143
}
[ "${IGNORE_TERM:-0}" = 1 ] || trap on_term TERM
wait "$job"
FAKE
  printf '%s\n' "$repo"
}

start_fake() {
  # start_fake <repo> <scope> [env...] -> echoes supervisor pid once its marker exists
  local repo="$1" scope="$2"
  shift 2
  env "$@" sh "$repo/scripts/run-durable-test-suite.sh" "$scope" -- sleep 300 >/dev/null 2>&1 &
  local pid=$!
  pids_to_reap="$pids_to_reap $pid"
  local waited=0
  while [ ! -s "$repo/.verification/${scope}-suite.job-pid" ] && [ "$waited" -lt 50 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  [ -s "$repo/.verification/${scope}-suite.job-pid" ] || fail "fake $scope runner in $repo never registered its job"
  printf '%s\n' "$pid"
}

alive() { kill -0 "$1" 2>/dev/null; }
job_of() { sed -n '1p' "$1/.verification/$2-suite.job-pid"; }

# --- 1. stops own run cleanly; a same-named sibling in ANOTHER worktree survives --
mine="$(make_worktree mine)"
theirs="$(make_worktree theirs)"
my_sup="$(start_fake "$mine" ai-long)"
their_sup="$(start_fake "$theirs" ai-long)"
my_job="$(job_of "$mine" ai-long)"
their_job="$(job_of "$theirs" ai-long)"

sh "$mine/scripts/stop-local-verification.sh" ai-long >"$tmpdir/out1" 2>&1 || { cat "$tmpdir/out1" >&2; fail "1: stop exited non-zero"; }
wait "$my_sup" 2>/dev/null || true
alive "$my_sup" && fail "1: my supervisor is still alive"
alive "$my_job" && fail "1: my job is still alive"
alive "$their_sup" || fail "1: sibling agent's supervisor was killed"
alive "$their_job" || fail "1: sibling agent's job was killed"
grep -q 'failure_kind=cancelled' "$mine/.verification/ai-long-suite.status" || fail "1: the supervisor's own cancel trap did not run (no cancelled status)"
echo "ok 1: stops only its own run; the sibling with the same script and scope survives"

# --- 2. --dry-run signals nothing --------------------------------------------
mine2="$(make_worktree mine2)"
sup2="$(start_fake "$mine2" perf)"
sh "$mine2/scripts/stop-local-verification.sh" --dry-run perf >"$tmpdir/out2" 2>&1
alive "$sup2" || fail "2: --dry-run killed the run"
grep -q 'dry-run' "$tmpdir/out2" || fail "2: no dry-run notice"
echo "ok 2: --dry-run signals nothing"

# --- 3. --all stops every live scope in this worktree, skips scopes with no run ---
sup2b="$(start_fake "$mine2" full)"
sh "$mine2/scripts/stop-local-verification.sh" --all >"$tmpdir/out3" 2>&1 || { cat "$tmpdir/out3" >&2; fail "3: --all failed"; }
wait "$sup2" 2>/dev/null || true
wait "$sup2b" 2>/dev/null || true
alive "$sup2" && fail "3: perf survived --all"
alive "$sup2b" && fail "3: full survived --all"
grep -q 'ai-playability: no run recorded' "$tmpdir/out3" || fail "3: a scope with no run was not reported as such"
echo "ok 3: --all stops every live scope here and skips the rest"

# --- 4. stale marker (dead pid) is a clean no-op ------------------------------
mine4="$(make_worktree mine4)"
printf 'pid=999999\nworktree=%s\nhead=x\nstarted_at=now\n' "$mine4" > "$mine4/.verification/full-suite.running"
sh "$mine4/scripts/stop-local-verification.sh" full >"$tmpdir/out4" 2>&1 || fail "4: stale marker made stop fail"
grep -q 'stale marker' "$tmpdir/out4" || fail "4: stale marker not reported"
echo "ok 4: a stale marker is a no-op"

# --- 5. a record naming another worktree is refused, process untouched --------
mine5="$(make_worktree mine5)"
other5="$(make_worktree other5)"
sup5="$(start_fake "$other5" full)"
printf 'pid=%s\nworktree=%s\nhead=x\nstarted_at=now\n' "$sup5" "$other5" > "$mine5/.verification/full-suite.running"
if sh "$mine5/scripts/stop-local-verification.sh" full >"$tmpdir/out5" 2>&1; then fail "5: foreign-worktree record was accepted"; fi
grep -q 'REFUSED' "$tmpdir/out5" || fail "5: no REFUSED notice"
alive "$sup5" || fail "5: the other worktree's run was killed"
echo "ok 5: a record for another worktree is refused and its run left alone"

# --- 6. pid reuse: the recorded pid is an unrelated process -------------------
mine6="$(make_worktree mine6)"
sleep 300 &
unrelated=$!
pids_to_reap="$pids_to_reap $unrelated"
printf 'pid=%s\nworktree=%s\nhead=x\nstarted_at=now\n' "$unrelated" "$mine6" > "$mine6/.verification/full-suite.running"
if sh "$mine6/scripts/stop-local-verification.sh" full >"$tmpdir/out6" 2>&1; then fail "6: an unrelated process was accepted as the supervisor"; fi
grep -q 'not this scope' "$tmpdir/out6" || fail "6: identity refusal not reported"
alive "$unrelated" || fail "6: an unrelated process was killed"
echo "ok 6: a reused pid is refused, the unrelated process survives"

# --- 7. a supervisor that ignores TERM is escalated against its recorded tree only ---
mine7="$(make_worktree mine7)"
bystander="$(make_worktree bystander7)"
sup7="$(start_fake "$mine7" full IGNORE_TERM=1)"
by_sup="$(start_fake "$bystander" full)"
job7="$(job_of "$mine7" full)"
STOP_LOCAL_VERIFICATION_TERM_WAIT=1 sh "$mine7/scripts/stop-local-verification.sh" --grace 1 full >"$tmpdir/out7" 2>&1 || { cat "$tmpdir/out7" >&2; fail "7: escalation failed"; }
wait "$sup7" 2>/dev/null || true
alive "$sup7" && fail "7: TERM-ignoring supervisor survived escalation"
alive "$job7" && fail "7: TERM-ignoring job survived escalation"
alive "$by_sup" || fail "7: escalation reached a bystander worktree"
echo "ok 7: TERM-ignoring run is escalated; bystander untouched"

# --- 8. the scripts contain no name-based or group-wide kill -------------------
for f in "$ROOT/scripts/stop-local-verification.sh" "$ROOT/scripts/launch-local-verification.sh"; do
  if grep -v '^[[:space:]]*#' "$f" | grep -E '(^|[^A-Za-z_-])(pkill|killall|pgrep)[[:space:]]|kill[[:space:]]+(-[A-Z0-9]+[[:space:]]+)?-[0-9$]' >/dev/null; then
    fail "8: $(basename "$f") contains a name-based or process-group kill"
  fi
done
echo "ok 8: no pkill/killall/pgrep and no negative-pid (process-group) kill"

echo "all stop-local-verification scenarios passed"
