#!/bin/sh
# Stop THIS worktree's own durable verification runs -- and nothing else.
#
# Several agents (Claude, Codex, OpenCode) run the same verification scripts on
# this host at the same time. Stopping "the ai-long run" by matching a process
# name (`pkill -f run-some-suite.sh`, `killall node`, ...) terminates
# EVERY agent's run, which is exactly the incident this script exists to make
# impossible. So this script never selects a process by name, never uses
# `pgrep`/`pkill`/`killall`, and never signals a process group. It acts only on
# process ids that a durable run recorded for itself in THIS worktree:
#
#   .verification/<scope>-suite.running   pid=<supervisor>  worktree=<path> ...
#   .verification/<scope>-suite.job-pid   the registered job pid
#
# A recorded pid is trusted only after all of these hold:
#   * the record's `worktree=` is this worktree (a copied/stale record is refused);
#   * the pid is live (sandbox-aware `hvl_pid_is_live`);
#   * the pid's command line is a durable-run supervisor for THIS scope (guards
#     against pid reuse pointing at an unrelated process).
#
# Stop sequence: SIGTERM the supervisor -- its own trap
# (`hvl_cancel_and_release`) walks the job's process tree, releases the host
# lease/capacity slot, removes its lock and records a `cancelled` status. Only if
# the supervisor or a member of the tree it was running is still alive after the
# grace period do we signal those explicit pids (re-walked by parent/child
# descent from the recorded pids, exactly like the library), TERM first, KILL
# last. See .claude/rules/hooks-and-tooling.md "Launching and stopping".

set -eu

usage() {
  cat >&2 <<'USAGE'
Usage: stop-local-verification.sh [--dry-run] [--grace SECONDS] (--all | <scope>...)

  <scope>       full | ai-long | ai-playability | perf  (as written to .verification/)
  --all         every durable scope that has a live run in THIS worktree
  --dry-run     print what would be stopped; signal nothing
  --grace N     seconds to wait after SIGTERM before escalating (default 30)

Only runs recorded by this worktree are ever touched. Runs in other worktrees
(other agents) are never selected, listed for stopping, or signalled.
USAGE
  exit 2
}

dry_run=0
grace=30
all=0
scopes=''

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --all) all=1 ;;
    --grace)
      shift
      [ "$#" -gt 0 ] || usage
      grace="$1"
      case "$grace" in ''|*[!0-9]*) usage ;; esac
      ;;
    -h|--help) usage ;;
    -*) usage ;;
    *)
      case "$1" in ''|*[!a-z0-9_-]*) usage ;; esac
      scopes="$scopes $1"
      ;;
  esac
  shift
done

if [ "$all" -eq 1 ]; then
  [ -z "$scopes" ] || usage
  scopes='full ai-long ai-playability perf'
elif [ -z "$scopes" ]; then
  usage
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
# shellcheck source=./host-verification-lease.sh
. "$repo_root/scripts/host-verification-lease.sh"
artifact_dir="$repo_root/.verification"

stopped=0
survivors=0

record_field() {
  # record_field <file> <key>
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1
}

live_members() {
  # live_members "<pid> <pid> ..." -> the subset still alive
  live_out=''
  for live_p in $1; do
    if hvl_pid_is_live "$live_p"; then live_out="$live_out $live_p"; fi
  done
  printf '%s\n' "$live_out"
}

tree_of() {
  # tree_of "<root> <root> ..." -> roots plus live descendants, by explicit ppid descent only
  tree_out=''
  for tree_root in $1; do
    tree_out="$tree_out $(hvl_job_tree_pids "$tree_root")"
  done
  printf '%s\n' "$tree_out"
}

wait_until_gone() {
  # wait_until_gone "<pids>" <seconds> -> 0 if none live
  wait_left="$2"
  while :; do
    [ -z "$(live_members "$1" | tr -d ' ')" ] && return 0
    [ "$wait_left" -gt 0 ] || return 1
    sleep 1
    wait_left=$((wait_left - 1))
  done
}

for scope in $scopes; do
  prefix="$artifact_dir/${scope}-suite"
  running="$prefix.running"
  job_pid_file="$prefix.job-pid"

  if [ ! -f "$running" ]; then
    echo "$scope: no run recorded in this worktree."
    continue
  fi

  record_worktree="$(record_field "$running" worktree)"
  # Compare physical paths: /var vs /private/var (macOS) and symlinked checkouts must not
  # make a legitimate record look foreign -- nor a foreign one look local.
  record_physical="$(cd "$record_worktree" 2>/dev/null && pwd -P || true)"
  repo_physical="$(cd "$repo_root" && pwd -P)"
  if [ -z "$record_physical" ] || [ "$record_physical" != "$repo_physical" ]; then
    echo "$scope: REFUSED -- record names worktree '$record_worktree', not '$repo_root'." >&2
    survivors=$((survivors + 1))
    continue
  fi

  supervisor="$(record_field "$running" pid)"
  case "$supervisor" in ''|*[!0-9]*) echo "$scope: REFUSED -- unreadable supervisor pid in $running." >&2; survivors=$((survivors + 1)); continue ;; esac

  if ! hvl_pid_is_live "$supervisor"; then
    echo "$scope: recorded supervisor $supervisor is not running (stale marker); nothing to stop."
    continue
  fi

  # Identity guard against pid reuse: the recorded pid must still be a durable-run
  # supervisor for this scope. (We already selected the pid by record; this only
  # confirms the record still points at what it claims.)
  supervisor_cmd="$(ps -o command= -p "$supervisor" 2>/dev/null || true)"
  case "$supervisor_cmd" in
    *run-durable-test-suite.sh*"$scope"*) ;;
    *)
      echo "$scope: REFUSED -- pid $supervisor is not this scope's durable-run supervisor (pid reused?): $supervisor_cmd" >&2
      survivors=$((survivors + 1))
      continue
      ;;
  esac

  job_pid=''
  if [ -f "$job_pid_file" ]; then
    job_pid="$(sed -n '1p' "$job_pid_file" 2>/dev/null || true)"
    case "$job_pid" in ''|*[!0-9]*) job_pid='' ;; esac
  fi

  roots="$supervisor"
  [ -z "$job_pid" ] || roots="$roots $job_pid"
  members="$(tree_of "$roots")"

  echo "$scope: supervisor=$supervisor job=${job_pid:-none} tree:$members"

  if [ "$dry_run" -eq 1 ]; then
    echo "$scope: --dry-run, nothing signalled."
    continue
  fi

  # 1. Ask the supervisor to cancel: its trap tears down the tree and records status.
  kill -TERM "$supervisor" 2>/dev/null || true
  if wait_until_gone "$members" "$grace"; then
    echo "$scope: stopped cleanly."
    stopped=$((stopped + 1))
    continue
  fi

  # 2. Escalate against the explicit recorded tree only (re-walked, never by name).
  echo "$scope: still alive after ${grace}s; signalling the recorded tree." >&2
  members="$(tree_of "$roots") $members"
  for member in $(live_members "$members"); do
    kill -TERM "$member" 2>/dev/null || true
  done
  if wait_until_gone "$members" "${STOP_LOCAL_VERIFICATION_TERM_WAIT:-10}"; then
    echo "$scope: stopped after escalation."
    stopped=$((stopped + 1))
    continue
  fi
  for member in $(live_members "$members"); do
    kill -KILL "$member" 2>/dev/null || true
  done
  if wait_until_gone "$members" 5; then
    echo "$scope: stopped (SIGKILL)."
    stopped=$((stopped + 1))
  else
    echo "$scope: FAILED to stop pids:$(live_members "$members")" >&2
    survivors=$((survivors + 1))
  fi
done

echo "stopped=$stopped refused_or_failed=$survivors"
[ "$survivors" -eq 0 ]
