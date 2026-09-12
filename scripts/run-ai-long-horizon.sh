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
# It does NOT take the host verification lease (matching
# run-ai-playability-regressions.sh) — it is a developer/agent tool, not a
# push gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./scripts/run-with-mise.sh node ./scripts/run-with-timeout.mjs 3600 ai-long-horizon -- \
  ./scripts/run-with-mise.sh yarn vitest run \
  --config vitest.long-horizon.config.ts \
  --testTimeout=1800000 \
  --hookTimeout=1800000 \
  "$@"
