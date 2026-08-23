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

[ "$(git -C "$ROOT" rev-parse HEAD)" = "$before_head" ] || { echo "hook test changed HEAD" >&2; exit 1; }
[ "$(git -C "$ROOT" branch --show-current)" = "$before_branch" ] || { echo "hook test changed branch" >&2; exit 1; }
[ "$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)" = "$before_status" ] || { echo "hook test changed worktree state" >&2; exit 1; }
[ "$(git -C "$ROOT" for-each-ref --format='%(refname) %(objectname)' refs/heads)" = "$before_refs" ] || { echo "hook test changed local refs" >&2; exit 1; }
