#!/usr/bin/env bash
# Smoke test: repository Git hooks delegate to the complete local gate without
# leaking Git's repository-local environment into worktree-aware commands.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PRE_COMMIT_HOOK="$ROOT/.githooks/pre-commit"
PRE_PUSH_HOOK="$ROOT/.githooks/pre-push"

if [ ! -x "$PRE_PUSH_HOOK" ]; then
  echo "repository pre-push hook is missing or not executable"
  exit 1
fi

if ! grep -Fq './scripts/pre-commit-checks.sh' "$PRE_PUSH_HOOK"; then
  echo "repository pre-push hook does not run the complete local gate"
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

git init -q "$tmpdir"
mkdir -p "$tmpdir/scripts"
printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'expected="$(git rev-parse --show-toplevel)"' \
  'actual="$(git -C "$expected/scripts" rev-parse --show-toplevel)"' \
  '[ "$actual" = "$expected" ]' \
  > "$tmpdir/scripts/pre-commit-checks.sh"
chmod +x "$tmpdir/scripts/pre-commit-checks.sh"

run_hook_with_git_environment() {
  hook="$1"
  (
    cd "$tmpdir" || exit 1
    GIT_DIR="$tmpdir/.git" \
      GIT_INDEX_FILE="$tmpdir/.git/index" \
      bash "$hook"
  )
}

run_hook_with_git_environment "$PRE_COMMIT_HOOK"
run_hook_with_git_environment "$PRE_PUSH_HOOK"
