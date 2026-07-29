#!/bin/sh
# Read durable test evidence only when it belongs to the current worktree HEAD.

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
prefix="$repo_root/.verification/${scope}-suite"
running="$prefix.running"
status="$prefix.status"

if [ -f "$running" ]; then
  echo "Durable $scope test evidence is still being produced: $running" >&2
  exit 3
fi
if [ ! -f "$status" ]; then
  echo "No durable $scope test result exists for this worktree." >&2
  exit 2
fi

field() {
  sed -n "s/^$1=//p" "$status" | head -n 1
}

recorded_scope="$(field scope)"
recorded_worktree="$(field worktree)"
if [ "$recorded_scope" != "$scope" ] || [ "$recorded_worktree" != "$repo_root" ]; then
  echo "Durable $scope status has mismatched scope or worktree metadata; inspect $status." >&2
  exit 1
fi

recorded_head="$(field head)"
current_head="$(git -C "$repo_root" rev-parse HEAD)"
if [ "$recorded_head" != "$current_head" ]; then
  echo "Durable $scope result belongs to $recorded_head, not current HEAD $current_head." >&2
  exit 1
fi

recorded_worktree_state="$(field worktree_state)"
current_worktree_state="$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all | cksum | awk '{print $1 "-" $2}')"
if [ "$recorded_worktree_state" != "$current_worktree_state" ]; then
  echo "Durable $scope result does not match the current working tree; rerun the suite." >&2
  exit 1
fi

exit_code="$(field exit_code)"
if [ "$exit_code" != '0' ]; then
  echo "Durable $scope test run failed with exit code ${exit_code:-unknown}; inspect $status." >&2
  exit 1
fi

printf 'Durable %s test run passed for %s.\n' "$scope" "$current_head"
