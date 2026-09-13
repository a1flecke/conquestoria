# #1070 World-turn Pathfinding Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably attribute every synchronous `processTurn` pathfinding operation to a world-phase scope before selecting any production optimization for #1070.

**Architecture:** Keep `tests/perf/perf-probe.ts` domain-neutral: it provides optional, stack-safe counting scopes around its existing spies. Put turn-manager knowledge and phase wrappers in a new test-only helper so generic performance tooling does not depend on pirate, rogue-host, or route-runner systems. First establish exhaustive, deterministic attribution and calibration; only then revise this plan with the measured dominating source and its minimal production fix.

**Tech Stack:** TypeScript, Vitest spies, existing deterministic crowded fixtures, `EventBus`, `firstSimulationDivergence`.

---

## File structure

- Modify: `tests/perf/perf-probe.ts` — generic scope API and aggregate-to-scope counters; no imports from world systems or `turn-manager`.
- Modify: `tests/perf/perf-probe.test.ts` — unit coverage for scope attribution, restoration, and unchanged aggregate counts.
- Create: `tests/perf/turn-pathfinding-attribution.ts` — world-specific phase labels, safely installed phase wrappers, and one attributed `processTurn` measurement entry point.
- Create: `tests/perf/turn-pathfinding-attribution.test.ts` — e1/e2 stability/reconciliation, calibrated pirate-plus-rogue-host coverage, and no-observability-change proof.
- Modify: `docs/superpowers/specs/2026-09-13-issue-1070-world-turn-pathfinding-design.md` — record the measured e1/e2 scope tables and select the next implementation scope only after the tests pass.
- Modify as required by test discovery: `scripts/ci-test-shards.json` — regenerated CI assignment for the new default-discovered test only.

### Task 1: Add a generic, exception-safe attribution primitive

**Files:**
- Modify: `tests/perf/perf-probe.ts:21-160`
- Modify: `tests/perf/perf-probe.test.ts:25-110`

- [ ] **Step 1: Write failing tests for scoped counter ownership and restoration.**

  Add these imports and assertions to `tests/perf/perf-probe.test.ts`. Use a real `findPath` within each scope so the test proves the same spies drive aggregate and scoped counters.

  ```ts
  import { withPerfProbe, type PathfindingAttributionCounts } from './perf-probe';

  it('attributes every pathfinding counter to the active scope and reconciles aggregates', () => {
    const map = tinyMap();
    const [from, to] = routeEndpoints(map);
    const { counts, attribution } = withPerfProbe(
      scope => {
        scope.run('turn:pirates', () => findPath(from, to, map, 'land'));
        return scope.run('turn:route-runners', () => findPath(to, from, map, 'land'));
      },
      { attribution: { defaultScope: 'turn:unattributed-pathfinding' } },
    );
    const sums = Object.values(attribution!).reduce<PathfindingAttributionCounts>(
      (total, value) => ({
        pathQueries: total.pathQueries + value.pathQueries,
        heapPops: total.heapPops + value.heapPops,
        heapPushes: total.heapPushes + value.heapPushes,
      }),
      { pathQueries: 0, heapPops: 0, heapPushes: 0 },
    );
    expect(attribution?.['turn:pirates']?.pathQueries).toBe(1);
    expect(attribution?.['turn:route-runners']?.pathQueries).toBe(1);
    expect(sums).toEqual({
      pathQueries: counts.pathQueries,
      heapPops: counts.heapPops,
      heapPushes: counts.heapPushes,
    });
  });

  it('restores the prior scope after a scoped callback throws', () => {
    const map = tinyMap();
    const [from, to] = routeEndpoints(map);
    const { attribution } = withPerfProbe(
      scope => {
        expect(() => scope.run('turn:pirates', () => { throw new Error('boom'); })).toThrow('boom');
        findPath(from, to, map, 'land');
      },
      { attribution: { defaultScope: 'turn:unattributed-pathfinding' } },
    );
    expect(attribution?.['turn:unattributed-pathfinding']?.pathQueries).toBe(1);
    expect(attribution?.['turn:pirates']).toBeUndefined();
  });
  ```

- [ ] **Step 2: Run the focused probe test and confirm the new API is absent.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/perf/perf-probe.test.ts`

  Expected: TypeScript/Vitest failure because `PathfindingAttributionCounts`, the callback form, and `scope.run` do not exist yet.

- [ ] **Step 3: Implement the smallest domain-neutral API.**

  In `tests/perf/perf-probe.ts`, add the following exported types immediately after `PerfCounts`, then change `withPerfProbe` to accept either the existing zero-argument callback or a scoped callback and the optional options object. Do not add any `src/` imports beyond the probe's existing measured primitives.

  ```ts
  export type PathfindingAttributionCounts = Pick<PerfCounts, 'heapPops' | 'heapPushes' | 'pathQueries'>;

  export interface PerfProbeScope {
    run<T>(key: string, fn: () => T): T;
  }

  export interface PerfProbeOptions {
    attribution?: { defaultScope: string };
  }

  export interface PerfProbeResult<T> {
    result: T;
    counts: PerfCounts;
    attribution?: Readonly<Record<string, PathfindingAttributionCounts>>;
  }
  ```

  Initialize `currentScope` from `options.attribution?.defaultScope`. On the `findPath`, `BinaryHeap.prototype.pop`, and `BinaryHeap.prototype.push` spy paths, increment the aggregate counter exactly as today and, when attribution is enabled, increment a lazily created `{ pathQueries: 0, heapPops: 0, heapPushes: 0 }` bucket for `currentScope`. Implement `scope.run` with:

  ```ts
  const previousScope = currentScope;
  currentScope = key;
  try {
    return fn();
  } finally {
    currentScope = previousScope;
  }
  ```

  Reject an empty scope key with `throw new Error('Perf attribution scope key must be non-empty.')`. Return no `attribution` property when options omit attribution, preserving every existing caller's result shape. When enabled, build the returned record from sorted keys so repeat comparisons cannot depend on insertion order. Move all spy setup inside the existing outer `try/finally`, restore in reverse order, and set `active = false` in that same `finally`; setup failures must not strand a spy or lock out the next probe.

- [ ] **Step 4: Run focused tests and rule checks.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/perf/perf-probe.test.ts`

  Expected: PASS, including existing non-nested and restoration behavior plus the two new scoped tests.

- [ ] **Step 5: Commit the generic probe unit.**

  ```bash
  git add tests/perf/perf-probe.ts tests/perf/perf-probe.test.ts
  git commit -m "test(perf): add scoped pathfinding attribution"
  ```

### Task 2: Isolate world-phase wrappers in a test helper

**Files:**
- Create: `tests/perf/turn-pathfinding-attribution.ts`
- Create: `tests/perf/turn-pathfinding-attribution.test.ts`

- [ ] **Step 1: Write a failing test for exhaustive and stable e1/e2 attribution.**

  In `tests/perf/turn-pathfinding-attribution.test.ts`, measure each crowded fixture three times through `measureTurnPathfindingAttribution`, assert every sample is deeply equal, and assert the three scope sums exactly match the returned aggregate counters:

  ```ts
  const sumScopes = (sample: TurnPathfindingAttributionSample): PathfindingAttributionCounts =>
    Object.values(sample.attribution).reduce<PathfindingAttributionCounts>(
      (total, scope) => ({
        pathQueries: total.pathQueries + scope.pathQueries,
        heapPops: total.heapPops + scope.heapPops,
        heapPushes: total.heapPushes + scope.heapPushes,
      }),
      { pathQueries: 0, heapPops: 0, heapPushes: 0 },
    );

  for (const state of [buildCrowdedGame({ entityScale: 1 }), buildCrowdedGame({ entityScale: 2 })]) {
    const samples = Array.from({ length: 3 }, () =>
      measureTurnPathfindingAttribution(structuredClone(state), new EventBus()));
    expect(samples[1]).toEqual(samples[0]);
    expect(samples[2]).toEqual(samples[0]);
    expect(sumScopes(samples[0]!)).toEqual({
      pathQueries: samples[0]!.counts.pathQueries,
      heapPops: samples[0]!.counts.heapPops,
      heapPushes: samples[0]!.counts.heapPushes,
    });
  }
  ```

- [ ] **Step 2: Implement the test-only measurement helper.**

  Create `tests/perf/turn-pathfinding-attribution.ts`. It may import `processTurn` and exactly the three exported helpers below; `tests/perf/perf-probe.ts` may not import this file or any of these systems.

  ```ts
  export const TURN_PATHFINDING_SCOPES = {
    pirates: 'turn:pirates',
    rogueElephantHost: 'turn:rogue-elephant-host',
    routeRunners: 'turn:route-runners',
    unattributed: 'turn:unattributed-pathfinding',
  } as const;

  export interface TurnPathfindingAttributionSample {
    state: GameState;
    counts: PerfCounts;
    attribution: Readonly<Record<string, PathfindingAttributionCounts>>;
    wrapperCalls: Readonly<Record<'pirates' | 'rogueElephantHost' | 'routeRunners', number>>;
  }

  export function measureTurnPathfindingAttribution(
    state: GameState,
    bus: EventBus,
  ): TurnPathfindingAttributionSample;
  ```

  Within `measureTurnPathfindingAttribution`, capture each original before calling `vi.spyOn`, then use scoped call-through wrappers for `processPiratesForCompletedRound`, `processRogueElephantHostTurn`, and `advanceRouteRunners`. Each wrapper increments only its corresponding `wrapperCalls` member and returns `scope.run(TURN_PATHFINDING_SCOPES.<name>, () => original(...args))`. Register each spy in a `spies` array and restore every spy in a `finally`, in reverse creation order. Call `withPerfProbe` with `defaultScope: TURN_PATHFINDING_SCOPES.unattributed`, run `processTurn(state, bus)`, require that the returned `attribution` is present, and return only serializable measurement values. This helper must not change state, emit an event, or access storage.

- [ ] **Step 3: Run the focused attribution test.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/perf/turn-pathfinding-attribution.test.ts`

  Expected: PASS, with all three repeated e1/e2 samples equal and every aggregate pathfinding counter reconciled to one stable scope table.

- [ ] **Step 4: Add a calibrated active-world-actor fixture and non-observability proof.**

  In the same test file, construct a deterministic small-map state using the proven local fixture patterns in `tests/systems/pirate-system.test.ts` and `tests/systems/combat-system.test.ts`:

  ```ts
  const initial = calibratedWorldActorTurn();
  const plainEvents = captureWorldActorEvents(new EventBus());
  const plain = processTurn(structuredClone(initial), plainEvents.bus);
  const attributedEvents = captureWorldActorEvents(new EventBus());
  const attributed = measureTurnPathfindingAttribution(structuredClone(initial), attributedEvents.bus);

  expect(attributed.wrapperCalls.pirates).toBe(1);
  expect(attributed.wrapperCalls.rogueElephantHost).toBeGreaterThan(0);
  expect(attributed.attribution[TURN_PATHFINDING_SCOPES.pirates]?.pathQueries).toBeGreaterThan(0);
  expect(attributed.attribution[TURN_PATHFINDING_SCOPES.rogueElephantHost]?.pathQueries).toBeGreaterThan(0);
  expect(firstSimulationDivergence(plain, attributed.state)).toBeNull();
  expect(attributedEvents.events).toEqual(plainEvents.events);
  ```

  `calibratedWorldActorTurn()` must retain one valid active pirate fleet with a reachable target and one `phase: 'active'` rogue-elephant host with an existing crisis force and target tile. It must create both on the same deterministic map and set their `createdTurn`/turn relationship so this single `processTurn` invokes movement rather than only activating a warning. `captureWorldActorEvents` must register concrete typed listeners for `unit:move`, `pirate:audio-cue`, and `rogue-elephant-host:lifecycle`, store `{ event, data }` records in emission order, and return the EventBus it used. Do not add an EventBus wildcard API.

- [ ] **Step 5: Add failure-path coverage.**

  Add a helper-level test that makes a scoped callback throw, catches that expected throw, then runs a real `findPath` through the still-live probe. Assert the post-throw operation charges `turn:unattributed-pathfinding`, not the thrown phase. Also assert a second `measureTurnPathfindingAttribution` call succeeds after a first call throws, proving both the generic and domain spies are restored.

- [ ] **Step 6: Run focused tests and source isolation checks.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/perf/perf-probe.test.ts tests/perf/turn-pathfinding-attribution.test.ts
  ./scripts/run-with-mise.sh yarn test --run tests/scripts/perf-isolation.test.ts
  ```

  Expected: PASS. The isolation test continues to prove no production module references the test-only probe.

- [ ] **Step 7: Commit the world attribution unit.**

  ```bash
  git add tests/perf/turn-pathfinding-attribution.ts tests/perf/turn-pathfinding-attribution.test.ts
  git commit -m "test(perf): attribute world-turn pathfinding"
  ```

### Task 3: Classify the test and record the evidence gate

**Files:**
- Modify: `scripts/ci-test-shards.json` only if default discovery requires it
- Modify: `docs/superpowers/specs/2026-09-13-issue-1070-world-turn-pathfinding-design.md`

- [ ] **Step 1: Place the new test in CI and the correct local tier.**

  The e1/e2 triple crowded measurement is a costly deterministic simulation. Add `tests/perf/turn-pathfinding-attribution.test.ts` to the existing intensive local selection, then regenerate the default-discovered CI manifest exactly once:

  ```bash
  ./scripts/run-with-mise.sh yarn test:profile:default
  ./scripts/run-with-mise.sh yarn test:ci-shards:allocate
  ./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts tests/scripts/local-test-tier-selection.test.ts
  ```

  Inspect `git diff -- scripts/ci-test-shards.json` before keeping it. Retain the generated placement for the new test, but stop and use the repository's fixed-shard procedure if allocation moves unrelated existing tests.

- [ ] **Step 2: Obtain the definitive attribution samples.**

  Run the new expensive test alone, then run the existing #1007 budget suite without regenerating any baseline:

  ```bash
  ./scripts/run-with-mise.sh yarn test:intensive-simulations tests/perf/turn-pathfinding-attribution.test.ts
  ./scripts/run-with-mise.sh yarn test:intensive-simulations tests/perf/algorithmic-budgets.test.ts
  ```

  Expected: PASS. Copy only stable integer scope counters from the test's assertion diagnostic or an explicit deterministic test report into the #1070 design spec; do not write elapsed time, local paths, or host properties.

- [ ] **Step 3: Apply the decision gate, not a speculative production change.**

  Update the `Root-cause decision gate` in the #1070 design spec with e1/e2 counts and their ratio for each scope. Select exactly one of these outcomes:

  ```text
  dominant named scope     -> write a new behavior-characterization-and-fix plan for that subsystem
  dominant unattributed    -> add one narrower attribution boundary and repeat Task 2
  no super-linear scope    -> tighten the existing turn shape guard with the observed evidence; no production code
  multiple same-query scopes -> document the shared immutable state slice, its deterministic key, and mutation invalidation before a helper is designed
  ```

  Do not change `src/`, save schemas, difficulty tables, UI, audio, AI policy, target selection, range, or baseline values in this task.

- [ ] **Step 4: Commit evidence and test-manifest changes.**

  ```bash
  git add docs/superpowers/specs/2026-09-13-issue-1070-world-turn-pathfinding-design.md scripts/ci-test-shards.json
  git commit -m "docs: record #1070 pathfinding attribution"
  ```

## Review and completion gate

- Run `git diff --check`, inspect `git diff --stat origin/main...HEAD` and the complete `git diff origin/main...HEAD` before calling the attribution work reviewed.
- The inline review must explicitly cover gameplay balance/fun/new mechanics; ages 7–43 and play styles; Explorer/Standard/Veteran; AI behavior; UI/UX; architecture/extensibility/data; SFX; save compatibility; tests; solo and hot-seat. Attribution is test-only, so its acceptance condition is no change to each player-visible or persistent dimension plus calibration evidence for the actor-owned world path.
- This plan deliberately stops before a production optimization. Its completion does not authorize changing a pathfinding algorithm or a world actor; the measured scope and a new reviewed plan must name the exact source first.
