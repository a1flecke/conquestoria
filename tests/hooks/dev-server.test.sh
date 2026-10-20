#!/usr/bin/env bash
# dev-server.sh (#1564): one owner for a worktree's dev server. It serves the worktree it is run from, records itself,
# and stops its server on `stop`, on its lifetime elapsing, on the worktree disappearing and on the server exiting.
# `status` shows every server; `reap` removes dead/expired/orphaned ones and never touches a live one that is in date.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/dev-server.sh"
TMP="$(cd "$(mktemp -d)" && pwd -P)"
export DEV_SERVER_REGISTRY="$TMP/registry"
export DEV_SERVER_NO_WAIT=1
export DEV_SERVER_POLL_SECONDS=1
MARK=$$   # makes every fake server's command line unique to this run

fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
  # Only pids this test started, found through the registry it created.
  for rec in "$DEV_SERVER_REGISTRY"/*/record; do
    [ -f "$rec" ] || continue
    for key in pid child; do
      p="$(sed -n "s/^$key=//p" "$rec" | head -n 1)"
      [ -n "$p" ] && kill -KILL "$p" 2>/dev/null || true
    done
  done
  for p in ${LISTENER_PID:-}; do kill "$p" 2>/dev/null || true; done
  rm -rf "$TMP"
}
trap cleanup EXIT

make_repo() {
  d="$TMP/$1"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  printf '%s\n' "$d"
}

in_repo() { # in_repo <dir> <args...>  (the dev-server script is always the repo's own)
  d="$1"; shift
  (cd "$d" && sh "$SCRIPT" "$@")
}

marker_alive() { ps -eo command= | grep -F "sleep $1" | grep -v grep >/dev/null 2>&1; }

wait_until() { # wait_until <seconds> <command...>
  limit="$1"; shift
  i=0
  while [ "$i" -lt $((limit * 10)) ]; do
    if "$@"; then return 0; fi
    sleep 0.1; i=$((i + 1))
  done
  return 1
}

record_of() { ls "$DEV_SERVER_REGISTRY"/*/record 2>/dev/null | head -n 1; }
rec_value() { sed -n "s/^$2=//p" "$1" | head -n 1; }

# ---- 1. start serves THIS worktree, says which one, and a second start reuses the server -----------------------------
A="$(make_repo wt-a)"
export DEV_SERVER_COMMAND="exec sleep $((40000 + MARK % 1000))"
SLEEP_A=$((40000 + MARK % 1000))
out="$(in_repo "$A" start)"
echo "$out" | grep -q "worktree: $A" || fail "start did not name the worktree: $out"
echo "$out" | grep -q "branch:" || fail "start did not name the branch"
echo "$out" | grep -Eq "url: +http://localhost:[0-9]+/conquestoria/" || fail "start did not print the URL: $out"
rec="$(record_of)"
[ -f "$rec" ] || fail "no record written"
[ "$(rec_value "$rec" worktree)" = "$A" ] || fail "record names the wrong worktree"
marker_alive "$SLEEP_A" || fail "the server process is not running"
again="$(in_repo "$A" start)"
echo "$again" | grep -q "already serving" || fail "a second start did not reuse the server: $again"
[ "$(ls -d "$DEV_SERVER_REGISTRY"/*/ | wc -l | tr -d ' ')" = 1 ] || fail "a second start created a second record"
echo "ok 1: start serves this worktree, names it, and reuses a live server"

# ---- 2. stop ends the server and its record; nothing is left behind ---------------------------------------------------
in_repo "$A" stop >/dev/null
wait_until 5 bash -c "! ps -eo command= | grep -F 'sleep $SLEEP_A' | grep -v grep >/dev/null" || fail "stop left the server running"
[ -z "$(record_of)" ] || fail "stop left a record"
out="$(in_repo "$A" stop)"
echo "$out" | grep -q "no server recorded" || fail "stop on nothing should say so"
echo "ok 2: stop removes the server and the record, and is safe to repeat"

# ---- 3. the lifetime ends a forgotten server on its own --------------------------------------------------------------
export DEV_SERVER_COMMAND="exec sleep $((41000 + MARK % 1000))"
SLEEP_B=$((41000 + MARK % 1000))
DEV_SERVER_TTL_SECONDS=2 in_repo "$A" start >/dev/null
marker_alive "$SLEEP_B" || fail "server did not start for the lifetime test"
wait_until 15 bash -c "! ps -eo command= | grep -F 'sleep $SLEEP_B' | grep -v grep >/dev/null" || fail "the server outlived its lifetime"
wait_until 5 bash -c "[ -z \"\$(ls $DEV_SERVER_REGISTRY/*/record 2>/dev/null)\" ]" || fail "the record outlived the server"
echo "ok 3: a server stops itself when its lifetime elapses"

# ---- 4. a server that exits takes its record with it -----------------------------------------------------------------
export DEV_SERVER_COMMAND="sleep 1"
in_repo "$A" start >/dev/null
wait_until 15 bash -c "[ -z \"\$(ls $DEV_SERVER_REGISTRY/*/record 2>/dev/null)\" ]" || fail "a record outlived its exited server"
echo "ok 4: an exited server leaves no record"

# ---- 5. removing the worktree stops its server ------------------------------------------------------------------------
export DEV_SERVER_COMMAND="exec sleep $((42000 + MARK % 1000))"
SLEEP_C=$((42000 + MARK % 1000))
C="$(make_repo wt-c)"
in_repo "$C" start >/dev/null
marker_alive "$SLEEP_C" || fail "server did not start for the worktree-removal test"
rm -rf "$C"
wait_until 15 bash -c "! ps -eo command= | grep -F 'sleep $SLEEP_C' | grep -v grep >/dev/null" || fail "the server outlived its worktree"
wait_until 5 bash -c "[ -z \"\$(ls $DEV_SERVER_REGISTRY/*/record 2>/dev/null)\" ]" || fail "the record outlived its worktree"
echo "ok 5: removing the worktree stops its server"

# ---- 6. two worktrees get two ports; status lists both; a taken port is skipped ---------------------------------------
export DEV_SERVER_COMMAND="exec sleep $((43000 + MARK % 1000))"
SLEEP_D=$((43000 + MARK % 1000))
D1="$(make_repo wt-d1)"; D2="$(make_repo wt-d2)"
in_repo "$D1" start >/dev/null
in_repo "$D2" start >/dev/null
ports="$(for r in "$DEV_SERVER_REGISTRY"/*/record; do rec_value "$r" port; done | sort | uniq | wc -l | tr -d ' ')"
[ "$ports" = 2 ] || fail "two worktrees must not share a port: $(for r in "$DEV_SERVER_REGISTRY"/*/record; do rec_value "$r" port; rec_value "$r" worktree; done | tr "\n" " ")"
st="$(in_repo "$D1" status)"
echo "$st" | grep -q "worktree=$D1" || fail "status missed the first server: $st"
echo "$st" | grep -q "worktree=$D2" || fail "status missed the second server: $st"
in_repo "$D1" stop >/dev/null
in_repo "$D2" stop >/dev/null
# A port something else holds is skipped.
if command -v python3 >/dev/null 2>&1; then
  H="$(make_repo wt-h)"
  # Hold the port this worktree would pick, then start: it must pick another.
  first_port="$(in_repo "$H" start | sed -n 's#.*localhost:\([0-9]*\)/.*#\1#p' | head -n 1)"
  in_repo "$H" stop >/dev/null
  python3 -I -c "
import socket, time
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', $first_port)); s.listen(1); time.sleep(60)
" >/dev/null 2>&1 &
  LISTENER_PID=$!
  disown "$LISTENER_PID" 2>/dev/null || true
  wait_until 5 bash -c "lsof -nP -iTCP:$first_port -sTCP:LISTEN >/dev/null 2>&1" || fail "could not hold the port for the test"
  second_port="$(in_repo "$H" start | sed -n 's#.*localhost:\([0-9]*\)/.*#\1#p' | head -n 1)"
  [ "$second_port" != "$first_port" ] || fail "start reused a port something else holds"
  in_repo "$H" stop >/dev/null
fi
echo "ok 6: separate ports, status lists every server, a held port is skipped"

# ---- 7. reap: dead record and orphaned child are cleaned; a live, in-date server is left alone -------------------------
export DEV_SERVER_COMMAND="exec sleep $((44000 + MARK % 1000))"
SLEEP_E=$((44000 + MARK % 1000))
E1="$(make_repo wt-e1)"; E2="$(make_repo wt-e2)"
in_repo "$E1" start >/dev/null
in_repo "$E2" start >/dev/null
for r in "$DEV_SERVER_REGISTRY"/*/record; do
  if [ "$(rec_value "$r" worktree)" = "$E1" ]; then victim_pid="$(rec_value "$r" pid)"; fi
done
kill -KILL "$victim_pid"          # the supervisor dies without cleaning up: its server is orphaned
sleep 1
out="$(in_repo "$E2" reap)"
echo "$out" | grep -q "reaped dead record for $E1" || fail "reap did not clean the dead record: $out"
echo "$out" | grep -q "$E2" && fail "reap must not touch a live, in-date server: $out"
st="$(in_repo "$E2" status)"
echo "$st" | grep -q "worktree=$E2" || fail "reap removed a live server"
in_repo "$E2" stop >/dev/null
wait_until 5 bash -c "! ps -eo command= | grep -F 'sleep $SLEEP_E' | grep -v grep >/dev/null" || fail "an orphaned server survived reap"
echo "ok 7: reap cleans dead and orphaned servers and leaves live ones alone"

# ---- 8. stop refuses a record that belongs to another worktree --------------------------------------------------------
F="$(make_repo wt-f)"
hash_dir="$(cd "$F" && sh -c '. "$1/scripts/host-verification-lease.sh"; hvl_path_hash "$(git rev-parse --show-toplevel)"' sh "$ROOT")"
mkdir -p "$DEV_SERVER_REGISTRY/$hash_dir"
printf 'pid=1\nchild=1\nport=5999\nworktree=/somewhere/else\nbranch=x\nstarted=0\nttl=1\n' > "$DEV_SERVER_REGISTRY/$hash_dir/record"
set +e
in_repo "$F" stop >/dev/null 2>&1
code=$?
set -e
[ "$code" -ne 0 ] || fail "stop accepted a record from another worktree"
rm -rf "$DEV_SERVER_REGISTRY/$hash_dir"
echo "ok 8: stop refuses another worktree's record"

# ---- 9. structural guard: never by name, never by process group ----------------------------------------------------------
if grep -nE '(^|[^a-zA-Z_-])(pkill|killall|pgrep)([^a-zA-Z_-]|$)' "$SCRIPT" | grep -vE '^[0-9]+:[[:space:]]*#' >/dev/null; then
  fail "dev-server.sh must not select processes by name"
fi
if grep -nE 'kill[^|;&]*[[:space:]]-[0-9]{2,}|kill[^|;&]*--[[:space:]]+-' "$SCRIPT" >/dev/null; then
  fail "dev-server.sh must not signal a process group"
fi
echo "ok 9: no kill by name or by process group"

echo "dev-server.test.sh: all scenarios passed"
