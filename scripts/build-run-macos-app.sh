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

APPLE_SIGNING_IDENTITY=- yarn tauri:build:mac-app
codesign --verify --deep --strict --verbose=2 "$app_path"
xattr -cr "$app_path"

if [ "$open_app" -eq 1 ]; then
  open "$app_path"
else
  echo "Built macOS app: $app_path"
fi
