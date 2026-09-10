#!/usr/bin/env bash
# #1007 — the LOCAL wall-clock performance reporter.
#
# Runs the perf fixtures + operations, records `performance.now()` durations
# AND the deterministic algorithmic counts to `.verification/perf/`. Wall-clock
# is machine-dependent and is NEVER a merge gate: this is not part of
# `yarn test`, `test:fast`, `test:slow`, `verify:push`, the pre-push hooks, the
# production build, or CI. `tests/scripts/perf-isolation.test.ts` guards that.
#
# The machine-INDEPENDENT algorithmic budgets live in
# `tests/perf/algorithmic-budgets.test.ts` and run in the ordinary slow tier.
#
#   yarn perf:report                 # full report
#   yarn perf:report -- -t findPath  # one area
#
# It does NOT take the host verification lease (matching
# run-ai-playability-regressions.sh / run-ai-long-horizon.sh) — developer tool,
# not a push gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./scripts/run-with-mise.sh node ./scripts/run-with-timeout.mjs 900 perf-report -- \
  ./scripts/run-with-mise.sh yarn vitest run \
  --config vitest.perf.config.ts \
  --testTimeout=600000 \
  --hookTimeout=600000 \
  "$@"
