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
#
# Environment overrides (all optional; see tests/hooks/host-verification-
# lease.test.sh for the contract each one is pinned by):
#   HOST_VERIFICATION_LEASE_ROOT           Lease root directory. Defaults to
#                                           <git-common-dir>/conquestoria-
#                                           verification-lease so every
#                                           linked worktree of one clone
#                                           shares it, and unrelated clones
#                                           / users never do.
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

hvl_resolve_root() {
  if [ -n "${HOST_VERIFICATION_LEASE_ROOT:-}" ]; then
    printf '%s\n' "$HOST_VERIFICATION_LEASE_ROOT"
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
  printf '%s/conquestoria-verification-lease\n' "$hvl_common_dir"
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
    return 0
  fi

  hvl_current_marker="$(hvl_start_marker "$hvl_owner_pid")"
  if [ -z "$hvl_current_marker" ] || [ "$hvl_current_marker" != "$hvl_owner_marker" ]; then
    # Same pid, different process (PID reuse): the process that actually
    # holds this pid now started at a different time than the lease
    # metadata records, so the original owner is gone.
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
