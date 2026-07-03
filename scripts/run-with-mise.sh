#!/usr/bin/env sh
set -eu

# In a git worktree, .pnp.cjs and the yarn installation live only in the main
# worktree.  Detect that case and transparently re-execute from there, injecting
# --root / --project overrides so the sub-commands target the current worktree's
# source rather than the main branch.
#
# Mapping (when $CURRENT_ROOT != $MAIN_ROOT):
#   yarn test          → vitest run --root $CURRENT_ROOT + bash tests/hooks/run.sh
#   yarn build         → tsc --project $CURRENT_ROOT/tsconfig.json --noEmit
#                      + vite build $CURRENT_ROOT
#                      + node $CURRENT_ROOT/scripts/version-sw-cache.mjs
#                        (this mirrors package.json's "build" script — keep both in
#                        sync if that script's composition ever changes)
#   yarn build:tauri   → same, with Vite's tauri mode at the worktree root
#   yarn dev/preview   → vite command rooted at the active worktree
#   yarn test:web-smoke → Playwright with the active worktree config
#   yarn vitest …      → yarn vitest … --root $CURRENT_ROOT  (appended)
#   yarn vite build …  → yarn vite build $CURRENT_ROOT …     (positional root)
#   yarn vite …        → yarn vite $CURRENT_ROOT …           (positional root)
#   yarn node …        → execute from $CURRENT_ROOT so relative scripts and outputs
#                        stay in the active worktree while Yarn resolves from the parent
#   yarn install       → always execute from $MAIN_ROOT, including first install
#   yarn setup:hooks   → execute the installer for the active worktree
#   yarn verify:push   → execute the canonical verifier for the active worktree
#   anything else      → unchanged, but executed from $MAIN_ROOT so yarn can
#                        find .pnp.cjs (e.g. yarn add)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Git hooks export GIT_DIR, GIT_INDEX_FILE, and related variables. Those values
# describe the caller's operation, not repository discovery for an arbitrary
# `git -C` path. Clear them only inside discovery subprocesses so callers keep
# their real index while linked-worktree routing remains stable.
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
MAIN_ROOT="$(git_without_local_env -C "$SCRIPT_DIR" worktree list --porcelain 2>/dev/null \
  | awk '/^worktree /{sub(/^worktree /, ""); print; exit}' || echo "$CURRENT_ROOT")"

if [ -n "$MAIN_ROOT" ] && [ "$CURRENT_ROOT" != "$MAIN_ROOT" ]; then
  MAIN_RUN="$MAIN_ROOT/scripts/run-with-mise.sh"

  case "${1:-},${2:-}" in
    yarn,install)
      cd "$MAIN_ROOT"
      run_without_local_git_env "$MAIN_RUN" "$@"
      exit
      ;;
    yarn,setup:hooks)
      exec sh "$CURRENT_ROOT/scripts/setup-git-hooks.sh"
      ;;
    yarn,verify:push)
      exec sh "$CURRENT_ROOT/scripts/verify-before-push.sh"
      ;;
  esac

  if [ "${1:-}" = "yarn" ] && [ ! -f "$MAIN_ROOT/.pnp.cjs" ]; then
    echo "ERROR: dependencies are not installed in the main worktree." >&2
    echo "Run: $CURRENT_ROOT/scripts/run-with-mise.sh yarn install --immutable" >&2
    exit 1
  fi

  case "${1:-},${2:-}" in
    yarn,test)
      # Expand into the two phases so --root reaches vitest
      shift 2
      (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn vitest run --root "$CURRENT_ROOT" "$@") \
        && run_without_local_git_env bash "$CURRENT_ROOT/tests/hooks/run.sh"
      exit
      ;;
    yarn,test:hooks)
      run_without_local_git_env bash "$CURRENT_ROOT/tests/hooks/run.sh"
      exit
      ;;
    yarn,build)
      # Expand so tsc targets the worktree's tsconfig; vite targets the worktree's root.
      # Third step mirrors package.json's "build" script (tsc && vite build && node
      # scripts/version-sw-cache.mjs) — the worktree path never reads that script
      # string, so it must be kept in sync here by hand.
      (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn tsc --project "$CURRENT_ROOT/tsconfig.json" --noEmit) \
        && (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn vite build "$CURRENT_ROOT") \
        && (cd "$CURRENT_ROOT" && node "$CURRENT_ROOT/scripts/version-sw-cache.mjs")
      exit
      ;;
    yarn,build:tauri)
      (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn tsc --project "$CURRENT_ROOT/tsconfig.json" --noEmit) \
        && (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn vite build "$CURRENT_ROOT" --mode tauri)
      exit
      ;;
    yarn,dev)
      shift 2
      cd "$MAIN_ROOT"
      run_without_local_git_env "$MAIN_RUN" yarn vite "$CURRENT_ROOT" "$@"
      exit
      ;;
    yarn,preview)
      shift 2
      cd "$MAIN_ROOT"
      run_without_local_git_env "$MAIN_RUN" yarn vite preview "$CURRENT_ROOT" "$@"
      exit
      ;;
    yarn,test:web-smoke)
      shift 2
      cd "$MAIN_ROOT"
      run_without_local_git_env "$MAIN_RUN" yarn playwright test --config "$CURRENT_ROOT/playwright.config.ts" "$@"
      exit
      ;;
    yarn,vitest)
      # Pass through with --root appended so aliases and test discovery use this worktree
      cd "$MAIN_ROOT"
      run_without_local_git_env "$MAIN_RUN" "$@" --root "$CURRENT_ROOT"
      exit
      ;;
    yarn,vite)
      # Vite 8 accepts root as a positional argument, not --root. Preserve common
      # subcommands by placing the worktree root after the subcommand.
      shift 2
      case "${1:-}" in
        build|optimize|preview)
          subcommand="$1"
          shift
          cd "$MAIN_ROOT"
          run_without_local_git_env "$MAIN_RUN" yarn vite "$subcommand" "$CURRENT_ROOT" "$@"
          exit
          ;;
        *)
          cd "$MAIN_ROOT"
          run_without_local_git_env "$MAIN_RUN" yarn vite "$CURRENT_ROOT" "$@"
          exit
          ;;
      esac
      ;;
    yarn,node)
      shift 2
      cd "$CURRENT_ROOT"
      NODE_OPTIONS="--require $MAIN_ROOT/.pnp.cjs --experimental-loader file://$MAIN_ROOT/.pnp.loader.mjs ${NODE_OPTIONS:-}" \
        exec mise exec -- node "$@"
      ;;
    yarn,*)
      # All other yarn sub-commands (install, add, etc.): just run from the main worktree
      cd "$MAIN_ROOT"
      run_without_local_git_env "$MAIN_RUN" "$@"
      exit
      ;;
  esac
fi

exec mise exec -- "$@"
