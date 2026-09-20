#!/usr/bin/env bash
# Follow-up to #1133: run_phase's own bounded, backed-off retry specifically
# for a STALL (exit 125 from run-with-timeout.mjs's zero-CPU-progress
# watchdog) -- distinct from the orchestration-only tests in
# verify-before-push.test.sh, which never exercise a non-zero exit at all.

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
export HOST_VERIFICATION_LEASE_ROOT="$tmpdir/host-lease-root"

cat > "$fake_bin/node" <<'EOF'
#!/bin/sh
shift
shift
shift
[ "$1" = "--" ] || exit 98
shift
exec "$@"
EOF

# Unlike verify-before-push.test.sh's fixed-exit-code fake, this one returns
# the Nth value from a space-separated exit-code sequence on the Nth call for
# that phase (holding the last value once the sequence is exhausted), so a
# single test run can simulate "stalled once, then recovered."
cat > "$fake_bin/yarn" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$VERIFY_COMMAND_LOG"
case "${1:-}" in
  test|test:regular) seq="${VERIFY_TEST_STATUS_SEQUENCE:-0}"; counter_file="$VERIFY_TEST_CALL_COUNT" ;;
  build) seq="${VERIFY_BUILD_STATUS_SEQUENCE:-0}"; counter_file="$VERIFY_BUILD_CALL_COUNT" ;;
  *) exit 97 ;;
esac
count=$(( $(cat "$counter_file" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$counter_file"
status=0
i=0
for s in $seq; do
  i=$((i + 1))
  status="$s"
  [ "$i" -ge "$count" ] && break
done
exit "$status"
EOF

chmod +x "$fake_bin/node" "$fake_bin/yarn"

run_verifier() {
  # $1 = test-phase exit-code sequence, $2 = build-phase exit-code sequence,
  # $3 = VERIFY_STALL_MAX_RETRIES (default 2)
  rm -f "$command_log" "$tmpdir/test-calls" "$tmpdir/build-calls"
  set +e
  (
    cd "$tmpdir"
    PATH="$fake_bin:$PATH" \
      VERIFY_COMMAND_LOG="$command_log" \
      VERIFY_TEST_STATUS_SEQUENCE="${1:-0}" \
      VERIFY_BUILD_STATUS_SEQUENCE="${2:-0}" \
      VERIFY_TEST_CALL_COUNT="$tmpdir/test-calls" \
      VERIFY_BUILD_CALL_COUNT="$tmpdir/build-calls" \
      VERIFY_STALL_MAX_RETRIES="${3:-2}" \
      VERIFY_STALL_RETRY_BACKOFF_SECONDS=0 \
      sh scripts/verify-before-push.sh --no-mise
  ) >"$tmpdir/stderr.log" 2>&1
  verifier_status=$?
  set -e
}

test_calls() { cat "$tmpdir/test-calls" 2>/dev/null || echo 0; }
build_calls() { cat "$tmpdir/build-calls" 2>/dev/null || echo 0; }

# Scenario 1: stalls once, then the retry succeeds -- overall pass, build
# still runs, exactly 2 test-phase invocations recorded.
run_verifier "125 0" "0"
[ "$verifier_status" -eq 0 ] || {
  echo "scenario 1: expected overall success after one retried stall, got $verifier_status"
  cat "$tmpdir/stderr.log"
  exit 1
}
[ "$(test_calls)" -eq 2 ] || {
  echo "scenario 1: expected exactly 2 test-phase invocations (1 stall + 1 retry), got $(test_calls)"
  exit 1
}
[ "$(build_calls)" -eq 1 ] || {
  echo "scenario 1: build phase did not run after the retried test phase succeeded"
  exit 1
}
grep -q "stalled (attempt 1/3)" "$tmpdir/stderr.log" || {
  echo "scenario 1: missing the retry/backoff message naming the attempt count"
  cat "$tmpdir/stderr.log"
  exit 1
}

# Scenario 2: stalls on every attempt -- exhausts retries (default max 2 ->
# 3 total attempts), fails with the ORIGINAL 125 exit code preserved (so a
# caller can still tell "gave up after repeated stall" from a real failure),
# and never reaches the build phase.
run_verifier "125 125 125" "0"
[ "$verifier_status" -eq 125 ] || {
  echo "scenario 2: expected exit 125 preserved after exhausting retries, got $verifier_status"
  exit 1
}
[ "$(test_calls)" -eq 3 ] || {
  echo "scenario 2: expected exactly 3 test-phase invocations (1 + 2 retries), got $(test_calls)"
  exit 1
}
[ "$(build_calls)" -eq 0 ] || {
  echo "scenario 2: build phase ran despite the test phase never succeeding"
  exit 1
}

# Scenario 3: a plain timeout (124 -- genuinely slow work, not a stall) must
# never retry. Exactly 1 invocation, exit code 124 preserved.
run_verifier "124" "0"
[ "$verifier_status" -eq 124 ] || {
  echo "scenario 3: expected exit 124 (plain timeout) to propagate unretried, got $verifier_status"
  exit 1
}
[ "$(test_calls)" -eq 1 ] || {
  echo "scenario 3: a plain timeout (124) was retried -- it must fail immediately, got $(test_calls) calls"
  exit 1
}

# Scenario 4: a real test failure (a normal non-zero exit unrelated to the
# stall watchdog) must never retry either -- retrying a genuine failure
# wastes time and risks hiding a flake as "fixed."
run_verifier "9" "0"
[ "$verifier_status" -eq 9 ] || {
  echo "scenario 4: expected exit 9 (real failure) to propagate unretried, got $verifier_status"
  exit 1
}
[ "$(test_calls)" -eq 1 ] || {
  echo "scenario 4: a real test failure was retried -- it must fail immediately, got $(test_calls) calls"
  exit 1
}

# Scenario 5: VERIFY_STALL_MAX_RETRIES=0 disables retrying entirely -- a
# single stall fails immediately with exit 125, no retry attempted.
run_verifier "125" "0" 0
[ "$verifier_status" -eq 125 ] || {
  echo "scenario 5: expected exit 125 with retries disabled, got $verifier_status"
  exit 1
}
[ "$(test_calls)" -eq 1 ] || {
  echo "scenario 5: VERIFY_STALL_MAX_RETRIES=0 did not disable retrying, got $(test_calls) calls"
  exit 1
}

# Scenario 6: a stall in the BUILD phase (after the test phase already
# passed) retries independently, using its own attempt counter -- the test
# phase's own (already-successful, single-call) counter must not leak into
# it.
run_verifier "0" "125 0"
[ "$verifier_status" -eq 0 ] || {
  echo "scenario 6: expected overall success after the build phase's stall retried, got $verifier_status"
  cat "$tmpdir/stderr.log"
  exit 1
}
[ "$(test_calls)" -eq 1 ] || {
  echo "scenario 6: test phase should have run exactly once, got $(test_calls)"
  exit 1
}
[ "$(build_calls)" -eq 2 ] || {
  echo "scenario 6: expected exactly 2 build-phase invocations (1 stall + 1 retry), got $(build_calls)"
  exit 1
}

echo "all verify-before-push stall-retry scenarios passed"
