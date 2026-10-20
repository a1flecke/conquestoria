#!/usr/bin/env bash
# block-raw-dev-server.sh (#1564): starting a dev server by hand is blocked (exit 2); the managed script, ordinary build and
# test commands, and merely MENTIONING `yarn dev` in a commit/PR text are not.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/block-raw-dev-server.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

run_hook() {
  jq -n --arg command "$1" '{tool_name: "Bash", tool_input: {command: $command}}' | bash "$HOOK" >/dev/null 2>&1
}

expect_block() {
  set +e; run_hook "$1"; code=$?; set -e
  [ "$code" -eq 2 ] || fail "expected block (exit 2), got $code for: $1"
}

expect_allow() {
  set +e; run_hook "$1"; code=$?; set -e
  [ "$code" -eq 0 ] || fail "expected allow (exit 0), got $code for: $1"
}

expect_block 'yarn dev'
expect_block './scripts/run-with-mise.sh yarn dev'
expect_block './scripts/run-with-mise.sh yarn dev --port 5199 --strictPort'
expect_block 'bash scripts/run-with-mise.sh yarn dev'
expect_block 'cd /tmp/x && ./scripts/run-with-mise.sh yarn dev'
expect_block 'nohup ./scripts/run-with-mise.sh yarn dev &'
expect_block 'yarn vite --port 5200'
expect_block 'npx vite'
expect_block 'npm run dev'
expect_block 'vite --host'
echo "ok 1: a hand-started dev server is blocked"

expect_allow './scripts/dev-server.sh start'
expect_allow 'sh scripts/dev-server.sh stop'
expect_allow './scripts/dev-server.sh status'
expect_allow './scripts/run-with-mise.sh yarn build'
expect_allow './scripts/run-with-mise.sh yarn test --run tests/foo.test.ts'
expect_allow './scripts/dev.sh build'
expect_allow 'rg "yarn dev" docs'
expect_allow 'grep -rn "yarn dev" CLAUDE.md'
expect_allow 'git commit -m "docs: mention yarn dev in the guide"'
expect_allow 'gh pr create --title "x" --body "run yarn dev to preview"'
expect_allow './scripts/pr-body.sh write x'
expect_allow 'echo yarn development'
echo "ok 2: the managed script, other commands and mere mentions are allowed"

# The block message points at the managed script.
msg="$(jq -n --arg c 'yarn dev' '{tool_name:"Bash",tool_input:{command:$c}}' | bash "$HOOK" 2>&1 >/dev/null || true)"
echo "$msg" | grep -q 'scripts/dev-server.sh start' || fail "the block message does not name the managed script"
echo "ok 3: the block message names scripts/dev-server.sh"

echo "block-raw-dev-server.test.sh: all scenarios passed"
