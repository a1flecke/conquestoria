#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/with-verification-lock.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

lock_dir="$tmpdir/verification.lock"
started="$tmpdir/started"
second_marker="$tmpdir/second-ran"

CONQUESTORIA_VERIFICATION_LOCK_DIR="$lock_dir" \
  "$RUNNER" sh -c 'touch "$1"; sleep 2' -- "$started" &
owner_pid=$!

for _ in {1..40}; do
  [ -f "$started" ] && break
  sleep 0.05
done

[ -f "$started" ] || {
  echo "verification lock owner did not start"
  exit 1
}

set +e
blocked_output="$(CONQUESTORIA_VERIFICATION_LOCK_DIR="$lock_dir" \
  "$RUNNER" sh -c 'touch "$1"' -- "$second_marker" 2>&1)"
blocked_status=$?
set -e

[ "$blocked_status" -eq 75 ] || {
  echo "expected concurrent verification to fail with 75, got $blocked_status"
  exit 1
}
[ ! -e "$second_marker" ] || {
  echo "concurrent verification ran despite the lock"
  exit 1
}
[[ "$blocked_output" == *"already running"* ]] || {
  echo "concurrent verification did not explain the active lock"
  exit 1
}

wait "$owner_pid"

mkdir "$lock_dir"
printf '%s\n' 999999 > "$lock_dir/pid"
CONQUESTORIA_VERIFICATION_LOCK_DIR="$lock_dir" \
  "$RUNNER" sh -c 'touch "$1"' -- "$second_marker"

[ -f "$second_marker" ] || {
  echo "stale verification lock was not reclaimed"
  exit 1
}
