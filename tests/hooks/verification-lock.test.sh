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
CONQUESTORIA_VERIFICATION_LOCK_DIR="$lock_dir" \
  "$RUNNER" sh -c 'touch "$1"' -- "$second_marker" > "$tmpdir/second-output" 2>&1 &
queued_pid=$!
set -e

[ ! -e "$second_marker" ] || {
  echo "queued verification ran while the lock owner was still active"
  exit 1
}

wait "$owner_pid"
wait "$queued_pid"

[ -f "$second_marker" ] || {
  echo "queued verification did not run after the owner completed"
  exit 1
}
grep -q 'Queued behind active verification' "$tmpdir/second-output" || {
  echo "queued verification did not report its wait"
  exit 1
}
