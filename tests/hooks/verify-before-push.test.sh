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
cp "$ROOT/scripts/host-verification-lease.sh" "$tmpdir/scripts/host-verification-lease.sh"
printf 'export default {};\n' > "$tmpdir/scripts/run-with-timeout.mjs"
# Isolate the host-wide verification lease from the real one for this
# machine (Phase 6 testability): verify-before-push.sh now acquires it
# around its test+build phases.
export HOST_VERIFICATION_LEASE_ROOT="$tmpdir/host-lease-root"

cat > "$fake_bin/node" <<'EOF'
#!/bin/sh
# run-with-timeout.mjs <runner> <seconds> <label> -- cmd...; record "<label> <seconds>" for the ceiling test below
[ -z "${VERIFY_TIMEOUT_LOG:-}" ] || printf '%s|%s\n' "$3" "$2" >> "$VERIFY_TIMEOUT_LOG"
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
  test|test:regular) exit "${VERIFY_TEST_STATUS:-0}" ;;
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

# #1166: the phase ceilings are runaway guards (the stall watchdog catches hangs), wide enough that a healthy
# run under permitted contention is never failed for being slow; both stay env-overridable.
timeout_log="$tmpdir/timeouts.log"
rm -f "$timeout_log"
(
  cd "$tmpdir"
  PATH="$fake_bin:$PATH" VERIFY_COMMAND_LOG="$tmpdir/ceiling-commands.log" VERIFY_TIMEOUT_LOG="$timeout_log" \
    sh scripts/verify-before-push.sh --no-mise
) >/dev/null 2>&1
[ "$(grep '^test suite|' "$timeout_log" | cut -d'|' -f2)" = "1200" ] || { echo "default test-phase ceiling is not 1200s: $(cat "$timeout_log")"; exit 1; }
[ "$(grep '^production build|' "$timeout_log" | cut -d'|' -f2)" = "600" ] || { echo "default build-phase ceiling is not 600s: $(cat "$timeout_log")"; exit 1; }
rm -f "$timeout_log"
(
  cd "$tmpdir"
  PATH="$fake_bin:$PATH" VERIFY_COMMAND_LOG="$tmpdir/ceiling-commands.log" VERIFY_TIMEOUT_LOG="$timeout_log" \
    VERIFY_TEST_TIMEOUT_SECONDS=17 VERIFY_BUILD_TIMEOUT_SECONDS=9 sh scripts/verify-before-push.sh --no-mise
) >/dev/null 2>&1
grep -q '^test suite|17$' "$timeout_log" && grep -q '^production build|9$' "$timeout_log" \
  || { echo "VERIFY_*_TIMEOUT_SECONDS overrides were not honoured: $(cat "$timeout_log")"; exit 1; }

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

run_regular_verifier() {
  rm -f "$command_log"
  set +e
  (
    cd "$tmpdir"
    PATH="$fake_bin:$PATH" \
      VERIFY_COMMAND_LOG="$command_log" \
      VERIFY_TEST_STATUS="${1:-0}" \
      VERIFY_BUILD_STATUS="${2:-0}" \
      sh scripts/verify-before-push.sh --no-mise --regular
  ) >/dev/null 2>&1
  verifier_status=$?
  set -e
}

run_regular_verifier 0 0
[ "$verifier_status" -eq 0 ] || {
  echo "canonical verifier --regular rejected passing test/build phases"
  exit 1
}
[ "$(sed -n '1p' "$command_log")" = "test:regular" ] || {
  echo "canonical verifier --regular did not run the regular test suite: got $(sed -n '1p' "$command_log")"
  exit 1
}
[ "$(sed -n '2p' "$command_log")" = "build" ] || {
  echo "canonical verifier --regular did not run build second"
  exit 1
}
