#!/usr/bin/env bash
# PreToolUse hook — blocks git commit when on main/master branch.
# Prevents accidental direct commits to the integration branch.

TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

if ! echo "$TOOL_INPUT" | grep -qE 'git (commit|merge)'; then
  exit 0
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "ERROR: Direct commit to '$CURRENT_BRANCH' is not allowed. Create a branch and open a PR instead." >&2
  exit 2
fi
