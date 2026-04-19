#!/usr/bin/env bash
# PreToolUse hook — blocks file operations whose path contains '.claire'
# (typo for '.claude'). See https://github.com/anthropics/claude-code/issues/31493
#
# Hook contract: tool input arrives as JSON on stdin (NOT in CLAUDE_TOOL_INPUT).
# See .claude/rules/hooks-and-tooling.md.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -q '\.claire'; then
  echo "ERROR: Path '$FILE_PATH' contains '.claire' — this is a typo bug for '.claude'. Refusing operation." >&2
  exit 2
fi

exit 0
