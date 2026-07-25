#!/bin/sh

set -eu

[ "$#" -gt 0 ] || {
  echo "Usage: with-verification-lock.sh <command> [args...]" >&2
  exit 2
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMON_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"
case "$COMMON_GIT_DIR" in
  /*) ;;
  *) COMMON_GIT_DIR="$REPO_ROOT/$COMMON_GIT_DIR" ;;
esac

LOCK_DIR="${CONQUESTORIA_VERIFICATION_LOCK_DIR:-$COMMON_GIT_DIR/conquestoria-verification.lock}"

reclaim_stale_lock() {
  owner_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$owner_pid" ] && kill -0 "$owner_pid" 2>/dev/null; then
    owner_command="$(cat "$LOCK_DIR/command" 2>/dev/null || echo 'unknown command')"
    echo "Verification already running (pid $owner_pid): $owner_command" >&2
    echo "Wait for it to finish; a second run would oversubscribe Vitest workers across worktrees." >&2
    exit 75
  fi

  rm -f "$LOCK_DIR/pid" "$LOCK_DIR/command"
  rmdir "$LOCK_DIR" 2>/dev/null || {
    echo "Verification lock is unavailable: $LOCK_DIR" >&2
    exit 75
  }
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  reclaim_stale_lock
  mkdir "$LOCK_DIR" 2>/dev/null || {
    echo "Verification lock is unavailable: $LOCK_DIR" >&2
    exit 75
  }
fi

printf '%s\n' "$$" > "$LOCK_DIR/pid"
printf '%s\n' "$*" > "$LOCK_DIR/command"

cleanup() {
  rm -f "$LOCK_DIR/pid" "$LOCK_DIR/command"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

export CONQUESTORIA_VERIFICATION_LOCK_HELD=1
"$@"
