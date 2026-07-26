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

# A live old-format directory must remain respected during the migration; once
# its owner exits, the new file lock can replace it without manual cleanup.
legacy_lock="$tmpdir/legacy-verification.lock"
legacy_marker="$tmpdir/legacy-ran"
sleep 1 &
legacy_owner_pid=$!
mkdir "$legacy_lock"
printf '%s\n' "$legacy_owner_pid" > "$legacy_lock/pid"
printf '%s\n' 'legacy verification' > "$legacy_lock/command"

CONQUESTORIA_VERIFICATION_LOCK_DIR="$legacy_lock" \
  "$RUNNER" sh -c 'touch "$1"' -- "$legacy_marker" > "$tmpdir/legacy-output" 2>&1 &
legacy_queued_pid=$!

sleep 0.1
[ ! -e "$legacy_marker" ] || {
  echo "migration ignored a live legacy verification owner"
  exit 1
}

wait "$legacy_owner_pid"
wait "$legacy_queued_pid"

[ -f "$legacy_marker" ] || {
  echo "migration did not run after the legacy owner completed"
  exit 1
}
[ -f "$legacy_lock" ] || {
  echo "migration did not replace the old lock directory with a file"
  exit 1
}
grep -q 'Queued behind legacy active verification' "$tmpdir/legacy-output" || {
  echo "migration did not report its legacy wait"
  exit 1
}
