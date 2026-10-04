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

# `yarn test:ai-long -- -t <name>` forwards the literal `--` (Yarn does not
# consume it), and Vitest then treats everything after `--` as positional file
# filters, silently dropping the `-t` test-name filter so the WHOLE matrix runs
# instead of the named scenario. Drop one leading `--` so the documented
# targeted form actually filters (#1095's lh-explorer-small repro).
if [ "${1:-}" = '--' ]; then
  shift
fi

# #1133: reuse host-verification-lease.sh's own sandbox-safe host-scope
# resolution (see its hvl_resolve_host_scope_dir) instead of duplicating
# git-common-dir logic here -- this lease still gets its own sub-path so it
# stays a separate coordination domain from the shared push-verification
# lease, per the header comment above.
. "$ROOT/scripts/host-verification-lease.sh"

# #1166: three distinct coordination concepts, acquired in this order.
#
#   1. COLLISION LOCK -- the ai-long singleton mutex (its own lease root,
#      `<scope>/ai-long-horizon-lease`), held for the whole logical run
#      including retries: at most one ai-long workload per clone at a time.
#   2. HOST CAPACITY -- one BACKGROUND-lane slot of the shared budget
#      (`<scope>/budget`), acquired only once the mutex is ours and held only
#      while a Vitest attempt is actually running. It is released before any
#      stall-retry backoff sleep and re-acquired for the next attempt.
#   3. PRIORITY -- ai-long is background work: it can never occupy the
#      reserved foreground slot a `git push` / `verify:pr` needs.
#
# Before #1166 (#1133 MR7) this acquired the shared budget slot FIRST and
# held it for the entire wrapper lifetime -- so a second, accidental ai-long
# request burned a capacity slot merely waiting for this mutex, and every
# retry backoff sleep held a slot while consuming no CPU. MR7's real fix (ai-
# long must count against the host ceiling) is kept; only the lock order and
# the holding window changed.
hvl_host_scope_dir="$(hvl_resolve_host_scope_dir)" || exit 2
# The budget below resolves against dirname(HOST_VERIFICATION_LEASE_ROOT) --
# i.e. $hvl_host_scope_dir -- so it is still the SHARED budget every other
# heavyweight class uses, while the mutex gets ai-long's own root.
export HOST_VERIFICATION_LEASE_ROOT="$hvl_host_scope_dir/ai-long-horizon-lease"
export HVL_CAPACITY_LANE=background

hvl_acquire "ai-long-horizon"
trap 'hvl_release_budget_slot; hvl_release' EXIT
# hvl_acquire/hvl_acquire_budget_slot reset INT/TERM when they return, so the
# cancel handler (forward to the job's whole tree, release, exit) is
# re-installed after every acquisition.
install_cancel_traps() {
  trap 'hvl_cancel_and_release INT 130' INT
  trap 'hvl_cancel_and_release TERM 143' TERM
}
install_cancel_traps

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
# starts only AFTER the mutex and a capacity slot are acquired, so waiting for
# another long-horizon run (or for background capacity) never eats into it.
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
  hvl_acquire_budget_slot ai-long
  install_cancel_traps
  set +e
  hvl_run_registering_job ./scripts/run-with-mise.sh node ./scripts/run-with-timeout.mjs 8400 ai-long-horizon -- \
    ./scripts/run-with-mise.sh yarn vitest run \
    --config vitest.long-horizon.config.ts \
    --testTimeout=1800000 \
    --hookTimeout=1800000 \
    "$@"
  matrix_status=$?
  set -e
  hvl_release_budget_slot

  [ "$matrix_status" -eq 0 ] && exit 0
  if [ "$matrix_status" -ne 125 ] || [ "$attempt" -gt "$AI_LONG_HORIZON_STALL_MAX_RETRIES" ]; then
    exit "$matrix_status"
  fi
  echo "run-ai-long-horizon: stalled (attempt $attempt/$((AI_LONG_HORIZON_STALL_MAX_RETRIES + 1))) -- host contention, not a code problem. Released host capacity; backing off ${AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS}s before retrying." >&2
  sleep "$AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS"
done
