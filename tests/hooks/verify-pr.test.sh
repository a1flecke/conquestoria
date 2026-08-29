#!/usr/bin/env bash
# Smoke test the durable PR verifier without running the real build or suite.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERIFY="$ROOT/scripts/verify-pr.sh"
STATUS="$ROOT/scripts/read-pr-verification-result.sh"
[ -x "$VERIFY" ] || {
  echo "verify-pr.sh is missing or not executable"
  exit 1
}
[ -x "$STATUS" ] || {
  echo "read-pr-verification-result.sh is missing or not executable"
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat > "$tmp/bin/yarn" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$VERIFY_PR_CALL_LOG"
EOF
chmod +x "$tmp/bin/yarn"

cat > "$tmp/bin/date" <<'EOF'
#!/bin/sh
state="$VERIFY_PR_DATE_STATE"
count=0
[ -f "$state" ] && count="$(cat "$state")"
count=$((count + 1))
printf '%s' "$count" > "$state"
case "$count" in
  1) printf '%s\n' "${VERIFY_PR_START_SECONDS:-0}" ;;
  *) printf '%s\n' "${VERIFY_PR_END_SECONDS:-1}" ;;
esac
EOF
chmod +x "$tmp/bin/date"

# Isolate the host-wide verification lease from the real one for this
# machine (Phase 6 testability): verify-pr.sh's build call now acquires it.
lease_root="$tmp/host-lease-root"

call_log="$tmp/calls"
date_state="$tmp/date-state"
PATH="$tmp/bin:$PATH" \
  VERIFY_PR_CALL_LOG="$call_log" \
  VERIFY_PR_DATE_STATE="$date_state" \
  VERIFY_PR_ARTIFACT_DIR="$tmp/artifacts" \
  VERIFY_PR_START_SECONDS=0 \
  VERIFY_PR_END_SECONDS=479 \
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
  sh "$VERIFY" > "$tmp/success.out"

printf '%s\n' build test:durable test:durable:status > "$tmp/expected-calls"
cmp "$tmp/expected-calls" "$call_log" || {
  echo "verify-pr.sh did not run build, durable suite, then status in order"
  exit 1
}
grep -Fq 'PR verification passed in 479s' "$tmp/success.out" || {
  echo "verify-pr.sh did not report its elapsed time"
  exit 1
}
VERIFY_PR_ARTIFACT_DIR="$tmp/artifacts" sh "$STATUS" > "$tmp/status.out"
grep -Fq 'PR verification passed for' "$tmp/status.out" || {
  echo "PR verification status reader did not accept the fresh result"
  exit 1
}

: > "$call_log"
: > "$date_state"
set +e
PATH="$tmp/bin:$PATH" \
  VERIFY_PR_CALL_LOG="$call_log" \
  VERIFY_PR_DATE_STATE="$date_state" \
  VERIFY_PR_ARTIFACT_DIR="$tmp/artifacts" \
  VERIFY_PR_START_SECONDS=0 \
  VERIFY_PR_END_SECONDS=481 \
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
  sh "$VERIFY" > "$tmp/slow.out" 2>&1
slow_status=$?
set -e
[ "$slow_status" -ne 0 ] || {
  echo "verify-pr.sh accepted a suite exceeding eight minutes"
  exit 1
}
grep -Fq 'exceeded the 480s ceiling' "$tmp/slow.out" || {
  echo "verify-pr.sh did not explain the eight-minute failure"
  exit 1
}
set +e
VERIFY_PR_ARTIFACT_DIR="$tmp/artifacts" sh "$STATUS" > "$tmp/slow-status.out" 2>&1
status_reader_exit=$?
set -e
[ "$status_reader_exit" -ne 0 ] || {
  echo "PR verification status reader accepted an over-budget result"
  exit 1
}
