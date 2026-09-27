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
# #1166: the recorded max is a latency SLO, not a correctness gate (a runaway
# is already recorded as a non-zero exit_code by verify-pr.sh).
if [ "$elapsed_seconds" -gt "$max_seconds" ]; then
  echo "WARNING: PR verification exceeded its ${max_seconds}s latency SLO (${elapsed_seconds}s) -- host contention, not a failure." >&2
fi

printf 'PR verification passed for %s in %ss.\n' "$(git -C "$repo_root" rev-parse HEAD)" "$elapsed_seconds"
