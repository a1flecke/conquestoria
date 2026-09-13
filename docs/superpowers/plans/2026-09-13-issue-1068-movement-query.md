# #1068 Detailed Movement-Query Blocker Lookup Implementation Plan — 🟡 implementation complete; PR pending

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make detailed movement-range blocker lookup linear in map entities plus reachable tiles, while preserving every movement result and blocker reason.

**Architecture:** Build a single immutable-in-practice `ReadonlyMap` of canonical blockers for one unit query inside `unit-movement-legality.ts`, and have the detailed BFS read it by hex key. Keep ownership predicates and source precedence in that module, retain the single-coordinate and key-set APIs as projections of the same builder, and do not add AI-round caching or change AI callers.

**Tech Stack:** TypeScript, Vitest, existing machine-independent performance probes and JSON baselines.

---

## File structure

- `src/systems/unit-movement-legality.ts` owns the canonical per-unit blocker map and projects it to the existing single-coordinate and key-set APIs.
- `src/systems/unit-movement-queries.ts` owns BFS traversal only; it builds one legality map per detailed query and reads blocker reasons from it.
- `tests/systems/unit-movement-characterization.test.ts` locks lookup equivalence, source precedence, and existing golden movement behavior.
- `tests/perf/perf-probe.ts`, `tests/perf/perf-probe.test.ts`, `tests/perf/perf-areas.ts`, `tests/perf/algorithmic-budgets.test.ts`, and `tests/perf/baselines/algorithmic-baseline.json` measure and enforce the new algorithmic shape.
- No UI, renderer, audio, storage, save migration, difficulty, or AI caller file changes are permitted in this MR.

### Task 1: Lock canonical-lookup compatibility before changing production code

**Files:**
- Modify: `tests/systems/unit-movement-characterization.test.ts:11-36,282-336`
- Test: `tests/systems/unit-system.test.ts:270-467`
- Test: `tests/ai/ai-tactics.test.ts:651-700`
- Test: `tests/systems/transport-system.test.ts:553-668`
- Test: `tests/systems/airborne-system.test.ts`

- [x] **Step 1: Add failing direct-lookup and first-match regressions to the characterization test.**

  Import `getBlockingMapEntitiesByHex` directly from `@/systems/unit-movement-legality`; do not expand the `unit-system` public barrel for this internal query dependency. Add the following assertions to the existing `#1010 golden — blockers` suite:

  ```ts
  it('getBlockingMapEntitiesByHex agrees with getBlockingMapEntityAt and preserves reasons', () => {
    const { state, moverId } = fixtureState();
    const mover = state.units[moverId]!;
    state.pirates = {
      factions: {
        'pirate-1': {
          id: 'pirate-1',
          headquarters: { kind: 'coastal-enclave', position: { q: 3, r: 1 }, integrity: 100, maxIntegrity: 100 },
        },
      },
    } as GameState['pirates'];
    const lookup = getBlockingMapEntitiesByHex(state, mover);

    for (const key of Object.keys(state.map.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      expect(lookup.get(key) ?? null).toEqual(getBlockingMapEntityAt(state, mover, { q, r }));
    }
    expect(lookup.get('3,1')).toEqual({ reason: 'pirate-enclave', entityId: 'pirate-1' });

    state.civilizations['civ-a']!.diplomacy.treaties.push({
      type: 'alliance', civA: 'civ-a', civB: 'civ-b', turnsRemaining: 5,
    });
    expect(getBlockingMapEntitiesByHex(state, mover).get('4,0')).toBeUndefined();
  });

  it('preserves city, camp, and first-record precedence on an overlapping imported-state hex', () => {
    const { state, moverId } = fixtureState();
    const mover = state.units[moverId]!;
    const overlap = { q: 0, r: 2 };
    state.cities = {
      friendlyFirst: { id: 'friendlyFirst', name: 'Friendly', owner: 'civ-a', position: overlap },
      hostileSecond: { id: 'hostileSecond', name: 'Hostile', owner: 'civ-b', position: overlap },
    } as typeof state.cities;

    expect(getBlockingMapEntityAt(state, mover, overlap)).toEqual({ reason: 'barbarian-camp', entityId: 'camp-1' });
    expect(getBlockingMapEntitiesByHex(state, mover).get(hexKey(overlap)))
      .toEqual({ reason: 'barbarian-camp', entityId: 'camp-1' });

    state.cities = {
      hostileFirst: { id: 'hostileFirst', name: 'Hostile', owner: 'civ-b', position: overlap },
    } as typeof state.cities;
    expect(getBlockingMapEntitiesByHex(state, mover).get(hexKey(overlap)))
      .toEqual({ reason: 'foreign-city', entityId: 'hostileFirst' });
  });
  ```

- [x] **Step 2: Run the new characterization test and confirm it fails because the map helper is absent.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-characterization.test.ts
  ```

  Expected: TypeScript/Vitest fails to resolve `getBlockingMapEntitiesByHex`; no production file changes have occurred.

- [x] **Step 3: Record the existing behavioral surfaces that must remain unchanged.**

  Do not edit these tests. Run them before implementation to establish the compatibility set:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/ai/ai-tactics.test.ts tests/systems/transport-system.test.ts tests/systems/airborne-system.test.ts
  ```

  Expected: PASS. This protects #843 direct-adjacency behavior, #845 camp/AI behavior, #965 pirate-enclave behavior, #970 transport and airborne legality, AI candidate behavior, player-facing movement highlights, and hot-seat ownership independence.

### Task 2: Introduce the canonical lookup and consume it once per detailed query

**Files:**
- Modify: `src/systems/unit-movement-legality.ts:78-130`
- Modify: `src/systems/unit-movement-queries.ts:14,159-241`
- Test: `tests/systems/unit-movement-characterization.test.ts:282-336`

- [x] **Step 1: Implement the canonical lookup in the legality module.**

  Add this exported helper immediately before `getBlockingMapEntityAt`:

  ```ts
  export function getBlockingMapEntitiesByHex(
    state: GameState,
    unit: Unit,
  ): ReadonlyMap<string, BlockingMapEntity> {
    const blockers = new Map<string, BlockingMapEntity>();
    const seenCityKeys = new Set<string>();
    for (const city of Object.values(state.cities)) {
      const key = hexKey(city.position);
      if (seenCityKeys.has(key)) continue;
      seenCityKeys.add(key);
      if (isBlockingCityFor(state, unit, city)) {
        blockers.set(key, { reason: 'foreign-city', entityId: city.id });
      }
    }
    if (isBlockingCampFor(unit)) {
      for (const camp of Object.values(state.barbarianCamps ?? {})) {
        const key = hexKey(camp.position);
        if (!blockers.has(key)) blockers.set(key, { reason: 'barbarian-camp', entityId: camp.id });
      }
    }
    if (isBlockingPirateEnclaveFor(unit)) {
      for (const enclave of pirateEnclaveAnchorEntries(state)) {
        if (!blockers.has(enclave.key)) {
          blockers.set(enclave.key, { reason: 'pirate-enclave', entityId: enclave.id });
        }
      }
    }
    return blockers;
  }
  ```

  Replace the body of `getBlockingMapEntityAt` with:

  ```ts
  return getBlockingMapEntitiesByHex(state, unit).get(hexKey(coord)) ?? null;
  ```

  Replace the duplicated loop in `getBlockingMapEntityKeys` with:

  ```ts
  return new Set(getBlockingMapEntitiesByHex(state, unit).keys());
  ```

  This intentionally preserves the prior `find` behavior for duplicate city records: only the first city at a hex participates; a non-blocking first city lets a camp or enclave win, and a blocking first city cannot be overwritten later.

- [x] **Step 2: Build one lookup after the unit-null guard in `getMovementRangeDetails`.**

  Change the legality import and insert the lookup once, before occupancy construction:

  ```ts
  import { getBlockingMapEntitiesByHex } from './unit-movement-legality';

  const unit = state.units[unitId];
  if (!unit) return { reachable: [], zocLimited: [] };
  const blockingEntitiesByHex = getBlockingMapEntitiesByHex(state, unit);
  ```

  Replace only the per-neighbor lookup with:

  ```ts
  const blockingEntity = blockingEntitiesByHex.get(key) ?? null;
  ```

  Leave the `fromStart`, pirate-enclave reason check, zone-of-control condition, terminal calculation, queue ordering, and AI caller signatures unchanged.

- [x] **Step 3: Run source policy and focused behavioral tests.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/systems/unit-movement-legality.ts src/systems/unit-movement-queries.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-movement-characterization.test.ts tests/ai/ai-tactics.test.ts tests/systems/transport-system.test.ts tests/systems/airborne-system.test.ts
  ```

  Expected: PASS. In particular, detailed reachable and `zocLimited` ordering/reasons remain identical, AI still excludes illegal pathing, transport and airborne use the same legality, and changing `currentPlayer` in hot-seat fixtures does not alter the acting unit's result.

- [x] **Step 4: Commit the tested legality/query change.**

  ```bash
  git add src/systems/unit-movement-legality.ts src/systems/unit-movement-queries.ts tests/systems/unit-movement-characterization.test.ts
  git commit -m "perf(movement): index detailed-query blockers"
  ```

### Task 3: Replace the obsolete performance proxy with an exact regression gate

**Files:**
- Modify: `tests/perf/perf-probe.ts:23-49,98-105`
- Modify: `tests/perf/perf-probe.test.ts:39-49`
- Modify: `tests/perf/perf-areas.ts:50-55,130-140`
- Modify: `tests/perf/algorithmic-budgets.test.ts:61-113,198-213`
- Modify: `tests/perf/baselines/algorithmic-baseline.json`
- Verify: `scripts/ci-test-shards.json` retains the existing assignment for the changed default-discovered test.

- [x] **Step 1: Add the lookup-build counter and its zero-operation probe assertion.**

  Extend `PerfCounts` and `emptyCounts()` with `blockingMapEntityLookupBuilds: number`. Spy on `legality.getBlockingMapEntitiesByHex` exactly as the existing `getBlockingMapEntityAt` spy does, incrementing the new counter and calling the captured original. Update the empty-operation expectation to include:

  ```ts
  blockingMapEntityLookupBuilds: 0,
  ```

- [x] **Step 2: Measure exact detailed-query work, without a derived city-count proxy.**

  In the `moveRange@e1`/`moveRange@e2` branch, remove `cityCount` and `derivedInnerBound` entirely and return:

  ```ts
  return {
    blockingEntityAtCalls: counts.blockingEntityAtCalls,
    blockingMapEntityLookupBuilds: counts.blockingMapEntityLookupBuilds,
  };
  ```

  Remove `cityCount` and `derivedInnerBound` from `AreaSample`; no other measured area uses either field.

- [x] **Step 3: Make Guard 1 exact and prove the guard rejects both sabotage shapes.**

  Add a local assertion helper in `algorithmic-budgets.test.ts`:

  ```ts
  function expectMoveRangeBlockerWork(sample: AreaSample): void {
    expect(sample.blockingEntityAtCalls, 'detailed BFS must not call the linear coordinate lookup').toBe(0);
    expect(sample.blockingMapEntityLookupBuilds, 'detailed query must build one blocker lookup').toBe(1);
  }
  ```

  Replace Guard 1 with `expectMoveRangeBlockerWork(S('moveRange@e2'))`. Add the controlled sabotage proof immediately after it:

  ```ts
  it('GUARD 1 sabotage proof — rejects a per-neighbor lookup or rebuilt lookup', () => {
    expect(() => expectMoveRangeBlockerWork({ blockingEntityAtCalls: 1, blockingMapEntityLookupBuilds: 1 })).toThrow();
    expect(() => expectMoveRangeBlockerWork({ blockingEntityAtCalls: 0, blockingMapEntityLookupBuilds: 2 })).toThrow();
  });
  ```

  Remove `moveRange` from computed baseline budgets: its two shape invariants are exact and independent of a historical hardware-free cap. Regenerate the baseline so it removes the obsolete `cityCount`, `derivedInnerBound`, and `budgets.moveRange` fields while retaining the new per-area counts.

- [x] **Step 4: Refresh CI-shard metadata because the default-discovered budget test gained a test.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test:profile:default
  ./scripts/run-with-mise.sh yarn test:ci-shards:allocate
  ./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts
  ```

  Result: `test:profile:default` and the shard-selection test passed. The allocator proposed a repository-wide 1,313-line reassignment even though the changed test already had exactly one valid assignment; that unrelated churn was discarded, leaving the manifest unchanged.

- [x] **Step 5: Regenerate and verify the performance baseline.**

  Run separately:

  ```bash
  UPDATE_PERF_BASELINE=1 ./scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
  ./scripts/run-with-mise.sh yarn test --run tests/perf/perf-probe.test.ts tests/perf/algorithmic-budgets.test.ts
  ./scripts/run-with-mise.sh yarn perf:report
  ```

  Expected: PASS. The checked-in JSON contains only deterministic numeric data; `moveRange@e1` and `moveRange@e2` show zero direct coordinate lookups and one canonical lookup build. Inspect `.verification/perf/report.json` to confirm the same counts are reported locally. In the PR body, justify each changed move-range number as removal of 27 per-neighbor linear scans and addition of one per-query canonical build; do not claim an AI-round cache.

- [x] **Step 6: Commit the performance gate.**

  ```bash
  git add tests/perf/perf-probe.ts tests/perf/perf-probe.test.ts tests/perf/perf-areas.ts tests/perf/algorithmic-budgets.test.ts tests/perf/baselines/algorithmic-baseline.json scripts/ci-test-shards.json
  git commit -m "test(perf): guard detailed movement blocker lookup"
  ```

### Task 4: Final review, verification, and delivery record

**Files:**
- Modify: `docs/superpowers/plans/2026-09-13-issue-1068-movement-query.md`
- Verify: changed source and test files from Tasks 1-3

- [x] **Step 1: Perform the required inline review against the completed diff.**

  Review both `git diff --stat origin/main...HEAD` and `git diff --stat`, then inspect the complete source diff. Record in the PR under `## Pre-PR inline code review`:

  ```text
  perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.
  ```

  The review must state evidence for no gameplay/difficulty/UI/SFX/save changes, unchanged AI call semantics, hot-seat actor-owner independence, canonical legality ownership, first-match collision preservation, transport/airborne compatibility, exact performance guard behavior, and any actual inline findings with their fixes.

- [ ] **Step 2: Run final source, targeted, build, and durable evidence.**

  Run separately:

  ```bash
  scripts/check-src-rule-violations.sh src/systems/unit-movement-legality.ts src/systems/unit-movement-queries.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-movement-characterization.test.ts tests/ai/ai-tactics.test.ts tests/systems/transport-system.test.ts tests/systems/airborne-system.test.ts tests/perf/perf-probe.test.ts tests/perf/algorithmic-budgets.test.ts tests/scripts/ci-test-shard-selection.test.ts
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test:durable
  ./scripts/run-with-mise.sh yarn test:durable:status
  ```

  Expected: every command exits 0; durable status identifies the current `HEAD` and a clean working tree. If any long command has incomplete terminal output, use its durable status before inspecting a live process and do not start a duplicate run.

- [x] **Step 3: Mark delivery state in this plan and commit it with the final review notes.**

  Tick every completed checkbox. Before creating the PR, annotate this plan's title with `🟡 implementation complete; PR pending`; after the PR number exists, replace that annotation with `✅ merged (#<actual-pr-number>)` in the merge-follow-up commit required by repository policy. Commit the pre-PR status update with:

  ```bash
  git add docs/superpowers/plans/2026-09-13-issue-1068-movement-query.md
  git commit -m "docs: record #1068 implementation status"
  ```

  The PR must explicitly list AI-round caching as out of scope and explain that no player-visible action was introduced, so this narrow performance MR cannot create a dead-end solo or hot-seat UX.
