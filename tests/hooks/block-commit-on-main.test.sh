#!/usr/bin/env bash
# Smoke test the hook in a disposable repository; never mutate this worktree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/block-commit-on-main.sh"

before_head="$(git -C "$ROOT" rev-parse HEAD)"
before_branch="$(git -C "$ROOT" branch --show-current)"
before_status="$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)"
before_refs="$(git -C "$ROOT" for-each-ref --format='%(refname) %(objectname)' refs/heads)"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
fixture="$tmpdir/hook-fixture"
git init -q -b main "$fixture"
git -C "$fixture" config user.email hook-test@example.invalid
git -C "$fixture" config user.name hook-test
touch "$fixture/initial"
git -C "$fixture" add initial
git -C "$fixture" commit -qm initial
git -C "$fixture" switch -qc feature/hook-test

run_hook() {
  local branch="$1" payload="$2"
  git -C "$fixture" switch -q "$branch"
  set +e
  output="$(cd "$fixture" && printf '%s' "$payload" | bash "$HOOK" 2>&1)"
  status=$?
  set -e
  printf '%s\nrc=%s\n' "$output" "$status"
}

out="$(run_hook main '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')"
grep -q 'rc=2' <<<"$out" || { echo "expected main commit block, got: $out" >&2; exit 1; }

out="$(run_hook main '{"tool_name":"Bash","tool_input":{"command":"git merge feature"}}')"
grep -q 'rc=2' <<<"$out" || { echo "expected main merge block, got: $out" >&2; exit 1; }

out="$(run_hook main '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}')"
grep -q 'rc=0' <<<"$out" || { echo "expected main non-git command allow, got: $out" >&2; exit 1; }

out="$(run_hook feature/hook-test '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')"
grep -q 'rc=0' <<<"$out" || { echo "expected feature commit allow, got: $out" >&2; exit 1; }

# The harness can run the hook from the main checkout while the session works in a linked worktree:
# the branch that matters is the one at the payload's cwd, not the process cwd.
wt="$tmpdir/hook-worktree"
git -C "$fixture" worktree add -q "$wt" -b feature/wt
git -C "$fixture" switch -q main
run_from() {
  local run_dir="$1" payload="$2"
  set +e
  output="$(cd "$run_dir" && printf '%s' "$payload" | bash "$HOOK" 2>&1)"
  status=$?
  set -e
  printf '%s\nrc=%s\n' "$output" "$status"
}
out="$(run_from "$fixture" "{\"tool_name\":\"Bash\",\"cwd\":\"$wt\",\"tool_input\":{\"command\":\"git commit -m foo\"}}")"
grep -q 'rc=0' <<<"$out" || { echo "expected worktree-cwd commit allow when hook runs from main, got: $out" >&2; exit 1; }
out="$(run_from "$wt" "{\"tool_name\":\"Bash\",\"cwd\":\"$fixture\",\"tool_input\":{\"command\":\"git commit -m foo\"}}")"
grep -q 'rc=2' <<<"$out" || { echo "expected main-cwd commit block when hook runs from a feature worktree, got: $out" >&2; exit 1; }

[ "$(git -C "$ROOT" rev-parse HEAD)" = "$before_head" ] || { echo "hook test changed HEAD" >&2; exit 1; }
[ "$(git -C "$ROOT" branch --show-current)" = "$before_branch" ] || { echo "hook test changed branch" >&2; exit 1; }
[ "$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)" = "$before_status" ] || { echo "hook test changed worktree state" >&2; exit 1; }
[ "$(git -C "$ROOT" for-each-ref --format='%(refname) %(objectname)' refs/heads)" = "$before_refs" ] || { echo "hook test changed local refs" >&2; exit 1; }
