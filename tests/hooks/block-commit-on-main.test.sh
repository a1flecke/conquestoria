#!/usr/bin/env bash
# Smoke test: block-commit-on-main.sh must exit 2 on git commit/merge when on main, exit 0 otherwise.
set -u
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/block-commit-on-main.sh"

# Skip if working tree is dirty (branch checkout would fail or leave confusing state)
if [ -n "$(git status --porcelain)" ]; then
  echo "skip: dirty working tree — skipping branch-switching smoke test"
  exit 0
fi

fail=0
ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)

trap 'git checkout -q "$ORIG_BRANCH" 2>/dev/null || true' EXIT

# Helper: run hook in a synthetic branch context
run_with_branch() {
  local branch="$1" payload="$2"
  if git show-ref --verify --quiet "refs/heads/$branch"; then :; else
    git branch -q "$branch" 2>/dev/null || true
  fi
  git checkout -q "$branch"
  echo "$payload" | bash "$HOOK" 2>&1
  echo "rc=$?"
}

# On main with git commit: must block
out=$(run_with_branch main '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')
echo "$out" | grep -q 'rc=2' || { echo "expected block on main+commit, got: $out"; fail=1; }

# On main with git merge: must block
out=$(run_with_branch main '{"tool_name":"Bash","tool_input":{"command":"git merge feature"}}')
echo "$out" | grep -q 'rc=2' || { echo "expected block on main+merge, got: $out"; fail=1; }

# On main with non-git command: must pass
out=$(run_with_branch main '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}')
echo "$out" | grep -q 'rc=0' || { echo "expected allow on main+ls, got: $out"; fail=1; }

# On a feature branch with git commit: must pass
git branch -q test-feat 2>/dev/null || true
out=$(run_with_branch test-feat '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')
echo "$out" | grep -q 'rc=0' || { echo "expected allow on feat+commit, got: $out"; fail=1; }
git branch -qD test-feat 2>/dev/null || true

exit "$fail"
