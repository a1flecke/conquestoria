#!/bin/sh
# Read PR-verification evidence only when it belongs to the current worktree state.

set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
artifact_dir="${VERIFY_PR_ARTIFACT_DIR:-$repo_root/.verification}"
status="$artifact_dir/pr-verification.status"

[ -f "$status" ] || {
  echo "No PR verification result exists for this worktree." >&2
  exit 2
}

field() {
  sed -n "s/^$1=//p" "$status" | head -n 1
}
worktree_state() {
  git -C "$repo_root" status --porcelain=v1 --untracked-files=all | cksum | awk '{print $1 "-" $2}'
}

[ "$(field worktree)" = "$repo_root" ] || {
  echo "PR verification status belongs to a different worktree." >&2
  exit 1
}
[ "$(field head)" = "$(git -C "$repo_root" rev-parse HEAD)" ] || {
  echo "PR verification status belongs to a different HEAD." >&2
  exit 1
}
[ "$(field worktree_state)" = "$(worktree_state)" ] || {
  echo "PR verification status does not match the current working tree." >&2
  exit 1
}
elapsed_seconds="$(field elapsed_seconds)"
max_seconds="$(field max_seconds)"
[ "$(field exit_code)" = '0' ] || {
  echo "PR verification failed; inspect $status." >&2
  exit 1
}
[ "$elapsed_seconds" -le "$max_seconds" ] || {
  echo "PR verification exceeded its recorded time ceiling; inspect $status." >&2
  exit 1
}

printf 'PR verification passed for %s in %ss.\n' "$(git -C "$repo_root" rev-parse HEAD)" "$elapsed_seconds"
