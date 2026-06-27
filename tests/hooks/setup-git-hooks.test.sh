#!/usr/bin/env bash
# Functional test for worktree-local repository hook installation.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INSTALLER="$ROOT/scripts/setup-git-hooks.sh"

[ -x "$INSTALLER" ] || {
  echo "hook installer is missing or not executable"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

main="$tmpdir/main"
first="$tmpdir/first"
second="$tmpdir/second"

git init -q "$main"
git -C "$main" config user.name Test
git -C "$main" config user.email test@example.com
mkdir -p "$main/scripts"
cp "$INSTALLER" "$main/scripts/setup-git-hooks.sh"
cp -R "$ROOT/.githooks" "$main/.githooks"
printf 'base\n' > "$main/base.txt"
git -C "$main" add .
git -C "$main" commit -q -m base
git -C "$main" worktree add -q -b first "$first"
git -C "$main" worktree add -q -b second "$second"

# A legacy/common value must remain untouched for sibling worktrees.
git -C "$main" config core.hooksPath /custom/shared/hooks

(
  cd "$first"
  bash scripts/setup-git-hooks.sh >/dev/null
)

first_path="$(git -C "$first" config core.hooksPath)"
main_path="$(git -C "$main" config core.hooksPath)"
second_path="$(git -C "$second" config core.hooksPath)"

[ "$first_path" = ".githooks" ] || {
  echo "target worktree hook path was not configured: $first_path"
  exit 1
}
[ "$main_path" = "/custom/shared/hooks" ] || {
  echo "main worktree hook path was changed: $main_path"
  exit 1
}
[ "$second_path" = "/custom/shared/hooks" ] || {
  echo "sibling worktree hook path was changed: $second_path"
  exit 1
}
