#!/usr/bin/env bash
# scripts/dev.sh: a fixed set of tasks, each a hard-coded argv through the mise wrapper. The only
# forwarded arguments are validated test paths under tests/. Everything else fails closed, so the
# script is safe to list as a trusted script for an auto-approval plugin (#1256).
#
# The fixture repo gets a FAKE scripts/run-with-mise.sh that records its argv, so every assertion is
# about the exact command a task runs without running anything heavy.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
DEV="$ROOT/scripts/dev.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -x "$DEV" ] || fail "0: scripts/dev.sh is missing or not executable"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tmp="$(cd "$tmp" && pwd -P)"

REPO="$tmp/repo"
OUTSIDE="$tmp/outside"
mkdir -p "$REPO/scripts" "$REPO/tests/systems" "$REPO/tests/ui" "$REPO/tests/helpers" "$OUTSIDE/dir"
cp -p "$DEV" "$REPO/scripts/dev.sh"

# Fake wrapper: record the argv, emit FAKE_OUT_LINES numbered lines, exit with FAKE_EXIT.
cat > "$REPO/scripts/run-with-mise.sh" <<'FAKE'
#!/bin/sh
printf '%s\n' "$*" > "$FAKE_ARGV_FILE"
if [ -n "${FAKE_OUT_LINES:-}" ]; then seq 1 "$FAKE_OUT_LINES"; fi
echo "fake-stderr-line" >&2
exit "${FAKE_EXIT:-0}"
FAKE
chmod +x "$REPO/scripts/run-with-mise.sh"

: > "$REPO/tests/systems/a.test.ts"
: > "$REPO/tests/ui/b.test.tsx"
: > "$REPO/tests/helpers/util.ts"
: > "$REPO/tests/.env"
: > "$REPO/.env"
: > "$REPO/tests/with space.test.ts"
: > "$REPO/tests/q'uote.test.ts"
: > "$OUTSIDE/x.test.ts"
ln -s "$OUTSIDE/x.test.ts" "$REPO/tests/escape.test.ts"
ln -s "$OUTSIDE/dir" "$REPO/tests/escapedir"

export FAKE_ARGV_FILE="$tmp/argv"
unset FAKE_OUT_LINES FAKE_EXIT || true

# run <args...>: run the fixture's dev.sh from an unrelated cwd; sets OUT, ERR, STATUS.
run() {
  rm -f "$FAKE_ARGV_FILE"
  STATUS=0
  (cd "$tmp" && "$REPO/scripts/dev.sh" "$@") >"$tmp/out" 2>"$tmp/err" || STATUS=$?
  OUT="$(cat "$tmp/out")"
  ERR="$(cat "$tmp/err")"
}

ran_wrapper() { [ -f "$FAKE_ARGV_FILE" ]; }
recorded() { cat "$FAKE_ARGV_FILE"; }

# --- 1. every task maps to exactly its documented argv (table-driven) ------------
TABLE='build|yarn build
typecheck|yarn tsc --noEmit
test-all|yarn test
test-regular|yarn test:regular
hooks|bash tests/hooks/run.sh
install|yarn install --immutable
setup-hooks|yarn setup:hooks
verify-pr|yarn verify:pr
verify-pr-status|yarn verify:pr:status
verify-status|yarn verify:local:status
durable|yarn test:durable
durable-status|yarn test:durable:status
ai-playability|yarn test:ai-playability
ai-playability-status|yarn test:ai-playability:status
ai-long|yarn test:ai-long
ai-long-status|yarn test:ai-long:status
web-smoke|yarn test:web-smoke
docs-lifecycle|node scripts/docs-lifecycle.mjs check
maintainability-check|node scripts/maintainability-audit.mjs --check
maintainability-report|node scripts/maintainability-audit.mjs --report
maintainability-baseline|node scripts/maintainability-audit.mjs --baseline'

while IFS='|' read -r task argv; do
  run "$task"
  [ "$STATUS" -eq 0 ] || fail "1: '$task' exited $STATUS: $ERR"
  [ "$(recorded)" = "$argv" ] || fail "1: '$task' ran '$(recorded)', expected '$argv'"
done <<EOF
$TABLE
EOF
echo "ok 1: every task runs exactly its documented argv"

# The usage text and the table must agree, so a new task cannot ship without a row above.
run
usage_tasks="$(printf '%s\n' "$ERR" | sed -n 's/^  \([a-z][a-z-]*\) .*/\1/p' | grep -vx 'test\|log' | sort | tr '\n' ' ')"
table_tasks="$(printf '%s\n' "$TABLE" | cut -d'|' -f1 | sort | tr '\n' ' ')"
[ "$usage_tasks" = "$table_tasks" ] \
  || fail "1b: usage lists [$usage_tasks] but the table covers [$table_tasks] (add a row for the new task)"
echo "ok 1b: usage text and the table list the same tasks"

# --- 2. test: valid files and directories ------------------------------------------
run test tests/systems/a.test.ts
[ "$STATUS" -eq 0 ] || fail "2: valid file rejected: $ERR"
[ "$(recorded)" = "yarn vitest run tests/systems/a.test.ts" ] || fail "2: ran '$(recorded)'"
run test tests/systems/a.test.ts tests/ui/b.test.tsx tests/helpers
[ "$STATUS" -eq 0 ] || fail "2: valid mix rejected: $ERR"
[ "$(recorded)" = "yarn vitest run tests/systems/a.test.ts tests/ui/b.test.tsx tests/helpers" ] || fail "2: ran '$(recorded)'"
run test tests/ui/
[ "$STATUS" -eq 0 ] || fail "2: directory with trailing slash rejected: $ERR"
echo "ok 2: test forwards validated files and directories"

# --- 3. test: every rejection fails closed, never reaches the wrapper ---------------
reject_test() {
  label="$1"; shift
  run test "$@"
  [ "$STATUS" -eq 2 ] || fail "3: $label: expected exit 2, got $STATUS (out: $OUT)"
  ran_wrapper && fail "3: $label: the wrapper ran ($(recorded))"
  printf '%s' "$ERR" | grep -q 'rejected\|requires at least one' || fail "3: $label: no clear denial message: $ERR"
  return 0
}
reject_test 'no path'
reject_test 'flag --watch' --watch tests/systems/a.test.ts
reject_test 'flag -t' -t foo
reject_test 'flag after a valid path' tests/systems/a.test.ts --watch
reject_test 'dot-dot' tests/../scripts/dev.sh
reject_test 'dot-dot only' ..
reject_test 'absolute path' "$REPO/tests/systems/a.test.ts"
reject_test 'tilde' '~/x.test.ts'
reject_test 'glob star' 'tests/*.test.ts'
reject_test 'glob question' 'tests/systems/?.test.ts'
reject_test 'brace' 'tests/{systems,ui}'
reject_test 'bracket' 'tests/[s]ystems'
reject_test 'nonexistent' tests/systems/missing.test.ts
reject_test 'outside tests/' scripts/dev.sh
reject_test 'repo root file' package.json
reject_test 'tests root itself' tests
reject_test 'non-test file under tests/' tests/helpers/util.ts
reject_test 'env file' .env
reject_test 'env file under tests' tests/.env
reject_test 'symlinked file leaving the repo' tests/escape.test.ts
reject_test 'symlinked directory leaving the repo' tests/escapedir
reject_test 'space' 'tests/with space.test.ts'
reject_test 'quote' "tests/q'uote.test.ts"
reject_test 'dollar' 'tests/$HOME'
reject_test 'semicolon' 'tests/systems;ls'
reject_test 'newline' "$(printf 'tests/systems/a.test.ts\nsecond')"
reject_test 'leading dash after valid' tests/systems/a.test.ts -x
reject_test 'empty string' ''
echo "ok 3: bad test paths fail closed without reaching the wrapper"

# --- 4. unknown / missing task exit 2 and list the tasks; extra args are refused ---
run
[ "$STATUS" -eq 2 ] || fail "4: no task exited $STATUS"
printf '%s' "$ERR" | grep -q 'build' || fail "4: no task did not list tasks"
run bogus
[ "$STATUS" -eq 2 ] || fail "4: unknown task exited $STATUS"
printf '%s' "$ERR" | grep -q 'typecheck' || fail "4: unknown task did not list tasks"
ran_wrapper && fail "4: unknown task reached the wrapper"
for t in 'yarn' 'sh' 'bash' 'gh' 'git' 'node' 'run-with-mise.sh' '--help' '-h' 'test:durable' ''; do
  run "$t"
  [ "$STATUS" -eq 2 ] || fail "4: '$t' exited $STATUS"
  ran_wrapper && fail "4: '$t' reached the wrapper"
done
run build extra
[ "$STATUS" -eq 2 ] || fail "4: build with an argument exited $STATUS"
ran_wrapper && fail "4: build with an argument reached the wrapper"
run build --watch
[ "$STATUS" -eq 2 ] || fail "4: build with a flag exited $STATUS"
echo "ok 4: unknown tasks, missing task and stray arguments exit 2"

# --- 5. exit status, header, 60-line tail, log file ---------------------------------
FAKE_EXIT=0 FAKE_OUT_LINES=100 run build
[ "$STATUS" -eq 0 ] || fail "5: exit 0 not propagated ($STATUS)"
head -1 "$tmp/out" | grep -qx '== dev.sh build exit=0 log=.verification/logs/build.log ==' \
  || fail "5: bad header: $(head -1 "$tmp/out")"
[ "$(sed -n 2p "$tmp/out")" = "42" ] || fail "5: tail did not start at line 42: $(sed -n 2p "$tmp/out")"
[ "$(tail -1 "$tmp/out")" = "fake-stderr-line" ] || fail "5: stderr was not captured into the log/tail"
[ "$(wc -l < "$tmp/out" | tr -d ' ')" -eq 61 ] || fail "5: expected header + 60 lines, got $(wc -l < "$tmp/out" | tr -d ' ')"
LOG="$REPO/.verification/logs/build.log"
[ -f "$LOG" ] || fail "5: log file missing"
[ "$(wc -l < "$LOG" | tr -d ' ')" -eq 101 ] || fail "5: log should hold all 100 lines plus stderr"

FAKE_EXIT=7 FAKE_OUT_LINES=3 run build
[ "$STATUS" -eq 7 ] || fail "5: exit 7 not propagated ($STATUS)"
head -1 "$tmp/out" | grep -qx '== dev.sh build exit=7 log=.verification/logs/build.log ==' \
  || fail "5: failing header wrong: $(head -1 "$tmp/out")"
[ "$(wc -l < "$tmp/out" | tr -d ' ')" -eq 5 ] || fail "5: short output should print header + 4 lines"
[ "$(wc -l < "$LOG" | tr -d ' ')" -eq 4 ] || fail "5: log was not overwritten by the second run"
echo "ok 5: exit status, header, 60-line tail and per-run log are correct"

# --- 6. a very long output is streamed to disk and the tail is still right ---------
FAKE_OUT_LINES=300000 run build
[ "$STATUS" -eq 0 ] || fail "6: long output run exited $STATUS"
[ "$(sed -n 2p "$tmp/out")" = "299942" ] || fail "6: tail wrong: $(sed -n 2p "$tmp/out")"
[ "$(wc -l < "$LOG" | tr -d ' ')" -eq 300001 ] || fail "6: log does not hold the whole output"
echo "ok 6: long output is bounded on screen and complete on disk"

# --- 7. log <task> [N] ---------------------------------------------------------------
FAKE_OUT_LINES=500 run build
run log build 3
[ "$STATUS" -eq 0 ] || fail "7: log build 3 exited $STATUS: $ERR"
[ "$(printf '%s\n' "$OUT" | head -1)" = "499" ] || fail "7: log build 3 first line: $OUT"
[ "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" -eq 3 ] || fail "7: log build 3 should print 3 lines"
run log build
[ "$STATUS" -eq 0 ] || fail "7: default log exited $STATUS"
[ "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" -eq 200 ] || fail "7: default is 200 lines"
run log build 5000
[ "$STATUS" -eq 0 ] || fail "7: N=5000 rejected"
for n in 0 5001 abc 1x -1 '' 1.5 '+3'; do
  run log build "$n"
  [ "$STATUS" -eq 2 ] || fail "7: N='$n' exited $STATUS"
done
run log nosuchtask
[ "$STATUS" -eq 2 ] || fail "7: unknown log task exited $STATUS"
run log log
[ "$STATUS" -eq 2 ] || fail "7: 'log log' exited $STATUS"
run log
[ "$STATUS" -eq 2 ] || fail "7: 'log' with no task exited $STATUS"
run log build 3 4
[ "$STATUS" -eq 2 ] || fail "7: extra log argument exited $STATUS"
run log ../../etc/passwd
[ "$STATUS" -eq 2 ] || fail "7: path-like log task exited $STATUS"
rm -f "$REPO/.verification/logs/durable.log"
run log durable
[ "$STATUS" -eq 1 ] || fail "7: task with no log yet exited $STATUS"
printf '%s' "$ERR" | grep -q 'no log' || fail "7: no-log message missing: $ERR"
ran_wrapper && fail "7: log reached the wrapper"
echo "ok 7: log reads only known task logs, bounds N, and never runs anything"

# --- 8. structural guard ---------------------------------------------------------------
# Comments are stripped first so a documented prohibition does not trip the guard.
code="$(sed 's/[[:space:]]#.*$//; /^[[:space:]]*#/d' "$DEV")"
guard() {
  pattern="$1"; reason="$2"
  if printf '%s\n' "$code" | grep -Eq "$pattern"; then
    printf '%s\n' "$code" | grep -En "$pattern" >&2
    fail "8: scripts/dev.sh must not contain this: $reason"
  fi
}
guard '(^|[^A-Za-z_])eval([^A-Za-z_]|$)' 'eval would turn a task word into code'
guard '(^|[;&|({[:space:]])(sh|bash|zsh|dash)[[:space:]]+-[A-Za-z]*c([[:space:]]|$)' 'sh -c would run a built string'
guard '^[[:space:]]*"\$@"|[;&|({][[:space:]]*"\$@"|exec[[:space:]]+"\$@"' 'forwarding "$@" in command position lets a caller choose the command'
guard '(^|[;&|({[:space:]])(kill|pkill|killall)([[:space:]]|$)' 'signalling processes can kill another agent'"'"'s run on a shared host'
guard '(^|[;&|({[:space:]])git([[:space:]]|$)' 'git is deliberately outside the dispatcher'
guard '(^|[;&|({[:space:]])gh([[:space:]]|$)' 'gh is deliberately outside the dispatcher'
guard '(^|[;&|({[:space:]])rm([[:space:]]|$)' 'deletion is deliberately outside the dispatcher'
guard '\$\((cat|<)' 'holding a log in memory defeats bounded output for long runs'
guard '(^|[;&|({[:space:]])(npx|curl|wget|sudo)([[:space:]]|$)' 'no network or privilege helpers'
grep -q 'run-with-mise.sh' "$DEV" || fail "8: tasks must go through the existing wrapper"
echo "ok 8: structural guard"

echo "ALL PASS"
