#!/bin/sh
# Read durable test evidence only when it belongs to the current worktree HEAD.
#
# #1133 items C/D: every path below prints a leading `STATUS: <word>` line to
# stdout, one of `active` / `passed` / `failed` / `abandoned` / `mismatched` /
# `none` (the last for "no result exists yet" / bad usage), so a caller never
# has to infer state from prose or from inspecting `ps` itself. Exit codes are
# unchanged from before this MR for every case that already existed --
# `abandoned` is a genuinely new distinction (exit 4) that a stale `.running`
# marker used to be indistinguishable from a real still-active run (both
# reported exit 3); no existing caller could have relied on that conflation
# since the cases were never told apart.

set -eu

scope="${1:-full}"
case "$scope" in
  ''|*[!a-z0-9_-]*)
    echo 'Usage: read-durable-test-result.sh [scope]' >&2
    exit 2
    ;;
esac

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
# shellcheck source=./host-verification-lease.sh
. "$script_dir/host-verification-lease.sh"
prefix="$repo_root/.verification/${scope}-suite"
running="$prefix.running"
status="$prefix.status"
log="$prefix.log"
job_pid_file="$prefix.job-pid"

if [ -f "$running" ]; then
  running_pid="$(sed -n 's/^pid=//p' "$running" 2>/dev/null | head -n 1)"
  job_pid=""
  if [ -f "$job_pid_file" ]; then
    job_pid="$(cat "$job_pid_file" 2>/dev/null | tr -d ' \t\n')"
  fi

  # The real job's pid (once registered) is the authoritative liveness
  # check; before it's registered (a short early window, or a run that
  # predates this pid-file mechanism entirely -- e.g. a hand-written
  # fixture), fall back to the recorded supervisor pid.
  is_alive=1
  if [ -n "$job_pid" ]; then
    hvl_pid_is_live "$job_pid" || is_alive=0
  elif [ -n "$running_pid" ]; then
    hvl_pid_is_live "$running_pid" || is_alive=0
  else
    is_alive=0
  fi

  if [ "$is_alive" -eq 1 ]; then
    echo 'STATUS: active'
    echo "Durable $scope test evidence is still being produced: $running" >&2
    if [ -f "$log" ]; then
      echo '--- last 20 lines so far ---' >&2
      tail -n 20 "$log" >&2
    fi
    exit 3
  fi

  echo 'STATUS: abandoned'
  echo "Durable $scope test evidence looks abandoned: $running records a process that is no longer alive. Treat this the same as a failure -- do not wait for it to complete." >&2
  exit 4
fi

if [ ! -f "$status" ]; then
  echo 'STATUS: none'
  echo "No durable $scope test result exists for this worktree." >&2
  exit 2
fi

field() {
  sed -n "s/^$1=//p" "$status" | head -n 1
}

recorded_scope="$(field scope)"
recorded_worktree="$(field worktree)"
if [ "$recorded_scope" != "$scope" ] || [ "$recorded_worktree" != "$repo_root" ]; then
  echo 'STATUS: mismatched'
  echo "Durable $scope status has mismatched scope or worktree metadata; inspect $status." >&2
  exit 1
fi

recorded_head="$(field head)"
current_head="$(git -C "$repo_root" rev-parse HEAD)"
if [ "$recorded_head" != "$current_head" ]; then
  echo 'STATUS: mismatched'
  echo "Durable $scope result belongs to $recorded_head, not current HEAD $current_head." >&2
  exit 1
fi

recorded_worktree_state="$(field worktree_state)"
current_worktree_state="$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all | cksum | awk '{print $1 "-" $2}')"
if [ "$recorded_worktree_state" != "$current_worktree_state" ]; then
  echo 'STATUS: mismatched'
  echo "Durable $scope result does not match the current working tree; rerun the suite." >&2
  exit 1
fi

exit_code="$(field exit_code)"
if [ "$exit_code" != '0' ]; then
  echo 'STATUS: failed'
  failure_kind="$(field failure_kind)"
  if [ -n "$failure_kind" ] && [ "$failure_kind" != 'none' ]; then
    echo "Durable $scope test run failed with exit code ${exit_code:-unknown} (failure_kind=$failure_kind); inspect $status." >&2
  else
    echo "Durable $scope test run failed with exit code ${exit_code:-unknown}; inspect $status." >&2
  fi
  exit 1
fi

echo 'STATUS: passed'
printf 'Durable %s test run passed for %s.\n' "$scope" "$current_head"
