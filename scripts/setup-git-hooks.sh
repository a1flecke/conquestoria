#!/bin/sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

for hook in pre-commit pre-push; do
  if [ ! -x "$REPO_ROOT/.githooks/$hook" ]; then
    echo "ERROR: $REPO_ROOT/.githooks/$hook is missing or not executable." >&2
    exit 1
  fi
done

# Hook configuration belongs to the active worktree. A repository-local value
# is shared by every linked worktree and can make old branches run incompatible
# hook implementations.
git -C "$REPO_ROOT" config extensions.worktreeConfig true
git -C "$REPO_ROOT" config --worktree core.hooksPath .githooks

printf 'Configured hooks for %s at .githooks\n' "$REPO_ROOT"
