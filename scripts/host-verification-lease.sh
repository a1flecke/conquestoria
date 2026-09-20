#!/bin/sh
# Host-wide verification lease and resource budget (#892, #1133).
#
# A local development host can run several linked worktrees at once (see
# `.claude/rules/hooks-and-tooling.md`). *Suite-scale* verification --
# `yarn test:durable` and the local pre-push test+build gate -- spawns a
# full Vitest worker pool per invocation; two of those overlapping on one
# host can starve each other's worker processes and produce spurious
# pool-startup failures (see the incident this issue fixes: "Timeout
# waiting for worker to respond" before any test file had even started).
# This library's `hvl_acquire`/`hvl_release` provide ONE host-wide mutual-
# exclusion slot for that class of command, implemented as an atomic
# `mkdir` lease so no daemon or network service is required.
#
# #1133 items H/J found that two independent single-slot mutexes (this one,
# and run-ai-long-horizon.sh's own separate one) are not, on their own, a
# machine resource policy: plain `yarn test`/`test:regular`/
# `test:intensive-simulations` -- run directly by a developer or agent, the
# most common heavy Vitest invocation of all -- had NO gating whatsoever,
# so any number of them could pile up concurrently with no bound.
# `hvl_acquire_budget_slot`/`hvl_release_budget_slot` add a host-wide
# COUNTING semaphore (as opposed to the single-slot mutex above) that
# `scripts/run-test-suite.sh` now uses for all three of its modes, capping
# the TOTAL number of concurrently active heavyweight Vitest invocations
# host-wide regardless of which command/worktree/agent started them. This
# is a deliberate reversal of this repo's own prior "never lock routine
# yarn test" guidance -- see the acceptance-criteria note on
# `hvl_acquire_budget_slot` below for why.
#
# This library intentionally does not touch worktree-local state
# (`.verification/`, Vite/Vitest caches) -- those remain per-worktree.
#
# This file only defines functions; it has no top-level side effects, so it
# is always safe to `. ` (source) it. Callers are:
#   - scripts/run-under-host-lease.sh (a small CLI: acquire, run one
#     command with signal forwarding, release)
#   - scripts/verify-before-push.sh (sources this directly to bracket its
#     test+build phases with one acquisition)
#   - scripts/run-test-suite.sh (sources this directly for the resource
#     budget only, around each of its three modes)
#
# Public functions:
#   hvl_acquire <label>   Block until the lease is owned by this process (or
#                         until CI mode causes an immediate no-op). On
#                         success, sets HVL_LEASE_DIR/HVL_META_FILE/
#                         HVL_SKIPPED and returns 0.
#   hvl_release           Release the lease iff this process still owns it
#                         (verified against recorded pid + start marker).
#                         Safe to call multiple times and safe to call when
#                         nothing was acquired.
#   hvl_run_registering_job <command...>
#                         Run <command...>, registering its pid (in
#                         HVL_JOB_PID and the held lease's metadata) as soon
#                         as it's known, and return its exit status. Call
#                         after hvl_acquire. This is what lets hvl_is_stale
#                         (#1133 item B) see a real heavyweight job is still
#                         alive even if the supervising shell that called
#                         hvl_acquire is gone. Does not itself install any
#                         signal handling -- see hvl_cancel_and_release.
#   hvl_cancel_and_release <signal> <exit-code>
#                         The INT/TERM handler a caller of
#                         hvl_run_registering_job should install once, at
#                         the top level (spanning every call it makes): if a
#                         job is currently registered, forwards <signal> to
#                         it and every live descendant found by walking the
#                         process table (#1133 item E; see
#                         hvl_job_tree_pids), waits for it, releases the
#                         lease, and exits <exit-code> (130/143 by
#                         convention).
#   hvl_acquire_budget_slot [label]
#                         Block until fewer than HOST_VERIFICATION_LEASE_
#                         BUDGET (default 3) other processes hold a slot in
#                         the SAME resolved budget domain (or until CI mode
#                         causes an immediate no-op). [label] (default
#                         "budget") is recorded into the won slot's owner
#                         file, and into a self-registered waiting record
#                         while blocked (#1133 MR6), so `yarn
#                         verify:local:status` can show which command holds
#                         or wants each slot from durable files alone, never
#                         `ps`. Unlike hvl_acquire,
#                         more than one holder can be inside this section at
#                         once, up to the budget -- it is a COUNTING
#                         semaphore, not a mutex. Tracks reentrancy with a
#                         depth counter keyed by the resolved budget
#                         directory (not a single global flag), so a nested
#                         call against the SAME domain (e.g. a caller that
#                         already holds a slot invoking another function
#                         that also acquires one) is a no-op rather than
#                         double-counting the same logical job, while an
#                         unrelated call against a DIFFERENT domain (a
#                         different HOST_VERIFICATION_LEASE_ROOT, e.g. a
#                         descendant process/test with its own override)
#                         always goes through real acquisition instead of
#                         inheriting an ancestor's unrelated held state.
#   hvl_release_budget_slot
#                         Release the budget slot iff this call is the
#                         outermost of a matched acquire/release pair on
#                         that same domain-keyed depth counter, and it is
#                         the one that originally acquired it. Safe to call
#                         multiple times and safe to call when nothing was
#                         acquired.
#
# Environment overrides (all optional; see tests/hooks/host-verification-
# lease.test.sh for the contract each one is pinned by):
#   HOST_VERIFICATION_LEASE_ROOT           Lease root directory. Defaults to
#                                           ${TMPDIR:-/tmp}/conquestoria-
#                                           verification/<uid>/<hash of the
#                                           canonical git-common-dir>/push-
#                                           verification-lease so every
#                                           linked worktree of one clone
#                                           shares it, unrelated clones /
#                                           users never do, and the whole
#                                           thing lives outside `.git` (see
#                                           hvl_resolve_host_scope_dir, #1133).
#   HOST_VERIFICATION_LEASE_REPORT_SECONDS How often (seconds) to print a
#                                           waiting-status line. Default 15.
#   HOST_VERIFICATION_LEASE_SHORT_GRACE    Seconds to wait before reclaiming
#                                           a lease with missing/corrupt
#                                           metadata (a creator that crashed
#                                           between `mkdir` and writing its
#                                           metadata file). Default 10.
#   HOST_VERIFICATION_LEASE_LONG_GRACE     Seconds to wait before reclaiming
#                                           a lease whose liveness cannot be
#                                           verified locally (hostname
#                                           mismatch). This lease root is
#                                           chosen to always be local-disk,
#                                           same-host, so this should not
#                                           trigger in practice; it exists
#                                           as a safety net so a corrupt or
#                                           foreign lease cannot block
#                                           development forever. Default
#                                           3600.
#   CI                                     Any non-empty value disables
#                                           coordination entirely (CI runs
#                                           on isolated, dedicated hardware
#                                           and must not know this exists).
#   DURABLE_JOB_PID_FILE                   If set, hvl_run_registering_job
#                                           also writes the real job's pid
#                                           to this path as soon as it's
#                                           known (#1133 items C/D) -- for a
#                                           caller that wants durable,
#                                           worktree-local liveness
#                                           evidence readable by a separate
#                                           process while the job is still
#                                           running. See
#                                           scripts/run-durable-test-suite.sh.
#   DURABLE_FAILURE_KIND_FILE              If set, a cancellation
#                                           (hvl_cancel_and_release /
#                                           hvl_wait_cancel) writes
#                                           `cancelled` to this path.
#   HOST_VERIFICATION_LEASE_BUDGET         Max concurrent holders of the
#                                           counting semaphore
#                                           (hvl_acquire_budget_slot).
#                                           Default 3 -- see that function's
#                                           own comment for the measured
#                                           evidence and its limits. CI is
#                                           unaffected (budget acquisition
#                                           is a no-op there, same as the
#                                           mutex above).
#   HVL_DEBUG_TRACE                        Any non-empty value makes
#                                           hvl_acquire_budget_slot print one
#                                           stderr line per ENTER/WON/
#                                           RECLAIM-EMPTY/RECLAIM-DEAD
#                                           decision (pid, resolved budget
#                                           dir, slot index). Off by default,
#                                           zero cost when unset. This is
#                                           what surfaced the actual
#                                           mechanism behind #1133 MR5's
#                                           cross-process-tree domain-scoping
#                                           bug (see hvl_acquire_budget_slot's
#                                           own comment) -- a real failure
#                                           that reproduced only inside a
#                                           full `yarn test` invocation and
#                                           never in 15+ standalone runs,
#                                           where the ENTER line's complete
#                                           absence proved the acquire calls
#                                           were never reaching real mkdir
#                                           contention at all.

hvl_now() {
  date +%s
}

hvl_hostname() {
  uname -n
}

# Portable "process start identity" -- pairs with a PID to defend against
# PID reuse (see hvl_is_stale). `ps -o lstart=` is supported by both GNU and
# BSD/macOS ps, unlike /proc/<pid>/stat which does not exist on macOS.
hvl_start_marker() {
  ps -o lstart= -p "$1" 2>/dev/null | sed -e 's/^[ \t]*//' -e 's/[ \t]*$//'
}

hvl_pid_is_live() {
  kill -0 "$1" 2>/dev/null
}

# hvl_job_tree_pids <root-pid>
#
# Prints <root-pid> plus every live transitive descendant, space-separated,
# found by walking `ps -eo pid=,ppid=` (portable across BSD/GNU ps). Pairs
# with hvl_run_registering_job (#1133 items B/E). An earlier version of this
# library put the wrapped command in its own OS process group (`set -m`) and
# used a single `kill -SIGNAL -$pgid` to reach it as a unit; that was found
# to be unsafe on at least one real CI runner -- it took down the whole job,
# almost certainly because `set -m`'s new-process-group semantics resolved
# more broadly than intended in that environment. This walk only ever
# touches PIDs reached by explicit parent/child descent from a PID this
# library itself recorded, so it cannot resolve to anything outside that
# explicit set regardless of how the host/CI environment handles process
# groups or sessions.
hvl_job_tree_pids() {
  hvl_snapshot="$(ps -eo pid=,ppid= 2>/dev/null)"
  hvl_tree_result="$1"
  hvl_tree_frontier="$1"
  while [ -n "$hvl_tree_frontier" ]; do
    hvl_tree_next=""
    for hvl_tree_p in $hvl_tree_frontier; do
      hvl_tree_kids="$(printf '%s\n' "$hvl_snapshot" | awk -v p="$hvl_tree_p" '$2==p{print $1}')"
      for hvl_tree_k in $hvl_tree_kids; do
        case " $hvl_tree_result " in
          *" $hvl_tree_k "*) ;;
          *)
            hvl_tree_result="$hvl_tree_result $hvl_tree_k"
            hvl_tree_next="$hvl_tree_next $hvl_tree_k"
            ;;
        esac
      done
    done
    hvl_tree_frontier="$hvl_tree_next"
  done
  printf '%s\n' "$hvl_tree_result"
}

hvl_job_pid_is_live() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  hvl_pid_is_live "$1"
}

# Portable mtime-as-epoch-seconds: try GNU stat syntax, fall back to BSD.
hvl_mtime_epoch() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0
}

hvl_field() {
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1
}

hvl_cpu_count() {
  getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo unknown
}

# Portable, stable hash of $1 (used to key a lease directory name). Tries
# common hash tools in order; `cksum` is POSIX-guaranteed so it is always a
# usable last resort even on a minimal system.
hvl_path_hash() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  elif command -v md5 >/dev/null 2>&1; then
    printf '%s' "$1" | md5
  elif command -v md5sum >/dev/null 2>&1; then
    printf '%s' "$1" | md5sum | awk '{print $1}'
  else
    printf '%s' "$1" | cksum | awk '{print $1"-"$2}'
  fi
}

# hvl_resolve_host_scope_dir
#
# Returns the sandbox-safe, per-user, per-clone base directory every lease
# in this coordination family is rooted under -- both the shared push-
# verification lease this file manages, and any sibling coordination domain
# that wants its own separate lease namespace under the same identity (e.g.
# run-ai-long-horizon.sh's own lease).
#
# #1133: this used to be <git-common-dir>/conquestoria-verification-lease --
# i.e. inside `.git`. Codex's default workspace-write sandbox protects `.git`
# (and, for a linked worktree, the gitdir file's resolved target) read-only,
# so a coordination primitive rooted there is unusable by design for one of
# the two agent runtimes this repo supports; that mismatch was directly
# observed blocking a focused rerun. Moved to a host-shared temp location
# instead, keyed by:
#   - uid, so unrelated users on a shared machine never collide even if
#     $TMPDIR itself is shared (it usually is not on macOS, but is on a
#     typical Linux box defaulting to /tmp); and
#   - a hash of the canonical (absolute) git-common-dir, so every linked
#     worktree of one clone -- which all share that same common dir --
#     resolves to the identical key, while a different clone (even of the
#     same repo, checked out twice) has a different common-dir path and
#     therefore a different key.
# No approval/elevation is required to create or use $TMPDIR, unlike `.git`
# under a restrictive sandbox.
hvl_resolve_host_scope_dir() {
  # #1133: when HOST_VERIFICATION_LEASE_ROOT is overridden (every existing
  # test does this for isolation from the real host lease), derive the
  # scope dir as its parent -- the exact inverse of hvl_resolve_root's own
  # default (`$host_scope_dir/push-verification-lease`) -- so
  # hvl_acquire_budget_slot's `budget` subdirectory lands next to that same
  # overridden root instead of falling through to git-repo resolution
  # (which requires $0 to live in a real checkout's scripts/ directory, not
  # a test fixture's temp script).
  if [ -n "${HOST_VERIFICATION_LEASE_ROOT:-}" ]; then
    dirname "$HOST_VERIFICATION_LEASE_ROOT"
    return 0
  fi

  # Resolved from $0's own directory rather than $PWD so this is correct
  # regardless of the caller's current directory -- every caller (this
  # file itself, or a script that sources it) lives in scripts/, alongside
  # this file, by construction.
  hvl_script_dir="$(cd "$(dirname "$0")" && pwd)"
  hvl_repo_root="$(git -C "$hvl_script_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$hvl_repo_root" ]; then
    echo 'ERROR: host-verification-lease.sh must run inside a git repository, or set HOST_VERIFICATION_LEASE_ROOT.' >&2
    return 1
  fi

  hvl_common_dir_raw="$(cd "$hvl_repo_root" && git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -z "$hvl_common_dir_raw" ]; then
    echo 'ERROR: could not resolve the git common directory for the host verification lease root.' >&2
    return 1
  fi
  case "$hvl_common_dir_raw" in
    /*) hvl_common_dir="$hvl_common_dir_raw" ;;
    *) hvl_common_dir="$(cd "$hvl_repo_root" && cd "$hvl_common_dir_raw" && pwd)" ;;
  esac

  hvl_uid="$(id -u 2>/dev/null || echo unknown)"
  hvl_key="$(hvl_path_hash "$hvl_common_dir")"
  hvl_tmp_base="${TMPDIR:-/tmp}"
  hvl_tmp_base="${hvl_tmp_base%/}"
  printf '%s/conquestoria-verification/%s/%s\n' "$hvl_tmp_base" "$hvl_uid" "$hvl_key"
}

hvl_resolve_root() {
  if [ -n "${HOST_VERIFICATION_LEASE_ROOT:-}" ]; then
    printf '%s\n' "$HOST_VERIFICATION_LEASE_ROOT"
    return 0
  fi

  hvl_host_scope_dir="$(hvl_resolve_host_scope_dir)" || return 1
  printf '%s/push-verification-lease\n' "$hvl_host_scope_dir"
}

hvl_write_metadata() {
  hvl_meta_tmp="$HVL_LEASE_DIR/owner.tmp.$$"
  {
    printf 'pid=%s\n' "$$"
    printf 'hostname=%s\n' "$HVL_SELF_HOST"
    printf 'start_marker=%s\n' "$HVL_SELF_MARKER"
    printf 'command=%s\n' "$HVL_LABEL"
    printf 'worktree=%s\n' "${HVL_WORKTREE:-$PWD}"
    printf 'acquired_at=%s\n' "$(hvl_now)"
    printf 'acquired_at_iso=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)"
    printf 'cpu_count=%s\n' "$(hvl_cpu_count)"
    printf 'vitest_max_workers=%s\n' "${VITEST_MAX_WORKERS:-}"
  } > "$hvl_meta_tmp"
  mv "$hvl_meta_tmp" "$HVL_META_FILE"
}

# Decide whether the lease currently sitting at $HVL_LEASE_DIR is stale and
# safe to reclaim. Returns 0 (true) if stale, 1 (false) if it must be
# respected (either genuinely live, or too young to judge yet).
hvl_is_stale() {
  hvl_meta="$HVL_META_FILE"
  if [ -f "$hvl_meta" ]; then
    hvl_ref_path="$hvl_meta"
  else
    hvl_ref_path="$HVL_LEASE_DIR"
  fi
  hvl_age=$(( $(hvl_now) - $(hvl_mtime_epoch "$hvl_ref_path") ))
  [ "$hvl_age" -ge 0 ] || hvl_age=0

  if [ ! -f "$hvl_meta" ]; then
    # Creator crashed between `mkdir` and writing metadata (or metadata was
    # already reclaimed out from under a concurrent reader). Give it a
    # short grace period in case the write is simply still in flight.
    [ "$hvl_age" -ge "${HOST_VERIFICATION_LEASE_SHORT_GRACE:-10}" ]
    return
  fi

  hvl_owner_pid="$(hvl_field "$hvl_meta" pid)"
  hvl_owner_host="$(hvl_field "$hvl_meta" hostname)"
  hvl_owner_marker="$(hvl_field "$hvl_meta" start_marker)"
  hvl_owner_job_pid="$(hvl_field "$hvl_meta" job_pid)"

  case "$hvl_owner_pid" in
    ''|*[!0-9]*)
      # Corrupt metadata: no parseable pid. Same short grace as missing
      # metadata -- there is no live process to check.
      [ "$hvl_age" -ge "${HOST_VERIFICATION_LEASE_SHORT_GRACE:-10}" ]
      return
      ;;
  esac
  if [ -z "$hvl_owner_host" ]; then
    [ "$hvl_age" -ge "${HOST_VERIFICATION_LEASE_SHORT_GRACE:-10}" ]
    return
  fi

  if [ "$hvl_owner_host" != "$HVL_SELF_HOST" ]; then
    # This lease root is chosen to be local-disk / same-host only, so this
    # should never legitimately happen. Cannot verify liveness remotely, so
    # use the long safety-net grace rather than assuming it is stale.
    [ "$hvl_age" -ge "${HOST_VERIFICATION_LEASE_LONG_GRACE:-3600}" ]
    return
  fi

  if ! hvl_pid_is_live "$hvl_owner_pid"; then
    # #1133 item B: the supervisor that acquired the lease is gone, but if it
    # registered the real heavyweight job's own pid before dying (see
    # hvl_run_registering_job) and that job is still alive, the lease must
    # not be reclaimed out from under it -- a detached/orphaned job can
    # legitimately keep running (and consuming CPU) after its supervising
    # shell exits, and stealing the lease here would let a second
    # suite-scale verification start while the first is still genuinely
    # active. Only an actually-dead job falls through to reclaim.
    if [ -n "$hvl_owner_job_pid" ] && hvl_job_pid_is_live "$hvl_owner_job_pid"; then
      return 1
    fi
    return 0
  fi

  hvl_current_marker="$(hvl_start_marker "$hvl_owner_pid")"
  if [ -z "$hvl_current_marker" ]; then
    # A live PID with an unreadable start marker is not proof of PID reuse.
    # Access to process metadata can be denied by a sandbox, so stealing the
    # lease here would permit two suite-scale verifications to overlap. Wait
    # for the live PID to exit rather than trading safety for faster recovery.
    return 1
  fi

  if [ "$hvl_current_marker" != "$hvl_owner_marker" ]; then
    # Same pid, different process (PID reuse): the process that actually
    # holds this pid now started at a different time than the lease
    # metadata records, so the original owner is gone -- unless its
    # registered job is somehow still alive (see above), in which case the
    # same "do not steal a live job" rule applies.
    if [ -n "$hvl_owner_job_pid" ] && hvl_job_pid_is_live "$hvl_owner_job_pid"; then
      return 1
    fi
    return 0
  fi

  return 1
}

hvl_report_waiting() {
  hvl_waited="$1"
  {
    echo 'Waiting for host verification slot...'
    hvl_owner_pid="$(hvl_field "$HVL_META_FILE" pid)"
    [ -n "$hvl_owner_pid" ] && echo "Held by PID $hvl_owner_pid"
    hvl_owner_cmd="$(hvl_field "$HVL_META_FILE" command)"
    [ -n "$hvl_owner_cmd" ] && echo "Command: $hvl_owner_cmd"
    hvl_owner_wt="$(hvl_field "$HVL_META_FILE" worktree)"
    [ -n "$hvl_owner_wt" ] && echo "Worktree: $hvl_owner_wt"
    echo "Held for: ${hvl_waited}s"
  } >&2
}

# Cancel cleanly while still waiting (i.e. before we own anything): nothing
# to release, just stop -- except a self-registered "waiting" record (#1133
# MR6, see hvl_acquire/hvl_acquire_budget_slot), which would otherwise be
# orphaned since neither function installs an EXIT trap. Shared by both the
# mutex and the budget semaphore's INT/TERM traps; each guard is a no-op
# when that specific function isn't the one currently waiting.
hvl_wait_cancel() {
  hvl_sig="$1"
  hvl_code="$2"
  [ -z "${hvl_waiting_file:-}" ] || rm -f "$hvl_waiting_file"
  [ -z "${hvl_budget_waiting_file:-}" ] || rm -f "$hvl_budget_waiting_file"
  echo "Host verification lease wait cancelled ($hvl_sig)." >&2
  [ -n "${DURABLE_FAILURE_KIND_FILE:-}" ] && printf 'cancelled\n' > "$DURABLE_FAILURE_KIND_FILE"
  exit "$hvl_code"
}

# hvl_acquire <label>
#
# Blocks until this process owns the host verification lease. In CI, or
# when HOST_VERIFICATION_LEASE_DISABLE is set, this is a no-op: sets
# HVL_SKIPPED=1 and returns immediately, so callers can unconditionally
# pair every hvl_acquire with an hvl_release.
hvl_acquire() {
  HVL_LABEL="$1"
  HVL_SKIPPED=0
  HVL_WORKTREE="$(pwd)"

  if [ -n "${CI:-}" ] || [ -n "${HOST_VERIFICATION_LEASE_DISABLE:-}" ]; then
    HVL_SKIPPED=1
    return 0
  fi

  hvl_root="$(hvl_resolve_root)" || exit 2
  mkdir -p "$hvl_root"
  HVL_LEASE_DIR="$hvl_root/active"
  HVL_META_FILE="$HVL_LEASE_DIR/owner"

  HVL_SELF_HOST="$(hvl_hostname)"
  HVL_SELF_PID="$$"
  HVL_SELF_MARKER="$(hvl_start_marker "$HVL_SELF_PID")"

  trap 'hvl_wait_cancel INT 130' INT
  trap 'hvl_wait_cancel TERM 143' TERM

  hvl_start_wait="$(hvl_now)"
  hvl_last_report=""
  hvl_report_interval="${HOST_VERIFICATION_LEASE_REPORT_SECONDS:-15}"
  hvl_waiting_file=""

  while :; do
    if mkdir "$HVL_LEASE_DIR" 2>/dev/null; then
      hvl_write_metadata
      break
    fi

    if [ ! -d "$HVL_LEASE_DIR" ]; then
      echo "ERROR: cannot create host verification lease at $HVL_LEASE_DIR" >&2
      trap - INT TERM
      exit 2
    fi

    if hvl_is_stale; then
      rm -f "$HVL_META_FILE"
      rmdir "$HVL_LEASE_DIR" 2>/dev/null || true
      continue
    fi

    # Self-register as a waiter (#1133 MR6) the first time this process
    # actually has to wait, so `yarn verify:local:status` can show a QUEUED
    # row from durable files -- never from `ps` -- for anyone currently
    # blocked here. Written once (not every loop iteration); hvl_wait_cancel
    # removes it on INT/TERM, and the break below removes it on acquire. A
    # stale file from a waiter that was SIGKILLed is a read-side concern
    # (the status view filters out any waiting record whose pid is dead),
    # not a writer-side one.
    if [ -z "$hvl_waiting_file" ]; then
      hvl_waiting_dir="$hvl_root/waiting"
      mkdir -p "$hvl_waiting_dir"
      hvl_waiting_file="$hvl_waiting_dir/$$"
      printf 'pid=%s\ncommand=%s\nworktree=%s\nwait_started_at=%s\n' \
        "$$" "$HVL_LABEL" "$HVL_WORKTREE" "$hvl_start_wait" > "$hvl_waiting_file"
    fi

    hvl_now_epoch="$(hvl_now)"
    hvl_waited=$(( hvl_now_epoch - hvl_start_wait ))
    if [ -z "$hvl_last_report" ] || [ $(( hvl_now_epoch - hvl_last_report )) -ge "$hvl_report_interval" ]; then
      hvl_report_waiting "$hvl_waited"
      hvl_last_report="$hvl_now_epoch"
    fi
    sleep 1
  done

  [ -z "$hvl_waiting_file" ] || rm -f "$hvl_waiting_file"
  trap - INT TERM
  HVL_ACQUIRED_AT="$(hvl_now)"
  HVL_WAITED_SECONDS=$(( HVL_ACQUIRED_AT - hvl_start_wait ))
  if [ "$HVL_WAITED_SECONDS" -gt 0 ]; then
    echo "host-verification-lease: acquired '$HVL_LABEL' after ${HVL_WAITED_SECONDS}s wait" >&2
  fi
}

# hvl_release
#
# Releases the lease iff this process is still its recorded owner. Safe to
# call after a skipped (CI) acquisition, or when nothing was ever acquired.
hvl_release() {
  [ "${HVL_SKIPPED:-1}" -eq 1 ] && return 0
  [ -n "${HVL_LEASE_DIR:-}" ] || return 0
  [ -d "$HVL_LEASE_DIR" ] || return 0
  [ -f "$HVL_META_FILE" ] || return 0

  hvl_owner_pid="$(hvl_field "$HVL_META_FILE" pid)"
  hvl_owner_marker="$(hvl_field "$HVL_META_FILE" start_marker)"
  if [ "$hvl_owner_pid" = "$HVL_SELF_PID" ] && [ "$hvl_owner_marker" = "$HVL_SELF_MARKER" ]; then
    rm -f "$HVL_META_FILE"
    rmdir "$HVL_LEASE_DIR" 2>/dev/null || true
    if [ -n "${HVL_ACQUIRED_AT:-}" ]; then
      hvl_duration=$(( $(hvl_now) - HVL_ACQUIRED_AT ))
      echo "host-verification-lease: released '$HVL_LABEL' after ${hvl_duration}s held" >&2
    fi
  fi
}

# hvl_acquire_budget_slot
#
# A host-wide COUNTING semaphore (#1133 items H/J), distinct from the
# single-slot mkdir mutex above: caps the TOTAL number of concurrently
# active heavyweight Vitest invocations, regardless of which command,
# worktree, or agent started them. Before this, only the push-verification
# class and run-ai-long-horizon.sh's own separate lease had any gating at
# all -- plain `yarn test`/`test:regular`/`test:intensive-simulations`
# (scripts/run-test-suite.sh's three modes, and by far the most common
# heavy invocation) had none.
#
# Measured evidence behind the default cap (3): on a 10-core dev machine,
# with the host otherwise quiet, 2/3/4 full `yarn test` invocations started
# simultaneously all completed cleanly -- no worker-pool timeouts, no
# stalls -- at roughly 1.3x/2x/2.5x the solo wall-clock time respectively.
# The default is set with headroom below that measured-safe ceiling (not
# at it) because the real incidents #1133 is about were reportedly NOT
# simultaneous starts; they involved a new process joining an ALREADY-busy
# host, a pattern this measurement session could not fully reproduce under
# controlled timing (4-concurrent did show markedly higher memory pressure
# and load average than 2- or 3-concurrent, consistent with -- but not
# proof of -- that being where risk actually starts). Override with
# HOST_VERIFICATION_LEASE_BUDGET for a host with different characteristics;
# revisit this default if future measurement pins the real threshold more
# precisely.
#
# Implemented as HOST_VERIFICATION_LEASE_BUDGET pre-named, NUMBERED slot
# directories (slot-0, slot-1, ...), each claimed with the exact same atomic
# `mkdir` primitive the single-slot mutex above already relies on. An
# earlier version of this function instead counted live marker files and
# compared the count to the budget before writing its own marker -- a
# classic time-of-check-to-time-of-use race (count, then write, as two
# separate steps) that a single isolated test run never hit, but that
# reliably let a 3rd/4th holder in once real host contention (several
# concurrent `yarn test` processes, exactly the scenario this exists to
# guard) widened the gap between those two steps. `mkdir` on a specific
# slot NAME is atomic: at most one process can ever win a given slot, so
# there is no window for two processes to both believe the same slot is
# free. Do not reintroduce a count-then-write scheme here.
hvl_acquire_budget_slot() {
  # #1133 MR6: optional label (e.g. "full", "regular"), recorded into the
  # won slot's owner file and any waiting record so `yarn verify:local:status`
  # can show which command holds/wants each slot. Every existing caller that
  # predates this parameter still works unchanged with the "budget" default.
  HVL_BUDGET_LABEL="${1:-budget}"
  HVL_BUDGET_SKIPPED=0
  HVL_BUDGET_NESTED=0

  if [ -n "${CI:-}" ] || [ -n "${HOST_VERIFICATION_LEASE_DISABLE:-}" ]; then
    HVL_BUDGET_SKIPPED=1
    return 0
  fi

  hvl_budget_host_scope_dir="$(hvl_resolve_host_scope_dir)" || exit 2
  hvl_budget_dir="$hvl_budget_host_scope_dir/budget"

  # Reentrancy is tracked with a DEPTH counter, KEYED BY THE RESOLVED BUDGET
  # DIRECTORY (hashed into the env var name), not a single global counter.
  # A single global counter is exported, so it is inherited by every
  # descendant process, not just genuine nested FUNCTION calls within the
  # same process -- e.g. `run-test-suite.sh full` acquires the real,
  # default-rooted budget once around vitest + the whole hook-test suite;
  # every hook test then runs as a DESCENDANT of that held slot. A hook
  # test that deliberately overrides HOST_VERIFICATION_LEASE_ROOT to
  # exercise real acquire/contention behavior in an isolated sandbox
  # resolves to a COMPLETELY DIFFERENT budget directory, but a single global
  # depth counter cannot tell the two apart: it saw depth>=1 inherited from
  # the ancestor's unrelated real acquisition and treated the test's own
  # acquire calls as nested no-ops, so its holders "succeeded" instantly
  # with no real mkdir contention at all -- exactly why
  # tests/hooks/host-verification-lease-budget.test.sh's own scenario 1
  # reliably failed ("a third holder acquired a slot") the moment it ran as
  # part of a real `yarn test` invocation, but never once in 15+ standalone
  # runs, under dash, or under synthetic CPU stress (none of which nest
  # inside an ancestor's own real acquisition). Keying the depth counter by
  # the target directory means a genuinely different domain always goes
  # through real acquisition, while true call-stack reentrancy against the
  # SAME domain (the actual scenario the doc comment above describes: "a
  # caller that already holds a slot invoking another function that also
  # acquires one") still nests correctly.
  hvl_budget_domain_key="$(hvl_path_hash "$hvl_budget_dir")"
  eval "hvl_budget_depth=\$(( \${HVL_BUDGET_DEPTH_$hvl_budget_domain_key:-0} + 1 ))"
  eval "export HVL_BUDGET_DEPTH_$hvl_budget_domain_key=\"\$hvl_budget_depth\""
  if [ "$hvl_budget_depth" -gt 1 ]; then
    HVL_BUDGET_NESTED=1
    return 0
  fi

  [ -z "${HVL_DEBUG_TRACE:-}" ] || echo "$(hvl_now) pid=$$ dir=$hvl_budget_dir ENTER budget=${HOST_VERIFICATION_LEASE_BUDGET:-3} root_env=[${HOST_VERIFICATION_LEASE_ROOT:-unset}]"  >&2
  mkdir -p "$hvl_budget_dir"
  hvl_budget_max="${HOST_VERIFICATION_LEASE_BUDGET:-3}"
  hvl_budget_self_marker="$(hvl_start_marker "$$")"
  hvl_budget_report_interval="${HOST_VERIFICATION_LEASE_REPORT_SECONDS:-15}"
  hvl_budget_start_wait="$(hvl_now)"
  hvl_budget_last_report=""
  hvl_budget_marker=""
  hvl_budget_waiting_file=""

  trap 'hvl_wait_cancel INT 130' INT
  trap 'hvl_wait_cancel TERM 143' TERM

  while :; do
    hvl_budget_slot_index=0
    while [ "$hvl_budget_slot_index" -lt "$hvl_budget_max" ]; do
      hvl_budget_slot_dir="$hvl_budget_dir/slot-$hvl_budget_slot_index"
      hvl_budget_owner_file="$hvl_budget_slot_dir/owner"

      if mkdir "$hvl_budget_slot_dir" 2>/dev/null; then
        printf 'pid=%s\nstart_marker=%s\ncommand=%s\nworktree=%s\nacquired_at=%s\nacquired_at_iso=%s\n' \
          "$$" "$hvl_budget_self_marker" "$HVL_BUDGET_LABEL" "$(pwd)" "$(hvl_now)" \
          "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)" > "$hvl_budget_owner_file"
        hvl_budget_marker="$hvl_budget_slot_dir"
        [ -z "${HVL_DEBUG_TRACE:-}" ] || echo "$(hvl_now) pid=$$ dir=$hvl_budget_dir WON slot=$hvl_budget_slot_index marker=[$hvl_budget_self_marker]"  >&2
        break
      fi

      # This slot name is already taken. Reclaim it only if its recorded
      # owner is genuinely gone (dead pid, or the pid was reused since),
      # the same staleness test hvl_is_stale already applies to the mutex --
      # EXCEPT when the owner file is missing/unreadable, which is not
      # itself proof of abandonment: the process that just won this slot's
      # `mkdir` may simply not have finished writing its owner file yet.
      # Under real contention this window is real (an earlier version of
      # this function had no grace period here at all, and a stress test
      # racing 10 holders for 3 slots reliably let a 4th in through exactly
      # this gap: another racer read the not-yet-written owner file as
      # empty, concluded the slot was abandoned, deleted it, and re-won it
      # for itself while the true owner was still mid-write). Give a missing
      # owner file the SAME short grace period (keyed off the slot
      # directory's own mtime) hvl_is_stale already gives the mutex's
      # metadata file for the identical reason -- move on to the next slot
      # index instead of reclaiming immediately.
      hvl_budget_owner_pid="$(hvl_field "$hvl_budget_owner_file" pid 2>/dev/null || true)"
      if [ -z "$hvl_budget_owner_pid" ]; then
        hvl_budget_slot_age=$(( $(hvl_now) - $(hvl_mtime_epoch "$hvl_budget_slot_dir") ))
        [ "$hvl_budget_slot_age" -ge 0 ] || hvl_budget_slot_age=0
        if [ "$hvl_budget_slot_age" -ge "${HOST_VERIFICATION_LEASE_SHORT_GRACE:-10}" ]; then
          [ -z "${HVL_DEBUG_TRACE:-}" ] || echo "$(hvl_now) pid=$$ dir=$hvl_budget_dir RECLAIM-EMPTY slot=$hvl_budget_slot_index age=$hvl_budget_slot_age raw_owner_file=[$(cat "$hvl_budget_owner_file" 2>/dev/null)]"  >&2
          rm -f "$hvl_budget_owner_file"
          rmdir "$hvl_budget_slot_dir" 2>/dev/null || true
          continue
        fi
        hvl_budget_slot_index=$((hvl_budget_slot_index + 1))
        continue
      fi

      hvl_budget_owner_marker="$(hvl_field "$hvl_budget_owner_file" start_marker 2>/dev/null || true)"
      hvl_budget_owner_alive=0
      if hvl_pid_is_live "$hvl_budget_owner_pid" && [ -n "$hvl_budget_owner_marker" ]; then
        hvl_budget_owner_fresh_marker="$(hvl_start_marker "$hvl_budget_owner_pid")"
        if [ -z "$hvl_budget_owner_fresh_marker" ]; then
          # A live pid with an unreadable start marker is not proof of PID
          # reuse -- ps can transiently fail to fork under real heavy host
          # load (exactly the condition this budget exists to coordinate
          # around), and access to process metadata can also be denied by a
          # sandbox. hvl_is_stale already treats this identically for the
          # mutex (see its own "not proof of PID reuse" comment); this
          # function originally did not, and reliably reclaimed a genuinely
          # live, correctly-owned slot the one time this ran as part of a
          # real, loaded `yarn test` invocation right after that same
          # invocation's own 650+-file Vitest run -- exactly the busy-host
          # condition where a `ps` fork is most likely to transiently fail.
          # Treat an inconclusive read as "still alive" rather than trade
          # safety for faster reclaim.
          hvl_budget_owner_alive=1
        elif [ "$hvl_budget_owner_fresh_marker" = "$hvl_budget_owner_marker" ]; then
          hvl_budget_owner_alive=1
        fi
      fi

      if [ "$hvl_budget_owner_alive" -eq 0 ]; then
        [ -z "${HVL_DEBUG_TRACE:-}" ] || echo "$(hvl_now) pid=$$ dir=$hvl_budget_dir RECLAIM-DEAD slot=$hvl_budget_slot_index owner_pid=$hvl_budget_owner_pid owner_marker=[$hvl_budget_owner_marker] live=$(hvl_pid_is_live "$hvl_budget_owner_pid" && echo yes || echo no) fresh_marker=[$(hvl_start_marker "$hvl_budget_owner_pid")]"  >&2
        rm -f "$hvl_budget_owner_file"
        rmdir "$hvl_budget_slot_dir" 2>/dev/null || true
        continue
      fi

      hvl_budget_slot_index=$((hvl_budget_slot_index + 1))
    done

    [ -n "$hvl_budget_marker" ] && break

    # Self-register as a waiter (#1133 MR6) the first time this process
    # actually has to wait -- same rationale and cleanup contract as
    # hvl_acquire's own waiting record above, keyed under the budget's own
    # scope dir instead of the mutex's.
    if [ -z "$hvl_budget_waiting_file" ]; then
      hvl_budget_waiting_dir="$hvl_budget_dir/waiting"
      mkdir -p "$hvl_budget_waiting_dir"
      hvl_budget_waiting_file="$hvl_budget_waiting_dir/$$"
      printf 'pid=%s\ncommand=%s\nworktree=%s\nwait_started_at=%s\n' \
        "$$" "$HVL_BUDGET_LABEL" "$(pwd)" "$hvl_budget_start_wait" > "$hvl_budget_waiting_file"
    fi

    hvl_budget_now_epoch="$(hvl_now)"
    hvl_budget_waited=$(( hvl_budget_now_epoch - hvl_budget_start_wait ))
    if [ -z "$hvl_budget_last_report" ] || [ $(( hvl_budget_now_epoch - hvl_budget_last_report )) -ge "$hvl_budget_report_interval" ]; then
      echo "host-verification-lease: waiting for a host resource budget slot ($hvl_budget_max/$hvl_budget_max in use, ${hvl_budget_waited}s)..." >&2
      hvl_budget_last_report="$hvl_budget_now_epoch"
    fi
    sleep 1
  done

  [ -z "$hvl_budget_waiting_file" ] || rm -f "$hvl_budget_waiting_file"
  trap - INT TERM
  hvl_budget_acquired_at="$(hvl_now)"
  hvl_budget_waited_seconds=$(( hvl_budget_acquired_at - hvl_budget_start_wait ))
  if [ "$hvl_budget_waited_seconds" -gt 0 ]; then
    echo "host-verification-lease: acquired a host resource budget slot after ${hvl_budget_waited_seconds}s wait" >&2
  fi
}

# hvl_release_budget_slot
#
# Releases the budget slot iff this call is the outermost of a matched
# acquire/release pair on this process's depth counter (see the reentrancy
# comment in hvl_acquire_budget_slot) AND it is the one that originally
# acquired it (verified against recorded pid + start marker, same as
# hvl_release does for the mutex -- protects against releasing a slot that
# was reclaimed out from under a false-positive staleness read). A no-op
# after a skipped (CI) acquisition, a still-nested release, or when nothing
# was acquired.
hvl_release_budget_slot() {
  [ "${HVL_BUDGET_SKIPPED:-0}" -eq 1 ] && return 0

  # hvl_budget_dir is a plain (non-exported) shell variable set by the
  # matching hvl_acquire_budget_slot call earlier in this SAME process --
  # release always runs in the same process/shell as its acquire, by this
  # library's own convention, the same way hvl_budget_marker already
  # carries over without being exported. Reusing it here (rather than
  # re-resolving) guarantees the depth counter decremented here is the
  # exact same domain-keyed one the matching acquire incremented.
  hvl_budget_domain_key="$(hvl_path_hash "${hvl_budget_dir:-}")"
  eval "hvl_budget_depth=\$(( \${HVL_BUDGET_DEPTH_$hvl_budget_domain_key:-1} - 1 ))"
  if [ "$hvl_budget_depth" -gt 0 ]; then
    eval "export HVL_BUDGET_DEPTH_$hvl_budget_domain_key=\"\$hvl_budget_depth\""
    return 0
  fi
  eval "unset HVL_BUDGET_DEPTH_$hvl_budget_domain_key"

  [ -n "${hvl_budget_marker:-}" ] || return 0
  hvl_budget_release_owner_pid="$(hvl_field "$hvl_budget_marker/owner" pid 2>/dev/null || true)"
  hvl_budget_release_owner_marker="$(hvl_field "$hvl_budget_marker/owner" start_marker 2>/dev/null || true)"
  if [ "$hvl_budget_release_owner_pid" = "$$" ] && [ "$hvl_budget_release_owner_marker" = "$hvl_budget_self_marker" ]; then
    rm -f "$hvl_budget_marker/owner"
    rmdir "$hvl_budget_marker" 2>/dev/null || true
  fi
}

# hvl_register_job_pid <pid>
#
# Records the real heavyweight job's own pid into the metadata of the lease
# THIS process currently holds, preserving every other field. A no-op when
# nothing was acquired (CI/skipped) or the lease is somehow no longer held --
# registration is best-effort and must never itself fail a caller.
hvl_register_job_pid() {
  [ "${HVL_SKIPPED:-1}" -eq 1 ] && return 0
  [ -n "${HVL_LEASE_DIR:-}" ] && [ -f "${HVL_META_FILE:-}" ] || return 0
  hvl_meta_tmp="$HVL_LEASE_DIR/owner.tmp.$$"
  { grep -v '^job_pid=' "$HVL_META_FILE" 2>/dev/null || true
    printf 'job_pid=%s\n' "$1"
  } > "$hvl_meta_tmp" && mv "$hvl_meta_tmp" "$HVL_META_FILE"
}

# hvl_run_registering_job <command...>
#
# See the "Public functions" header comment above for the contract. Runs
# "$@" as a plain backgrounded job (no OS-level process-group manipulation --
# see hvl_job_tree_pids for why) and registers its pid in HVL_JOB_PID (a
# shared, non-local variable -- see hvl_cancel_and_release) as well as in
# the lease metadata. Deliberately does NOT install its own INT/TERM traps:
# an earlier version did, saving/restoring the caller's previous trap via
# `trap -p` so it could compose safely with a caller's own outer signal
# handling -- but `trap -p` is a POSIX option dash does not implement
# ("Illegal option -p"), breaking every caller on any host/CI whose /bin/sh
# is dash rather than bash. Trap ownership belongs to the caller instead
# (see hvl_cancel_and_release below), which sidesteps the portability gap
# entirely: nothing here ever needs to query an existing trap.
hvl_run_registering_job() {
  "$@" &
  HVL_JOB_PID=$!
  hvl_register_job_pid "$HVL_JOB_PID"
  # #1133 items C/D: an optional side channel (same convention as
  # DURABLE_FAILURE_KIND_FILE) so a caller that wants durable, worktree-
  # local evidence of the real job pid can read it directly off disk while
  # this is still running, independent of whether a lease was ever
  # acquired (HVL_SKIPPED) or of this function's own call stack.
  [ -n "${DURABLE_JOB_PID_FILE:-}" ] && printf '%s\n' "$HVL_JOB_PID" > "$DURABLE_JOB_PID_FILE"

  # #1133 MR6: restore the CALLER's own errexit setting, not unconditionally
  # `set -e`. This function runs as a plain call in the caller's own shell
  # (never a subshell), so any `set` here is global, visible-after-return
  # state. A caller that itself needs `set +e` across this call -- to
  # capture "$?" or write it to a file afterward, e.g.
  # run-durable-test-suite.sh's `--no-lease` path and run-under-host-
  # lease.sh's own trailer -- had that `set +e` silently undone the moment
  # this function returned, because it unconditionally re-enabled errexit
  # here regardless of what the caller had set. Under `set -e`, a function
  # call returning non-zero is itself a triggering command: with errexit
  # forced back on before control returned, the caller's very next
  # statement (its own exit-code capture) never ran. Confirmed directly
  # under both bash and dash with a minimal repro (a backgrounded `false`
  # wrapped exactly this way): the calling script aborted before reaching
  # its own capture line, discovered only because `run-durable-test-
  # suite.sh --no-lease` (used by test:ai-long/ai-playability/perf:durable)
  # left its exit-code file empty on any REAL failure of the wrapped
  # command, corrupting `exit_code=` in the durable `.status` file that
  # this MR's own status view (and the pre-existing read-durable-test-
  # result.sh) both depend on being a clean integer. `test:durable` (the
  # "full" scope) was unaffected: it wraps run-under-host-lease.sh as a
  # separate `sh` process, and `set` state never crosses a process boundary.
  case "$-" in
    *e*) hvl_job_errexit_was_set=1 ;;
    *) hvl_job_errexit_was_set=0 ;;
  esac
  set +e
  wait "$HVL_JOB_PID"
  hvl_job_status=$?
  [ "$hvl_job_errexit_was_set" -eq 0 ] || set -e

  HVL_JOB_PID=''
  return "$hvl_job_status"
}

# hvl_cancel_and_release <signal> <exit-code>
#
# The one INT/TERM handler every caller of hvl_run_registering_job should
# install (once, at the top level, spanning every hvl_run_registering_job
# call it makes -- see run-under-host-lease.sh and verify-before-push.sh for
# the pattern). If a job is currently registered (HVL_JOB_PID set by
# hvl_run_registering_job), forwards <signal> to it and every live
# descendant (hvl_job_tree_pids) and waits for it to exit; if no job is
# currently running (e.g. between verify-before-push.sh's two run_phase
# calls), this step is simply skipped. Then releases the lease and exits
# with <exit-code> (130/143 by shell convention), matching what the
# now-removed inline forwarding used to do per-call.
hvl_cancel_and_release() {
  hvl_cancel_signal="$1"
  hvl_cancel_exit_code="$2"
  if [ -n "${HVL_JOB_PID:-}" ]; then
    for hvl_cancel_pid in $(hvl_job_tree_pids "$HVL_JOB_PID"); do
      kill -"$hvl_cancel_signal" "$hvl_cancel_pid" 2>/dev/null || true
    done
    wait "$HVL_JOB_PID" 2>/dev/null || true
  fi
  [ -n "${DURABLE_FAILURE_KIND_FILE:-}" ] && printf 'cancelled\n' > "$DURABLE_FAILURE_KIND_FILE"
  hvl_release
  exit "$hvl_cancel_exit_code"
}
