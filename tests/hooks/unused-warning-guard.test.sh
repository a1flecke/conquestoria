#!/usr/bin/env bash
# The typecheck unused-binding guard (#1287).
#
# scripts/typecheck.sh must fail on an unused test binding, pass a clean tree,
# ignore unused src bindings while the enforced scope is tests, fail on any real
# type error, and fail closed on an unrecognized tsc failure. The matrix uses a
# fake `yarn` so it needs no real compiler; the final case runs the real guard
# against this repository to prove the wiring (not just the filter logic).
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
TYPECHECK="$ROOT/scripts/typecheck.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -f "$TYPECHECK" ] || fail "0: scripts/typecheck.sh is missing"
[ -f "$ROOT/tsconfig.unused.json" ] || fail "0: tsconfig.unused.json is missing"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat > "$tmp/bin/yarn" <<'FAKE'
#!/bin/sh
if [ -n "${FAKE_TSC_STDERR:-}" ]; then printf '%s\n' "$FAKE_TSC_STDERR" >&2; fi
if [ -n "${FAKE_TSC_OUTPUT:-}" ]; then printf '%s\n' "$FAKE_TSC_OUTPUT"; fi
exit "${FAKE_TSC_EXIT:-0}"
FAKE
chmod +x "$tmp/bin/yarn"

# run_case <scope> <output> <exit>: sets STATUS, OUT, ERR.
run_case() {
  scope="$1"; output="$2"; exit_code="$3"
  STATUS=0
  OUT="$(FAKE_TSC_OUTPUT="$output" FAKE_TSC_EXIT="$exit_code" PATH="$tmp/bin:$PATH" bash "$TYPECHECK" "$scope" 2>"$tmp/err")" || STATUS=$?
  ERR="$(cat "$tmp/err")"
}

# 1. clean tree passes.
run_case tests '' 0
[ "$STATUS" -eq 0 ] || fail "1: clean tree exited $STATUS ($ERR)"
echo "ok 1: clean tree passes"

# 2. unused test local fails.
unused_test="tests/x.test.ts(3,7): error TS6133: 'dead' is declared but its value is never read."
run_case tests "$unused_test" 2
[ "$STATUS" -eq 1 ] || fail "2: unused test local exited $STATUS ($ERR)"
printf '%s' "$ERR" | grep -q 'TS6133' || fail "2: unused diagnostic not printed: $ERR"
printf '%s' "$ERR" | grep -q 'unused tests' || fail "2: scope message missing: $ERR"
echo "ok 2: unused test binding fails"

# 3. unused test import (TS6192) fails.
run_case tests "tests/y.test.ts(1,1): error TS6192: All imports in import declaration are unused." 2
[ "$STATUS" -eq 1 ] || fail "3: unused import exited $STATUS ($ERR)"
echo "ok 3: unused test import fails"

# 4. unused src binding is ignored while scope is tests.
src_unused="src/foo.ts(1,1): error TS6133: 'x' is declared but its value is never read."
run_case tests "$src_unused" 2
[ "$STATUS" -eq 0 ] || fail "4: src unused under scope tests exited $STATUS ($ERR)"
echo "ok 4: src unused ignored under scope tests"

# 5. the same src binding fails under scope all and src.
run_case all "$src_unused" 2
[ "$STATUS" -eq 1 ] || fail "5: src unused under scope all exited $STATUS"
run_case src "$src_unused" 2
[ "$STATUS" -eq 1 ] || fail "5: src unused under scope src exited $STATUS"
echo "ok 5: src unused enforced under src/all scope"

# 6. a tests unused line is ignored under scope src.
run_case src "$unused_test" 2
[ "$STATUS" -eq 0 ] || fail "6: tests unused under scope src exited $STATUS"
echo "ok 6: tests unused ignored under scope src"

# 7. a real type error always fails, even outside the scope.
real="src/foo.ts(9,1): error TS2322: Type 'string' is not assignable to type 'number'."
run_case tests "$real" 2
[ "$STATUS" -eq 1 ] || fail "7: real src type error exited $STATUS"
printf '%s' "$ERR" | grep -q 'TS2322' || fail "7: real error not printed: $ERR"
echo "ok 7: real type errors fail in every scope"

# 8. mixed: a real error plus an out-of-scope unused still fails.
run_case tests "$real
$src_unused" 2
[ "$STATUS" -eq 1 ] || fail "8: mixed diagnostics exited $STATUS"
echo "ok 8: real error wins over out-of-scope unused"

# 9. invalid scope fails closed.
STATUS=0
PATH="$tmp/bin:$PATH" bash "$TYPECHECK" bogus >/dev/null 2>"$tmp/err" || STATUS=$?
[ "$STATUS" -eq 2 ] || fail "9: invalid scope exited $STATUS"
grep -q 'unknown scope' "$tmp/err" || fail "9: invalid scope message missing"
echo "ok 9: invalid scope exits 2"

# 10. tsc failing with no TS diagnostic fails closed.
run_case tests '' 1
[ "$STATUS" -eq 1 ] || fail "10: silent tsc failure exited $STATUS"
printf '%s' "$ERR" | grep -q 'without a TS diagnostic' || fail "10: fail-closed message missing: $ERR"
echo "ok 10: silent tsc failure fails closed"

# 11. real repository: the tests scope is currently clean.
STATUS=0
bash "$TYPECHECK" tests >/dev/null 2>"$tmp/err" || STATUS=$?
[ "$STATUS" -eq 0 ] || { cat "$tmp/err" >&2; fail "11: real repo tests-scope guard exited $STATUS"; }
echo "ok 11: real repository passes the tests-scope guard"

echo "ALL PASS"
