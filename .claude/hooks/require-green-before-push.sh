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

# Shared temp files; individual branches add more as needed.
INSTALL_LOG=$(mktemp)
trap 'rm -f "$INSTALL_LOG"' EXIT

# Ensure dependencies are installed before building/testing
(cd "$MAIN_WORKTREE" && "$RUN" yarn install --immutable) >"$INSTALL_LOG" 2>&1 || true

if [ "$IN_WORKTREE" -eq 1 ]; then
  # Worktree gate: run tsc and vitest in parallel — they don't depend on each other.
  # This cuts wall-clock time from ~40s (sequential) to ~25s (vitest-dominated).
  # The vitest transform cache is shared via node_modules/.vite/vitest in the main
  # worktree (set in vite.config.ts cacheDir), so repeated runs are faster still.
  TSC_LOG=$(mktemp)
  VITEST_LOG=$(mktemp)
  trap 'rm -f "$INSTALL_LOG" "$TSC_LOG" "$VITEST_LOG"' EXIT

  (cd "$MAIN_WORKTREE" && "$RUN" yarn tsc --project "$PROJECT_DIR/tsconfig.json" --noEmit) \
    >"$TSC_LOG" 2>&1 &
  TSC_PID=$!

  (cd "$MAIN_WORKTREE" && "$RUN" yarn vitest run --root "$PROJECT_DIR") \
    >"$VITEST_LOG" 2>&1 &
  VITEST_PID=$!

  wait "$TSC_PID"; tsc_exit=$?
  wait "$VITEST_PID"; vitest_exit=$?

  # Shell hook smoke tests are fast (~5s); run after vitest completes so their
  # output appends cleanly to the same log without interleaving.
  shell_exit=0
  bash "$PROJECT_DIR/tests/hooks/run.sh" >>"$VITEST_LOG" 2>&1 || shell_exit=1

  if [ "$tsc_exit" -ne 0 ]; then
    {
      echo "ERROR: type-check failed — fix type/build errors before pushing."
      echo "--- last 20 lines of tsc output ---"
      tail -n 20 "$TSC_LOG"
    } >&2
    exit 2
  fi

  if [ "$vitest_exit" -ne 0 ] || [ "$shell_exit" -ne 0 ]; then
    {
      echo "ERROR: tests failed — fix failing tests before pushing."
      echo "--- last 30 lines of test output ---"
      tail -n 30 "$VITEST_LOG"
    } >&2
    exit 2
  fi

else
  # Main tree: full build (tsc + vite bundle) then tests, sequential as before.
  BUILD_LOG=$(mktemp)
  TEST_LOG=$(mktemp)
  trap 'rm -f "$INSTALL_LOG" "$BUILD_LOG" "$TEST_LOG"' EXIT

  build_failed=0
  (cd "$MAIN_WORKTREE" && "$RUN" yarn build) >"$BUILD_LOG" 2>&1 || build_failed=1

  if [ "$build_failed" -ne 0 ]; then
    {
      echo "ERROR: type-check failed — fix type/build errors before pushing."
      echo "--- last 30 lines of build output ---"
      tail -n 30 "$BUILD_LOG"
    } >&2
    exit 2
  fi

  tests_failed=0
  (cd "$MAIN_WORKTREE" && "$RUN" yarn test) >"$TEST_LOG" 2>&1 || tests_failed=1

  if [ "$tests_failed" -ne 0 ]; then
    {
      echo "ERROR: tests failed — fix failing tests before pushing."
      echo "--- last 30 lines of test output ---"
      tail -n 30 "$TEST_LOG"
    } >&2
    exit 2
  fi
fi

exit 0
