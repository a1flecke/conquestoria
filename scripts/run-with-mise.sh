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
#   yarn build:tauri   → same, with Vite's tauri mode at the worktree root
#   yarn dev/preview   → vite command rooted at the active worktree
#   yarn test:web-smoke → Playwright with the active worktree config
#   yarn vitest …      → yarn vitest … --root $CURRENT_ROOT  (appended)
#   yarn vite build …  → yarn vite build $CURRENT_ROOT …     (positional root)
#   yarn vite …        → yarn vite $CURRENT_ROOT …           (positional root)
#   yarn node …        → execute from $CURRENT_ROOT so relative scripts and outputs
#                        stay in the active worktree while Yarn resolves from the parent
#   anything else      → unchanged, but executed from $MAIN_ROOT so yarn can
#                        find .pnp.cjs (e.g. yarn install, yarn add)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"
MAIN_ROOT="$(git -C "$SCRIPT_DIR" worktree list --porcelain 2>/dev/null \
  | awk '/^worktree /{sub(/^worktree /, ""); print; exit}' || echo "$CURRENT_ROOT")"

if [ -n "$MAIN_ROOT" ] && [ "$CURRENT_ROOT" != "$MAIN_ROOT" ] && [ -f "$MAIN_ROOT/.pnp.cjs" ]; then
  MAIN_RUN="$MAIN_ROOT/scripts/run-with-mise.sh"
  case "${1:-},${2:-}" in
    yarn,test)
      # Expand into the two phases so --root reaches vitest
      shift 2
      (cd "$MAIN_ROOT" && "$MAIN_RUN" yarn vitest run --root "$CURRENT_ROOT" "$@") \
        && bash "$CURRENT_ROOT/tests/hooks/run.sh"
      exit
      ;;
    yarn,test:hooks)
      exec bash "$CURRENT_ROOT/tests/hooks/run.sh"
      ;;
    yarn,build)
      # Expand so tsc targets the worktree's tsconfig; vite targets the worktree's root
      (cd "$MAIN_ROOT" && "$MAIN_RUN" yarn tsc --project "$CURRENT_ROOT/tsconfig.json" --noEmit) \
        && (cd "$MAIN_ROOT" && "$MAIN_RUN" yarn vite build "$CURRENT_ROOT")
      exit
      ;;
    yarn,build:tauri)
      (cd "$MAIN_ROOT" && "$MAIN_RUN" yarn tsc --project "$CURRENT_ROOT/tsconfig.json" --noEmit) \
        && (cd "$MAIN_ROOT" && "$MAIN_RUN" yarn vite build "$CURRENT_ROOT" --mode tauri)
      exit
      ;;
    yarn,dev)
      shift 2
      cd "$MAIN_ROOT" && exec "$MAIN_RUN" yarn vite "$CURRENT_ROOT" "$@"
      ;;
    yarn,preview)
      shift 2
      cd "$MAIN_ROOT" && exec "$MAIN_RUN" yarn vite preview "$CURRENT_ROOT" "$@"
      ;;
    yarn,test:web-smoke)
      shift 2
      cd "$MAIN_ROOT" && exec "$MAIN_RUN" yarn playwright test --config "$CURRENT_ROOT/playwright.config.ts" "$@"
      ;;
    yarn,vitest)
      # Pass through with --root appended so aliases and test discovery use this worktree
      cd "$MAIN_ROOT" && exec "$MAIN_RUN" "$@" --root "$CURRENT_ROOT"
      ;;
    yarn,vite)
      # Vite 8 accepts root as a positional argument, not --root. Preserve common
      # subcommands by placing the worktree root after the subcommand.
      shift 2
      case "${1:-}" in
        build|optimize|preview)
          subcommand="$1"
          shift
          cd "$MAIN_ROOT" && exec "$MAIN_RUN" yarn vite "$subcommand" "$CURRENT_ROOT" "$@"
          ;;
        *)
          cd "$MAIN_ROOT" && exec "$MAIN_RUN" yarn vite "$CURRENT_ROOT" "$@"
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
      cd "$MAIN_ROOT" && exec "$MAIN_RUN" "$@"
      ;;
  esac
fi

exec mise exec -- "$@"
