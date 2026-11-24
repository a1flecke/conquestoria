#!/usr/bin/env bash
# Antigravity PostToolUse hook for file write/edit tools.
#
# Delegates directly to the canonical .claude/hooks/check-src-edit.sh rule scanner.
# Because Antigravity PostToolUse returns {}, any detected rule violations are saved
# under a conversation-scoped temp file so .agents/hooks/post-invocation.sh can inject
# them as a systemMessage on the very next step.

set -u

INPUT="$(cat 2>/dev/null || true)"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.toolCall.args.Path // .toolCall.args.AbsolutePath // .toolCall.args.TargetFile // .toolCall.args.file_path // empty' 2>/dev/null || true)"

if [ -z "$FILE_PATH" ]; then
  printf '{}\n'
  exit 0
fi

SCRIPT_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // .workspacePaths[0] // empty' 2>/dev/null || true)"
[ -n "$SESSION_CWD" ] && [ -d "$SESSION_CWD" ] || SESSION_CWD="$SCRIPT_REPO_ROOT"

# Resolve relative paths against the session cwd so check-src-edit.sh sees */src/*.ts(x).
case "$FILE_PATH" in
  /*) ABS_PATH="$FILE_PATH" ;;
  *) ABS_PATH="$SESSION_CWD/$FILE_PATH" ;;
esac

HOOK_REPO_ROOT="$SCRIPT_REPO_ROOT"
SESSION_TOP="$(git -C "$SESSION_CWD" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$SESSION_TOP" ] && [ -x "$SESSION_TOP/.claude/hooks/check-src-edit.sh" ]; then
  HOOK_REPO_ROOT="$SESSION_TOP"
fi

CHECK_SCRIPT="$HOOK_REPO_ROOT/.claude/hooks/check-src-edit.sh"
if [ -x "$CHECK_SCRIPT" ]; then
  CLAUDE_PAYLOAD="$(jq -n --arg path "$ABS_PATH" '{tool_name: "Edit", tool_input: {file_path: $path}}')"
  ERR_FILE="$(mktemp)"
  if ! "$CHECK_SCRIPT" <<<"$CLAUDE_PAYLOAD" >/dev/null 2>"$ERR_FILE"; then
    if [ -s "$ERR_FILE" ]; then
      CONV_RAW="$(printf '%s' "$INPUT" | jq -r '.conversationId // empty' 2>/dev/null || true)"
      CONV_SAFE="$(printf '%s' "$CONV_RAW" | tr -cd 'A-Za-z0-9._-')"
      [ -n "$CONV_SAFE" ] || CONV_SAFE="default"
      STATE_DIR="${CONQUESTORIA_AGY_HOOK_STATE_DIR:-${TMPDIR:-/tmp}/conquestoria-agy-src-check}"
      mkdir -p "$STATE_DIR"
      chmod 700 "$STATE_DIR" 2>/dev/null || true
      cat "$ERR_FILE" >> "$STATE_DIR/${CONV_SAFE}.txt"
    fi
  fi
  rm -f "$ERR_FILE"
fi

printf '{}\n'
exit 0
