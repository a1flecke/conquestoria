#!/bin/sh
# yarn verify:local:status -- one agent/human-facing view of every tracked
# heavyweight verification class on this host (#1133 P2 / MR6).
#
# Shows, from durable files and lease/budget metadata only -- NEVER from
# `ps` heuristics (the exact failure mode #1133 opened over: an agent that
# loses its terminal/tool stream retrying "because the UI ended" instead of
# reading durable state):
#   - the host-wide mutex's current holder (if any) and any process
#     currently blocked waiting for it;
#   - the ai-long singleton mutex's holder and waiters (#1166);
#   - each host capacity lane's (#1166: foreground / background) current
#     holders and any process currently blocked waiting for a slot, every
#     row tagged lane=<lane>, plus an in-use/capacity line per lane;
#   - each of the four durable scopes (full, ai-long, ai-playability, perf)
#     this worktree has ever run via its canonical durable command
#     (`yarn test:durable`, `yarn test:ai-long`, `yarn test:ai-playability`,
#     `yarn perf:report:durable`): its last known RUNNING/DONE/ABANDONED/NONE
#     state.
#
# Row states:
#   ACTIVE     a live mutex or budget holder (command, worktree, elapsed).
#   QUEUED     a live process blocked waiting for the mutex or a budget
#              slot (command, worktree, waited).
#   RUNNING    a durable scope with an active .running marker whose real
#              job pid is confirmed alive.
#   DONE       a durable scope with a completed, HEAD-matching result
#              (passed or failed).
#   ABANDONED  a durable scope's .running marker whose recorded process is
#              no longer alive -- treat as a failure, do not wait for it.
#   STALE      a durable scope's completed result belongs to a different
#              HEAD or working-tree state than the one now checked out.
#   NONE       no durable result exists yet for that scope in this worktree.
#
# A stale ACTIVE/QUEUED record left behind by a killed process is a read-
# side concern here (filtered out via a liveness check on its recorded
# pid), not something this script reclaims -- it never writes to lease
# state, only reads it.
#
# If you lost a stream and are wondering whether to retry: read this first.
#   RUNNING    -> tail its log (scripts/read-durable-test-result.sh <scope>
#                 prints the last 20 lines) or wait; do not start a duplicate.
#   DONE       -> consume the recorded result; nothing to rerun.
#   ABANDONED  -> clean up and rerun; it will not resume on its own.
#   Never retry solely because the terminal/tool stream ended.

set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
# Fail fast and clearly if this isn't a git checkout, rather than letting
# each of the four read-durable-test-result.sh calls below fail the same
# way with less context.
git -C "$script_dir" rev-parse --show-toplevel > /dev/null
# shellcheck source=./host-verification-lease.sh
. "$script_dir/host-verification-lease.sh"

now="$(hvl_now)"

print_row() {
  # print_row <state> <command-or-scope> <detail>
  printf '%-9s %-20s %s\n' "$1" "$2" "$3"
}

echo '--- host-wide coordination ---'
if [ -n "${CI:-}" ] || [ -n "${HOST_VERIFICATION_LEASE_DISABLE:-}" ]; then
  echo '(disabled: CI or HOST_VERIFICATION_LEASE_DISABLE is set)'
else
  hvl_status_root="$(hvl_resolve_root)" || hvl_status_root=""
  mutex_active=0
  if [ -n "$hvl_status_root" ]; then
    mutex_owner="$hvl_status_root/active/owner"
    if [ -f "$mutex_owner" ]; then
      m_pid="$(hvl_field "$mutex_owner" pid)"
      if [ -n "$m_pid" ] && hvl_pid_is_live "$m_pid"; then
        mutex_active=1
        m_cmd="$(hvl_field "$mutex_owner" command)"
        m_wt="$(hvl_field "$mutex_owner" worktree)"
        m_at="$(hvl_field "$mutex_owner" acquired_at)"
        m_elapsed=$(( now - ${m_at:-$now} ))
        m_job_pid="$(hvl_field "$mutex_owner" job_pid)"
        m_detail="worktree=${m_wt:-?} elapsed=${m_elapsed}s pid=$m_pid"
        [ -z "$m_job_pid" ] || m_detail="$m_detail job_pid=$m_job_pid"
        print_row ACTIVE "${m_cmd:-lease}" "$m_detail"
      fi
    fi
    mutex_waiting_dir="$hvl_status_root/waiting"
    if [ -d "$mutex_waiting_dir" ]; then
      for f in "$mutex_waiting_dir"/*; do
        [ -f "$f" ] || continue
        w_pid="$(hvl_field "$f" pid)"
        if [ -n "$w_pid" ] && hvl_pid_is_live "$w_pid"; then
          w_cmd="$(hvl_field "$f" command)"
          w_wt="$(hvl_field "$f" worktree)"
          w_at="$(hvl_field "$f" wait_started_at)"
          w_waited=$(( now - ${w_at:-$now} ))
          print_row QUEUED "${w_cmd:-lease}" "worktree=${w_wt:-?} waited=${w_waited}s pid=$w_pid"
        fi
      done
    fi
  fi
  [ "$mutex_active" -eq 1 ] || echo 'push-verification lease: idle'

  hvl_status_scope_dir="$(hvl_resolve_host_scope_dir)" || hvl_status_scope_dir=""

  # #1166: the ai-long singleton mutex (a collision lock, not capacity).
  # A second ai-long request now waits HERE without holding any capacity,
  # so without this row it would be invisible.
  if [ -n "$hvl_status_scope_dir" ]; then
    ai_long_root="$hvl_status_scope_dir/ai-long-horizon-lease"
    ai_long_owner="$ai_long_root/active/owner"
    ai_long_active=0
    if [ -f "$ai_long_owner" ]; then
      a_pid="$(hvl_field "$ai_long_owner" pid)"
      if [ -n "$a_pid" ] && hvl_pid_is_live "$a_pid"; then
        ai_long_active=1
        a_wt="$(hvl_field "$ai_long_owner" worktree)"
        a_at="$(hvl_field "$ai_long_owner" acquired_at)"
        print_row ACTIVE ai-long-mutex "worktree=${a_wt:-?} elapsed=$(( now - ${a_at:-$now} ))s pid=$a_pid"
      fi
    fi
    if [ -d "$ai_long_root/waiting" ]; then
      for f in "$ai_long_root/waiting"/*; do
        [ -f "$f" ] || continue
        w_pid="$(hvl_field "$f" pid)"
        if [ -n "$w_pid" ] && hvl_pid_is_live "$w_pid"; then
          w_wt="$(hvl_field "$f" worktree)"
          w_at="$(hvl_field "$f" wait_started_at)"
          print_row QUEUED ai-long-mutex "worktree=${w_wt:-?} waited=$(( now - ${w_at:-$now} ))s pid=$w_pid"
        fi
      done
    fi
    [ "$ai_long_active" -eq 1 ] || echo 'ai-long singleton lease: idle'
  fi

  # #1166: host capacity is two non-borrowable lanes. Rows carry lane=...;
  # every slot-* directory is scanned (not just 0..capacity-1) so a slot
  # held by an older checkout with a larger budget is still shown.
  for lane in foreground background; do
    lane_max="$(hvl_lane_capacity "$lane")"
    lane_in_use=0
    if [ -n "$hvl_status_scope_dir" ]; then
      budget_dir="$(hvl_lane_budget_dir "$hvl_status_scope_dir" "$lane")"
      for slot_dir in "$budget_dir"/slot-*; do
        slot_owner="$slot_dir/owner"
        [ -f "$slot_owner" ] || continue
        s_pid="$(hvl_field "$slot_owner" pid)"
        if [ -n "$s_pid" ] && hvl_pid_is_live "$s_pid"; then
          lane_in_use=$((lane_in_use + 1))
          s_cmd="$(hvl_field "$slot_owner" command)"
          s_wt="$(hvl_field "$slot_owner" worktree)"
          s_at="$(hvl_field "$slot_owner" acquired_at)"
          s_elapsed=$(( now - ${s_at:-$now} ))
          print_row ACTIVE "${s_cmd:-budget}" "lane=$lane worktree=${s_wt:-?} elapsed=${s_elapsed}s pid=$s_pid slot=${slot_dir##*/slot-}"
        fi
      done
      budget_waiting_dir="$budget_dir/waiting"
      if [ -d "$budget_waiting_dir" ]; then
        for f in "$budget_waiting_dir"/*; do
          [ -f "$f" ] || continue
          w_pid="$(hvl_field "$f" pid)"
          if [ -n "$w_pid" ] && hvl_pid_is_live "$w_pid"; then
            w_cmd="$(hvl_field "$f" command)"
            w_wt="$(hvl_field "$f" worktree)"
            w_at="$(hvl_field "$f" wait_started_at)"
            w_waited=$(( now - ${w_at:-$now} ))
            print_row QUEUED "${w_cmd:-budget}" "lane=$lane worktree=${w_wt:-?} waited=${w_waited}s pid=$w_pid"
          fi
        done
      fi
    fi
    echo "$lane capacity: $lane_in_use/$lane_max slots in use"
  done
fi

echo ''
echo '--- durable scopes (this worktree) ---'
for scope in full ai-long ai-playability perf; do
  scope_out="$(sh "$script_dir/read-durable-test-result.sh" "$scope" 2>&1 || true)"
  scope_status_line="$(printf '%s\n' "$scope_out" | sed -n '1p')"
  scope_status="${scope_status_line#STATUS: }"
  scope_detail="$(printf '%s\n' "$scope_out" | sed -n '2p')"
  case "$scope_status" in
    active) scope_state=RUNNING ;;
    passed) scope_state=DONE ;;
    failed) scope_state=DONE ;;
    abandoned) scope_state=ABANDONED ;;
    mismatched) scope_state=STALE ;;
    *) scope_state=NONE ;;
  esac
  print_row "$scope_state" "$scope" "$scope_detail"
done
