#!/usr/bin/env bash
# SessionStart / SessionEnd hook for dev servers (#1564). Usage: dev-server-lifecycle.sh start|end
#
#   end    stop THIS session's worktree server (the worktree is the payload's `cwd`)
#   start  reap servers left behind by earlier or crashed sessions: only servers whose worktree no longer exists or whose
#          lifetime has elapsed are stopped; a live, in-date server is never touched
#
# Always exits 0 and prints nothing: a lifecycle hook must never block a session or add text to its context.
# The hook script itself is read from $CLAUDE_PROJECT_DIR, but the dev-server script that runs is the one in the
# session's own worktree when it has one, so a tree that has not merged this change yet is simply a no-op.
#
# Hook contract: the payload arrives as JSON on stdin; `cwd` is the session's working directory.

MODE="${1:-end}"
INPUT=$(cat 2>/dev/null || true)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$CWD" ] || CWD="${CLAUDE_PROJECT_DIR:-}"
[ -n "$CWD" ] && [ -d "$CWD" ] || exit 0

TOP=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null)
[ -n "$TOP" ] || exit 0
SCRIPT="$TOP/scripts/dev-server.sh"
[ -f "$SCRIPT" ] || exit 0

case "$MODE" in
  end) (cd "$TOP" && sh "$SCRIPT" stop --quiet) >/dev/null 2>&1 ;;
  start) (cd "$TOP" && sh "$SCRIPT" reap) >/dev/null 2>&1 ;;
esac
exit 0
