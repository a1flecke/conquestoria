#!/bin/sh
# Run a test command with worktree-local, durable evidence for agent workflows.

set -eu

usage() {
  echo 'Usage: run-durable-test-suite.sh <scope> [--no-lease] -- <command> [arguments...]' >&2
  exit 2
}

scope="${1:-}"
case "$scope" in
  ''|*[!a-z0-9_-]*) usage ;;
esac
[ "$#" -ge 1 ] || usage
shift

# #1133 items C/D: durability (worktree-local evidence) is independent of
# which host-wide lease (if any) a command uses -- some heavyweight AI-suite
# runners deliberately do NOT take the shared push-verification lease (see
# their own header comments), so wrapping them here must not force them into
# it. --no-lease skips the host-wide lease acquisition below entirely while
# still getting durable evidence + job-pid liveness tracking (via
# hvl_run_registering_job directly); omitting it preserves the original
# behavior (used by the "full" scope / yarn test:durable), acquiring the
# shared lease via run-under-host-lease.sh.
use_lease=1
if [ "${1:-}" = '--no-lease' ]; then
  use_lease=0
  shift
fi
[ "${1:-}" = '--' ] || usage
shift
[ "$#" -ge 1 ] || usage

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
# shellcheck source=./host-verification-lease.sh
. "$repo_root/scripts/host-verification-lease.sh"
artifact_dir="$repo_root/.verification"
prefix="$artifact_dir/${scope}-suite"
lock_dir="$prefix.lock"
running="$prefix.running"
log="$prefix.log"
status="$prefix.status"
status_tmp="$status.tmp.$$"
failure_kind_file="$prefix.failure-kind"
job_pid_file="$prefix.job-pid"
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
  # #1133 cross-context status-visibility: use the shared, sandbox-aware
  # liveness check (hvl_pid_is_live, already sourced above) rather than a
  # raw `kill -0` -- a bare `kill -0` conflates "genuinely dead" with
  # "signal denied by a privilege boundary", which would let a restricted
  # execution context wrongly steal a lock still held by a genuinely
  # active run in a privileged context.
  if [ -z "$lock_pid" ] || hvl_pid_is_live "$lock_pid"; then
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
  # Same #1133 cross-context reasoning as acquire_lock above: a raw `kill
  # -0` here would let a restricted execution context start a duplicate
  # run against evidence a genuinely active run (in a privileged context)
  # is still producing.
  if [ -n "$running_pid" ] && hvl_pid_is_live "$running_pid"; then
    echo "A durable $scope test run is already active in this worktree; inspect $running or $log." >&2
    release_lock
    exit 1
  fi
fi

# Finished and abandoned artifacts cannot be evidence for the run about to
# start. A live marker is handled above before anything is removed.
rm -f "$running" "$log" "$status" "$status_tmp" "$failure_kind_file" "$job_pid_file"
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
  rm -f "$running" "$job_pid_file"
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
#
# #1133 items C/D: DURABLE_JOB_PID_FILE asks run-under-host-lease.sh's own
# hvl_run_registering_job to also drop the real job's pid into this file,
# independent of the (worktree-local) lock/marker above. read-durable-test-
# result.sh reads it directly off disk while this is still running -- it
# does not need to wait for this script to finish, so a concurrent reader
# can tell a genuinely-active run apart from an abandoned one (a stale
# `.running` marker whose process actually died). The output is piped
# through `tee` (not just redirected) so a `.running` job streams live
# instead of only appearing in $log after the fact -- `set -e` must be off
# across the pipeline for the same reason run-test-suite.sh's own internal
# pipeline needs it: a mid-group failure would otherwise abort this script
# before `echo "$?"` ever runs, losing the real exit code.
exit_file="$(mktemp)"
set +e
if [ "$use_lease" -eq 1 ]; then
  {
    DURABLE_FAILURE_KIND_FILE="$failure_kind_file" DURABLE_JOB_PID_FILE="$job_pid_file" \
      sh "$repo_root/scripts/run-under-host-lease.sh" "durable $scope suite" -- "$@"
    echo "$?" > "$exit_file"
  } 2>&1 | tee "$log"
else
  {
    DURABLE_FAILURE_KIND_FILE="$failure_kind_file" DURABLE_JOB_PID_FILE="$job_pid_file" \
      hvl_run_registering_job "$@"
    echo "$?" > "$exit_file"
  } 2>&1 | tee "$log"
fi
set -e
test_exit_code="$(cat "$exit_file")"
rm -f "$exit_file"

trap - EXIT
finish "$test_exit_code"
release_lock
exit "$test_exit_code"
