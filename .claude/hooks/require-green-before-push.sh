#!/usr/bin/env bash
# PreToolUse hook — blocks `git push`, `gh pr create`, `gh pr merge` unless
# `yarn build` and `yarn test` both pass on the current tree.
#
# Hook contract (see .claude/rules/hooks-and-tooling.md):
# - Tool input arrives as JSON on stdin
# - Exit 0 allows the tool call
# - Exit 2 blocks; stderr is returned to Claude as the reason
# - Any other exit code is a non-blocking error

set -u

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only inspect push/PR-create/PR-merge commands
if [ -z "$COMMAND" ]; then
  exit 0
fi
if ! echo "$COMMAND" | grep -qE '(^|[[:space:]&;|])(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+(create|merge))([[:space:]]|$)'; then
  exit 0
fi

# Test-only short-circuit so the smoke test can exercise the gate logic
# without running the real build/test pipeline.
case "${REQUIRE_GREEN_TEST_MODE:-}" in
  pass) exit 0 ;;
  fail)
    echo "ERROR: [test-mode] build/test failed" >&2
    exit 2
    ;;
esac

# mise is how this repo installs node/yarn; activate silently if available
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate bash)" >/dev/null 2>&1 || true
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "ERROR: yarn not found on PATH — run \`eval \"\$(mise activate bash)\"\` and retry." >&2
  exit 2
fi

BUILD_LOG=$(mktemp)
TEST_LOG=$(mktemp)
trap 'rm -f "$BUILD_LOG" "$TEST_LOG"' EXIT

if ! yarn -s build >"$BUILD_LOG" 2>&1; then
  {
    echo "ERROR: \`yarn build\` failed — fix type/build errors before pushing."
    echo "--- last 30 lines of build output ---"
    tail -n 30 "$BUILD_LOG"
  } >&2
  exit 2
fi

if ! yarn -s test >"$TEST_LOG" 2>&1; then
  {
    echo "ERROR: \`yarn test\` failed — fix failing tests before pushing."
    echo "--- last 30 lines of test output ---"
    tail -n 30 "$TEST_LOG"
  } >&2
  exit 2
fi

exit 0
