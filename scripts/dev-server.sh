#!/bin/sh
# One owner for a worktree's dev server (#1564): start it, find it, stop it, and make sure it cannot be forgotten.
#
#   dev-server.sh start         serve THIS worktree on its own port; prints the URL, worktree and branch
#   dev-server.sh stop          stop THIS worktree's server (recorded pids only)
#   dev-server.sh status        every dev server on the host: worktree, branch, port, age, time left, state
#   dev-server.sh reap          stop servers whose worktree is gone or whose lifetime elapsed; drop dead records
#
# Why it exists. The browser-pane preview starts `yarn dev` in the folder the session was LAUNCHED in, so an agent that
# then entered a worktree previewed the wrong code. A hand-started background `yarn dev` serves the right tree but records
# nothing, so it is stopped only by whoever remembers its pid, and agents routinely did not. Here every server is owned by a
# supervisor that records itself and stops its server when ANY of these happens, with no agent action:
#   * it is stopped (`stop`, or the SessionEnd hook calling `stop`),
#   * its lifetime elapses (DEV_SERVER_TTL_SECONDS, default 7200),
#   * its worktree directory disappears,
#   * its server process dies.
# Open the page with the preview tool's `url` form (preview_start {url: ...}); do not start `yarn dev` yourself
# (.claude/hooks/block-raw-dev-server.sh refuses it).
#
# Shared host: several agents run at once. This script never selects a process by name, never signals a process group,
# and never touches a server whose record belongs to another worktree except to REAP it when that worktree is gone or the
# lifetime has elapsed. It acts only on pids recorded in the registry, walked by parent/child descent (hvl_job_tree_pids).
#
# Environment (all optional; the test hooks set them):
#   DEV_SERVER_REGISTRY        registry directory (default: <host scope dir>/dev-servers)
#   DEV_SERVER_TTL_SECONDS     maximum lifetime of a server (default 7200)
#   DEV_SERVER_POLL_SECONDS    supervisor check interval (default 10)
#   DEV_SERVER_COMMAND         command that runs the server in the worktree; `{port}` is replaced by the port
#   DEV_SERVER_NO_WAIT=1       do not wait for the server to answer before returning from `start`
#   DEV_SERVER_PORT_BASE       first port of the range (default 5200); the range is 700 ports wide

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/host-verification-lease.sh
. "$SCRIPT_DIR/host-verification-lease.sh"

TTL_DEFAULT=7200
POLL="${DEV_SERVER_POLL_SECONDS:-10}"
PORT_BASE="${DEV_SERVER_PORT_BASE:-5200}"
PORT_SPAN=700
APP_PATH='/conquestoria/'

die() { echo "dev-server: $*" >&2; exit 2; }

usage() {
  cat >&2 <<'USAGE'
usage: scripts/dev-server.sh start|stop|status|reap

  start    serve this worktree on its own port (prints the URL, worktree and branch); reuses a live server
  stop     stop this worktree's server (recorded pids only)
  status   list every dev server on the host with worktree, branch, port, age and time left
  reap     stop servers whose worktree is gone or whose lifetime elapsed, and drop dead records
USAGE
  exit 2
}

# ---------------------------------------------------------------- helpers

registry_dir() {
  if [ -n "${DEV_SERVER_REGISTRY:-}" ]; then
    printf '%s\n' "$DEV_SERVER_REGISTRY"
  else
    printf '%s/dev-servers\n' "$(hvl_resolve_host_scope_dir)"
  fi
}

worktree_root() { git rev-parse --show-toplevel 2>/dev/null || die "not inside a git worktree"; }

record_dir_for() { printf '%s/%s\n' "$(registry_dir)" "$(hvl_path_hash "$1")"; }

# rec_get <record-file> <key>
rec_get() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1; }

port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  else
    return 1
  fi
}

# A port nobody else holds, starting from this worktree's own deterministic slot, so a worktree gets the same port every time.
pick_port() {
  hash_num="$(printf '%s' "$1" | cksum | awk '{print $1}')"
  slot=$((hash_num % PORT_SPAN))
  n=0
  while [ "$n" -lt 40 ]; do
    candidate=$((PORT_BASE + (slot + n) % PORT_SPAN))
    if ! port_in_use "$candidate" && ! port_recorded "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
    n=$((n + 1))
  done
  die "no free port found from $PORT_BASE (range $PORT_SPAN)"
}

# A port another live record already claims (a server that has not bound it yet must not be handed out twice).
port_recorded() {
  for rec in "$(registry_dir)"/*/record; do
    [ -f "$rec" ] || continue
    [ "$(rec_get "$rec" port)" = "$1" ] || continue
    rp="$(rec_get "$rec" pid)"
    hvl_job_pid_is_live "$rp" && return 0
  done
  return 1
}

# A recorded supervisor is trusted only if the pid is live AND its command line is this script (guards pid reuse).
supervisor_is_ours() {
  hvl_job_pid_is_live "$1" || return 1
  ps -o command= -p "$1" 2>/dev/null | grep -q 'dev-server\.sh'
}

stop_tree() {
  root_pid="$1"
  pids="$(hvl_job_tree_pids "$root_pid")"
  for p in $pids; do kill -TERM "$p" 2>/dev/null || true; done
  i=0
  while [ "$i" -lt 20 ]; do
    alive=0
    for p in $pids; do hvl_job_pid_is_live "$p" && alive=1; done
    [ "$alive" -eq 0 ] && return 0
    sleep 0.5
    i=$((i + 1))
  done
  # Escalate against the same explicit pid set (plus anything it spawned meanwhile), never a name or a group.
  for p in $(hvl_job_tree_pids "$root_pid"); do kill -KILL "$p" 2>/dev/null || true; done
}

age_of() { echo $(( $(hvl_now) - $1 )); }

human_age() {
  s="$1"
  if [ "$s" -ge 3600 ]; then printf '%dh%02dm' $((s / 3600)) $(((s % 3600) / 60))
  elif [ "$s" -ge 60 ]; then printf '%dm' $((s / 60))
  else printf '%ds' "$s"; fi
}

# ---------------------------------------------------------------- supervisor

# Runs detached. Owns the server for its whole life and removes its own record when it ends.
supervise() {
  wt="$1" port="$2" ttl="$3" rec_dir="$4"
  record="$rec_dir/record"
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  started="$(hvl_now)"
  mkdir -p "$rec_dir"

  cmd="${DEV_SERVER_COMMAND:-}"
  [ -n "$cmd" ] || cmd='./scripts/run-with-mise.sh yarn dev --port {port} --strictPort'
  cmd="$(printf '%s' "$cmd" | sed "s/{port}/$port/g")"
  cd "$wt"
  sh -c "$cmd" &
  child=$!

  cleanup() {
    stop_tree "$child"
    rm -rf "$rec_dir"
  }
  trap 'cleanup; exit 0' TERM INT HUP

  {
    printf 'pid=%s\n' "$$"
    printf 'child=%s\n' "$child"
    printf 'port=%s\n' "$port"
    printf 'worktree=%s\n' "$wt"
    printf 'branch=%s\n' "$branch"
    printf 'started=%s\n' "$started"
    printf 'ttl=%s\n' "$ttl"
  } > "$record.tmp"
  mv "$record.tmp" "$record"

  while :; do
    sleep "$POLL" &
    wait $! 2>/dev/null || true
    if [ ! -d "$wt" ]; then reason='worktree removed'; break; fi
    if ! hvl_job_pid_is_live "$child"; then reason='server exited'; break; fi
    if [ "$(age_of "$started")" -ge "$ttl" ]; then reason='lifetime elapsed'; break; fi
  done
  echo "dev-server: stopping ($reason)" >&2
  cleanup
}

# ---------------------------------------------------------------- commands

cmd_start() {
  wt="$(worktree_root)"
  rec_dir="$(record_dir_for "$wt")"
  record="$rec_dir/record"

  if [ -f "$record" ]; then
    rp="$(rec_get "$record" pid)"
    if supervisor_is_ours "$rp"; then
      port="$(rec_get "$record" port)"
      echo "dev-server: already serving this worktree"
      print_where "$wt" "$port"
      return 0
    fi
    rm -rf "$rec_dir"   # a dead supervisor's leftover
  fi

  ttl="${DEV_SERVER_TTL_SECONDS:-$TTL_DEFAULT}"
  case "$ttl" in ''|*[!0-9]*) die "DEV_SERVER_TTL_SECONDS must be a whole number of seconds" ;; esac
  port="$(pick_port "$wt")"
  mkdir -p "$rec_dir"
  log="$rec_dir/server.log"

  if command -v setsid >/dev/null 2>&1; then
    nohup setsid sh "$SCRIPT_DIR/dev-server.sh" __supervise "$wt" "$port" "$ttl" "$rec_dir" >"$log" 2>&1 </dev/null &
  elif command -v perl >/dev/null 2>&1; then
    nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' sh "$SCRIPT_DIR/dev-server.sh" __supervise "$wt" "$port" "$ttl" "$rec_dir" >"$log" 2>&1 </dev/null &
  else
    die "neither setsid nor perl is available to detach the server; refusing to start one that would die with this shell"
  fi

  # The record appears once the supervisor is running.
  i=0
  while [ ! -f "$record" ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
  [ -f "$record" ] || die "the supervisor did not start (see $log)"

  if [ "${DEV_SERVER_NO_WAIT:-0}" != "1" ]; then
    i=0
    while [ "$i" -lt 120 ]; do
      if curl -fs -o /dev/null "http://localhost:$port$APP_PATH" 2>/dev/null; then break; fi
      [ -f "$record" ] || die "the server exited before it answered (see $log)"
      sleep 0.5
      i=$((i + 1))
    done
    [ "$i" -lt 120 ] || { cmd_stop >/dev/null 2>&1 || true; die "the server did not answer within 60s (see $log); stopped it"; }
  fi
  echo "dev-server: started"
  print_where "$wt" "$port"
}

print_where() {
  echo "  worktree: $1"
  echo "  branch:   $(git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "  url:      http://localhost:$2$APP_PATH"
  echo "  stop:     scripts/dev-server.sh stop   (it also stops itself after $(human_age "${DEV_SERVER_TTL_SECONDS:-$TTL_DEFAULT}") or when this worktree is removed)"
  echo "  preview:  preview_start {url: http://localhost:$2$APP_PATH}"
}

cmd_stop() {
  quiet=0
  [ "${1:-}" = "--quiet" ] && quiet=1
  wt="$(worktree_root)"
  rec_dir="$(record_dir_for "$wt")"
  record="$rec_dir/record"
  if [ ! -f "$record" ]; then
    [ "$quiet" -eq 1 ] || echo "dev-server: no server recorded for this worktree"
    return 0
  fi
  [ "$(rec_get "$record" worktree)" = "$wt" ] || die "record does not belong to this worktree; refusing"
  rp="$(rec_get "$record" pid)"
  if supervisor_is_ours "$rp"; then
    # The supervisor's own trap stops the server and removes the record; only then escalate.
    kill -TERM "$rp" 2>/dev/null || true
    i=0
    while [ "$i" -lt 30 ] && hvl_job_pid_is_live "$rp"; do sleep 0.5; i=$((i + 1)); done
    if hvl_job_pid_is_live "$rp"; then stop_tree "$rp"; fi
  fi
  child="$(rec_get "$record" child)"
  [ -n "$child" ] && hvl_job_pid_is_live "$child" && stop_tree "$child"
  rm -rf "$rec_dir"
  [ "$quiet" -eq 1 ] || echo "dev-server: stopped the server for $wt"
}

cmd_status() {
  reg="$(registry_dir)"
  found=0
  for rec in "$reg"/*/record; do
    [ -f "$rec" ] || continue
    found=1
    rp="$(rec_get "$rec" pid)"; port="$(rec_get "$rec" port)"; wt="$(rec_get "$rec" worktree)"
    br="$(rec_get "$rec" branch)"; st="$(rec_get "$rec" started)"; ttl="$(rec_get "$rec" ttl)"
    if ! supervisor_is_ours "$rp"; then state=DEAD
    elif [ ! -d "$wt" ]; then state=ORPHAN
    elif [ "$(age_of "$st")" -ge "$ttl" ]; then state=EXPIRED
    else state=LIVE; fi
    left=$((ttl - $(age_of "$st"))); [ "$left" -lt 0 ] && left=0
    printf '%-8s port=%s age=%s left=%s branch=%s worktree=%s\n' "$state" "$port" "$(human_age "$(age_of "$st")")" "$(human_age "$left")" "$br" "$wt"
  done
  [ "$found" -eq 1 ] || echo "dev-server: no dev servers recorded on this host"
}

cmd_reap() {
  reg="$(registry_dir)"
  reaped=0
  for rec in "$reg"/*/record; do
    [ -f "$rec" ] || continue
    rec_dir="$(dirname "$rec")"
    rp="$(rec_get "$rec" pid)"; wt="$(rec_get "$rec" worktree)"
    st="$(rec_get "$rec" started)"; ttl="$(rec_get "$rec" ttl)"
    if ! supervisor_is_ours "$rp"; then
      child="$(rec_get "$rec" child)"
      [ -n "$child" ] && hvl_job_pid_is_live "$child" && stop_tree "$child"
      rm -rf "$rec_dir"; echo "reaped dead record for $wt"; reaped=$((reaped + 1)); continue
    fi
    if [ ! -d "$wt" ] || [ "$(age_of "$st")" -ge "$ttl" ]; then
      kill -TERM "$rp" 2>/dev/null || true
      i=0
      while [ "$i" -lt 30 ] && hvl_job_pid_is_live "$rp"; do sleep 0.5; i=$((i + 1)); done
      hvl_job_pid_is_live "$rp" && stop_tree "$rp"
      rm -rf "$rec_dir"; echo "reaped server for $wt"; reaped=$((reaped + 1))
    fi
  done
  [ "$reaped" -gt 0 ] || echo "dev-server: nothing to reap"
}

[ "$#" -ge 1 ] || usage
sub="$1"; shift
case "$sub" in
  start) cmd_start ;;
  stop) cmd_stop "$@" ;;
  status) cmd_status ;;
  reap) cmd_reap ;;
  __supervise) supervise "$@" ;;
  *) usage ;;
esac
