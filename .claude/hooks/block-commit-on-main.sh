#!/usr/bin/env bash
# PreToolUse hook — blocks `git commit` or `git merge` when current branch is main/master.
# Memory: aaron's "never commit directly to main" preference.
#
# Hook contract: tool input arrives as JSON on stdin (NOT in CLAUDE_TOOL_INPUT).
# See .claude/rules/hooks-and-tooling.md.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only inspect git commands; word-boundary the subcommand match to avoid
# false positives like `git commit-tree`.
if [ -z "$COMMAND" ] || ! echo "$COMMAND" | grep -qE '(^|[[:space:]&;|])git[[:space:]]+(commit|merge)([[:space:]]|$)'; then
  exit 0
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "ERROR: Direct '$COMMAND' on '$CURRENT_BRANCH' is blocked. Create a branch and open a PR instead." >&2
  exit 2
fi

exit 0
