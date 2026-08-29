#!/bin/sh
# Run a test command with worktree-local, durable evidence for agent workflows.

set -eu

usage() {
  echo 'Usage: run-durable-test-suite.sh <scope> -- <test command> [arguments...]' >&2
  exit 2
}

scope="${1:-}"
[ "$#" -ge 3 ] && [ "${2:-}" = '--' ] || usage
case "$scope" in
  ''|*[!a-z0-9_-]*) usage ;;
esac
shift 2

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
artifact_dir="$repo_root/.verification"
prefix="$artifact_dir/${scope}-suite"
lock_dir="$prefix.lock"
running="$prefix.running"
log="$prefix.log"
status="$prefix.status"
status_tmp="$status.tmp.$$"
failure_kind_file="$prefix.failure-kind"
head_sha="$(git -C "$repo_root" rev-parse HEAD)"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

mkdir -p "$artifact_dir"

release_lock() {
  rm -f "$lock_dir/pid"
  rmdir "$lock_dir" 2>/dev/null || true
}

acquire_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    printf 'pid=%s\n' "$$" > "$lock_dir/pid"
    return
  fi

  lock_pid="$(sed -n 's/^pid=//p' "$lock_dir/pid" 2>/dev/null | head -n 1)"
  if [ -z "$lock_pid" ] || kill -0 "$lock_pid" 2>/dev/null; then
    echo "A durable $scope test run is already active or establishing its lock in this worktree; inspect $lock_dir." >&2
    exit 1
  fi

  rm -f "$lock_dir/pid"
  if ! rmdir "$lock_dir" 2>/dev/null || ! mkdir "$lock_dir" 2>/dev/null; then
    echo "Unable to replace stale durable $scope lock at $lock_dir." >&2
    exit 1
  fi
  printf 'pid=%s\n' "$$" > "$lock_dir/pid"
}

worktree_state() {
  git -C "$repo_root" status --porcelain=v1 --untracked-files=all | cksum | awk '{print $1 "-" $2}'
}

acquire_lock

if [ -f "$running" ]; then
  running_pid="$(sed -n 's/^pid=//p' "$running" | head -n 1)"
  if [ -n "$running_pid" ] && kill -0 "$running_pid" 2>/dev/null; then
    echo "A durable $scope test run is already active in this worktree; inspect $running or $log." >&2
    release_lock
    exit 1
  fi
fi

# Finished and abandoned artifacts cannot be evidence for the run about to
# start. A live marker is handled above before anything is removed.
rm -f "$running" "$log" "$status" "$status_tmp" "$failure_kind_file"
initial_worktree_state="$(worktree_state)"
printf 'pid=%s\nworktree=%s\nhead=%s\nstarted_at=%s\n' \
  "$$" "$repo_root" "$head_sha" "$started_at" > "$running"

finish() {
  exit_code="$1"
  completed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  failure_kind='none'
  if [ "$exit_code" -ne 0 ]; then
    failure_kind="$(sed -n '1p' "$failure_kind_file" 2>/dev/null || true)"
    case "$failure_kind" in
      product-test|hook-test|build|timeout|runner-infrastructure|cancelled) ;;
      *) failure_kind='command-failed' ;;
    esac
  fi
  {
    printf 'scope=%s\n' "$scope"
    printf 'worktree=%s\n' "$repo_root"
    printf 'head=%s\n' "$head_sha"
    printf 'worktree_state=%s\n' "$initial_worktree_state"
    printf 'started_at=%s\n' "$started_at"
    printf 'completed_at=%s\n' "$completed_at"
    printf 'exit_code=%s\n' "$exit_code"
    printf 'failure_kind=%s\n' "$failure_kind"
  } > "$status_tmp"
  mv "$status_tmp" "$status"
  rm -f "$running"
}

on_exit() {
  exit_code="$?"
  finish "$exit_code"
  release_lock
}
trap on_exit EXIT

# Lock order: the worktree-local durable lock above is always acquired
# before the host-wide verification lease below -- this is the one
# caller in the repo that acquires both, and it always does so in this
# order, so there is no inversion risk with any other caller (see
# ".claude/rules/hooks-and-tooling.md" -> "Host verification lease").
# The host lease serializes actually running the heavyweight suite across
# every worktree on this machine; it does not touch this worktree's
# `.verification/` evidence directory or lock at all.
if DURABLE_FAILURE_KIND_FILE="$failure_kind_file" \
  sh "$repo_root/scripts/run-under-host-lease.sh" "durable $scope suite" -- "$@" \
  > "$log" 2>&1; then
  test_exit_code=0
else
  test_exit_code=$?
fi

cat "$log"
trap - EXIT
finish "$test_exit_code"
release_lock
exit "$test_exit_code"
