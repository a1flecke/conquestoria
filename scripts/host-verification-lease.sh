#!/bin/sh
# Host-wide verification lease (#892).
#
# A local development host can run several linked worktrees at once (see
# `.claude/rules/hooks-and-tooling.md`). Ordinary `yarn test`, `yarn build`,
# watch mode, and focused Vitest runs stay fully concurrent across those
# worktrees on purpose. But *suite-scale* verification -- `yarn test:durable`
# and the local pre-push test+build gate -- spawns a full Vitest worker pool
# per invocation; two of those overlapping on one host can starve each
# other's worker processes and produce spurious pool-startup failures (see
# the incident this issue fixes: "Timeout waiting for worker to respond"
# before any test file had even started).
#
# This library provides ONE host-wide mutual-exclusion slot for that class
# of command, implemented as an atomic `mkdir` lease so no daemon or network
# service is required. It intentionally does not touch worktree-local state
# (`.verification/`, Vite/Vitest caches) -- those remain per-worktree.
#
# This file only defines functions; it has no top-level side effects, so it
# is always safe to `. ` (source) it. Callers are:
#   - scripts/run-under-host-lease.sh (a small CLI: acquire, run one
#     command with signal forwarding, release)
#   - scripts/verify-before-push.sh (sources this directly to bracket its
#     test+build phases with one acquisition)
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
# to release, just stop.
hvl_wait_cancel() {
  hvl_sig="$1"
  hvl_code="$2"
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

    hvl_now_epoch="$(hvl_now)"
    hvl_waited=$(( hvl_now_epoch - hvl_start_wait ))
    if [ -z "$hvl_last_report" ] || [ $(( hvl_now_epoch - hvl_last_report )) -ge "$hvl_report_interval" ]; then
      hvl_report_waiting "$hvl_waited"
      hvl_last_report="$hvl_now_epoch"
    fi
    sleep 1
  done

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

  set +e
  wait "$HVL_JOB_PID"
  hvl_job_status=$?
  set -e

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
