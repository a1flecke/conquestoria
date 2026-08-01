#!/bin/sh
# Run build plus durable tests and persist PR-verification evidence.

set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
artifact_dir="${VERIFY_PR_ARTIFACT_DIR:-$repo_root/.verification}"
status="$artifact_dir/pr-verification.status"
status_tmp="$status.tmp.$$"
max_seconds="${VERIFY_PR_MAX_SECONDS:-480}"
head_sha="$(git -C "$repo_root" rev-parse HEAD)"
worktree_state() {
  git -C "$repo_root" status --porcelain=v1 --untracked-files=all | cksum | awk '{print $1 "-" $2}'
}

mkdir -p "$artifact_dir"
started_at="$(date +%s)"
initial_worktree_state="$(worktree_state)"
exit_code=0

if yarn build; then :; else exit_code=$?; fi
if [ "$exit_code" -eq 0 ]; then
  if yarn test:durable; then :; else exit_code=$?; fi
fi
if [ "$exit_code" -eq 0 ]; then
  if yarn test:durable:status; then :; else exit_code=$?; fi
fi

elapsed_seconds=$(( $(date +%s) - started_at ))
if [ "$exit_code" -eq 0 ] && [ "$elapsed_seconds" -gt "$max_seconds" ]; then
  echo "PR verification exceeded the ${max_seconds}s ceiling (${elapsed_seconds}s)." >&2
  exit_code=1
fi

{
  printf 'worktree=%s\n' "$repo_root"
  printf 'head=%s\n' "$head_sha"
  printf 'worktree_state=%s\n' "$initial_worktree_state"
  printf 'elapsed_seconds=%s\n' "$elapsed_seconds"
  printf 'max_seconds=%s\n' "$max_seconds"
  printf 'exit_code=%s\n' "$exit_code"
} > "$status_tmp"
mv "$status_tmp" "$status"

if [ "$exit_code" -ne 0 ]; then exit "$exit_code"; fi
printf 'PR verification passed in %ss.\n' "$elapsed_seconds"
