#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
app_path="$root_dir/src-tauri/target/release/bundle/macos/Conquestoria.app"
open_app=1

case "${1:-}" in
  --no-open)
    open_app=0
    ;;
  "")
    ;;
  *)
    echo "Usage: mise run macos:run [--no-open]" >&2
    exit 2
    ;;
esac

cd "$root_dir"

# This task is the human entry point, so it owns its own dependency state. A checkout whose
# generated Yarn PnP map predates package.json, or a linked worktree with no map at all, would
# otherwise fail inside `tsc` with a "cannot find module" that says nothing about the app.
# `--immutable` keeps a real manifest/lockfile disagreement a loud, reviewable failure instead of
# silently rewriting yarn.lock; when they agree this only relinks (well under a second).
printf 'Ensuring this checkout has a current dependency install...\n' >&2
"$root_dir/scripts/run-with-mise.sh" yarn install --immutable

APPLE_SIGNING_IDENTITY=- "$root_dir/scripts/run-with-mise.sh" yarn tauri:build:mac-app
codesign --verify --deep --strict --verbose=2 "$app_path"
xattr -cr "$app_path"

if [ "$open_app" -eq 1 ]; then
  open "$app_path"
else
  echo "Built macOS app: $app_path"
fi
