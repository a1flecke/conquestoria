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

hvl_common_dir="$(git rev-parse --git-common-dir)"
case "$hvl_common_dir" in
  /*) : ;;
  *) hvl_common_dir="$ROOT/$hvl_common_dir" ;;
esac
export HOST_VERIFICATION_LEASE_ROOT="$hvl_common_dir/conquestoria-ai-long-horizon-lease"

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
sh ./scripts/run-under-host-lease.sh "ai-long-horizon" -- \
  ./scripts/run-with-mise.sh node ./scripts/run-with-timeout.mjs 8400 ai-long-horizon -- \
  ./scripts/run-with-mise.sh yarn vitest run \
  --config vitest.long-horizon.config.ts \
  --testTimeout=1800000 \
  --hookTimeout=1800000 \
  "$@"
