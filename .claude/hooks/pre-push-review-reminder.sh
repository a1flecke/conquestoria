#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash — blocks git push / gh pr create / merge
# unless the current branch is fast-forward compatible with origin/main (i.e.
# origin/main is an ancestor of HEAD). Rebase before pushing.

set -u
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"

case "$cmd" in
  *"git push"*|*"gh pr merge"*|*"gh pr create"*) : ;;
  *) exit 0 ;;
esac

# Skip the check when pushing directly to main (the block-commit-on-main hook
# already handles that case).
current_branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo '')"
if [ "$current_branch" = "main" ]; then
  exit 0
fi

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  exit 0
fi

# origin/main must be an ancestor of HEAD for a FF merge to be possible.
if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  behind="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  echo "ERROR: Branch is $behind commit(s) behind origin/main. Rebase before pushing: git fetch origin main && git rebase origin/main" >&2
  exit 2
fi

exit 0
