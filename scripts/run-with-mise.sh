#!/usr/bin/env sh
set -eu

# Every worktree owns its PnP map because it is generated from that worktree's
# package.json and yarn.lock. Yarn's download cache is shared by Yarn itself;
# sharing a .pnp.cjs map would let a stale branch resolve the wrong dependency
# graph. This adapter always executes from the active worktree.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Git hooks export GIT_DIR, GIT_INDEX_FILE, and related variables. Clear them
# only for repository discovery so a hook's real index remains untouched.
run_without_local_git_env() (
  local_vars="$(git rev-parse --local-env-vars 2>/dev/null || true)"
  for variable in $local_vars; do
    unset "$variable"
  done
  exec "$@"
)

git_without_local_env() {
  run_without_local_git_env git "$@"
}

CURRENT_ROOT="$(git_without_local_env -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"

# Vite/Vitest caches are writable state and always belong to the active
# worktree. Vitest config consumes this override.
export CONQUESTORIA_VITEST_CACHE_DIR="$CURRENT_ROOT/.vite/vitest"

case "${1:-},${2:-}" in
  yarn,setup:hooks)
    run_without_local_git_env sh "$CURRENT_ROOT/scripts/setup-git-hooks.sh"
    ;;
  yarn,install)
    cd "$CURRENT_ROOT"
    shift
    run_without_local_git_env mise exec -- yarn "$@"
    ;;
esac

if [ "${1:-}" = 'yarn' ] && { [ ! -f "$CURRENT_ROOT/.pnp.cjs" ] || [ -L "$CURRENT_ROOT/.pnp.cjs" ]; }; then
  echo "ERROR: dependencies are not installed in this worktree: $CURRENT_ROOT" >&2
  echo "Run: $CURRENT_ROOT/scripts/run-with-mise.sh yarn install --immutable" >&2
  exit 1
fi

cd "$CURRENT_ROOT"
run_without_local_git_env mise exec -- "$@"
