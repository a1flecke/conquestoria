# #1069 — AI-round pathfinding / city-yield super-linearity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #1069 by fixing the two functions that actually dominate `aiRound`'s super-linear
work — `ai-upgrades.ts`'s upgrade-routing destination search (98–99% of heap pops) and
`ai-production.ts`'s research-value scoring (the dominant `calculateCityYields` caller) — with
provably-exact, narrowly-scoped optimizations, and add the `cityYieldCalls` guard the `aiRound`
perf area never had.

**Architecture:** Two independent, additive fixes, no shared surface area:
1. A geometric hex-distance prefilter before `routePath`'s A* calls in `ai-upgrades.ts`, using
   hex distance as a proven lower bound on real path length to skip searches that are
   mathematically guaranteed to be discarded anyway.
2. A civ-level "research scoring baseline," computed once per `generateWithResidual` call and
   reused across every building candidate, replacing per-candidate full-empire rescans with a
   single cached "before" plus a cheap single-city "after" patch — falling back to the exact
   original full-rescan code whenever the patch isn't provably safe (a unique national-project
   building candidate, or `networkGovernanceBonus > 0`).

Read `docs/superpowers/specs/2026-09-15-issue-1069-ai-round-perf-design.md` in full before
starting — this plan assumes its attribution, cache-validity proofs, and scope boundaries as
given. **Do not silently redesign anything marked "Decisions Terra may not silently redesign"
below** — if evidence during implementation contradicts one of them, stop and escalate (Sol/Astra
per the assignment), do not improvise past it.

**Tech Stack:** TypeScript, Vitest, the existing `tests/perf/perf-probe.ts` spy infrastructure.

## Global Constraints

- Every fix must be **provably exact** for the case it optimizes and must **fall back to the
  exact unmodified original code** for any case outside its proven-safe scope — never an
  approximation.
- No new production instrumentation (`tests/scripts/perf-isolation.test.ts` enforces this) — all
  measurement stays in `tests/perf/**`.
- No RNG, no behavior-tier (difficulty/personality) branching, no change to which candidate an AI
  civ ultimately picks.
- `yarn test` does not type-check — `yarn build` is the only path that runs `tsc`. Run it before
  any commit that could have introduced a type error.
- Commit after each task. End every commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

## Decisions Terra may not silently redesign

1. The `routePath` fix is a **prefilter**, not a cache — no memoization of path results across
   calls. If measurement shows it doesn't help enough, the fix to reach for next is narrowing the
   candidate SET further (still exact), not caching approximate/stale paths.
2. The research-baseline fix falls back to the full original computation whenever
   `networkGovernanceBonus > 0` **or** the candidate building is itself a unique national project
   (`building?.nationalProject && building.uniquePerEmpire`). Do not attempt to extend the fast
   path to cover either case without writing (and getting reviewed) a new cache-validity proof for
   it — see design doc §5b for exactly why both are unsafe as written.
3. Do not touch `applyAIProduction`'s two-pass `generateWithResidual` call structure
   (`bestByCityId` precompute + sequential enqueue loop) — the design doc §5a explains why caching
   across those two call sites (or across cities within the sequential loop) is a real behavior
   change, not a safe dedup.
4. Do not touch `validateUnitMove`'s `blockingEntityAtCalls`, `ai-prepared-turn.ts:740`'s
   `travelTurnsByPlanId`, or `ai-objective-scoring.ts:189`'s `pathLength` — all three were
   investigated and found near-linear or shrinking, not part of this issue's scope (design doc
   §2a, §7).
5. Do not widen `isCityCoastal`, touch `src/ai/ai-expansion-sites.ts`, or touch anything in the
   #1064/#1066/#1107 expansion/amphibious/coastal-recovery machinery. This MR does not change
   candidate generation for expansion, amphibious, or coastal-recovery objectives — only the
   upgrade-routing and research-scoring cost of evaluating candidates that already exist.

---

### Task 1: Golden-reference fixture for whole-round behavioral equivalence

**IMPLEMENTATION NOTE (found while executing this task, not anticipated when this plan was
written):** a raw JSON dump of `aiRound@e2`'s full resulting `GameState` is ~12.5MB (8.5MB for
e1) — an unreasonable thing to commit, and it would grow by that much again on every future
regen. Switched to **per-top-level-key digests**, reusing this repo's existing convention for
exactly this problem: `tests/storage/fixtures/save-compat/migration-digest.ts` (#1023)'s
`digestMigratedState`/`describeDigestDrift`, imported directly rather than reimplemented, plus a
small local digest for `traces` (not itself a `GameState`). Output is ~120 lines instead of tens
of megabytes, and a failure still names the divergent top-level key. This does not change what's
being proven — a digest divergence is exactly as strong a signal as a full-value divergence,
just without full diagnostic detail on-hand (get that by regenerating a NEW digest locally,
comparing key-by-key, and inspecting the live objects in a debugger/temporary log — never by
re-baselining the committed golden file to match a divergence).

**Files:**
- Create: `tests/perf/fixtures/aiRound-1069-golden-digests.json` (compact digest file, not a raw
  state dump — see note above)
- Create: `tests/perf/aiRound-1069-equivalence.test.ts`

**Interfaces:**
- Consumes: `buildCrowdedGame` (`tests/perf/fixtures/crowded-state.ts`), `processNonHumanMajorRound`
  (`@/ai/ai-round-scheduler`), `firstSimulationDivergence` (`tests/helpers/deterministic-state.ts`).
- Produces: two committed JSON fixtures + a permanent regression test other tasks must keep green.

This is the load-bearing equivalence proof for the WHOLE MR — every later task must leave this
test passing unchanged.

- [x] **Step 1: Generate the golden reference on the UNMODIFIED current `main`-equivalent code**
  — done. `tests/perf/aiRound-1069-equivalence.test.ts` runs `processNonHumanMajorRound` on both
  `buildCrowdedGame({entityScale: 1})` and `{entityScale: 2})`, digests the result via
  `digestMigratedState` (reused from `tests/storage/fixtures/save-compat/migration-digest.ts`,
  #1023's existing convention for exactly this "large state, need a compact pinned fingerprint"
  problem) for `state` plus a local sha256 digest for `traces`, gated by
  `UPDATE_1069_REFERENCE=1` the same way `algorithmic-budgets.test.ts` uses
  `UPDATE_PERF_BASELINE`.

- [x] **Step 2: Regenerate the fixture on the current, unmodified code** — done:
  `UPDATE_1069_REFERENCE=1 bash scripts/run-with-mise.sh yarn vitest run
  tests/perf/aiRound-1069-equivalence.test.ts` wrote
  `tests/perf/fixtures/aiRound-1069-golden-digests.json` (124 lines).

- [x] **Step 3: Run again without the env var — confirm it's green against itself** — done, PASS
  (2 tests).

- [x] **Step 4: Commit the fixture + test** — staged (`tests/perf/aiRound-1069-equivalence.test.ts`,
  `tests/perf/fixtures/aiRound-1069-golden-digests.json`), committed at the end of this task
  alongside the rest of the branch's early commits.

  This test must stay green, UNCHANGED, through every remaining task. If a later task needs to
  touch it, that is a signal to stop and reconsider, not to regenerate the fixture — regenerating
  after the fix lands would make this test prove nothing.

---

### Task 2: Failing-shape + equivalence tests for the `ai-upgrades.ts` distance prefilter

**Files:**
- Modify: `tests/ai/ai-upgrades.test.ts` (279 lines currently — read it first for existing
  fixture-building helpers/conventions before adding to it)
- Modify (read-only reference): `src/ai/ai-upgrades.ts`

**Interfaces:**
- Consumes: whatever fixture-building helpers `ai-upgrades.test.ts` already has (read the file
  first — likely a `GameState` builder plus a `PreparedMajorCivPlan` builder, following the
  pattern other `tests/ai/*.test.ts` files use).
- Produces: a test proving (a) an unreachable-by-round-cap destination city is never pathed to,
  and (b) the chosen destination/route is unchanged from today when there IS a reachable one
  nearer than an unreachable one.

- [ ] **Step 1: Write the failing/current-shape test — prove `routePath` is called for a
  guaranteed-discarded distant city today**

  Build a fixture: one civ, one unit eligible for modernization (per
  `eligibleForModernization` — needs a unit type with a real upgrade target given the civ's
  completed techs; check `getCanonicalUpgradeTarget`'s test fixtures in
  `tests/systems/unit-upgrade-system.test.ts` for a known eligible pairing to reuse), two safe
  cities with the needed building: one within `6 * movementPoints` hexes, one far outside it
  (e.g. `40 * movementPoints` hexes away on a large enough map — reuse or extend
  `tests/perf/fixtures/crowded-state.ts`'s map-building approach, or build a minimal map inline
  with `createNewGame`/a hand-built `GameMap` if `ai-upgrades.test.ts` already does that
  elsewhere).

  ```ts
  import { vi } from 'vitest';
  import * as pathfindingModule from '@/systems/unit-pathfinding';

  it('#1069: does not call findPath for a destination city beyond the 6-round cap', () => {
    const findPathSpy = vi.spyOn(pathfindingModule, 'findPath');
    // ...build state with unit + near-safe-city (in range) + far-safe-city (out of range)...
    const result = processAIUpgrades(state, civId, prepared, new EventBus());
    const calledTargets = findPathSpy.mock.calls.map(call => call[1]); // `to` param
    expect(calledTargets).not.toContainEqual(farCity.position);
    findPathSpy.mockRestore();
  });
  ```

  Run it now, before Step 3's implementation: **expected FAIL** (current code calls `findPath` for
  the far city too, since the distance prefilter doesn't exist yet).

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-upgrades.test.ts -t "does not call findPath"
  ```

- [ ] **Step 2: Write the equivalence test — same fixture, assert the near city still wins**

  ```ts
  it('#1069: still routes to the nearest in-range safe city (unchanged decision)', () => {
    const result = processAIUpgrades(state, civId, prepared, new EventBus());
    expect(result.routedUnitIds).toContain(unitId);
    // assert the unit actually moved toward nearCity.position, not farCity.position --
    // e.g. via portfolio.upgradeRoutesByUnitId[unitId].cityId === nearCity.id, or via the
    // unit's new position being closer to nearCity than before.
  });
  ```

  This should already PASS on current code (the near city already wins today — the fix only
  removes wasted work evaluating the far one) — confirms the test fixture itself is sound before
  the implementation changes anything.

- [ ] **Step 3: Implement the prefilter** (see Task 3)

- [ ] **Step 4: Re-run both tests — both must PASS**

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-upgrades.test.ts
  ```

---

### Task 3: Implement the `ai-upgrades.ts` distance prefilter

**Files:**
- Modify: `src/ai/ai-upgrades.ts:285-306` (the `destinations` block inside `processAIUpgrades`)

**Interfaces:**
- Consumes: the file's own existing `distance(state, left, right)` helper (`ai-upgrades.ts:47-55`),
  `UNIT_DEFINITIONS` (already imported).
- Produces: no new exports; behavior-preserving internal change only.

- [ ] **Step 1: Add the prefilter**

  Replace:
  ```ts
      .flatMap(cityCandidate => {
        const path = routePath(
          working,
          current,
          cityCandidate,
          civ.techState.completed,
        );
        if (!path) return [];
        const rounds = Math.ceil(
          Math.max(0, path.length - 1)
          / Math.max(1, UNIT_DEFINITIONS[current.type].movementPoints),
        );
        return rounds <= 6 ? [{ city: cityCandidate, path, rounds }] : [];
      })
  ```
  with:
  ```ts
      .flatMap(cityCandidate => {
        // #1069: hex distance is a strict lower bound on any real path's
        // hex-step count -- terrain/obstacles can only lengthen a route, never
        // shorten it below the direct distance. So if a candidate is already
        // farther than `rounds <= 6` could ever allow, the routePath() search
        // below is GUARANTEED to be discarded by the `rounds <= 6` check a few
        // lines down. Skip the A* search entirely for those candidates; every
        // candidate that reaches routePath() is scored identically to before
        // this change. See docs/superpowers/specs/2026-09-15-issue-1069-ai-round-perf-design.md §3.
        const maxHexSteps = 6 * Math.max(1, UNIT_DEFINITIONS[current.type].movementPoints);
        if (distance(working, current.position, cityCandidate.position) > maxHexSteps) return [];
        const path = routePath(
          working,
          current,
          cityCandidate,
          civ.techState.completed,
        );
        if (!path) return [];
        const rounds = Math.ceil(
          Math.max(0, path.length - 1)
          / Math.max(1, UNIT_DEFINITIONS[current.type].movementPoints),
        );
        return rounds <= 6 ? [{ city: cityCandidate, path, rounds }] : [];
      })
  ```

- [ ] **Step 2: Run Task 2's tests + the full `ai-upgrades.test.ts` file**

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-upgrades.test.ts
  ```
  Expected: all PASS, including the two new #1069 tests.

- [ ] **Step 3: Run Task 1's whole-round equivalence test**

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/perf/aiRound-1069-equivalence.test.ts
  ```
  Expected: still PASS (unchanged fixture from Task 1).

- [ ] **Step 4: Commit**

  ```bash
  git add src/ai/ai-upgrades.ts tests/ai/ai-upgrades.test.ts
  git commit -m "perf(ai): skip guaranteed-out-of-range upgrade destinations before pathfinding (#1069)"
  ```

---

### Task 4: Implement the research-scoring baseline (`research-output-system.ts` + `ai-production.ts`)

**Files:**
- Modify: `src/systems/research-output-system.ts` (extract `projectOneCityScience`, add
  `computeResearchScoringBaseline` + `ResearchScoringBaseline` type, extend
  `getMarginalCivResearchGain`)
- Modify: `src/ai/ai-production.ts:477-721` (`generateWithResidual`) and `:664`
  (the `getMarginalCivResearchGain` call site)
- Modify: `tests/systems/research-output-system.test.ts` (114 lines currently — read first)
- Modify: `tests/ai/ai-production.test.ts` (1249 lines currently — read first for existing
  building-candidate fixture conventions)

**Interfaces:**
- Produces:
  ```ts
  // research-output-system.ts
  export interface ResearchScoringBaseline {
    readonly cityScience: Readonly<Record<string, number>>;
    readonly networkGovernanceBonusActive: boolean;
    readonly inputs: CivResearchProjectionInputs; // new, NOT exported -- internal to this module
  }
  export function computeResearchScoringBaseline(state: GameState, civId: string): ResearchScoringBaseline;
  export function getMarginalCivResearchGain(
    state: GameState, civId: string, cityId: string, buildingId: string,
    baseline?: ResearchScoringBaseline,
  ): number; // signature EXTENDED, not changed -- 4-arg callers unaffected
  ```
- Consumes (by `ai-production.ts`): `computeResearchScoringBaseline`, extended
  `getMarginalCivResearchGain`.

#### Step-by-step

- [ ] **Step 1: Read the exact current bodies first**

  Read `src/systems/research-output-system.ts` in full (225 lines) and
  `src/ai/ai-production.ts:477-560` (top of `generateWithResidual`) before editing — the design
  doc's line numbers were correct as of `ca7392c1`; confirm they still match before editing
  (another task may have landed on `main` in the meantime — if line numbers drifted, that's fine,
  just locate the same functions by name).

- [ ] **Step 2: Write the equivalence test FIRST (must fail — the new symbols don't exist yet)**

  In `tests/systems/research-output-system.test.ts`, add:

  ```ts
  import { computeResearchScoringBaseline, getMarginalCivResearchGain } from '@/systems/research-output-system';
  import { getAvailableBuildings } from '@/systems/city-system'; // or wherever it's actually exported from -- confirm
  import * as resourceSystem from '@/systems/resource-system';
  import { vi } from 'vitest';

  describe('#1069 -- getMarginalCivResearchGain baseline equivalence', () => {
    it('fast path (with baseline) matches the full recompute (without baseline) for every real building candidate', () => {
      // Build (or reuse an existing helper's) a multi-city civ state with several idle cities
      // and several available buildings per city -- reuse whatever fixture-building helper
      // this file or `tests/ai/ai-production.test.ts` already has for a multi-city civ.
      const baseline = computeResearchScoringBaseline(state, civId);
      expect(baseline.networkGovernanceBonusActive).toBe(false); // this fixture's tech level
      for (const cityId of civ.cities) {
        const city = state.cities[cityId]!;
        for (const building of getAvailableBuildings(/* ...same args ai-production.ts uses... */)) {
          const full = getMarginalCivResearchGain(state, civId, cityId, building.id);
          const fast = getMarginalCivResearchGain(state, civId, cityId, building.id, baseline);
          expect(fast).toBe(full);
        }
      }
    });

    it('falls back to a full per-city rescan (not the 1-city patch) for a unique national-project building candidate', () => {
      // pick/construct a building with nationalProject: true, uniquePerEmpire: true that is
      // available to this civ/city (check BUILDINGS in city-system.ts for a real id -- e.g.
      // whichever era-appropriate one the fixture's tech level unlocks)
      const baseline = computeResearchScoringBaseline(state, civId);
      const yieldSpy = vi.spyOn(resourceSystem, 'calculateCityYields');
      const fast = getMarginalCivResearchGain(state, civId, cityId, nationalProjectBuildingId, baseline);
      const fastCalls = yieldSpy.mock.calls.length;
      yieldSpy.mockRestore();
      const full = getMarginalCivResearchGain(state, civId, cityId, nationalProjectBuildingId);
      expect(fast).toBe(full);
      // "before" costs ZERO calculateCityYields calls even here -- it always reuses
      // baseline.cityScience regardless of which building is being scored. Only "after" must
      // fall back to a full per-city rescan (not the 1-city patch), because a unique national
      // project can shift `nationalProjectBonus` -- a civ-level input feeding EVERY city's
      // `production`/`idleScienceBonus`, not just the modified one. So the fast call's TOTAL
      // cost here is exactly `civ.cities.length` (all from "after"), not `0` (the ordinary-
      // building fast-path cost, next test) and not `2 * civ.cities.length` (the no-baseline
      // `full` call's cost, which redundantly recomputes "before" too).
      expect(fastCalls).toBe(civ.cities.length);
    });

    it('the fast path skips the O(cities) rescan for an ordinary (non-national-project) building', () => {
      const baseline = computeResearchScoringBaseline(state, civId);
      const yieldSpy = vi.spyOn(resourceSystem, 'calculateCityYields');
      getMarginalCivResearchGain(state, civId, cityId, ordinaryBuildingId, baseline);
      const fastCalls = yieldSpy.mock.calls.length;
      yieldSpy.mockRestore();
      // exactly one calculateCityYields call -- the modified city's "after" projection.
      // (the "before" side is fully served by the cached baseline.cityScience, zero extra calls.)
      expect(fastCalls).toBe(1);
    });
  });
  ```

  Fill in the fixture-construction details by reading the existing tests in both files first —
  do not invent a new fixture style if one already exists that fits.

  Run now: **expected FAIL** (`computeResearchScoringBaseline` doesn't exist yet — a compile
  error, which is an acceptable "fails" state for this step; confirm via `yarn vitest run` that it
  reports the missing export, not a silent skip).

- [ ] **Step 3: Extract `projectOneCityScience` and add the new baseline type/function**

  In `research-output-system.ts`, add (near the top, after the existing interfaces). Use
  `CivDefinition['bonusEffect']`'s actual declared type directly (read its definition in
  `civ-registry.ts`/`types.ts` — whatever `resolveCivDefinition` is typed to return) rather than
  an inferred `ReturnType<...> extends {...}` gymnastic — simpler and matches this codebase's
  existing style of naming real types explicitly:

  ```ts
  interface CivResearchProjectionInputs {
    readonly civDefinitionBonusEffect: CivDefinition['bonusEffect'] | undefined; // adjust the exact type name to whatever civ-registry.ts actually exports
    readonly resourceYieldBonus: ReturnType<typeof getCivResourceYieldBonus>;
    readonly nationalProjectBonus: ReturnType<typeof getNationalProjectCivYieldBonus>;
    readonly empireTechPercents: ReturnType<typeof getEmpireTechPercents>;
    readonly empireFlatTechYields: ReturnType<typeof getEmpireFlatTechYields>;
    readonly empireFlatTargetCityId: string | undefined;
  }
  ```

  **Important design correction (caught in Astra's own mandated design review — apply this from
  the start, do not discover it the hard way):** the original inline loop in
  `getProjectedCityScience` threads `projectedState` forward across cities
  (`let projectedState = state;` ... `projectedState = workResult.state;` each iteration), so
  city B's `assignCityFocus`/`normalizeWorkedTilesForCity` call sees city A's already-updated
  state, not the original `state`. Rather than gambling on whether that threading is behaviorally
  load-bearing (it may or may not be — territory/focus assignment for one city plausibly never
  reads another city's data, but proving that from scratch is its own audit), make
  `projectOneCityScience` return the updated state alongside the score, so **both** callers get
  the exact right behavior with zero ambiguity: the full-scan loop threads it forward exactly as
  today (zero behavior change, guaranteed), and the single-city incremental caller (which only
  ever needs one city, no "next city" to thread into) just discards the returned state.

  Extract the per-city loop body of `getProjectedCityScience` (currently inline,
  `research-output-system.ts:80-131`) into:

  ```ts
  /**
   * One city's contribution to `getProjectedCityScience`'s result. Pulled out so #1069's
   * incremental "after" path (`getMarginalCivResearchGain`) can project a SINGLE city without
   * rescanning the whole civ -- see docs/superpowers/specs/2026-09-15-issue-1069-ai-round-perf-design.md §5b
   * for the exact proof this is safe. `lowestScienceCityId`/`networkGovernanceBonus` are only
   * ever non-trivial from the full-scan caller; the incremental caller always passes
   * `networkGovernanceBonus: 0` (the fast path is never taken when it's nonzero -- see
   * computeResearchScoringBaseline / getMarginalCivResearchGain below). Returns the
   * possibly-updated state (from assignCityFocus/normalizeWorkedTilesForCity) alongside the
   * score so a caller iterating multiple cities can thread it forward exactly as the original
   * inline loop did -- a single-city caller may discard the returned state.
   */
  function projectOneCityScience(
    state: GameState,
    civId: string,
    cityId: string,
    inputs: CivResearchProjectionInputs,
    lowestScienceCityId: string | undefined,
    networkGovernanceBonus: number,
  ): { state: GameState; science: number } {
    const civ = state.civilizations[civId];
    const cityBeforeFocus = state.cities[cityId];
    if (!civ || !cityBeforeFocus) return { state, science: 0 };
    const workResult = cityBeforeFocus.focus === 'custom'
      ? normalizeWorkedTilesForCity(state, cityId)
      : assignCityFocus(state, cityId, cityBeforeFocus.focus);
    const projectedState = workResult.state;
    const city = projectedState.cities[cityId];
    if (!city) return { state: projectedState, science: 0 };

    const activeRouteCount = (projectedState.marketplace?.tradeRoutes ?? [])
      .filter(route => route.fromCityId === cityId || route.toCityId === cityId).length;
    const hostsCompletedLegendaryWonder = Object.values(projectedState.completedLegendaryWonders ?? {})
      .some(wonder => wonder.cityId === cityId);
    const baseYields = calculateCityYields(
      city,
      projectedState.map,
      inputs.civDefinitionBonusEffect,
      civ.techState.completed,
      { activeRouteCount, hostsCompletedLegendaryWonder },
      projectedState.turn,
    );
    const networkCityBonus = getNetworkCityYieldBonus(projectedState, cityId, baseYields);
    const wonderCityBonuses = getLegendaryWonderCityYieldBonus(projectedState, civId, cityId);
    const baseYieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
    const crisisMultiplier = getCrisisYieldMultiplier(projectedState, cityId);
    const scienceMultiplier = baseYieldMultiplier * crisisMultiplier.science;
    const productionMultiplier = baseYieldMultiplier * crisisMultiplier.production;
    const production = Math.floor(
      (baseYields.production
        + networkCityBonus.production
        + (wonderCityBonuses.production ?? 0)
        + inputs.resourceYieldBonus.production
        + (inputs.nationalProjectBonus.production ?? 0)
        + (cityId === inputs.empireFlatTargetCityId ? inputs.empireFlatTechYields.production : 0)
        + ((city.resilienceBonusUntilTurn ?? 0) > projectedState.turn ? 1 : 0))
      * productionMultiplier
      * (1 + (inputs.empireTechPercents.production ?? 0) / 100),
    );
    const science = Math.floor(
      (baseYields.science
        + networkCityBonus.science
        + (wonderCityBonuses.science ?? 0)
        + inputs.resourceYieldBonus.science
        + (cityId === lowestScienceCityId ? networkGovernanceBonus : 0))
      * scienceMultiplier
      * (1 + (inputs.empireTechPercents.science ?? 0) / 100),
    );
    const idleScienceBonus = city.productionQueue.length === 0 && city.idleProduction === 'science'
      ? (isCityProductionLocked(city) ? 0 : production)
      : 0;
    return { state: projectedState, science: science + idleScienceBonus };
  }
  ```

  **Verify the scoring math is a byte-for-byte transcription** of the current inline loop body
  (lines 80-131) before moving on — this step must not change `getProjectedCityScience`'s
  behavior at all. Then rewrite `getProjectedCityScience`'s per-city loop to call it, **threading
  the returned state forward exactly as the original did** (this is the fix for the design gap
  called out above — do not pass the same unthreaded `state` to every city):

  ```ts
  function getProjectedCityScience(state: GameState, civId: string): Record<string, number> {
    const civ = state.civilizations[civId];
    if (!civ) return {};
    const inputs: CivResearchProjectionInputs = {
      civDefinitionBonusEffect: resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect,
      resourceYieldBonus: getCivResourceYieldBonus(state, civId),
      nationalProjectBonus: getNationalProjectCivYieldBonus(state, civId),
      empireTechPercents: getEmpireTechPercents(civ.techState.completed),
      empireFlatTechYields: getEmpireFlatTechYields(civ.techState.completed),
      empireFlatTargetCityId: civ.cities.length > 0 ? [...civ.cities].sort()[0] : undefined,
    };
    const networkGovernanceBonus = getLowestCityScienceBonus(civ.techState.completed);
    let lowestScienceCityId: string | undefined;
    if (networkGovernanceBonus > 0) {
      let lowestScience = Infinity;
      for (const cityId of [...civ.cities].sort()) {
        const city = state.cities[cityId];
        if (!city) continue;
        const science = calculateCityYields(
          city, state.map, inputs.civDefinitionBonusEffect, civ.techState.completed, {}, state.turn,
        ).science;
        if (science < lowestScience) { lowestScience = science; lowestScienceCityId = cityId; }
      }
    }
    let projectedState = state;
    const cityScience: Record<string, number> = {};
    for (const cityId of civ.cities) {
      const result = projectOneCityScience(projectedState, civId, cityId, inputs, lowestScienceCityId, networkGovernanceBonus);
      projectedState = result.state;
      cityScience[cityId] = result.science;
    }
    return cityScience;
  }
  ```

  This is now a **pure refactor with no threading ambiguity**: the full-scan loop's behavior is
  identical to the original by construction (same forward-threading), and the incremental
  single-city caller below simply calls `projectOneCityScience` once and reads `.science`,
  discarding `.state` (there is no "next city" for it to thread into). No empirical guessing
  needed — Task 1's whole-round equivalence test is still the backstop, but this removes the
  specific risk this note used to leave open.

  Add the baseline function:

  ```ts
  export interface ResearchScoringBaseline {
    readonly cityScience: Readonly<Record<string, number>>;
    readonly networkGovernanceBonusActive: boolean;
    readonly inputs: CivResearchProjectionInputs;
  }

  /**
   * #1069 -- computed once per city-scoring pass (see ai-production.ts's generateWithResidual)
   * and reused across every building candidate evaluated in that pass, instead of each candidate
   * re-deriving the whole civ's projected science from scratch. See design doc §5.
   */
  export function computeResearchScoringBaseline(state: GameState, civId: string): ResearchScoringBaseline {
    const civ = state.civilizations[civId];
    const inputs: CivResearchProjectionInputs = civ
      ? {
          civDefinitionBonusEffect: resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect,
          resourceYieldBonus: getCivResourceYieldBonus(state, civId),
          nationalProjectBonus: getNationalProjectCivYieldBonus(state, civId),
          empireTechPercents: getEmpireTechPercents(civ.techState.completed),
          empireFlatTechYields: getEmpireFlatTechYields(civ.techState.completed),
          empireFlatTargetCityId: civ.cities.length > 0 ? [...civ.cities].sort()[0] : undefined,
        }
      : {
          civDefinitionBonusEffect: undefined,
          resourceYieldBonus: getCivResourceYieldBonus(state, civId),
          nationalProjectBonus: getNationalProjectCivYieldBonus(state, civId),
          empireTechPercents: getEmpireTechPercents([]),
          empireFlatTechYields: getEmpireFlatTechYields([]),
          empireFlatTargetCityId: undefined,
        };
    return {
      cityScience: getProjectedCityScience(state, civId),
      networkGovernanceBonusActive: civ ? getLowestCityScienceBonus(civ.techState.completed) > 0 : false,
      inputs,
    };
  }
  ```

  (Adjust the `!civ` branch if it turns out to be unreachable/dead in practice -- keep it only if
  needed for type-safety; do not leave genuinely dead code per this repo's "No Dead Return
  Fields"/dead-code rules -- if `!civ` can't realistically occur given callers, simplify and let
  `getProjectedCityScience`'s own `if (!civ) return {}` guard be the only place that's handled.)

- [ ] **Step 4: Extend `getMarginalCivResearchGain`**

  ```ts
  export function getMarginalCivResearchGain(
    state: GameState,
    civId: string,
    cityId: string,
    buildingId: string,
    baseline?: ResearchScoringBaseline,
  ): number {
    const civ = state.civilizations[civId];
    const city = state.cities[cityId];
    if (!civ || !city || city.owner !== civId || city.buildings.includes(buildingId)) return 0;

    const before = baseline
      ? calculateCivResearchOutput(state, civId, { authoritativeCityScience: baseline.cityScience }).finalScience
      : calculateCivResearchOutput(state, civId).finalScience;

    const building = BUILDINGS[buildingId];
    const projectKey = `${civId}:${buildingId}`;
    const isUniqueNationalProject = Boolean(building?.nationalProject && building.uniquePerEmpire);
    const projectedState: GameState = {
      ...state,
      cities: {
        ...state.cities,
        [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
      },
      ...(isUniqueNationalProject
        ? {
            builtNationalProjects: {
              ...(state.builtNationalProjects ?? {}),
              [projectKey]: { civId, cityId, eraBuilt: resolveCivilizationEra(civ.techState.completed) },
            },
          }
        : {}),
    };

    if (baseline && !baseline.networkGovernanceBonusActive && !isUniqueNationalProject) {
      const { science: afterCityOwnScience } = projectOneCityScience(projectedState, civId, cityId, baseline.inputs, undefined, 0);
      const afterCityScience = {
        ...baseline.cityScience,
        [cityId]: afterCityOwnScience,
      };
      return Math.max(
        0,
        calculateCivResearchOutput(projectedState, civId, { authoritativeCityScience: afterCityScience }).finalScience - before,
      );
    }

    return Math.max(0, calculateCivResearchOutput(projectedState, civId).finalScience - before);
  }
  ```

- [ ] **Step 5: Run the new equivalence tests**

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/systems/research-output-system.test.ts
  ```
  Expected: all PASS, including the three new #1069 tests.

- [ ] **Step 6: Wire `ai-production.ts`'s `generateWithResidual` to compute + pass the baseline**

  At the top of `generateWithResidual` (after the existing `const civDefinition = ...` line,
  `ai-production.ts:489`), add:

  ```ts
  const researchBaseline = computeResearchScoringBaseline(state, civId);
  ```

  Add the import: `import { computeResearchScoringBaseline, getMarginalCivResearchGain } from '@/systems/research-output-system';` (extending the existing `getMarginalCivResearchGain`-only
  import at `ai-production.ts:42`).

  Change line ~664:
  ```ts
  const researchValueScore = getMarginalCivResearchGain(state, civId, cityId, building.id) * 1.25;
  ```
  to:
  ```ts
  const researchValueScore = getMarginalCivResearchGain(state, civId, cityId, building.id, researchBaseline) * 1.25;
  ```

- [ ] **Step 7: Run the full `ai-production.test.ts` file + Task 1's whole-round equivalence test**

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts tests/perf/aiRound-1069-equivalence.test.ts
  ```
  Expected: all PASS. **If Task 1's test goes red here, stop** — it means some production/research
  candidate ranking shifted. Do not adjust the fixture or the test to make it pass; find and fix
  the actual divergence (most likely candidate: the `projectedState` focus-threading question
  flagged in Step 3).

- [ ] **Step 8: `yarn build` (type-check)**

  ```bash
  bash scripts/run-with-mise.sh yarn build
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add src/systems/research-output-system.ts src/ai/ai-production.ts tests/systems/research-output-system.test.ts
  git commit -m "perf(ai): cache the research-scoring baseline across building candidates (#1069)"
  ```

---

### Task 5: Close the `cityYieldCalls` guard gap on the `aiRound` perf area

**Files:**
- Modify: `tests/perf/perf-areas.ts:98-115` (the `aiRound@e1`/`aiRound@e2` case in
  `measurePerfArea`)
- Modify: `tests/perf/algorithmic-budgets.test.ts` (`computeBaseline`'s `aiRound` budget/ratio
  entries, and GUARD 3 — or a new guard, your call, document whichever)
- Modify: `tests/perf/baselines/algorithmic-baseline.json` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `PerfCounts.cityYieldCalls` (`tests/perf/perf-probe.ts` — already computed, just not
  forwarded).

- [ ] **Step 1: Forward `cityYieldCalls` from the probe into the `aiRound` `AreaSample`**

  In `tests/perf/perf-areas.ts`, change the `aiRound@e1`/`aiRound@e2` case's return:
  ```ts
      return {
        pathQueries: counts.pathQueries,
        heapPops: counts.heapPops,
        structuredCloneWholeState: counts.structuredCloneWholeState,
        blockingEntityAtCalls: counts.blockingEntityAtCalls,
        cityYieldCalls: counts.cityYieldCalls,
      };
  ```

- [ ] **Step 2: Add the budget + ratio entries**

  In `algorithmic-budgets.test.ts`'s `computeBaseline`, extend the `aiRound` budget object:
  ```ts
      aiRound: {
        pathQueries: cap(a['aiRound@e2'].pathQueries!),
        heapPops: cap(a['aiRound@e2'].heapPops!),
        structuredCloneWholeState: cap(a['aiRound@e2'].structuredCloneWholeState!),
        blockingEntityAtCalls: cap(a['aiRound@e2'].blockingEntityAtCalls!),
        cityYieldCalls: cap(a['aiRound@e2'].cityYieldCalls!),
      },
  ```
  and add to `ratios`:
  ```ts
      aiRoundCityYieldCalls: Number((ratio(a['aiRound@e2'].cityYieldCalls!, a['aiRound@e1'].cityYieldCalls!) * RATIO_SLACK).toFixed(2)),
  ```

- [ ] **Step 3: Add assertions to GUARD 3** (the existing `"GUARD 3 — a full AI round's path work
  stays bounded"` test, `algorithmic-budgets.test.ts` — rename it to reflect that it now also
  covers city-yield work, or add a sibling "GUARD 8" — pick one and be consistent with the file's
  existing numbering convention):

  ```ts
    expect(e2.cityYieldCalls!, 'AI round city-yield budget').toBeLessThanOrEqual(base.budgets.aiRound!.cityYieldCalls!);
    if (e1.cityYieldCalls! > 0) {
      expect(e2.cityYieldCalls! / e1.cityYieldCalls!, 'AI round city-yield work must not get MORE super-linear')
        .toBeLessThanOrEqual(base.ratios.aiRoundCityYieldCalls!);
    }
  ```

- [ ] **Step 4: Regenerate the real baseline first** (with Task 3 + Task 4's fixes both already
  landed):

  ```bash
  UPDATE_PERF_BASELINE=1 bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
  ```

  Then bump `auditedCommit` in `tests/perf/baselines/algorithmic-baseline.json` to this branch's
  HEAD SHA once the commit is made (or note in the PR body that it reflects the pre-merge tip —
  follow whatever the file's own regen convention leaves it at; do not hand-edit any other field).

- [ ] **Step 5: MANDATORY sabotage proof — confirm the newly-tightened `cityYieldCalls` guard
  actually catches the regression it's meant to catch**

  With the real (tightened, post-fix) baseline now committed from Step 4, temporarily revert
  *only* Task 4's fix — hand-revert `ai-production.ts`'s call site back to
  `getMarginalCivResearchGain(state, civId, cityId, building.id)` (drop the `researchBaseline`
  argument) — leaving Step 1-3's new guard code and the newly-tightened baseline untouched. Run:

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
  ```

  **Expected: the `cityYieldCalls` assertion added in Step 3 FAILS** — the sabotaged (reverted)
  code reproduces the old O(cities²) work, which now exceeds the tightened budget. Paste the
  actual failing assertion output into the PR body as the sabotage-proof evidence. Then revert
  the sabotage and confirm green again:

  ```bash
  git checkout -- src/ai/ai-production.ts   # or whatever file you hand-edited
  bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
  ```

  Do the same for the `ai-upgrades.ts` prefilter if it isn't already covered by Task 2's own
  call-count assertion (it is — Task 2 Step 1's test is itself a sabotage proof for that fix,
  since it fails on unfixed code and passes on fixed code; no separate repeat needed here).

- [ ] **Step 6: Run the full suite + `yarn perf:report`**

  ```bash
  bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
  bash scripts/run-with-mise.sh yarn perf:report
  ```

  Eyeball `.verification/perf/report.json` for the `aiRound` numbers — confirm they match what
  the regenerated baseline shows.

- [ ] **Step 7: Record before/after numbers**

  Fill in (for the PR body, per `.claude/rules/performance-budgets.md`):
  - `aiRound.pathQueries`: old e1/e2, new e1/e2, old/new ratio.
  - `aiRound.heapPops`: same.
  - `aiRound.cityYieldCalls`: old e1/e2 (9,616 / 31,164, from the design doc — confirm still
    accurate at this exact HEAD before quoting it), new e1/e2, old/new ratio.
  - One-line root-cause justification per changed number (point at design doc §2b/§4b).

- [ ] **Step 8: Commit**

  ```bash
  git add tests/perf/perf-areas.ts tests/perf/algorithmic-budgets.test.ts tests/perf/baselines/algorithmic-baseline.json
  git commit -m "perf(test): gate aiRound cityYieldCalls -- closes the #1069 measurement gap"
  ```

---

### Task 6: Focused AI-behavior regressions (recent load-bearing mechanisms)

**Files:**
- Modify: `tests/ai/ai-prepared-turn.test.ts`, `tests/ai/ai-expansion-sites.test.ts`,
  `tests/ai/ai-major-turn.test.ts`, `tests/ai/ai-plan-portfolio.test.ts` (add to existing files —
  do not duplicate whole fixtures; find the smallest existing test in each file that already
  exercises the mechanism and confirm it still passes, adding an explicit assertion only if the
  existing test doesn't already assert the specific thing being protected).

Per the assignment's "BEHAVIOR REGRESSIONS" section — confirm, don't necessarily add new tests if
existing coverage already proves it:

- [ ] Exploration still occurs (existing `ai-exploration`/`ai-prepared-turn` coverage).
- [ ] Expand candidates still form; committed expansion sites retain hysteresis; illegal committed
  sites release (existing `#1107` coverage in `ai-prepared-turn.test.ts`/`ai-plan-portfolio.test.ts`
  — these are UNTOUCHED by this MR's changes, so existing tests passing unmodified is sufficient
  proof; do not add new ones unless an existing one fails).
- [ ] Visible minor-civ cities constrain expansion (existing `#1107` coverage).
- [ ] Settlers do not enter withdrawal loops merely because strength is zero (existing
  `ai-major-turn.test.ts` `shouldWithdraw` coverage — this MR does not touch `ai-major-turn.ts`
  at all, so this is a pure regression check, not new work).
- [ ] Moving repel targets refresh (existing `ai-plan-portfolio.test.ts` coverage).
- [ ] Amphibious candidates remain reachable; transport demands still form (existing `#1109`/#1066
  coverage — untouched files).
- [ ] Coastal-access recovery still works (existing `#1107` coverage — `ai-expansion-sites.ts` is
  untouched by this MR).

Run the full `tests/ai/` directory:

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ai/
```

Expected: all pass, unchanged, since none of these mechanisms live in the two files this MR
touches (`ai-upgrades.ts`, `ai-production.ts`'s research-scoring path,
`research-output-system.ts`).

- [ ] Commit only if any test needed adjustment (should not be needed): otherwise no commit for
  this task — it's a verification checkpoint, not new code.

---

### Task 7: Long-horizon verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full long-horizon suite**

  ```bash
  bash scripts/run-with-mise.sh yarn test:ai-long
  ```

  This takes ~20-45 minutes. Use a background task / durable-log pattern consistent with how
  prior sessions in this repo have run it (redirect to a log file, poll).

- [ ] **Step 2: Confirm the matrix result**

  - Zero new `unknownFindings` (any new finding must already have a
    `KNOWN_CAMPAIGN_GAPS` entry — this MR should introduce none, since it changes nothing about
    what the AI decides, only how cheaply it decides it).
  - Zero `staleGaps` newly appearing because this MR's speed-up incidentally "fixed" something a
    registered gap was tracking by making the AI reach further within the same round budget. If
    that happens: **this is a real behavioral side-effect of the perf fix (the AI does provably
    the same work, just faster, so it may now complete more rounds' worth of decisions within a
    long-horizon scenario's fixed round cap)** — this is expected and fine (a faster identical AI
    naturally makes more progress in the same round count), but confirm via the deterministic
    artifact diff that the *decisions* themselves didn't change shape, only *how many rounds*
    happened to complete work. If a genuinely new class of finding appears (not explainable as
    "more rounds of identical behavior"), stop and escalate per the assignment's "intentional
    behavior drift" rule.

- [ ] **Step 3: Diff deterministic artifacts against a pre-fix run** (if feasible — see Task 1's
  golden-reference approach applied at long-horizon scale, optional but recommended): compare
  `.verification/ai-long-horizon/<seed>.json` for at least `lh-late-era-medium` between a run on
  `origin/main` and a run on this branch. Any diff beyond wall-clock timing fields is worth
  understanding before merging.

---

### Task 8: Full verification sweep + PR

**Files:** none — verification and PR creation only.

- [ ] `bash scripts/run-with-mise.sh yarn build`
- [ ] `bash scripts/run-with-mise.sh yarn test:durable`
- [ ] `bash scripts/run-with-mise.sh yarn test:durable:status`
- [ ] `scripts/check-src-rule-violations.sh src/ai/ai-upgrades.ts src/ai/ai-production.ts src/systems/research-output-system.ts`
- [ ] `git diff --check` (no whitespace errors)
- [ ] Inspect the full diff manually (`git diff origin/main...HEAD`) before writing the PR body.
- [ ] Write the PR body per the assignment's "MR DESCRIPTION" section (root cause, why the
  original #1069 diagnosis was stale, before/after numbers for both metrics, cache/precompute
  validity scope, equivalence evidence, long-horizon result, sabotage proof, baseline changes, no
  known in-scope findings) — include a "Pre-PR inline code review" section per this repo's
  established convention (see recent merged PRs, e.g. #1111, for the expected shape and depth).
- [ ] Stop and hand off: **READY FOR SOL IMPLEMENTATION REVIEW**.
