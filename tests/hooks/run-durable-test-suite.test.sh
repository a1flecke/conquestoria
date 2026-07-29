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
repo="$tmpdir/worktree-a"
mkdir -p "$repo/scripts"
cp "$RUNNER" "$READER" "$repo/scripts/"
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
