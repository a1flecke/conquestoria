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

# Detect the git working directory from the command.
# Handle "cd /some/path && git push ..." — the hook always runs from
# $CLAUDE_PROJECT_DIR, not from the shell's cwd at tool-call time, so we must
# extract the path ourselves when the command starts with a cd.
git_cwd=""
if printf '%s' "$cmd" | grep -qE '^[[:space:]]*cd[[:space:]]+'; then
  # Extract the first argument to cd from line 1 only (multi-line commands
  # such as those with heredoc bodies must not bleed into the path).
  cd_path="$(printf '%s' "$cmd" | head -1 | sed -E 's|^[[:space:]]*cd[[:space:]]+([^ ;&]+).*|\1|')"
  # Verify it is actually a git repo before trusting the extracted path.
  if [ -n "$cd_path" ] && git -C "$cd_path" rev-parse --git-dir >/dev/null 2>&1; then
    git_cwd="$cd_path"
  fi
fi

git_run() {
  if [ -n "$git_cwd" ]; then
    git -C "$git_cwd" "$@"
  else
    git "$@"
  fi
}

# Skip the check when pushing directly to main (the block-commit-on-main hook
# already handles that case).
current_branch="$(git_run symbolic-ref --short HEAD 2>/dev/null || echo '')"
if [ "$current_branch" = "main" ]; then
  exit 0
fi

if ! git_run rev-parse --verify origin/main >/dev/null 2>&1; then
  exit 0
fi

# origin/main must be an ancestor of HEAD for a FF merge to be possible.
if ! git_run merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  behind="$(git_run rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  echo "ERROR: Branch is $behind commit(s) behind origin/main. Rebase before pushing: git fetch origin main && git rebase origin/main" >&2
  exit 2
fi

exit 0
