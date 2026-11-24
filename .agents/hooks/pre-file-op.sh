#!/usr/bin/env bash
# Antigravity PreToolUse hook for file read/write/edit tools.
#
# Enforces .claude/settings.json and .claude/rules/opencode-config.md protections:
#   - deny any access to ~/.config/opencode/service.json (credential file)
#   - force_ask on writes/edits to ~/.config/opencode/**

set -u

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.toolCall.name // empty' 2>/dev/null || true)"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.toolCall.args.Path // .toolCall.args.AbsolutePath // .toolCall.args.TargetFile // .toolCall.args.file_path // empty' 2>/dev/null || true)"

if [ -z "$FILE_PATH" ]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

# Normalize leading ~/ to $HOME/ for consistent matching.
case "$FILE_PATH" in
  "~/"*) NORMALIZED_PATH="${HOME}/${FILE_PATH#~/}" ;;
  *) NORMALIZED_PATH="$FILE_PATH" ;;
esac

case "$NORMALIZED_PATH" in
  */.config/opencode/service.json|.config/opencode/service.json)
    jq -n --arg reason "Accessing '$FILE_PATH' is forbidden: ~/.config/opencode/service.json holds a credential (see .claude/rules/opencode-config.md)." \
      '{decision: "deny", reason: $reason}'
    exit 0
    ;;
esac

case "$TOOL_NAME" in
  write_file|write_to_file|edit_file|replace_file_content|multi_replace_file_content)
    case "$NORMALIZED_PATH" in
      */.config/opencode/*|.config/opencode/*)
        jq -n --arg reason "Modifying '$FILE_PATH' requires explicit human authorization in this conversation (see .claude/rules/opencode-config.md)." \
          '{decision: "force_ask", reason: $reason}'
        exit 0
        ;;
    esac
    ;;
esac

printf '{"decision":"allow"}\n'
exit 0
