#!/usr/bin/env bash
# A root dependency's non-optional peer must be provided by the root manifest.
#
# @axe-core/playwright declares `playwright-core` as a peer (>= 1.0.0), but the project only ever
# got it transitively through @playwright/test → playwright (#1459). Every `yarn install` then
# reported YN0002/YN0086, which the macOS run task echoed on every build. This asserts the install
# itself is free of unmet-peer warnings instead of reimplementing Yarn's peer resolution, so any
# unprovided peer anywhere in the graph fails here.
#
# Yarn's own rule is what matters: a peer of a root dependency is provided by the workspace root,
# so this fails until the peer is declared in package.json.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

set +e
output="$(cd "$ROOT" && yarn install --immutable 2>&1)"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  printf '%s\n' "$output" >&2
  echo "yarn install --immutable failed (exit $status)" >&2
  exit 1
fi

if printf '%s' "$output" | grep -Eq 'YN0002|YN0086'; then
  printf '%s\n' "$output" >&2
  echo 'yarn install reported an unmet peer dependency:' >&2
  echo 'declare the peer in package.json so the workspace root provides it,' >&2
  echo 'and use `yarn explain peer-requirements <hash>` to see who asked for it.' >&2
  exit 1
fi
