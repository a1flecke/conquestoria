#!/usr/bin/env bash
# Antigravity PreToolUse hook for subagent/swarm/workflow tools.
#
# Conquestoria policy (CLAUDE.md / GEMINI.md / .opencode/opencode.jsonc) runs coding
# and research tasks inline in the current session. Only the specialized 'browser' and
# 'image-generator' subagents are allowed through invoke_subagent.

set -u

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.toolCall.name // empty' 2>/dev/null || true)"
TYPE_NAME="$(printf '%s' "$INPUT" | jq -r '.toolCall.args.TypeName // .toolCall.args.typeName // empty' 2>/dev/null || true)"

if [ "$TOOL_NAME" = "invoke_subagent" ]; then
  case "$TYPE_NAME" in
    browser|image-generator)
      printf '{"decision":"allow"}\n'
      exit 0
      ;;
  esac
fi

REASON="Conquestoria policy (CLAUDE.md / GEMINI.md) requires executing coding and research tasks inline in the current session. Do not spawn '${TOOL_NAME:-subagent}'${TYPE_NAME:+ (TypeName='${TYPE_NAME}')}; only 'browser' and 'image-generator' subagents are permitted."
jq -n --arg reason "$REASON" '{decision: "deny", reason: $reason}'
exit 0
