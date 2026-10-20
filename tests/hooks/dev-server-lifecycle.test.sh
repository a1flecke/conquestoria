#!/usr/bin/env bash
# dev-server-lifecycle.sh (#1564): the SessionEnd hook stops the session worktree's server; the SessionStart hook reaps
# only expired/orphaned servers and leaves a live in-date one alone. Both print nothing and always exit 0.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/dev-server-lifecycle.sh"
TMP="$(cd "$(mktemp -d)" && pwd -P)"
export DEV_SERVER_REGISTRY="$TMP/registry"
export DEV_SERVER_NO_WAIT=1
export DEV_SERVER_POLL_SECONDS=1
SLEEP_N=$((45000 + $$ % 1000))
export DEV_SERVER_COMMAND="exec sleep $SLEEP_N"

fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
  for rec in "$DEV_SERVER_REGISTRY"/*/record; do
    [ -f "$rec" ] || continue
    for key in pid child; do
      p="$(sed -n "s/^$key=//p" "$rec" | head -n 1)"
      [ -n "$p" ] && kill -KILL "$p" 2>/dev/null || true
    done
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

# A fixture "worktree": a git repo holding a copy of the script and the lease library it sources.
make_wt() {
  d="$TMP/$1"
  mkdir -p "$d/scripts"
  cp "$ROOT/scripts/dev-server.sh" "$ROOT/scripts/host-verification-lease.sh" "$d/scripts/"
  git -C "$d" init -q
  git -C "$d" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  printf '%s\n' "$d"
}

alive() { ps -eo command= | grep -F "sleep $SLEEP_N" | grep -v grep >/dev/null 2>&1; }
records() { ls "$DEV_SERVER_REGISTRY"/*/record 2>/dev/null | wc -l | tr -d ' '; }
payload() { jq -n --arg cwd "$1" '{hook_event_name: "x", cwd: $cwd}'; }

W="$(make_wt wt)"
(cd "$W" && sh scripts/dev-server.sh start >/dev/null)
alive || fail "fixture server did not start"

# SessionStart reaps nothing while the server is live and in date.
out="$(payload "$W" | bash "$HOOK" start 2>&1)"; code=$?
[ "$code" -eq 0 ] || fail "start hook exited $code"
[ -z "$out" ] || fail "start hook printed output: $out"
[ "$(records)" = 1 ] || fail "start hook touched a live, in-date server"
alive || fail "start hook stopped a live server"
echo "ok 1: SessionStart leaves a live in-date server alone and prints nothing"

# SessionEnd stops this worktree's server.
out="$(payload "$W" | bash "$HOOK" end 2>&1)"; code=$?
[ "$code" -eq 0 ] || fail "end hook exited $code"
[ -z "$out" ] || fail "end hook printed output: $out"
i=0; while alive && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
alive && fail "SessionEnd left the server running"
[ "$(records)" = 0 ] || fail "SessionEnd left a record"
echo "ok 2: SessionEnd stops the session worktree's server"

# A cwd that is not a git worktree, an empty payload and a missing script are all harmless no-ops.
mkdir -p "$TMP/plain"
payload "$TMP/plain" | bash "$HOOK" end; [ $? -eq 0 ] || fail "non-git cwd should exit 0"
echo '' | bash "$HOOK" end; [ $? -eq 0 ] || fail "empty payload should exit 0"
NOSCRIPT="$TMP/noscript"; mkdir -p "$NOSCRIPT"; git -C "$NOSCRIPT" init -q
payload "$NOSCRIPT" | bash "$HOOK" end; [ $? -eq 0 ] || fail "a tree without the script should exit 0"
echo "ok 3: no-op cases exit 0"

# SessionStart reaps an orphaned server (its worktree is gone).
W2="$(make_wt gone)"
(cd "$W2" && sh scripts/dev-server.sh start >/dev/null)
rm -rf "$W2"
i=0; while [ "$(records)" != 0 ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
[ "$(records)" = 0 ] || fail "an orphaned server was not stopped by its supervisor"
echo "ok 4: a removed worktree's server is gone"

echo "dev-server-lifecycle.test.sh: all scenarios passed"
