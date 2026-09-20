#!/usr/bin/env bash
# #1133 (items B, E). The host lease used to record only the *supervisor*
# pid (the shell that called hvl_acquire), and run-under-host-lease.sh only
# ever signaled the single immediate child pid on cancellation. Two real gaps
# followed from that, both exercised here with a real nested child+grandchild
# tree (not the single-`sleep` fixture in host-verification-lease.test.sh):
#
#   1. If the supervisor dies (crash, OOM-kill, agent restart) while its
#      heavyweight job's process tree is still alive, hvl_is_stale saw a dead
#      supervisor pid and reclaimed the lease immediately -- even though the
#      real job was still consuming CPU -- letting a second acquisition start
#      and overlap it.
#   2. Signaling only the immediate child pid on cancellation does not
#      guarantee the whole descendant tree dies; a grandchild can be
#      orphaned and keep running.
#
# hvl_run_registering_job (host-verification-lease.sh) registers the wrapped
# job's own pid into the lease metadata as soon as it's known, and
# cancellation walks the live process table from that pid (hvl_job_tree_pids)
# to reach every descendant rather than a single pid. (An earlier version of
# this fix used `set -m` plus a single `kill -SIGNAL -$pgid` to treat the job
# as one OS process group; that was found to take down an entire CI runner,
# almost certainly because the new-process-group semantics resolved more
# broadly than intended in that environment. The tree-walk approach below
# never signals anything outside PIDs explicitly reached by parent/child
# descent from a PID this library itself recorded, so it cannot repeat that
# failure regardless of how a given host/CI handles process groups/sessions.)

set -eu
unset CI || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"
RUNNER="$ROOT/scripts/run-under-host-lease.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
lease_root="$tmpdir/lease-root"
mkdir -p "$lease_root"

wait_for_lease_owner() {
  attempts=0
  while [ ! -f "$lease_root/active/owner" ]; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 100 ]; then
      echo "holder did not acquire the lease within 10 seconds" >&2
      return 1
    fi
    sleep 0.1
  done
}

wait_for_field() {
  # wait_for_field <field-name> -- polls the owner file for a non-empty
  # value, since hvl_run_registering_job registers job_pid slightly after
  # the initial acquire/mkdir.
  field="$1"
  attempts=0
  while :; do
    value="$(sed -n "s/^${field}=//p" "$lease_root/active/owner" 2>/dev/null | head -n 1)"
    [ -n "$value" ] && { printf '%s\n' "$value"; return 0; }
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 100 ]; then
      echo "field '$field' never appeared in the owner file within 10 seconds" >&2
      return 1
    fi
    sleep 0.1
  done
}

# job_tree_pids <root-pid> -- shells out to the same tree-walk the library
# itself uses, so this test verifies real behavior rather than reimplementing
# (and potentially diverging from) the walk's own logic.
job_tree_pids() {
  ( . "$LIB"; hvl_job_tree_pids "$1" )
}

job_tree_any_alive() {
  for p in $(job_tree_pids "$1"); do
    kill -0 "$p" 2>/dev/null && return 0
  done
  return 1
}

# --- 1. the registered job_pid is real, and its descendant tree includes
#        the nested grandchild -------------------------------------------

rm -rf "$lease_root"; mkdir -p "$lease_root"
holder_log="$tmpdir/holder1.log"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    exec sh "$RUNNER" nested-holder -- sh -c 'sh -c "sleep 20" & wait'
) > "$holder_log" 2>&1 &
holder_pid=$!
wait_for_lease_owner
job_pid="$(wait_for_field job_pid)"

case "$job_pid" in
  ''|*[!0-9]*)
    echo "job_pid was not a plain integer: '$job_pid'" >&2
    exit 1
    ;;
esac
kill -0 "$job_pid" 2>/dev/null || {
  echo "registered job_pid $job_pid is not a live process" >&2
  exit 1
}
tree_members="$(job_tree_pids "$job_pid")"
printf '%s' "$tree_members" | grep -q "$job_pid" || {
  echo "the job tree did not even include its own root pid: $tree_members" >&2
  exit 1
}
descendant_comms="$(for p in $tree_members; do ps -o comm= -p "$p" 2>/dev/null; done)"
printf '%s\n' "$descendant_comms" | grep -q 'sleep' || {
  echo "the nested grandchild sleep process was not reachable from job_pid $job_pid's tree: $descendant_comms" >&2
  exit 1
}

kill -TERM "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
sleep 0.3
job_tree_any_alive "$job_pid" && {
  echo "cancelling the wrapper left members of the registered job's tree alive" >&2
  exit 1
}

# --- 2. cancelling the wrapper reaps the WHOLE nested tree, not just the
#        immediate child ---------------------------------------------------

rm -rf "$lease_root"; mkdir -p "$lease_root"
marker_dir="$tmpdir/tree-marker"
mkdir -p "$marker_dir"
holder_log="$tmpdir/holder2.log"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    exec sh "$RUNNER" tree-holder -- \
    sh -c "touch '$marker_dir/parent-started'; sh -c \"touch '$marker_dir/child-started'; sleep 20\" & wait"
) > "$holder_log" 2>&1 &
holder_pid=$!
wait_for_lease_owner
job_pid="$(wait_for_field job_pid)"

attempts=0
while [ ! -f "$marker_dir/child-started" ]; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 50 ] || { echo "nested child never started" >&2; exit 1; }
  sleep 0.1
done

before_members="$(job_tree_pids "$job_pid")"
before_count=0
for p in $before_members; do
  kill -0 "$p" 2>/dev/null && before_count=$((before_count + 1))
done
[ "$before_count" -ge 2 ] || {
  echo "expected at least 2 live members (parent shell + nested sleep) in job_pid $job_pid's tree before cancellation, saw $before_count" >&2
  exit 1
}

kill -TERM "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
sleep 0.3

after_count=0
for p in $before_members; do
  kill -0 "$p" 2>/dev/null && after_count=$((after_count + 1))
done
[ "$after_count" -eq 0 ] || {
  echo "cancellation left $after_count process(es) alive from job_pid $job_pid's tree" >&2
  exit 1
}

# --- 3. a live registered job is never stolen even once its own supervisor
#        is killed outright (SIGKILL bypasses the EXIT trap that would
#        normally release the lease) -- and the lease becomes reclaimable
#        again only once that job actually dies -----------------------------

rm -rf "$lease_root"; mkdir -p "$lease_root"
holder_log="$tmpdir/holder3.log"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" \
    exec sh "$RUNNER" orphan-holder -- sh -c 'sh -c "sleep 30" & wait'
) > "$holder_log" 2>&1 &
holder_pid=$!
wait_for_lease_owner
job_pid="$(wait_for_field job_pid)"
kill -0 "$job_pid" 2>/dev/null || {
  echo "job_pid $job_pid was never alive to begin with" >&2
  exit 1
}

# Simulate an abrupt supervisor death: SIGKILL cannot be trapped, so the
# lease directory/metadata is left behind exactly as it would be after a
# real crash/OOM-kill, with the job still running underneath it.
kill -KILL "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
[ -d "$lease_root/active" ] || {
  echo "test setup error: the lease directory disappeared on its own after SIGKILL" >&2
  exit 1
}
kill -0 "$job_pid" 2>/dev/null || {
  echo "test setup error: the job died along with its SIGKILLed supervisor" >&2
  exit 1
}

waiter_marker="$tmpdir/waiter-ran"
waiter_log="$tmpdir/waiter3.log"
rm -f "$waiter_marker"
(
  HOST_VERIFICATION_LEASE_ROOT="$lease_root" HOST_VERIFICATION_LEASE_REPORT_SECONDS=1 \
    sh "$RUNNER" waiter -- sh -c "touch '$waiter_marker'; exit 0"
) > "$waiter_log" 2>&1 &
waiter_pid=$!
sleep 1.5
[ ! -e "$waiter_marker" ] || {
  echo "a second acquisition stole the lease while its orphaned-but-live job was still running (#1133 item B regression)" >&2
  exit 1
}
grep -Fq 'Waiting for host verification slot' "$waiter_log" || {
  echo "the waiter did not report waiting behind the orphaned-but-live job" >&2
  exit 1
}

# Now actually end the orphaned job -- the lease must become reclaimable
# again once it is genuinely gone.
kill -KILL "$job_pid" 2>/dev/null || true
attempts=0
while kill -0 "$job_pid" 2>/dev/null; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 50 ] || { echo "orphaned job_pid $job_pid would not die" >&2; exit 1; }
  sleep 0.1
done

wait "$waiter_pid" 2>/dev/null || true
[ -e "$waiter_marker" ] || {
  echo "the waiter never acquired the lease after the orphaned job actually ended" >&2
  cat "$waiter_log" >&2
  exit 1
}

echo "all host-verification-lease process-group scenarios passed"
