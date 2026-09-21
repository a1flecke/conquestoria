#!/usr/bin/env bash
# #1005 — the heavyweight local-only AI campaign suite.
#
# 300-500 turn deterministic campaigns across every challenge tier, every AI
# personality, small/medium/large maps, solo + hot seat, early + late-era start.
# Minutes per scenario; NOT part of `yarn test`, `test:regular`, `test:intensive-simulations`,
# `verify:push`, the pre-push hooks, the production build, or CI. Run it
# explicitly before finishing a change that materially affects AI strategy,
# production, diplomacy, movement, pathfinding, combat decisions, economy,
# victory pursuit, turn orchestration, or a large simulation system
# (see .claude/rules/ai-simulation.md).
#
#   yarn test:ai-long                       # full matrix
#   yarn test:ai-long -- -t lh-standard-small   # one scenario
#
# #1125: this suite now takes its OWN host-wide lease, distinct from
# run-ai-playability-regressions.sh (5min cap — cheap enough to stay
# concurrent, like ordinary `yarn test`) and from the shared push-verification
# lease `scripts/host-verification-lease.sh`'s other three callers use
# (`test:durable`, `verify-before-push.sh`, `verify-pr.sh`). This suite is
# expensive enough (a single scenario can run 25+ minutes; the full matrix
# regularly runs 40-90+ minutes) that two of them running concurrently on one
# host — including one running in THIS worktree while another worktree of the
# same clone runs its own — starve each other's CPU and produce unreliable,
# contention-distorted timing: directly observed while investigating #1125
# itself, where a scenario documented at 19.4s measured 49.9s in isolation
# while a second worktree's own long-horizon run was concurrently active. This
# is a routine, expected condition on a dev host running multiple concurrent
# agents (`.claude/rules/hooks-and-tooling.md`'s own #608 section documents
# this as normal, not a rare edge case), so this suite plans for it rather
# than producing misleading numbers every time it happens. It uses its OWN
# lease root (not the shared one) specifically so a routine `git push`'s
# test+build phase never has to wait up to two hours for someone else's
# long-horizon run to finish — the two operations are different classes of
# cost and should never block each other.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# #1133: reuse host-verification-lease.sh's own sandbox-safe host-scope
# resolution (see its hvl_resolve_host_scope_dir) instead of duplicating
# git-common-dir logic here -- this lease still gets its own sub-path so it
# stays a separate coordination domain from the shared push-verification
# lease, per the header comment above.
. "$ROOT/scripts/host-verification-lease.sh"

# #1133 (2026-09-21 benchmark/closure pass): this suite previously held ONLY
# its own separate ai-long-horizon-lease mutex below, with NO coordination
# against the shared host-wide budget scripts/run-test-suite.sh's three
# modes (full/regular/intensive-simulations) already respect. That let up to
# HOST_VERIFICATION_LEASE_BUDGET (3) of those PLUS one ai-long run proceed
# fully simultaneously -- one MORE heavyweight Vitest invocation than the
# documented host-wide ceiling. This is not theoretical: directly reproduced
# during this benchmark pass, where an ai-long run's stall-retry attempt
# genuinely overlapped with another agent's real `regular` push-verification
# run (both visible as concurrent ACTIVE rows in `yarn verify:local:status`
# at the same instant). Fixed by having ai-long also hold ONE shared-budget
# slot for its entire run (including stall-retry attempts and their backoff
# sleeps below) -- its own per-ai-long mutex still separately prevents two
# ai-long runs from double-booking each other, so this adds one more
# constraint rather than replacing that one. This is deliberately the
# simplest sufficient policy (one slot, not a weighted multi-slot cost):
# it gives a single known host-wide ceiling across every heavyweight class,
# matching the issue's own stated preference for the simplest policy that
# achieves that. Acquired BEFORE the ai-long-specific
# HOST_VERIFICATION_LEASE_ROOT override below so it resolves against the
# real SHARED root (the same one full/regular/intensive-simulations use),
# not ai-long's own separate domain.
hvl_acquire_budget_slot ai-long
trap hvl_release_budget_slot EXIT

hvl_host_scope_dir="$(hvl_resolve_host_scope_dir)" || exit 2
export HOST_VERIFICATION_LEASE_ROOT="$hvl_host_scope_dir/ai-long-horizon-lease"

# #1125: this outer wrapper must stay LARGER than campaign-scenarios.ts's own
# SCENARIO_TIMEOUT_MS (the per-scenario Vitest timeout), or a legitimately slow
# worst-case scenario gets killed here first -- turning a diagnosable single-test
# timeout into an ambiguous "the whole run vanished" signal. 6bbe6e67 bumped
# SCENARIO_TIMEOUT_MS from 1,500,000 to 4,800,000ms (80min) without touching this
# 3600s (60min) literal, so for three days this wrapper WAS smaller than the inner
# timeout it wraps. 8400s = SCENARIO_TIMEOUT_MS's own 4800s worst-case-scenario
# ceiling + the other 8 scenarios' historical combined ~720s, x1.5 for the matrix
# and continuity files' own concurrent CPU contention -- see campaign-scenarios.ts's
# header comment for the per-scenario numbers this is derived from. This budget
# starts only AFTER the lease above is acquired, so waiting for another
# long-horizon run to finish never eats into it.
# Follow-up to #1133 (see verify-before-push.sh's run_phase and
# .claude/rules/hooks-and-tooling.md's "verify-before-push.sh retries a STALL
# automatically" section for the full rationale): only exit 125 (STALL --
# zero CPU progress, a machine-checked claim from run-with-timeout.mjs's own
# watchdog) is safe to retry. A plain timeout (124) or a real failure fail
# immediately, unretried.
AI_LONG_HORIZON_STALL_MAX_RETRIES="${AI_LONG_HORIZON_STALL_MAX_RETRIES:-2}"
AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS="${AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS:-20}"

attempt=0
while :; do
  attempt=$((attempt + 1))
  set +e
  sh ./scripts/run-under-host-lease.sh "ai-long-horizon" -- \
    ./scripts/run-with-mise.sh node ./scripts/run-with-timeout.mjs 8400 ai-long-horizon -- \
    ./scripts/run-with-mise.sh yarn vitest run \
    --config vitest.long-horizon.config.ts \
    --testTimeout=1800000 \
    --hookTimeout=1800000 \
    "$@"
  matrix_status=$?
  set -e

  [ "$matrix_status" -eq 0 ] && exit 0
  if [ "$matrix_status" -ne 125 ] || [ "$attempt" -gt "$AI_LONG_HORIZON_STALL_MAX_RETRIES" ]; then
    exit "$matrix_status"
  fi
  echo "run-ai-long-horizon: stalled (attempt $attempt/$((AI_LONG_HORIZON_STALL_MAX_RETRIES + 1))) -- host contention, not a code problem. Backing off ${AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS}s before retrying." >&2
  sleep "$AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS"
done
