#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN_ROOT="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /, ""); print; exit}')"

# The routing branch exists only in linked worktrees; the main checkout has no
# alternate cwd to preserve.
if [ -z "$MAIN_ROOT" ] || [ "$ROOT" = "$MAIN_ROOT" ]; then
  exit 0
fi

observed="$(cd "$ROOT" && ./scripts/run-with-mise.sh yarn node -e 'console.log(process.cwd())')" || exit 1
if [ "$observed" != "$ROOT" ]; then
  echo "expected yarn node cwd $ROOT, got $observed"
  exit 1
fi

if ! grep -q 'yarn,test:hooks)' "$ROOT/scripts/run-with-mise.sh"; then
  echo "missing worktree-local test:hooks routing"
  exit 1
fi
if ! grep -q 'vitest run --root.*"\$@"' "$ROOT/scripts/run-with-mise.sh"; then
  echo "focused yarn test arguments are not preserved"
  exit 1
fi
for route in 'yarn,build:tauri)' 'yarn,test:web-smoke)' 'yarn,dev)' 'yarn,preview)'; do
  if ! grep -q "$route" "$ROOT/scripts/run-with-mise.sh"; then
    echo "missing worktree-local route: $route"
    exit 1
  fi
done
if ! grep -q 'vite build "\$CURRENT_ROOT" --mode tauri' "$ROOT/scripts/run-with-mise.sh"; then
  echo "Tauri build does not target the active worktree"
  exit 1
fi
if ! grep -q 'playwright test --config "\$CURRENT_ROOT/playwright.config.ts"' "$ROOT/scripts/run-with-mise.sh"; then
  echo "web smoke does not target the active worktree config"
  exit 1
fi
if ! grep -q "'./scripts/run-with-mise.sh yarn dev" "$ROOT/playwright.config.ts"; then
  echo "Playwright local web server bypasses the worktree-aware command wrapper"
  exit 1
fi
