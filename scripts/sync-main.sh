#!/usr/bin/env sh
# scripts/sync-main.sh: bring the current feature branch up to date with origin/main (#1256).
#
# Work keeps landing on origin/main, so every agent (Claude Code, Codex, OpenCode) needs to rebase its
# branch routinely, and that must not need a human approval. This is the one fixed, no-argument way to do
# it: it can only run `git fetch origin main` and `git rebase origin/main`, so it is safe to allow by name.
# It refuses main, a detached HEAD, a dirty tracked tree and a rebase already in progress, and it never
# takes an argument, so no flag (--force, --skip, --strategy, ...) can be smuggled in.
#
# A conflict stops the rebase for the agent to resolve (stage only the resolved files, then continue);
# this script never resolves, skips or aborts one. Publishing the rebased branch is a separate step and an
# already-pushed branch needs --force-with-lease, which deliberately remains a human-approved operation.
set -eu

deny() {
  echo "sync-main: $1" >&2
  exit 2
}

[ "$#" -eq 0 ] || deny "takes no arguments (it always rebases the current branch onto origin/main)"

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"

for state in rebase-merge rebase-apply; do
  if [ -d "$(git rev-parse --git-path "$state")" ]; then
    deny "a rebase is already in progress: resolve the conflicts, stage only the resolved files, then run GIT_EDITOR=true git rebase --continue"
  fi
done

branch="$(git symbolic-ref --short -q HEAD)" || deny "HEAD is detached; switch to your feature branch first"
[ "$branch" != main ] || deny "refusing to rebase main; work happens on a feature branch in a worktree"

[ -z "$(git status --porcelain --untracked-files=no)" ] || deny "tracked files have uncommitted changes; commit them first"

git fetch origin main || { echo "sync-main: git fetch origin main failed (network or remote problem)" >&2; exit 1; }

status=0
git rebase origin/main || status=$?
if [ "$status" -ne 0 ]; then
  cat >&2 <<'CONFLICT'
sync-main: the rebase stopped on a conflict and is left in progress.
  1. Resolve the conflicting files.
  2. Stage only the resolved paths: git add -- <paths>
  3. Continue: GIT_EDITOR=true git rebase --continue
Never use git rebase --skip. To give up, ask the user before running git rebase --abort.
CONFLICT
  exit "$status"
fi

echo "sync-main: $branch is now based on $(git rev-parse --short origin/main)."
echo "If this branch was already pushed, publishing it needs a force-with-lease push, which asks for approval."
