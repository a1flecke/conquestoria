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

# Detect the project directory from the command: "cd /some/path && git push ..."
# The hook always runs from $CLAUDE_PROJECT_DIR, so we must extract the path
# from a leading "cd" when commands originate from a git worktree.
PROJECT_DIR="$CLAUDE_PROJECT_DIR"
first_line="$(printf '%s' "$COMMAND" | head -1)"
if printf '%s' "$first_line" | grep -qE '^[[:space:]]*cd[[:space:]]+'; then
  cd_path="$(printf '%s' "$first_line" | sed -E 's|^[[:space:]]*cd[[:space:]]+([^ ;&]+).*|\1|')"
  if [ -n "$cd_path" ] && [ -d "$cd_path" ] && git -C "$cd_path" rev-parse --git-dir >/dev/null 2>&1; then
    PROJECT_DIR="$cd_path"
  fi
fi

# mise is how this repo installs node/yarn; use the project's run-with-mise.sh
# wrapper so yarn runs in the correct toolchain without shell-level activation
# (which fails in non-interactive subprocess contexts).
RUN="$PROJECT_DIR/scripts/run-with-mise.sh"
if [ ! -x "$RUN" ]; then
  echo "ERROR: $RUN not found or not executable." >&2
  exit 2
fi

BUILD_LOG=$(mktemp)
TEST_LOG=$(mktemp)
trap 'rm -f "$BUILD_LOG" "$TEST_LOG"' EXIT

# Ensure dependencies are installed before building/testing
(cd "$PROJECT_DIR" && "$RUN" yarn install --immutable) >"$BUILD_LOG" 2>&1 || true

if ! (cd "$PROJECT_DIR" && "$RUN" yarn build) >>"$BUILD_LOG" 2>&1; then
  {
    echo "ERROR: \`yarn build\` failed — fix type/build errors before pushing."
    echo "--- last 30 lines of build output ---"
    tail -n 30 "$BUILD_LOG"
  } >&2
  exit 2
fi

if ! (cd "$PROJECT_DIR" && "$RUN" yarn test) >"$TEST_LOG" 2>&1; then
  {
    echo "ERROR: \`yarn test\` failed — fix failing tests before pushing."
    echo "--- last 30 lines of test output ---"
    tail -n 30 "$TEST_LOG"
  } >&2
  exit 2
fi

exit 0
