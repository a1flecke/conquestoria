#!/usr/bin/env bash
# PreToolUse hook — blocks file operations on paths containing '.claire' (typo for '.claude').
# See: https://github.com/anthropics/claude-code/issues/31493

TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

if echo "$TOOL_INPUT" | grep -q '\.claire'; then
  echo "ERROR: Path contains '.claire' — this is a typo bug for '.claude'. Refusing operation." >&2
  exit 2
fi
