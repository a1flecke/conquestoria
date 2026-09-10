---
paths:
  - "src/core/turn-manager.ts"
  - "src/core/completed-round-orchestrator.ts"
  - "src/systems/unit-pathfinding.ts"
  - "src/systems/binary-heap.ts"
  - "src/systems/unit-movement-cost.ts"
  - "src/systems/unit-movement-legality.ts"
  - "src/systems/unit-movement-queries.ts"
  - "src/systems/unit-movement-system.ts"
  - "src/systems/unit-movement-validation.ts"
  - "src/systems/fog-of-war.ts"
  - "src/systems/civilization-elimination-system.ts"
  - "src/storage/**"
  - "src/ai/ai-round-scheduler.ts"
  - "src/ai/ai-major-turn.ts"
  - "tests/perf/**"
  - "scripts/run-tests-by-tier.sh"
---

# Performance Budgets (#1007)

Two layers. Never conflate them.

## 1. Algorithmic regression budgets — a real merge gate

`tests/perf/algorithmic-budgets.test.ts` (in `SLOW_TEST_FILES`, so it runs in
`yarn test` / the CI slow lane / `yarn test:durable`). Every assertion is a
**machine-independent integer count** on a deterministic fixture
(`tests/perf/fixtures/crowded-state.ts`) — a `vi.spyOn` work counter
(`tests/perf/perf-probe.ts`), never a wall-clock. Counts come from spies on
`BinaryHeap.prototype.pop`/`push`, `globalThis.structuredClone`,
`getBlockingMapEntityAt`, `findPath`, `updateVisibility`, `calculateCityYields`
— zero production instrumentation (`tests/scripts/perf-isolation.test.ts` asserts
`src/**` never imports vitest, uses `vi.*`, or references `tests/perf`).

Checked-in numbers live in `tests/perf/baselines/algorithmic-baseline.json`
(**integers / ratios / budgets only** — a contamination test rejects any
wall-clock, date, path, or `node`/`cpu` key). Budgets are `measured × 1.5`.
Shape ratios are either an exact invariant (`1.0` — "must not scale with
entities at all", which `main` satisfies) or `main`'s current ratio `× 1.3`
(guard against *worsening*).

### Re-baselining

Regenerate with:

```
UPDATE_PERF_BASELINE=1 yarn vitest run tests/perf/algorithmic-budgets.test.ts
```

- A PR that **deliberately** changes an algorithm's work (a new per-turn system,
  a new AI objective class, an extra unconditional save pass, a schema
  migration) regenerates the baseline **in the same PR** and puts a one-line
  justification **per changed number** in the PR body. Also re-run
  `yarn perf:report` and eyeball `.verification/perf/report.json`.
- Never widen a budget by hand — move the baseline number (via the regen flag)
  and say why.
- **Shape ratios are NOT re-baselined for a size change.** A linear→quadratic
  move (a ratio jumping from ~2 to ~4 for a 2× input) is always either a bug to
  fix or an explicit, reviewed architectural decision — not a number to bump.
- **A budget or ratio *dropping* is NOT automatically good.** It can mean the AI
  skipped work / got dumber. Before regenerating a lower baseline, cross-check
  that `yarn test:ai-long` and `tests/simulation/ai-playability.test.ts` did not
  regress — #1007 does not add lower-bound floors (correctness is #1005's scope).
- The **`aiRound` budgets are `#985`-sensitive** — a Domination-AI change that
  adds real AI work legitimately moves them; regenerate + justify.

### Known super-linearities on `main` (guarded against *worsening*, tracked for fixing)

`aiRound` path work and `turn` heap-pop count are already super-linear in entity
count on `96fb08e9` — see the #1007 follow-up issues. Those guards only catch a
*further* regression; the follow-ups own tightening them once the underlying
`getMovementRangeDetails` / world-phase pathfinding cost is reduced.

## 2. Wall-clock report — LOCAL only, never a gate

`yarn perf:report` (`scripts/run-perf-report.sh` → `vitest.perf.config.ts` →
`tests/perf/report/**`). Excluded from `yarn test` / `test:fast` / `test:slow` /
`verify:push` / the pre-push hooks / CI **unconditionally** by
`vite.config.ts`'s `test.exclude`. Writes `.verification/perf/report.json`
(deterministic counts, diffable) and `.verification/perf/report.timings.json`
(machine-specific `performance.now()` deltas + node/cpu — asserted on nowhere).

Run it before finishing a change to: turn orchestration, a full AI round,
pathfinding, the movement-cost model, visibility, save serialize / parse /
normalize, or any new per-turn system. Not for docs / assets / copy / CSS /
unrelated test refactors.
