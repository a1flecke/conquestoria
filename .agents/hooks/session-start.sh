#!/usr/bin/env bash
# Antigravity SessionStart hook — reaps stale dev servers left by dead/expired sessions
# by delegating to the canonical .claude/hooks/dev-server-lifecycle.sh script (#1564).
#
# Always outputs valid JSON ({}) and exits 0 so startup is never blocked.

set -u

INPUT="$(cat 2>/dev/null || true)"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // .workspacePaths[0] // empty' 2>/dev/null || true)"
[ -n "$CWD" ] || CWD="$REPO_ROOT"

HOOK_SCRIPT="$REPO_ROOT/.claude/hooks/dev-server-lifecycle.sh"
if [ -x "$HOOK_SCRIPT" ]; then
  CLAUDE_PROJECT_DIR="$REPO_ROOT" \
    "$HOOK_SCRIPT" start <<<"$(jq -n --arg cwd "$CWD" '{cwd: $cwd}')" >/dev/null 2>&1 || true
fi

printf '{}\n'
exit 0
