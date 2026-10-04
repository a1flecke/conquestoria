#!/bin/sh
# Launch one durable verification run for THIS worktree, politely, on a host that
# several agents share.
#
# What it does that a bare `yarn test:ai-long:durable &` does not:
#   0. reuses a passing durable result for this exact clean HEAD instead of
#      launching an identical run (`--force` overrides);
#   1. shows who else is running/queued on the host first (`verify:local:status`),
#      so the decision to start is informed;
#   2. refuses a duplicate of the same scope in this worktree (the durable runner
#      would refuse too, but only after you have been told the run "started");
#   3. refuses to pile a third heavyweight run onto this worktree
#      (`--max-mine`, default 2 -- one worktree must not consume the host);
#   4. refuses a dirty tree unless `--allow-dirty`: durable evidence is only
#      valid for the exact tree it ran on, and any edit while it runs
#      (or before, uncommitted) turns the result into `mismatched`;
#   5. starts the run DETACHED in its own session so it outlives the tool call
#      that launched it (a plain `&` is killed with the caller's process group --
#      that is how a "background" run silently dies), logs to
#      `.verification/launch-<scope>.log`, and records the launcher pid in
#      `.verification/launch-<scope>.pid`.
#
# It queues like everything else: the runner itself waits for host capacity /
# the ai-long singleton without holding a slot. Stopping a run is
# `verify:stop` (scripts/stop-local-verification.sh), which acts on recorded pids
# only -- never `pkill`/`killall` by name, which would kill other agents' runs.

set -eu

usage() {
  cat >&2 <<'USAGE'
Usage: launch-local-verification.sh [--wait] [--allow-dirty] [--force] [--max-mine N] <scope>

  <scope>          full | ai-long | ai-playability | perf
  --wait           block until the run finishes; exit 0 only if it passed
  --allow-dirty    launch even though the worktree has uncommitted changes
  --force          re-run even if a passing result already exists for this HEAD
  --max-mine N     max live durable runs this worktree may have (default 2)

When the worktree is clean and a durable <scope> result for the current HEAD has
already passed, the reason to run again is gone: this prints a one-line reuse
notice and exits 0 without launching anything. Use --force to run anyway.

Environment (tests): LAUNCH_VERIFICATION_COMMAND overrides the launched command.
USAGE
  exit 2
}

wait_for=0
allow_dirty=0
force=0
max_mine=2
scope=''

while [ "$#" -gt 0 ]; do
  case "$1" in
    --wait) wait_for=1 ;;
    --allow-dirty) allow_dirty=1 ;;
    --force) force=1 ;;
    --max-mine)
      shift
      [ "$#" -gt 0 ] || usage
      max_mine="$1"
      case "$max_mine" in ''|*[!0-9]*) usage ;; esac
      ;;
    -h|--help) usage ;;
    -*) usage ;;
    *)
      [ -z "$scope" ] || usage
      scope="$1"
      ;;
  esac
  shift
done

case "$scope" in
  full) yarn_script='test:durable' ;;
  ai-long) yarn_script='test:ai-long:durable' ;;
  ai-playability) yarn_script='test:ai-playability:durable' ;;
  perf) yarn_script='perf:report:durable' ;;
  *) usage ;;
esac

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
# shellcheck source=./host-verification-lease.sh
. "$repo_root/scripts/host-verification-lease.sh"
artifact_dir="$repo_root/.verification"
mkdir -p "$artifact_dir"

live_run_of() {
  # live_run_of <scope> -> prints the supervisor pid if this worktree has a live run of it
  lr_running="$artifact_dir/$1-suite.running"
  [ -f "$lr_running" ] || return 1
  lr_pid="$(sed -n 's/^pid=//p' "$lr_running" | head -n 1)"
  case "$lr_pid" in ''|*[!0-9]*) return 1 ;; esac
  hvl_pid_is_live "$lr_pid" || return 1
  printf '%s\n' "$lr_pid"
}

# 0. Does this evidence need producing at all? If the current clean HEAD already
# has a passing durable result for this scope, reuse it instead of burning shared
# CPU on an identical run. This answers "must it run again"; verify:impact (#1232)
# answers the separate "which evidence does this change require" and is not
# conflated with it. The reader enforces the rest: only `passed` for the current
# HEAD and tree reuses (`failed` / `mismatched` / `abandoned` / `none`, and any
# dirty tree, all fall through to a real launch). `--force` skips this entirely.
if [ "$force" -ne 1 ]; then
  durable_result="$(sh "$repo_root/scripts/read-durable-test-result.sh" "$scope" 2>/dev/null || true)"
  if printf '%s\n' "$durable_result" | grep -q '^STATUS: passed'; then
    short_head="$(git -C "$repo_root" rev-parse --short HEAD)"
    completed_at="$(sed -n 's/^completed_at=//p' "$artifact_dir/$scope-suite.status" 2>/dev/null | head -n 1)"
    echo "Reusing durable $scope evidence for $short_head (passed at ${completed_at:-unknown}); pass --force to re-run."
    exit 0
  fi
fi

# 1. What is the rest of the host doing?
echo '--- host snapshot (other agents included) ---'
sh "$repo_root/scripts/verify-local-status.sh" 2>&1 | grep -E 'ACTIVE|QUEUED|capacity|lease' || true
echo '---'

# 2. Duplicate of this scope?
if existing="$(live_run_of "$scope")"; then
  echo "A $scope run is already live in this worktree (supervisor pid $existing)." >&2
  echo "Wait for it (yarn $yarn_script:status) or stop it: scripts/stop-local-verification.sh $scope" >&2
  exit 3
fi

# 3. Too many of mine?
mine=0
for other in full ai-long ai-playability perf; do
  if live_run_of "$other" >/dev/null; then mine=$((mine + 1)); fi
done
if [ "$mine" -ge "$max_mine" ]; then
  echo "This worktree already has $mine live durable run(s) (limit $max_mine); not adding another." >&2
  echo "Shared host: let one finish or stop one with scripts/stop-local-verification.sh <scope>." >&2
  exit 3
fi

# 4. Dirty tree?
if [ "$allow_dirty" -ne 1 ] && [ -n "$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)" ]; then
  echo 'The worktree has uncommitted changes; durable evidence is valid only for the exact tree it ran on.' >&2
  echo 'Commit first, or pass --allow-dirty. Do not edit files while the run is in progress.' >&2
  exit 4
fi

# 5. Start detached in a NEW session so it survives the launching tool call.
log="$artifact_dir/launch-$scope.log"
pidfile="$artifact_dir/launch-$scope.pid"
: > "$log"

if [ -n "${LAUNCH_VERIFICATION_COMMAND:-}" ]; then
  launch_cmd="$LAUNCH_VERIFICATION_COMMAND"
else
  launch_cmd="cd '$repo_root' && bash scripts/run-with-mise.sh yarn $yarn_script"
fi

if command -v setsid >/dev/null 2>&1; then
  nohup setsid sh -c "$launch_cmd" >"$log" 2>&1 </dev/null &
elif command -v perl >/dev/null 2>&1; then
  # macOS ships no setsid(1); POSIX::setsid gives the same new-session detach.
  nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' sh -c "$launch_cmd" >"$log" 2>&1 </dev/null &
else
  echo 'Neither setsid nor perl is available to detach the run; refusing to start a run that would die with this shell.' >&2
  exit 5
fi
launcher_pid=$!
printf '%s\n' "$launcher_pid" > "$pidfile"

echo "Launched $scope (launcher pid $launcher_pid)."
echo "  log:    $log"
echo "  status: yarn $yarn_script:status   (or yarn verify:local:status)"
echo "  stop:   scripts/stop-local-verification.sh $scope   (recorded pids only)"

if [ "$wait_for" -eq 1 ]; then
  # The launcher is our child: `wait` reaps it. `setsid` may have forked, so also poll the
  # durable reader until it stops saying `active`.
  wait "$launcher_pid" 2>/dev/null || true
  while :; do
    result="$(sh "$repo_root/scripts/read-durable-test-result.sh" "$scope" 2>&1 || true)"
    printf '%s\n' "$result" | grep -q '^STATUS: active' || break
    sleep 5
  done
  printf '%s\n' "$result" | head -n 3
  printf '%s\n' "$result" | grep -q '^STATUS: passed'
fi
