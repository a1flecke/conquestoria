#!/usr/bin/env bash
# Claude Code PreToolUse hook — blocks push/PR publication unless the same
# canonical test/build verifier used by the repository pre-push hook passes.

set -u

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi
if ! printf '%s' "$COMMAND" | head -1 | grep -qE '(^|[[:space:]&;|])(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+(create|merge))([[:space:]]|$)'; then
  exit 0
fi

PROJECT_DIR="$CLAUDE_PROJECT_DIR"
first_line="$(printf '%s' "$COMMAND" | head -1)"
if printf '%s' "$first_line" | grep -qE '^[[:space:]]*cd[[:space:]]+'; then
  cd_path="$(printf '%s' "$first_line" | sed -E 's|^[[:space:]]*cd[[:space:]]+([^ ;&]+).*|\1|')"
  if [ -n "$cd_path" ] && [ -d "$cd_path" ]; then
    PROJECT_DIR="$cd_path"
  fi
fi

# #1133: a plain `git push` is also verified by the repo's real
# `.githooks/pre-push` hook once this PreToolUse hook lets the tool call
# through -- running the same test+build gate here too would just pay for it
# twice. Defer to that hook when it is actually wired up for this worktree.
# This does not apply to `gh pr create`/`gh pr merge`, which never trigger a
# git pre-push hook, so those always fall through to running the verifier here.
if printf '%s' "$first_line" | grep -qE '(^|[[:space:]&;|])git[[:space:]]+push([[:space:]]|$)'; then
  hooks_path="$(git -C "$PROJECT_DIR" config --worktree --get core.hooksPath 2>/dev/null || true)"
  [ -n "$hooks_path" ] || hooks_path="$(git -C "$PROJECT_DIR" config --get core.hooksPath 2>/dev/null || true)"
  if [ "$hooks_path" = ".githooks" ] && [ -x "$PROJECT_DIR/.githooks/pre-push" ]; then
    exit 0
  fi
fi

VERIFY="$PROJECT_DIR/scripts/verify-before-push.sh"
if [ ! -x "$VERIFY" ]; then
  echo "ERROR: canonical verifier is missing or not executable: $VERIFY" >&2
  exit 2
fi

VERIFY_LOG="$(mktemp)"
trap 'rm -f "$VERIFY_LOG"' EXIT

if (cd "$PROJECT_DIR" && "$VERIFY" --regular) >"$VERIFY_LOG" 2>&1; then
  exit 0
fi

{
  echo "ERROR: pre-push verification failed."
  echo "--- last 40 lines of verification output ---"
  tail -n 40 "$VERIFY_LOG"
} >&2
exit 2
