#!/bin/sh
# Run build plus durable tests and persist PR-verification evidence.
#
# #1166: the status file doubles as a reusable CAPABILITY PROOF. When the run
# passes on a clean worktree whose HEAD did not move while it ran, it records
# `capabilities=build,test:full`; scripts/read-verification-proof.sh lets the
# pre-push gate accept that proof instead of re-running a weaker subset of the
# same verification for the identical commit.
#
# Time semantics (#1166): VERIFY_PR_MAX_SECONDS (480s) is a latency SLO, not a
# correctness gate. The scheduler deliberately permits concurrency that can
# push a healthy full verification past it, and a scheduling decision must
# never turn a correct result into a failure -- so exceeding it records
# `slo_exceeded=1` and warns. Only VERIFY_PR_HARD_MAX_SECONDS (a runaway
# ceiling, default 1800s -- ~3x the slowest three-way-contended full suite
# measured in #1133) still fails the run, as `failure_kind=runaway`.

set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
artifact_dir="${VERIFY_PR_ARTIFACT_DIR:-$repo_root/.verification}"
status="$artifact_dir/pr-verification.status"
status_tmp="$status.tmp.$$"
max_seconds="${VERIFY_PR_MAX_SECONDS:-480}"
hard_max_seconds="${VERIFY_PR_HARD_MAX_SECONDS:-1800}"
head_sha="$(git -C "$repo_root" rev-parse HEAD)"
worktree_porcelain() {
  git -C "$repo_root" status --porcelain=v1 --untracked-files=all
}
worktree_state() {
  worktree_porcelain | cksum | awk '{print $1 "-" $2}'
}

# #1166: PR verification is publication work -- it runs in the foreground
# capacity lane and holds the publication mutex (see host-verification-
# lease.sh "Capacity lanes" and run-durable-test-suite.sh).
export HVL_CAPACITY_LANE=foreground

mkdir -p "$artifact_dir"
started_at="$(date +%s)"
initial_worktree_state="$(worktree_state)"
initially_clean=0
[ -n "$(worktree_porcelain)" ] || initially_clean=1
exit_code=0
failure_kind=none

# The build runs under the host verification lease (#892) as its own
# bounded acquisition, separate from `yarn test:durable` below (which
# acquires the same lease again, internally, around just the suite run).
# Two short sequential acquisitions rather than one held across both avoids
# any risk of this process waiting on a lease it already holds.
if sh "$repo_root/scripts/run-under-host-lease.sh" "verify-pr build" -- yarn build; then :; else exit_code=$?; failure_kind=build; fi
if [ "$exit_code" -eq 0 ]; then
  if yarn test:durable; then :; else exit_code=$?; failure_kind=test; fi
fi
if [ "$exit_code" -eq 0 ]; then
  if yarn test:durable:status; then :; else exit_code=$?; failure_kind=test; fi
fi

elapsed_seconds=$(( $(date +%s) - started_at ))
slo_exceeded=0
if [ "$elapsed_seconds" -gt "$max_seconds" ]; then
  slo_exceeded=1
fi
if [ "$exit_code" -eq 0 ] && [ "$elapsed_seconds" -gt "$hard_max_seconds" ]; then
  echo "PR verification exceeded the ${hard_max_seconds}s runaway ceiling (${elapsed_seconds}s)." >&2
  exit_code=1
  failure_kind=runaway
fi

# A proof is granted only for exactly what was verified: a passing run, a
# worktree that was clean before AND after (so HEAD alone pins every input),
# and a HEAD that did not move underneath it.
capabilities=''
if [ "$exit_code" -eq 0 ] && [ "$initially_clean" -eq 1 ] \
  && [ -z "$(worktree_porcelain)" ] \
  && [ "$(git -C "$repo_root" rev-parse HEAD)" = "$head_sha" ]; then
  capabilities='build,test:full'
fi

{
  printf 'proof_format=1\n'
  printf 'worktree=%s\n' "$repo_root"
  printf 'head=%s\n' "$head_sha"
  printf 'worktree_state=%s\n' "$initial_worktree_state"
  printf 'elapsed_seconds=%s\n' "$elapsed_seconds"
  printf 'max_seconds=%s\n' "$max_seconds"
  printf 'hard_max_seconds=%s\n' "$hard_max_seconds"
  printf 'slo_exceeded=%s\n' "$slo_exceeded"
  printf 'exit_code=%s\n' "$exit_code"
  printf 'failure_kind=%s\n' "$failure_kind"
  printf 'capabilities=%s\n' "$capabilities"
} > "$status_tmp"
mv "$status_tmp" "$status"

if [ "$exit_code" -ne 0 ]; then exit "$exit_code"; fi
if [ "$slo_exceeded" -eq 1 ]; then
  echo "WARNING: PR verification passed but took ${elapsed_seconds}s, over the ${max_seconds}s latency SLO -- host contention, not a correctness failure (see yarn verify:local:status)." >&2
fi
printf 'PR verification passed in %ss.\n' "$elapsed_seconds"
