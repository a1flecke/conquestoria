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

LOCK_FILE="${CONQUESTORIA_VERIFICATION_LOCK_DIR:-$COMMON_GIT_DIR/conquestoria-verification.lock}"

exec perl "$SCRIPT_DIR/with-verification-lock.pl" "$LOCK_FILE" "$@"
