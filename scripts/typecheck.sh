#!/bin/sh
# Unused-binding-aware typecheck (#1287).
#
# The plain `tsc --noEmit` the build used before cannot see unused imports,
# locals or parameters, so dead test bindings accumulated silently. This wrapper
# runs the project through tsconfig.unused.json (base config plus
# noUnusedLocals/noUnusedParameters) and fails in two cases:
#
#   1. any real (non-unused-binding) diagnostic anywhere -- identical to the
#      plain typecheck the build already enforced, so replacing `tsc` with this
#      script never weakens type checking;
#   2. an unused local/parameter/import/type inside the enforced scope.
#
# Scope is `tests` while the production unused inventory is still being
# classified (#1287 requires a separate src/** follow-up); it widens to `all`
# when that follow-up lands. The only diagnostics treated as "unused" are
# TypeScript's own noUnused codes; every other diagnostic is a real error, so an
# unrecognized new dry-run guard fails closed instead of being ignored.
#
# Usage: scripts/typecheck.sh [tests|src|all]   (default: tests)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SCOPE="${1:-tests}"

case "$SCOPE" in
  tests|src|all) ;;
  *) echo "typecheck: unknown scope '$SCOPE' (expected tests, src or all)" >&2; exit 2 ;;
esac

# TypeScript's noUnused* diagnostic codes: local/parameter (6133), parameter
# property (6138), all imports unused (6192), type-only binding unused (6196),
# all destructured elements unused (6198), all variables unused (6199), all type
# parameters unused (6205).
UNUSED_CODES="TS6133|TS6138|TS6192|TS6196|TS6198|TS6199|TS6205"

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

status=0
yarn tsc --noEmit -p "$ROOT/tsconfig.unused.json" --pretty false >"$OUT" 2>&1 || status=$?

# tsc must have produced at least one TS diagnostic when it failed; a non-zero
# exit with no diagnostic text at all (config load failure, missing binary) is
# an infrastructure error, not a clean tree.
if [ "$status" -ne 0 ] && ! grep -q 'error TS' "$OUT"; then
  cat "$OUT" >&2
  echo "typecheck: tsc exited $status without a TS diagnostic" >&2
  exit 1
fi

# 1. Every diagnostic that is not an unused-binding code is a real type error.
real_errors="$(grep -E 'error TS' "$OUT" | grep -Ev "error ($UNUSED_CODES)" || true)"
if [ -n "$real_errors" ]; then
  printf '%s\n' "$real_errors" >&2
  echo "typecheck: type error(s) above" >&2
  exit 1
fi

# 2. Unused bindings inside the enforced scope only.
case "$SCOPE" in
  tests) scope_pattern='^tests/' ;;
  src) scope_pattern='^src/' ;;
  all) scope_pattern='^(tests|src)/' ;;
esac

unused="$(grep -E "$scope_pattern" "$OUT" | grep -E "error ($UNUSED_CODES)" || true)"
if [ -n "$unused" ]; then
  printf '%s\n' "$unused" >&2
  echo "typecheck: unused $SCOPE binding(s) above (noUnusedLocals/noUnusedParameters)" >&2
  exit 1
fi

exit 0
