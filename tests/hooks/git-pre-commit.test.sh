#!/usr/bin/env bash
# Functional tests for the repository pre-commit hook.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.githooks/pre-commit"

[ -x "$HOOK" ] || {
  echo "repository pre-commit hook is missing or not executable"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

git init -q "$tmpdir"
git -C "$tmpdir" config user.name Test
git -C "$tmpdir" config user.email test@example.com
printf 'base\n' > "$tmpdir/base.txt"
git -C "$tmpdir" add base.txt
git -C "$tmpdir" commit -q -m base
mkdir -p "$tmpdir/scripts"

write_index_probe() {
  script="$1"
  printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'git diff --cached --name-only' \
    > "$tmpdir/scripts/$script"
  chmod +x "$tmpdir/scripts/$script"
}

write_index_probe pre-commit-guardrails.sh

alternate_index="$tmpdir/alternate-index"
GIT_INDEX_FILE="$alternate_index" git -C "$tmpdir" read-tree HEAD
printf 'alternate\n' > "$tmpdir/alternate.txt"
GIT_INDEX_FILE="$alternate_index" git -C "$tmpdir" add alternate.txt

observed="$(
  cd "$tmpdir"
  GIT_DIR="$tmpdir/.git" \
    GIT_INDEX_FILE="$alternate_index" \
    bash "$HOOK"
)"

[ "$observed" = "alternate.txt" ] || {
  echo "pre-commit inspected the wrong index: expected alternate.txt, got '$observed'"
  exit 1
}

printf '%s\n' '#!/bin/sh' 'exit 23' > "$tmpdir/scripts/pre-commit-guardrails.sh"
chmod +x "$tmpdir/scripts/pre-commit-guardrails.sh"

set +e
(
  cd "$tmpdir"
  GIT_DIR="$tmpdir/.git" \
    GIT_INDEX_FILE="$alternate_index" \
    bash "$HOOK"
)
status=$?
set -e

[ "$status" -eq 23 ] || {
  echo "pre-commit did not propagate guardrail failure: expected 23, got $status"
  exit 1
}
