#!/usr/bin/env bash
# PreToolUse hook -- blocks killing processes by NAME or by process GROUP.
#
# Several agents (Claude, Codex, OpenCode) run the same test/verification scripts on
# this host at the same time. `pkill -f run-ai-long-horizon.sh` (or killall, or
# `kill $(pgrep ...)`) selects every process with that name -- including another
# agent's multi-hour run in a different worktree. That happened; it is now blocked.
#
# Stop your own work by recorded pid instead:
#   scripts/stop-local-verification.sh <scope>|--all     (durable verification runs)
#   kill <the pid you started>                            (a specific numeric pid)
# See .claude/rules/hooks-and-tooling.md "Launching and stopping".
#
# Hook contract: tool input arrives as JSON on stdin (NOT in CLAUDE_TOOL_INPUT).
# See .claude/rules/hooks-and-tooling.md.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$COMMAND" ] || exit 0

# A git/gh/pr-body command may legitimately MENTION pkill in a commit message or PR body
# (including a heredoc body). For those, scan only the first line with quoted strings removed,
# so `git commit -m "...pkill..." && pkill -f x` is still caught but the message text is not.
if echo "$COMMAND" | grep -qE '^[[:space:]]*(git|gh)[[:space:]]|pr-body\.sh'; then
  SCAN="$(printf '%s' "$COMMAND" | head -n 1 | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"
else
  SCAN="$COMMAND"
fi

block() {
  cat >&2 <<EOF
ERROR: $1

This host runs several agents at once; killing by name or process group can terminate
another agent's run in a different worktree. Kill only a specific numeric pid you
started, or use:
  scripts/stop-local-verification.sh <full|ai-long|ai-playability|perf>|--all [--dry-run]
EOF
  exit 2
}

# pkill / killall as a command word (start of line or after a separator/subshell opener).
# Command position only: start of input, after a separator/quote/subshell opener, or after a
# wrapper word -- so `rg pkill docs` (searching for the word) is not mistaken for running it.
CMDPOS=$'(^|[;&|(`"\']|(sudo|env|nohup|time|exec|xargs|then|do|else)[[:space:]])[[:space:]]*'
if echo "$SCAN" | grep -qE "${CMDPOS}(pkill|killall)([[:space:]]|\$)"; then
  block "pkill/killall select processes by name."
fi

# kill fed by a name search: kill $(pgrep ...), kill `pidof ...`, kill $(ps ... | grep ...)
if echo "$SCAN" | grep -qE '(^|[[:space:];&|(])kill[^;&|]*(\$\(|`)[[:space:]]*(pgrep|pidof|ps)([[:space:]]|$)'; then
  block "kill with a pid list produced by pgrep/pidof/ps selects processes by name."
fi

# pgrep/pidof/ps ... | xargs kill
if echo "$SCAN" | grep -qE '(pgrep|pidof|ps)[^;&]*\|[^;&]*xargs[^;&|]*[[:space:]]kill([[:space:]]|$)'; then
  block "piping pgrep/pidof/ps into xargs kill selects processes by name."
fi

# Process-group kill: `kill -- -PGID`, `kill -TERM -PGID`, or a 3+ digit negative pid (cannot be a signal).
if echo "$SCAN" | grep -qE '(^|[[:space:];&|(])kill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+--[[:space:]]+-[0-9]'; then
  block "kill -- -PGID signals a whole process group."
fi
if echo "$SCAN" | grep -qE '(^|[[:space:];&|(])kill[^;&|]*[[:space:]]-[0-9]{3,}([[:space:]]|$)'; then
  block "a negative pid (kill -PGID) signals a whole process group."
fi

exit 0
