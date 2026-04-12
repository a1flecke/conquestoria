#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash — reminds Claude to run the
# code-review skill before pushing or merging if the current branch
# has commits ahead of origin/main.

set -u
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"

case "$cmd" in
  *"git push"*|*"gh pr merge"*|*"gh pr create"*) : ;;
  *) exit 0 ;;
esac

# How many commits ahead of origin/main?
ahead=0
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
fi

if [ "${ahead:-0}" -ge 1 ]; then
  reason="This branch has $ahead commit(s) ahead of origin/main. Run the 'code-review:code-review' skill before pushing/merging. If you've already reviewed this branch in this session, proceed."
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $r
    }
  }'
  exit 0
fi

exit 0
