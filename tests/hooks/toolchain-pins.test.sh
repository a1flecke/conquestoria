#!/usr/bin/env bash
# Keep mise's Yarn runtime aligned with the package-manager contract.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
package_yarn="$(sed -n 's/^[[:space:]]*"packageManager":[[:space:]]*"yarn@\([^"]*\)",*$/\1/p' "$ROOT/package.json")"
mise_yarn="$(sed -n 's/^yarn = "\([^"]*\)"/\1/p' "$ROOT/mise.toml")"

[ -n "$package_yarn" ] || {
  echo "package.json does not pin Yarn"
  exit 1
}
[ -n "$mise_yarn" ] || {
  echo "mise.toml does not pin Yarn"
  exit 1
}

[ "$mise_yarn" = "$package_yarn" ] || {
  echo "Yarn version mismatch: mise=$mise_yarn packageManager=$package_yarn"
  exit 1
}
