#!/usr/bin/env bash
# Follow-up to #1133 (mirrors verify-before-push-stall-retry.test.sh's fixture
# approach): run-ai-long-horizon.sh's own bounded, backed-off retry
# specifically for a STALL (exit 125), discovered while verifying #1122 hit
# the exact same host-contention stall this suite's own wrapper already
# retries around.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-ai-long-horizon.sh"

[ -x "$RUNNER" ] || {
  echo "run-ai-long-horizon.sh is missing or not executable"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
fake_bin="$tmpdir/bin"
command_log="$tmpdir/commands.log"
mkdir -p "$fake_bin" "$tmpdir/scripts"
cp "$RUNNER" "$tmpdir/scripts/run-ai-long-horizon.sh"
cp "$ROOT/scripts/run-under-host-lease.sh" "$tmpdir/scripts/run-under-host-lease.sh"
cp "$ROOT/scripts/host-verification-lease.sh" "$tmpdir/scripts/host-verification-lease.sh"
printf 'export default {};\n' > "$tmpdir/scripts/run-with-timeout.mjs"
# Bypass the real mise/PnP adapter entirely -- a plain passthrough, same role
# verify-before-push.sh's own --no-mise flag plays for its equivalent test.
cat > "$tmpdir/scripts/run-with-mise.sh" <<'EOF'
#!/bin/sh
exec "$@"
EOF
chmod +x "$tmpdir/scripts/run-with-mise.sh"
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

# Returns the Nth value from a space-separated exit-code sequence on the Nth
# call, holding the last value once exhausted -- same convention as
# verify-before-push-stall-retry.test.sh's fake yarn.
cat > "$fake_bin/yarn" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$COMMAND_LOG"
count=$(( $(cat "$CALL_COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$CALL_COUNT_FILE"
status=0
i=0
for s in ${STATUS_SEQUENCE:-0}; do
  i=$((i + 1))
  status="$s"
  [ "$i" -ge "$count" ] && break
done
exit "$status"
EOF

chmod +x "$fake_bin/node" "$fake_bin/yarn"

run_matrix() {
  # $1 = exit-code sequence, $2 = AI_LONG_HORIZON_STALL_MAX_RETRIES (default 2)
  rm -f "$command_log" "$tmpdir/call-count"
  set +e
  (
    cd "$tmpdir"
    PATH="$fake_bin:$PATH" \
      COMMAND_LOG="$command_log" \
      CALL_COUNT_FILE="$tmpdir/call-count" \
      STATUS_SEQUENCE="${1:-0}" \
      AI_LONG_HORIZON_STALL_MAX_RETRIES="${2:-2}" \
      AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS=0 \
      bash scripts/run-ai-long-horizon.sh
  ) >"$tmpdir/stderr.log" 2>&1
  matrix_status=$?
  set -e
}

call_count() { cat "$tmpdir/call-count" 2>/dev/null || echo 0; }

# Scenario 1: stalls once, then the retry succeeds.
run_matrix "125 0"
[ "$matrix_status" -eq 0 ] || {
  echo "scenario 1: expected overall success after one retried stall, got $matrix_status"
  cat "$tmpdir/stderr.log"
  exit 1
}
[ "$(call_count)" -eq 2 ] || {
  echo "scenario 1: expected exactly 2 invocations (1 stall + 1 retry), got $(call_count)"
  exit 1
}
grep -q "stalled (attempt 1/3)" "$tmpdir/stderr.log" || {
  echo "scenario 1: missing the retry/backoff message naming the attempt count"
  cat "$tmpdir/stderr.log"
  exit 1
}

# Scenario 2: stalls on every attempt -- exhausts retries (default max 2 -> 3
# total attempts), fails with the ORIGINAL 125 preserved.
run_matrix "125 125 125"
[ "$matrix_status" -eq 125 ] || {
  echo "scenario 2: expected exit 125 preserved after exhausting retries, got $matrix_status"
  exit 1
}
[ "$(call_count)" -eq 3 ] || {
  echo "scenario 2: expected exactly 3 invocations (1 + 2 retries), got $(call_count)"
  exit 1
}

# Scenario 3: a plain timeout (124) must never retry.
run_matrix "124"
[ "$matrix_status" -eq 124 ] || {
  echo "scenario 3: expected exit 124 (plain timeout) to propagate unretried, got $matrix_status"
  exit 1
}
[ "$(call_count)" -eq 1 ] || {
  echo "scenario 3: a plain timeout (124) was retried -- it must fail immediately, got $(call_count) calls"
  exit 1
}

# Scenario 4: a real failure must never retry either.
run_matrix "9"
[ "$matrix_status" -eq 9 ] || {
  echo "scenario 4: expected exit 9 (real failure) to propagate unretried, got $matrix_status"
  exit 1
}
[ "$(call_count)" -eq 1 ] || {
  echo "scenario 4: a real failure was retried -- it must fail immediately, got $(call_count) calls"
  exit 1
}

echo "all run-ai-long-horizon stall-retry scenarios passed"
