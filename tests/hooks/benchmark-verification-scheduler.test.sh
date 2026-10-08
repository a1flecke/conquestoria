#!/usr/bin/env bash
# #1166: the scheduler benchmark harness (scripts/benchmark-verification-scheduler.mjs) drives the REAL
# scheduler scripts through the scenario matrix and checks the scheduler's invariants from measurements.
# This test (1) runs a representative subset of the synthetic matrix and requires every invariant to hold,
# and (2) proves the harness is not vacuous: with the background capacity deliberately widened (fault
# injection) it must FAIL its own capacity invariant.

set -eu
unset CI HVL_CAPACITY_LANE HOST_VERIFICATION_FOREGROUND_BUDGET HOST_VERIFICATION_BACKGROUND_BUDGET HOST_VERIFICATION_LEASE_BUDGET VERIFY_REUSE_PROOF || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS="$ROOT/scripts/benchmark-verification-scheduler.mjs"

run_node() {
  if command -v node >/dev/null 2>&1; then node "$@"; else "$ROOT/scripts/run-with-mise.sh" node "$@"; fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Subset chosen to cover each invariant family once: foreground+background+AI-long mix, the AI-long
# singleton, AI-long backoff releasing capacity, stale-proof fallback and linked-worktree proof reuse.
if ! run_node "$HARNESS" --mode synthetic --scenarios 6,11,12,14,15 --scale 0.6 --json "$tmp/ok.json" >"$tmp/ok.out" 2>"$tmp/ok.err"; then
  echo "benchmark harness reported a failed scheduler invariant on the real scripts:"
  cat "$tmp/ok.out" "$tmp/ok.err"
  exit 1
fi
grep -q '"failedChecks": \[\]' "$tmp/ok.json" || { echo "expected no failed checks"; cat "$tmp/ok.json"; exit 1; }
for scenario in 6 11 12; do
  grep -q "\"id\": $scenario," "$tmp/ok.json" || { echo "scenario $scenario missing from the report"; exit 1; }
done

# Non-vacuity: three background-class jobs on a widened (3-slot) background lane breaks the "never above 2"
# invariant, so the harness must exit non-zero and name it.
if run_node "$HARNESS" --mode synthetic --scenarios 10 --scale 0.6 --inject HOST_VERIFICATION_BACKGROUND_BUDGET=3 --json "$tmp/bad.json" >"$tmp/bad.out" 2>"$tmp/bad.err"; then
  echo "harness passed although the background lane was widened to 3 -- its invariants are vacuous"
  cat "$tmp/bad.out"
  exit 1
fi
grep -q 'background lane never above 2' "$tmp/bad.json" || { echo "harness did not name the capacity invariant it detected"; cat "$tmp/bad.json"; exit 1; }
# A failing job must be diagnosable from the report alone (#1403: CI printed `ai=1` and nothing else). With stall
# retries disabled, AI-long's deliberate stall exits 125 and the report must carry that exit code.
if run_node "$HARNESS" --mode synthetic --scenarios 12 --scale 0.6 --inject AI_LONG_HORIZON_STALL_MAX_RETRIES=0 --json "$tmp/diag.json" >"$tmp/diag.out" 2>"$tmp/diag.err"; then
  echo "harness passed although AI-long was forced to fail -- scenario 12 is vacuous"
  cat "$tmp/diag.out"
  exit 1
fi
grep -q 'exit=125' "$tmp/diag.json" || { echo "the report does not say which exit code AI-long failed with"; cat "$tmp/diag.json"; exit 1; }
grep -q 'ai=125' "$tmp/diag.json" || { echo "the 'every job exited 0' detail lost the per-job exit codes"; exit 1; }
echo "ok"
