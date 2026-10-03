#!/usr/bin/env sh
# scripts/push-branch.sh: publish the current feature branch to origin (#1260).
#
# After scripts/sync-main.sh rebases a branch that was already pushed, publishing it needs a lease-protected
# force push. This is the one fixed, no-argument way for any agent (Claude Code, Codex, OpenCode) to do that, so
# it can be allowed by name instead of asking a human each time. It can only push the CURRENT branch to origin
# under the SAME name (HEAD:refs/heads/<branch>), and:
#   - it refuses main/master, a detached HEAD, a rebase in progress and any argument;
#   - it refuses unless the branch already contains the latest origin/main (run scripts/sync-main.sh first);
#   - a new branch and a fast-forward are plain pushes;
#   - a diverged (rebased) branch uses a lease PINNED to the exact remote tip this clone last saw
#     (refs/remotes/origin/<branch>), and only when the remote still has exactly that tip, so work someone else
#     pushed since is never overwritten;
#   - it never deletes, tags, mirrors, uses a bare force, skips the pre-push verification, or pushes another ref.
# Raw `git push --force*` stays denied/asking everywhere.
set -eu

deny() {
  echo "push-branch: $1" >&2
  exit 2
}

[ "$#" -eq 0 ] || deny "takes no arguments (it always pushes the current branch to origin under the same name)"

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"

for state in rebase-merge rebase-apply; do
  if [ -d "$(git rev-parse --git-path "$state")" ]; then
    deny "a rebase is in progress; finish it first (the steps are in the output of ./scripts/sync-main.sh)"
  fi
done

branch="$(git symbolic-ref --short -q HEAD)" || deny "HEAD is detached; switch to your feature branch first"
case "$branch" in
  main|master) deny "refusing to push '$branch'; work happens on a feature branch in a worktree" ;;
  -*|*[!A-Za-z0-9._/-]*) deny "branch name '$branch' has characters this script does not support" ;;
esac

git fetch origin main || { echo "push-branch: git fetch origin main failed (network or remote problem)" >&2; exit 1; }
git merge-base --is-ancestor origin/main HEAD || deny "'$branch' does not contain the latest origin/main; run ./scripts/sync-main.sh first"

head="$(git rev-parse HEAD)"
listing="$(git ls-remote origin "refs/heads/$branch")" || { echo "push-branch: git ls-remote origin failed (network or remote problem)" >&2; exit 1; }
remote="${listing%%[[:space:]]*}"

if [ -z "$remote" ]; then
  git push -u origin "HEAD:refs/heads/$branch"
  exit 0
fi

seen="$(git rev-parse -q --verify "refs/remotes/origin/$branch")" || deny "origin already has '$branch' but this clone has no record of it; fetch and inspect it first (git fetch origin $branch)"
[ "$seen" = "$remote" ] || deny "origin/$branch moved since this clone last saw it (someone else pushed); fetch and inspect it first (git fetch origin $branch)"

if [ "$remote" = "$head" ]; then
  echo "push-branch: origin/$branch is already at HEAD; nothing to push."
  exit 0
fi

if git merge-base --is-ancestor "$remote" "$head"; then
  git push origin "HEAD:refs/heads/$branch"
else
  git push "--force-with-lease=refs/heads/$branch:$remote" origin "HEAD:refs/heads/$branch"
fi
