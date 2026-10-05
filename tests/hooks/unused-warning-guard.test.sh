#!/usr/bin/env bash
# The repo-wide unused-binding guard (#1295, following #1287).
#
# tsconfig.json must enable noUnusedLocals/noUnusedParameters so a newly
# introduced unused binding anywhere in src/** or tests/** fails the canonical
# typecheck (`yarn tsc --noEmit`, used by `yarn build` and `dev.sh typecheck`).
# This proves both the tracked config and tsc's behavior, then runs the real
# repository typecheck so the guard is not vacuous.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
TSCONFIG="$ROOT/tsconfig.json"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -f "$TSCONFIG" ] || fail "0: tsconfig.json is missing"

# 1. The tracked config enables both options.
grep -q '"noUnusedLocals": true' "$TSCONFIG" || fail "1: tsconfig.json must enable noUnusedLocals"
grep -q '"noUnusedParameters": true' "$TSCONFIG" || fail "1: tsconfig.json must enable noUnusedParameters"
echo "ok 1: tsconfig.json enables the repo-wide unused guard"

# 2. tsc really fails on an unused binding and passes a clean fixture.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true
  },
  "include": ["*.ts"]
}
JSON

printf 'const dead = 1;\nexport {};\n' > "$tmp/unused.ts"
STATUS=0
yarn tsc -p "$tmp/tsconfig.json" --pretty false >/dev/null 2>&1 || STATUS=$?
[ "$STATUS" -ne 0 ] || fail "2: an unused local must fail tsc under the guard"
rm -f "$tmp/unused.ts"

printf 'export const used = 1;\n' > "$tmp/clean.ts"
STATUS=0
yarn tsc -p "$tmp/tsconfig.json" --pretty false >/dev/null 2>&1 || STATUS=$?
[ "$STATUS" -eq 0 ] || fail "2: a clean fixture must typecheck under the guard"
echo "ok 2: tsc fails on an unused binding and passes a clean fixture"

# 3. The real repository is clean under the guard.
STATUS=0
yarn tsc --noEmit >/dev/null 2>&1 || STATUS=$?
[ "$STATUS" -eq 0 ] || fail "3: the repository must typecheck clean under the repo-wide guard"
echo "ok 3: real repository passes the repo-wide guard"

echo "ALL PASS"
