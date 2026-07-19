#!/usr/bin/env bash
# Functional orchestration tests for the canonical push verifier.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERIFIER="$ROOT/scripts/verify-before-push.sh"

[ -x "$VERIFIER" ] || {
  echo "canonical push verifier is missing or not executable"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
fake_bin="$tmpdir/bin"
command_log="$tmpdir/commands.log"
mkdir -p "$fake_bin" "$tmpdir/scripts"
cp "$VERIFIER" "$tmpdir/scripts/verify-before-push.sh"
printf 'export default {};\n' > "$tmpdir/scripts/run-with-timeout.mjs"

cat > "$fake_bin/node" <<'EOF'
#!/bin/sh
shift
shift
shift
[ "$1" = "--" ] || exit 98
shift
exec "$@"
EOF

cat > "$fake_bin/yarn" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$VERIFY_COMMAND_LOG"
case "${1:-}" in
  test|test:fast) exit "${VERIFY_TEST_STATUS:-0}" ;;
  build) exit "${VERIFY_BUILD_STATUS:-0}" ;;
esac
exit 97
EOF
chmod +x "$fake_bin/node" "$fake_bin/yarn"

run_verifier() {
  rm -f "$command_log"
  set +e
  (
    cd "$tmpdir"
    PATH="$fake_bin:$PATH" \
      VERIFY_COMMAND_LOG="$command_log" \
      VERIFY_TEST_STATUS="${1:-0}" \
      VERIFY_BUILD_STATUS="${2:-0}" \
      sh scripts/verify-before-push.sh --no-mise
  ) >/dev/null 2>&1
  verifier_status=$?
  set -e
}

run_verifier 0 0
[ "$verifier_status" -eq 0 ] || {
  echo "canonical verifier rejected passing test/build phases"
  exit 1
}
[ "$(sed -n '1p' "$command_log")" = "test" ] || {
  echo "canonical verifier did not run tests first"
  exit 1
}
[ "$(sed -n '2p' "$command_log")" = "build" ] || {
  echo "canonical verifier did not run build second"
  exit 1
}

run_verifier 9 0
[ "$verifier_status" -eq 9 ] || {
  echo "canonical verifier did not propagate test failure: $verifier_status"
  exit 1
}
[ "$(wc -l < "$command_log" | tr -d ' ')" -eq 1 ] || {
  echo "canonical verifier ran build after tests failed"
  exit 1
}

run_verifier_fast() {
  rm -f "$command_log"
  set +e
  (
    cd "$tmpdir"
    PATH="$fake_bin:$PATH" \
      VERIFY_COMMAND_LOG="$command_log" \
      VERIFY_TEST_STATUS="${1:-0}" \
      VERIFY_BUILD_STATUS="${2:-0}" \
      sh scripts/verify-before-push.sh --no-mise --fast
  ) >/dev/null 2>&1
  verifier_status=$?
  set -e
}

run_verifier_fast 0 0
[ "$verifier_status" -eq 0 ] || {
  echo "canonical verifier --fast rejected passing test/build phases"
  exit 1
}
[ "$(sed -n '1p' "$command_log")" = "test:fast" ] || {
  echo "canonical verifier --fast did not run the fast test suite: got $(sed -n '1p' "$command_log")"
  exit 1
}
[ "$(sed -n '2p' "$command_log")" = "build" ] || {
  echo "canonical verifier --fast did not run build second"
  exit 1
}
