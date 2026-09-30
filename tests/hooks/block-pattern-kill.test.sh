#!/usr/bin/env bash
# block-pattern-kill.sh: name/process-group kills are blocked (exit 2); killing a
# specific numeric pid, and merely MENTIONING pkill in a commit/PR text, are not.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/block-pattern-kill.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

run_hook() {
  jq -n --arg command "$1" '{tool_name: "Bash", tool_input: {command: $command}}' | bash "$HOOK" >/dev/null 2>&1
}

expect_block() {
  set +e
  run_hook "$1"
  local code=$?
  set -e
  [ "$code" -eq 2 ] || fail "expected block (exit 2), got $code for: $1"
}

expect_allow() {
  set +e
  run_hook "$1"
  local code=$?
  set -e
  [ "$code" -eq 0 ] || fail "expected allow (exit 0), got $code for: $1"
}

# --- blocked: selection by name -------------------------------------------------
expect_block 'pkill -f run-some-suite.sh'
expect_block 'pkill vitest'
expect_block 'killall node'
expect_block 'cd /tmp && pkill -f vitest'
expect_block 'sh -c "pkill -f foo"'
expect_block 'kill $(pgrep -f run-some-suite.sh)'
expect_block 'kill -9 `pidof node`'
expect_block 'kill $(ps aux | grep vitest | awk "{print \$2}")'
expect_block "ps aux | grep vitest | awk '{print \$2}' | xargs kill -9"
expect_block 'pgrep -f vitest | xargs kill'
echo "ok 1: kills by name are blocked"

# --- blocked: whole process groups -----------------------------------------------
expect_block 'kill -- -12345'
expect_block 'kill -TERM -- -12345'
expect_block 'kill -9 -12345'
expect_block 'kill -12345'
echo "ok 2: process-group kills are blocked"

# --- blocked even when chained after an innocuous git command --------------------
expect_block 'git status && pkill -f vitest'
expect_block 'git commit -m "wip" && pkill -f vitest'
echo "ok 3: a chained kill after git/gh is still caught"

# --- allowed: a specific pid --------------------------------------------------------
expect_allow 'kill 12345'
expect_allow 'kill -9 12345'
expect_allow 'kill -TERM 4321'
expect_allow 'kill -15 4321 4322'
expect_allow 'sh scripts/stop-local-verification.sh --all --dry-run'
expect_allow 'scripts/stop-local-verification.sh ai-long'
echo "ok 4: specific-pid kills and the safe stop script are allowed"

# --- allowed: mentioning it in text ---------------------------------------------------
expect_allow 'git commit -m "never use pkill -f on this host"'
expect_allow "git commit -m 'killall is banned; use verify:stop'"
expect_allow 'gh pr create --title "block pkill" --body "pkill -f x is now blocked"'
expect_allow $'git commit -F - <<\'MSG\'\nblock pkill and killall\n\nWe never run pkill -f any more.\nMSG'
expect_allow 'bash scripts/pr-body.sh write x'
expect_allow 'echo hello'
expect_allow 'rg pkill docs'
echo "ok 5: commit/PR text that merely mentions pkill is not blocked"

# --- fail open on empty/garbled input ---------------------------------------------------
printf '' | bash "$HOOK" >/dev/null 2>&1 || fail "empty input must exit 0"
printf 'not json' | bash "$HOOK" >/dev/null 2>&1 || fail "garbled input must exit 0"
echo "ok 6: empty and garbled input fail open"

echo "all block-pattern-kill scenarios passed"
