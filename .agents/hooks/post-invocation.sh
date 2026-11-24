#!/usr/bin/env bash
# Antigravity PostInvocation hook — surfaces any src/ rule violations captured during
# PostToolUse (.agents/hooks/post-file-edit.sh) back into the agent loop immediately.

set -u

INPUT="$(cat 2>/dev/null || true)"
CONV_RAW="$(printf '%s' "$INPUT" | jq -r '.conversationId // empty' 2>/dev/null || true)"
CONV_SAFE="$(printf '%s' "$CONV_RAW" | tr -cd 'A-Za-z0-9._-')"
[ -n "$CONV_SAFE" ] || CONV_SAFE="default"

STATE_DIR="${CONQUESTORIA_AGY_HOOK_STATE_DIR:-${TMPDIR:-/tmp}/conquestoria-agy-src-check}"
STATE_FILE="$STATE_DIR/${CONV_SAFE}.txt"

if [ -s "$STATE_FILE" ]; then
  VIOLATIONS="$(cat "$STATE_FILE")"
  rm -f "$STATE_FILE"
  MSG="$(printf 'Conquestoria src/ rule check (check-src-edit.sh) found possible violations in your recent edit(s). Address them before continuing:\n\n%s' "$VIOLATIONS")"
  jq -n --arg msg "$MSG" '{
    injectSteps: [
      {
        systemMessage: {
          systemMessage: $msg
        }
      }
    ],
    terminationBehavior: "force_continue"
  }'
  exit 0
fi

printf '{}\n'
exit 0
