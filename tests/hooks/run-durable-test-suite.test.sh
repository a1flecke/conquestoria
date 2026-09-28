#!/usr/bin/env bash
# Contract tests for worktree-local durable full-suite evidence.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-durable-test-suite.sh"
READER="$ROOT/scripts/read-durable-test-result.sh"

[ -x "$RUNNER" ] || {
  echo "durable test runner is missing or not executable" >&2
  exit 1
}
[ -x "$READER" ] || {
  echo "durable test-result reader is missing or not executable" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
# Isolate the host-wide verification lease from the real one for this
# machine (Phase 6 testability): every run-durable-test-suite.sh
# invocation below now acquires it internally, so it must never touch real
# host state.
export HOST_VERIFICATION_LEASE_ROOT="$tmpdir/host-lease-root"
repo="$tmpdir/worktree-a"
mkdir -p "$repo/scripts"
cp "$RUNNER" "$READER" "$ROOT/scripts/host-verification-lease.sh" "$ROOT/scripts/run-under-host-lease.sh" "$repo/scripts/"
cp "$ROOT/.gitignore" "$repo/.gitignore"

git -C "$repo" init -q
git -C "$repo" config user.email durable-test@example.invalid
git -C "$repo" config user.name durable-test
touch "$repo/initial"
git -C "$repo" add initial .gitignore
git -C "$repo" commit -qm initial
git -C "$repo" add scripts
git -C "$repo" commit -qm runner

mkdir -p "$repo/.verification"
printf 'old log\n' > "$repo/.verification/full-suite.log"
printf 'exit_code=0\n' > "$repo/.verification/full-suite.status"
mkdir "$repo/.verification/full-suite.lock"
printf 'pid=999999\n' > "$repo/.verification/full-suite.lock/pid"

(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'printf "fresh output\\n"; exit 0'
)

grep -Fxq 'fresh output' "$repo/.verification/full-suite.log" || {
  echo "durable runner did not replace a stale log" >&2
  exit 1
}
grep -Fxq 'exit_code=0' "$repo/.verification/full-suite.status" || {
  echo "durable runner did not persist a successful status" >&2
  exit 1
}
grep -Fxq 'failure_kind=none' "$repo/.verification/full-suite.status" || {
  echo "durable runner did not classify a successful run" >&2
  exit 1
}
[ ! -d "$repo/.verification/full-suite.lock" ] || {
  echo "durable runner did not clean a stale lock" >&2
  exit 1
}
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) >/dev/null

set +e
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'exit 7'
) >/dev/null 2>&1
failure_status=$?
set -e
[ "$failure_status" -eq 7 ] || {
  echo "durable runner did not preserve a test failure: $failure_status" >&2
  exit 1
}
grep -Fxq 'exit_code=7' "$repo/.verification/full-suite.status" || {
  echo "durable runner did not persist a failing status" >&2
  exit 1
}
grep -Fxq 'failure_kind=command-failed' "$repo/.verification/full-suite.status" || {
  echo "durable runner did not classify a generic command failure" >&2
  exit 1
}
set +e
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) >/dev/null 2>&1
reader_failure_status=$?
set -e
[ "$reader_failure_status" -eq 1 ] || {
  echo "durable reader accepted a failed test result: $reader_failure_status" >&2
  exit 1
}

printf 'pid=%s\nworktree=%s\n' "$$" "$repo" > "$repo/.verification/full-suite.running"
set +e
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'exit 0'
) >/dev/null 2>&1
active_status=$?
set -e
[ "$active_status" -eq 1 ] || {
  echo "durable runner replaced a live run marker: $active_status" >&2
  exit 1
}
set +e
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) >/dev/null 2>&1
active_reader_status=$?
set -e
[ "$active_reader_status" -eq 3 ] || {
  echo "durable reader did not report an active run: $active_reader_status" >&2
  exit 1
}
rm -f "$repo/.verification/full-suite.running"

mkdir "$repo/.verification/full-suite.lock"
printf 'pid=%s\n' "$$" > "$repo/.verification/full-suite.lock/pid"
set +e
(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'exit 0'
) >/dev/null 2>&1
lock_status=$?
set -e
[ "$lock_status" -eq 1 ] || {
  echo "durable runner started while another runner held the worktree lock: $lock_status" >&2
  exit 1
}
rm -f "$repo/.verification/full-suite.lock/pid"
rmdir "$repo/.verification/full-suite.lock"

(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'exit 0'
) >/dev/null
printf 'uncommitted change\n' >> "$repo/initial"
set +e
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) >/dev/null 2>&1
dirty_status=$?
set -e
[ "$dirty_status" -eq 1 ] || {
  echo "durable reader accepted evidence after an uncommitted change: $dirty_status" >&2
  exit 1
}
git -C "$repo" checkout -- initial
touch "$repo/next"
git -C "$repo" add next
git -C "$repo" commit -qm next
set +e
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) >/dev/null 2>&1
stale_status=$?
set -e
[ "$stale_status" -eq 1 ] || {
  echo "durable reader accepted evidence from another HEAD: $stale_status" >&2
  exit 1
}

repo_b="$tmpdir/worktree-b"
git -C "$repo" worktree add -qb durable-sibling "$repo_b"
(
  cd "$repo_b"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'exit 0'
) >/dev/null
[ -f "$repo/.verification/full-suite.status" ] && [ -f "$repo_b/.verification/full-suite.status" ] || {
  echo "separate worktrees did not retain independent durable artifacts" >&2
  exit 1
}

# A catchable cancellation is terminal evidence, not an abandoned marker.
rm -rf "$repo/.verification"
(
  cd "$repo"
  exec > "$tmpdir/cancelled-run.log" 2>&1
  exec sh scripts/run-durable-test-suite.sh cancelled-scope --no-lease -- sleep 30
) &
cancelled_wrapper_pid=$!

attempts=0
while [ ! -s "$repo/.verification/cancelled-scope-suite.running" ] || [ ! -s "$repo/.verification/cancelled-scope-suite.job-pid" ]; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || {
    echo "durable cancellation fixture never recorded its supervisor and job" >&2
    cat "$tmpdir/cancelled-run.log" >&2
    exit 1
  }
  sleep 0.1
done

cancelled_supervisor_pid="$(sed -n 's/^pid=//p' "$repo/.verification/cancelled-scope-suite.running" | head -n 1)"
cancelled_job_pid="$(cat "$repo/.verification/cancelled-scope-suite.job-pid")"
kill -TERM "$cancelled_supervisor_pid"

# The supervisor must forward the signal to its registered child instead of
# leaving an orphaned test process behind.
attempts=0
while kill -0 "$cancelled_supervisor_pid" 2>/dev/null; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || {
    echo "durable cancellation supervisor did not terminate" >&2
    exit 1
  }
  sleep 0.1
done
attempts=0
while kill -0 "$cancelled_job_pid" 2>/dev/null; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 100 ]; then
    kill -TERM "$cancelled_job_pid" 2>/dev/null || true
    echo "durable cancellation left the registered job running" >&2
    exit 1
  fi
  sleep 0.1
done

set +e
wait "$cancelled_wrapper_pid"
cancelled_runner_status=$?
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh cancelled-scope
) > "$tmpdir/cancelled-read.log" 2>&1
cancelled_reader_status=$?
set -e

[ "$cancelled_runner_status" -eq 143 ] || {
  echo "durable cancellation did not preserve TERM exit status: $cancelled_runner_status" >&2
  cat "$tmpdir/cancelled-run.log" >&2
  exit 1
}
[ "$cancelled_reader_status" -eq 1 ] || {
  echo "durable cancellation did not record a terminal failed result: $cancelled_reader_status" >&2
  cat "$tmpdir/cancelled-read.log" >&2
  exit 1
}
grep -Fq 'was cancelled by TERM' "$tmpdir/cancelled-read.log" || {
  echo "durable reader did not explain the cancellation signal" >&2
  cat "$tmpdir/cancelled-read.log" >&2
  exit 1
}
grep -Fxq 'failure_kind=cancelled' "$repo/.verification/cancelled-scope-suite.status" || {
  echo "durable cancellation was not classified as cancelled" >&2
  cat "$repo/.verification/cancelled-scope-suite.status" >&2
  exit 1
}
grep -Fxq 'completion_reason=signal' "$repo/.verification/cancelled-scope-suite.status" || {
  echo "durable cancellation did not record the signal completion reason" >&2
  cat "$repo/.verification/cancelled-scope-suite.status" >&2
  exit 1
}
grep -Fxq 'termination_signal=TERM' "$repo/.verification/cancelled-scope-suite.status" || {
  echo "durable cancellation did not record the received signal" >&2
  cat "$repo/.verification/cancelled-scope-suite.status" >&2
  exit 1
}
grep -Fq 'DURABLE CANCELLATION: received signal=TERM' "$repo/.verification/cancelled-scope-suite.log" || {
  echo "durable cancellation log did not record the received signal" >&2
  cat "$repo/.verification/cancelled-scope-suite.log" >&2
  exit 1
}
grep -Fq 'DURABLE CANCELLATION: terminal status recorded signal=TERM' "$repo/.verification/cancelled-scope-suite.log" || {
  echo "durable cancellation log did not record durable terminal evidence" >&2
  cat "$repo/.verification/cancelled-scope-suite.log" >&2
  exit 1
}
grep -Fq 'DURABLE CANCELLATION: cleanup completed signal=TERM' "$repo/.verification/cancelled-scope-suite.log" || {
  echo "durable cancellation log did not record cleanup completion" >&2
  cat "$repo/.verification/cancelled-scope-suite.log" >&2
  exit 1
}
[ ! -e "$repo/.verification/cancelled-scope-suite.running" ] || {
  echo "durable cancellation left a stale running marker" >&2
  exit 1
}
[ ! -e "$repo/.verification/cancelled-scope-suite.job-pid" ] || {
  echo "durable cancellation left a stale job pid" >&2
  exit 1
}
