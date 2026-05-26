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

# Resolve the main worktree — yarn's .pnp.cjs lives there, not in secondary
# worktrees. Always run yarn from the main worktree, but target the current
# worktree's source with --root (vitest/vite) and --project (tsc) so we gate
# the right branch's code.
MAIN_WORKTREE="$(git -C "$PROJECT_DIR" worktree list --porcelain 2>/dev/null \
  | awk '/^worktree /{sub(/^worktree /, ""); print; exit}')"
[ -z "$MAIN_WORKTREE" ] && MAIN_WORKTREE="$PROJECT_DIR"

# mise is how this repo installs node/yarn; use the main worktree's wrapper.
RUN="$MAIN_WORKTREE/scripts/run-with-mise.sh"
if [ ! -x "$RUN" ]; then
  echo "ERROR: $RUN not found or not executable." >&2
  exit 2
fi

# Are we validating a non-main worktree?
IN_WORKTREE=0
[ "$PROJECT_DIR" != "$MAIN_WORKTREE" ] && IN_WORKTREE=1

BUILD_LOG=$(mktemp)
TEST_LOG=$(mktemp)
trap 'rm -f "$BUILD_LOG" "$TEST_LOG"' EXIT

# Ensure dependencies are installed before building/testing
(cd "$MAIN_WORKTREE" && "$RUN" yarn install --immutable) >"$BUILD_LOG" 2>&1 || true

# Type-check: when in a worktree, run tsc against that worktree's tsconfig so
# we gate the feature branch's types, not the main branch's.  On the main tree
# run the full build (tsc + vite bundle) as before.
build_failed=0
if [ "$IN_WORKTREE" -eq 1 ]; then
  (cd "$MAIN_WORKTREE" && "$RUN" yarn tsc --project "$PROJECT_DIR/tsconfig.json" --noEmit) \
    >>"$BUILD_LOG" 2>&1 || build_failed=1
else
  (cd "$MAIN_WORKTREE" && "$RUN" yarn build) >>"$BUILD_LOG" 2>&1 || build_failed=1
fi

if [ "$build_failed" -ne 0 ]; then
  {
    echo "ERROR: type-check failed — fix type/build errors before pushing."
    echo "--- last 30 lines of build output ---"
    tail -n 30 "$BUILD_LOG"
  } >&2
  exit 2
fi

# Tests: when in a worktree, run vitest with --root pointing at the worktree so
# test files and @/ aliases resolve against the feature branch's source, not main.
# Hook smoke tests run from the worktree too (they find their sibling scripts via
# relative paths from tests/hooks/).  On the main tree, run the combined yarn test
# script as before.
tests_failed=0
if [ "$IN_WORKTREE" -eq 1 ]; then
  (cd "$MAIN_WORKTREE" && "$RUN" yarn vitest run --root "$PROJECT_DIR") \
    >"$TEST_LOG" 2>&1 || tests_failed=1
  bash "$PROJECT_DIR/tests/hooks/run.sh" >>"$TEST_LOG" 2>&1 || tests_failed=1
else
  (cd "$MAIN_WORKTREE" && "$RUN" yarn test) >"$TEST_LOG" 2>&1 || tests_failed=1
fi

if [ "$tests_failed" -ne 0 ]; then
  {
    echo "ERROR: tests failed — fix failing tests before pushing."
    echo "--- last 30 lines of test output ---"
    tail -n 30 "$TEST_LOG"
  } >&2
  exit 2
fi

exit 0
