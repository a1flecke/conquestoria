# City-State Population Bounds & Magic-Upgrade Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagent-driven execution is NOT used on this repo — `CLAUDE.md` forbids spawning subagents; all tasks run inline in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound minor-civ (city-state) population growth with an era-scaled ceiling, and retire the `processMinorCivEraUpgrade` "magic" unit-rewrite + free-population behavior, per issue #948 (H1/H2 from the #490 audit).

**Architecture:** Enforce the population ceiling entirely inside `processMinorCivEconomyTurn` (minor-civ-economy-system.ts) by suppressing the food-growth *input* passed to the existing, untouched `processCity` — no changes to the generic city-growth system. Retire the unit-type-rewrite and free-population-grant side effects from `processMinorCivEraUpgrade` (minor-civ-system.ts), keeping only harmless `lastEraUpgrade` bookkeeping — no field removal, no save-schema change.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- No `Math.random()` — N/A here, no new randomness.
- No `state.currentPlayer` — population ceiling and era bookkeeping are owned-state calculations, viewer-independent.
- No new save-schema version / migration. `MinorCivEconomyState` and `MinorCivState.lastEraUpgrade` keep their current shape.
- No new UI (city-state economy is currently fully hidden from the player — confirmed no `food`/`population`/`foodNeeded` reads in `src/ui/diplomacy-panel.ts` or any other UI file).
- Do not touch `.claude/rules/game-balance.md` sections unrelated to this issue.
- Do not implement #951 (mobilization/recovery), #949 (full long-run suite), #954 (unit-cap completion), #496, #497 — only make sure this change doesn't block them.

---

## Phase 0 audit findings (already completed, recorded here for the PR body)

- `processCity` (`src/systems/city-system.ts:2064`) grows population by **at most +1/turn**: `if (newFood >= city.foodNeeded) { newPop++; ... }` (not a `while` loop). No ceiling exists.
- `foodNeeded` starts at 15 and scales `×1.3` (floored) per growth event; growth naturally decelerates but never stops.
- `processMinorCivEconomyTurn` (`src/systems/minor-civ-economy-system.ts:545`) runs every turn for every non-destroyed minor civ with an owned city (via `processMinorCivTurn`, itself called every turn from `turn-manager.ts:1122`), regardless of production-queue state. It calls `processCity` directly at line ~627.
- Focus assignment (`assignCityFocus`/`normalizeWorkedTilesForCity`) already influences food yield — 'food' focus during `recovering` posture, 'production' during `mobilizing`, 'balanced' otherwise. Worked-tile count tracks population, so yield growth is naturally sublinear-ish but not bounded.
- `getMinorCivCompletedTechBand` / `getMinorCivBuildCandidates` already use `resolveNeutralPressureEra(state, city.position) ?? 1` as the canonical era/maturity source for production eligibility — this is the correct source to reuse for the population ceiling (not `lastEraUpgrade`, not a new resolver).
- `processMinorCivEraUpgrade` (`src/systems/minor-civ-system.ts:951`) is called unconditionally every turn for every minor civ from `turn-manager.ts:1609`, **after** `processMinorCivTurn` (line 1122) in the same turn-resolution pass. It mutates `unit.type` for every non-settler/worker unit to `ERA_UNIT_MAP[pressureEra]` and does `city.population += 1`, whenever local pressure era exceeds `mc.lastEraUpgrade`.
- **Whether a minor civ without `economy` can exist in real reachable state: NO.** `normalizeMinorCivEconomyState` (called unconditionally at the top of `processMinorCivEconomyTurn`, and again on every save load via `save-manager.ts:825`) normalizes `economy` for *every* minor civ in `state.minorCivs`, not just the one being processed. Since `processMinorCivTurn` runs before `processMinorCivEraUpgrade` in the same turn-resolution pass, and `lastEraUpgrade` is initialized to the *current* pressure era at placement (so the upgrade condition `pressureEra > mc.lastEraUpgrade` cannot be true before real world-era progression, which requires many turns to have already elapsed), `economy` is always populated by the time the upgrade condition could ever be true. **No legacy backstop is needed — option (a), full removal, is safe and correct.**
- No test currently relies on unit-type rewriting or the free +1 pop surviving past this change other than the 4 tests directly inside `describe('minor civ era upgrades', ...)` in `tests/systems/minor-civ-system.test.ts:510-566`, which assert the old behavior and must be rewritten.
- `lastEraUpgrade` has no consumer anywhere outside `processMinorCivEraUpgrade` itself (confirmed via repo-wide grep) — safe to keep updating it as inert bookkeeping without any behavior depending on it, avoiding a schema change while leaving a hook for future systems (#951/#954) to read "highest pressure era this civ has reached" without recomputing it.
- Minor-civ city-state economy is **not rendered anywhere in the UI** (`src/ui/diplomacy-panel.ts`, `advisor-system.ts`, `minor-civ-notifications*.ts` — none reference `.food`/`.foodNeeded`/`.population` of a minor-civ city). Freezing `food` while at the population cap therefore cannot mislead any visible UI.
- Reference point for "meaningfully below a runaway megacity": `tests/systems/helpers/pacing-reference-economy.ts:128` caps its single-city max-development proxy at population 12 (`Math.min(12, 2 + floor(buildings.length/4))`). Minor-civ unit caps (`MINOR_CIV_ECONOMY_TUNING.*.caps`) top out at 5-6 units even at veteran/mobilizing — city-states are designed to stay small throughout. The chosen ceiling table (6/10/14/18 across era bands 1-2/3-5/6-8/9+) stays at or below this reference at every band and never approaches a "unbounded major-civ empire" scale.
- Growth-rate/difficulty: `MINOR_CIV_ECONOMY_TUNING` varies `productionMultiplier` (production only) by challenge tier, but **food yield is unaffected by challenge tier** anywhere in the file — so the population ceiling has no existing difficulty-tuning hook to justify varying by challenge. Ceiling stays **difficulty-invariant**, matching the issue's "only if already justified" guidance.

---

## Task 1: Minor-civ population ceiling

**Files:**
- Modify: `src/systems/minor-civ-economy-system.ts`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

**Interfaces:**
- Produces: `export const MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND: ReadonlyArray<{ maxEra: number; ceiling: number }>` and `export function getMinorCivPopulationCeiling(state: GameState, minorCivId: string): number` — both reusable by future #951 levy logic.
- Consumes: `resolveNeutralPressureEra` (already imported in this file).

- [ ] **Step 1: Write failing tests for `getMinorCivPopulationCeiling`**

Add to `tests/systems/minor-civ-economy-system.test.ts` (new top-level `describe` block, after the existing `#855` block):

```ts
describe('minor-civ population ceiling', () => {
  it('returns the era-1/2 ceiling for a freshly placed city-state', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-era1', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];

    expect(getMinorCivPopulationCeiling(state, minorCiv.id)).toBe(6);
  });

  it('raises the ceiling as nearby pressure era advances', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-era-scale', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    state.cities['pressure-source'] = {
      id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
    } as never;
    state.civilizations.player.cities = ['pressure-source'];
    state.civilizations.player.techState.completed = getEraAdvancementTechs(2)
      .slice(0, Math.ceil(getEraAdvancementTechs(2).length * 0.5))
      .map(tech => tech.id);

    expect(getMinorCivPopulationCeiling(state, minorCiv.id)).toBe(10);
  });

  it('is deterministic for identical input state', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-deterministic', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];

    expect(getMinorCivPopulationCeiling(state, minorCiv.id))
      .toBe(getMinorCivPopulationCeiling(state, minorCiv.id));
  });

  it('does not vary the ceiling by opponent challenge tier', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-difficulty', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    state.opponentChallenge = 'explorer';
    const explorerCeiling = getMinorCivPopulationCeiling(state, minorCiv.id);
    state.opponentChallenge = 'veteran';
    const veteranCeiling = getMinorCivPopulationCeiling(state, minorCiv.id);

    expect(explorerCeiling).toBe(veteranCeiling);
  });
});
```

Add `getMinorCivPopulationCeiling` and `getEraAdvancementTechs` to the existing top-of-file imports (`getEraAdvancementTechs` is already imported from `@/systems/tech-definitions`; add `getMinorCivPopulationCeiling` to the `@/systems/minor-civ-economy-system` import list).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-economy-system.test.ts -t "population ceiling"`
Expected: FAIL — `getMinorCivPopulationCeiling` is not exported.

- [ ] **Step 3: Implement the ceiling table + resolver**

In `src/systems/minor-civ-economy-system.ts`, after `MINOR_CIV_ECONOMY_TUNING` (around line 53), add:

```ts
// Era/maturity-scaled population ceiling for a one-city minor civ (#948, H1 from the #490 audit).
// Reuses resolveNeutralPressureEra — the same canonical era/maturity source that already gates
// minor-civ production eligibility (getMinorCivCompletedTechBand / getMinorCivBuildCandidates) —
// rather than introducing a second era resolver. Values stay at or below the reference-economy
// single-city max-development proxy (population 12, tests/systems/helpers/pacing-reference-economy.ts)
// at every band, and are difficulty-invariant because food yield itself has no existing
// challenge-tier tuning in MINOR_CIV_ECONOMY_TUNING. See .claude/rules/game-balance.md.
export const MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND: ReadonlyArray<{ maxEra: number; ceiling: number }> = [
  { maxEra: 2, ceiling: 6 },
  { maxEra: 5, ceiling: 10 },
  { maxEra: 8, ceiling: 14 },
  { maxEra: Infinity, ceiling: 18 },
];

export function getMinorCivPopulationCeiling(state: GameState, minorCivId: string): number {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  const pressureEra = city ? resolveNeutralPressureEra(state, city.position) ?? 1 : 1;
  const band = MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND.find(entry => pressureEra <= entry.maxEra);
  return band?.ceiling ?? MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND[MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND.length - 1].ceiling;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-economy-system.test.ts -t "population ceiling"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-economy-system.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat(minor-civs): add era-scaled population ceiling resolver"
```

---

## Task 2: Enforce the ceiling in `processMinorCivEconomyTurn`

**Files:**
- Modify: `src/systems/minor-civ-economy-system.ts`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

**Interfaces:**
- Consumes: `getMinorCivPopulationCeiling` (Task 1), `processCity` (existing import).
- Produces: no new exports — internal wiring change to `processMinorCivEconomyTurn`.

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/minor-civ-economy-system.test.ts`, inside (or right after) the new `describe('minor-civ population ceiling', ...)` block:

```ts
  it('grows normally below the ceiling', () => {
    const state = createNewGame(undefined, 'minor-pop-grow-below-cap', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.population = 4;
    city.food = city.foodNeeded - 1;
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', resource: undefined };
    }

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].population).toBe(5);
  });

  it('stops growth exactly at the ceiling and does not exceed it', () => {
    const state = createNewGame(undefined, 'minor-pop-stop-at-cap', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', resource: undefined };
    }
    city.population = 6; // era-1/2 ceiling
    city.food = city.foodNeeded - 1;

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].population).toBe(6);
  });

  it('does not bank food beyond the growth threshold while capped', () => {
    const state = createNewGame(undefined, 'minor-pop-no-food-banking', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', resource: undefined };
    }
    city.population = 6;
    city.food = 0;

    let nextState = state;
    for (let turn = 0; turn < 20; turn++) {
      nextState = { ...nextState, turn: nextState.turn + 1 };
      const result = processMinorCivEconomyTurn(nextState, minorCiv.id);
      nextState = result.state;
    }

    const finalCity = nextState.cities[city.id];
    expect(finalCity.population).toBe(6);
    expect(finalCity.food).toBeLessThan(finalCity.foodNeeded);
  });

  it('preserves an over-cap legacy population without shrinking it, and blocks further growth', () => {
    const state = createNewGame(undefined, 'minor-pop-over-cap-legacy', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', resource: undefined };
    }
    city.population = 9; // above the era-1/2 ceiling of 6, simulating a pre-patch save
    city.food = city.foodNeeded - 1;

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].population).toBe(9);
  });

  it('resumes growth once the era-scaled ceiling rises above the current population', () => {
    const state = createNewGame(undefined, 'minor-pop-resume-after-era', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', resource: undefined };
    }
    city.population = 6;
    city.food = city.foodNeeded - 1;
    const capped = processMinorCivEconomyTurn(state, minorCiv.id);
    expect(capped.state.cities[city.id].population).toBe(6);

    let nextState = capped.state;
    nextState.cities[city.id].food = nextState.cities[city.id].foodNeeded - 1;
    nextState.cities['pressure-source'] = {
      id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
    } as never;
    nextState.civilizations.player.cities = ['pressure-source'];
    nextState.civilizations.player.techState.completed = getEraAdvancementTechs(2)
      .slice(0, Math.ceil(getEraAdvancementTechs(2).length * 0.5))
      .map(tech => tech.id);

    const resumed = processMinorCivEconomyTurn(nextState, minorCiv.id);

    expect(resumed.state.cities[city.id].population).toBe(7);
  });

  it('produces a deterministic result from identical starting state', () => {
    const state = createNewGame(undefined, 'minor-pop-deterministic-turn', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.population = 5;
    city.food = 3;

    const resultA = processMinorCivEconomyTurn(structuredClone(state), minorCiv.id);
    const resultB = processMinorCivEconomyTurn(structuredClone(state), minorCiv.id);

    expect(resultA.state.cities[city.id].population).toBe(resultB.state.cities[city.id].population);
    expect(resultA.state.cities[city.id].food).toBe(resultB.state.cities[city.id].food);
  });
```

Add `getMinorCivPopulationCeiling` to the import list if not already added in Task 1's step.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-economy-system.test.ts -t "cap"`
Expected: FAIL on "stops growth exactly at the ceiling" and "does not bank food" and "preserves an over-cap legacy population" (population exceeds 6/stays at 9 grows further) — "grows normally below the ceiling" and "resumes growth" may already pass since nothing yet stops growth (that's expected/acceptable; the important failures are the cap-enforcement ones).

- [ ] **Step 3: Implement growth suppression in `processMinorCivEconomyTurn`**

In `src/systems/minor-civ-economy-system.ts`, find this block (around line 622-637):

```ts
  const completedTechs = getMinorCivCompletedTechBand(nextState, minorCivId);
  const availableResources = getMinorCivAvailableResources(nextState, minorCivId);
  const cityForYields = nextState.cities[city.id];
  const yields = calculateCityYields(cityForYields, nextState.map, undefined, completedTechs, {}, nextState.turn);
  const productionYield = Math.max(0, Math.floor(yields.production * tuning.productionMultiplier));
  const processed = processCity(
    cityForYields,
    nextState.map,
    yields.food,
    productionYield,
    undefined,
    completedTechs,
    undefined,
    resolveNeutralPressureEra(nextState, cityForYields.position) ?? 1,
    availableResources,
  );
```

Replace with:

```ts
  const completedTechs = getMinorCivCompletedTechBand(nextState, minorCivId);
  const availableResources = getMinorCivAvailableResources(nextState, minorCivId);
  const cityForYields = nextState.cities[city.id];
  const yields = calculateCityYields(cityForYields, nextState.map, undefined, completedTechs, {}, nextState.turn);
  const productionYield = Math.max(0, Math.floor(yields.production * tuning.productionMultiplier));

  // #948 (H1): a one-city minor civ has no housing ceiling in the generic city-growth system, so
  // long peaceful games can produce an implausible megacity. Enforce an era-scaled ceiling here,
  // in the minor-civ economy flow only, rather than changing processCity for every civ. While at
  // or above the ceiling: (1) clamp any already-banked food below the next growth threshold, so a
  // legacy over-cap save can never re-trigger growth from stale banked food, and (2) feed
  // processCity a food yield equal to population (zero net surplus) so food stays flat instead of
  // banking toward a future multi-level jump. This never shrinks an already-over-cap population —
  // it only blocks further growth until the ceiling (era/maturity) catches up.
  const populationCeiling = getMinorCivPopulationCeiling(nextState, minorCivId);
  const growthSuppressed = cityForYields.population >= populationCeiling;
  const cityForProcessing = growthSuppressed
    ? { ...cityForYields, food: Math.min(cityForYields.food, Math.max(0, cityForYields.foodNeeded - 1)) }
    : cityForYields;
  const foodYieldForGrowth = growthSuppressed
    ? Math.min(yields.food, cityForProcessing.population)
    : yields.food;

  const processed = processCity(
    cityForProcessing,
    nextState.map,
    foodYieldForGrowth,
    productionYield,
    undefined,
    completedTechs,
    undefined,
    resolveNeutralPressureEra(nextState, cityForYields.position) ?? 1,
    availableResources,
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-economy-system.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — confirm no regression)

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-economy-system.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "fix(minor-civs): enforce population ceiling in minor-civ economy turn"
```

---

## Task 3: Retire the magic era-upgrade behavior

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Test: `tests/systems/minor-civ-system.test.ts`

**Interfaces:**
- No signature change to `processMinorCivEraUpgrade(state: GameState, mc: MinorCivState): void` — same call site in `turn-manager.ts:1609` needs no edit.

- [ ] **Step 1: Rewrite the 4 existing tests to match the new (no-magic) contract, and add 2 new ones**

Replace the entire `describe('minor civ era upgrades', ...)` block (lines 510-566) in `tests/systems/minor-civ-system.test.ts` with:

```ts
describe('minor civ era upgrades', () => {
  it('does not rewrite the garrison unit type when local pressure era advances', () => {
    const state = createNewGame(undefined, 'mc-era-up', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);
    const garrison = state.units[mc.units[0]];
    expect(garrison.type).toBe('warrior');
  });

  it('grants no free population when local pressure era advances', () => {
    const state = createNewGame(undefined, 'mc-era-pop', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);
    const popBefore = state.cities[mc.cityId].population;

    processMinorCivEraUpgrade(state, mc);
    expect(state.cities[mc.cityId].population).toBe(popBefore);
  });

  it('does not rewrite the garrison even after many eras of world progression', () => {
    const state = createNewGame(undefined, 'mc-era-twelve', 'small');
    state.era = 12;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 4;
    setNearbyPressureEra(state, mcId, 12);

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[mc.units[0]].type).toBe('warrior');
    expect(mc.lastEraUpgrade).toBe(12);
  });

  it('does not advance lastEraUpgrade beyond the nearby civilization pressure era', () => {
    const state = createNewGame(undefined, 'mc-local-era-cap', 'small');
    state.era = 12;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[mc.units[0]].type).toBe('warrior');
    expect(mc.lastEraUpgrade).toBe(1);
  });

  it('does not rewrite a production-backed unit the economy just trained', () => {
    const state = createNewGame(undefined, 'mc-era-no-duplicate-upgrade', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const trainedUnit = createUnit('swordsman', mcId, state.cities[mc.cityId].position, state.idCounters);
    state.units[trainedUnit.id] = trainedUnit;
    mc.units = [...mc.units, trainedUnit.id];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[trainedUnit.id].type).toBe('swordsman');
    expect(state.units[mc.units[0]].type).toBe('warrior');
  });

  it('does not batch-rewrite multiple existing units at once', () => {
    const state = createNewGame(undefined, 'mc-era-no-batch-rewrite', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const second = createUnit('scout', mcId, city.position, state.idCounters);
    state.units[second.id] = second;
    mc.units = [...mc.units, second.id];
    const typesBefore = mc.units.map(id => state.units[id].type);
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);

    const typesAfter = mc.units.map(id => state.units[id].type);
    expect(typesAfter).toEqual(typesBefore);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-system.test.ts -t "era upgrades"`
Expected: FAIL — current implementation still rewrites unit type and adds population.

- [ ] **Step 3: Remove the magic mutations from `processMinorCivEraUpgrade`, delete `ERA_UNIT_MAP`**

In `src/systems/minor-civ-system.ts`, delete the `ERA_UNIT_MAP` constant (lines 932-945) and replace `processMinorCivEraUpgrade` (lines 951-970) with:

```ts
// #948 (H2, #490 audit): this used to rewrite every existing unit's type to an era-appropriate
// type and grant +1 free population on every local-pressure-era tick, regardless of whether the
// economy (#505) had already trained a production-backed unit/grown the city legitimately. That
// silently overwrote real production. It is now bookkeeping-only: it tracks the highest local
// pressure era this minor civ has observed (for future systems, e.g. #951/#954, to read without
// recomputing it) and does nothing else. Era-appropriate defenders now come exclusively from
// getMinorCivBuildCandidates/chooseMinorCivQueueItem (production), and population growth is
// bounded by getMinorCivPopulationCeiling in minor-civ-economy-system.ts. A legacy no-`economy`
// backstop is deliberately NOT retained: normalizeMinorCivEconomyState populates `economy` for
// every minor civ on every turn (processMinorCivEconomyTurn) and on every save load
// (save-manager.ts), and `lastEraUpgrade` starts at the placement-time pressure era, so the
// upgrade condition below cannot fire before at least one economy-normalizing pass has already
// run — there is no reachable state where `economy` is missing when this matters.
export function processMinorCivEraUpgrade(state: GameState, mc: MinorCivState): void {
  if (mc.isDestroyed) return;
  const city = state.cities[mc.cityId];
  const pressureEra = city ? resolveNeutralPressureEra(state, city.position) : null;
  if (pressureEra === null || pressureEra <= mc.lastEraUpgrade) return;

  mc.lastEraUpgrade = pressureEra;
}
```

Check `UnitType` import is still used elsewhere in the file after removing `ERA_UNIT_MAP` (it is — `PlacementResult`, `createUnit` calls, etc. — no import cleanup needed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-system.test.ts`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "fix(minor-civs): retire magic era-upgrade unit rewrite and free population grant"
```

---

## Task 4: Long-run regression, balance docs, full verification, and PR

**Files:**
- Modify: `.claude/rules/game-balance.md`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3.

- [ ] **Step 1: Write the long-run (100+ turn) deterministic fixture test**

Add to `tests/systems/minor-civ-economy-system.test.ts`:

```ts
describe('#948 — long-run city-state population bound', () => {
  it('keeps population within the era-scaled ceiling and units non-rewritten over 120 peaceful turns', () => {
    const state = createNewGame(undefined, 'minor-pop-long-run-948', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', resource: undefined };
    }
    const trackedUnitId = minorCiv.units[0];
    const startingType = state.units[trackedUnitId].type;

    let nextState = state;
    const populationHistory: number[] = [];
    for (let turn = 0; turn < 120; turn++) {
      nextState = { ...nextState, turn: nextState.turn + 1 };
      if (turn === 60) {
        // Mid-run era advance: nearby major civ reaches era 3, raising the ceiling from 6 to 10.
        nextState = {
          ...nextState,
          cities: {
            ...nextState.cities,
            'pressure-source': {
              id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
            } as never,
          },
          civilizations: {
            ...nextState.civilizations,
            player: {
              ...nextState.civilizations.player,
              cities: ['pressure-source'],
              techState: {
                ...nextState.civilizations.player.techState,
                completed: getEraAdvancementTechs(2)
                  .slice(0, Math.ceil(getEraAdvancementTechs(2).length * 0.5))
                  .map(tech => tech.id),
              },
            },
          },
        };
      }
      const result = processMinorCivEconomyTurn(nextState, minorCiv.id);
      nextState = result.state;
      const ceiling = getMinorCivPopulationCeiling(nextState, minorCiv.id);
      const pop = nextState.cities[city.id].population;
      populationHistory.push(pop);
      expect(pop).toBeLessThanOrEqual(ceiling);
    }

    const finalCity = nextState.cities[city.id];
    expect(finalCity.population).toBeGreaterThan(city.population);
    expect(finalCity.population).toBeLessThanOrEqual(10);
    expect(state.units[trackedUnitId].type).toBe(startingType);
    expect(populationHistory.every(pop => Number.isFinite(pop) && pop >= 0)).toBe(true);

    const replay = processMinorCivEconomyTurn(structuredClone(nextState), minorCiv.id);
    const replayAgain = processMinorCivEconomyTurn(structuredClone(nextState), minorCiv.id);
    expect(replay.state.cities[city.id].population).toBe(replayAgain.state.cities[city.id].population);
  });
});
```

- [ ] **Step 2: Run the long-run test**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-economy-system.test.ts -t "long-run"`
Expected: PASS. If population never actually grows past the starting value (grassland yield too low relative to population), increase the `terrain` override to also strip any `improvement` field and confirm the city's `workedTiles` includes multiple grassland tiles — do not raise the ceiling or change `processCity` to force the test to pass.

- [ ] **Step 3: Document the ceiling and retired-upgrade rules in `.claude/rules/game-balance.md`**

Add a new `## Minor-Civ Population Ceiling (#948)` section to `.claude/rules/game-balance.md`, placed after the existing `## Unrest Instant-Action Costs (Appease vs Concede)` section and before `## National Project Lifecycle Contract`:

```markdown
## Minor-Civ Population Ceiling (#948)

A one-city minor civ (city-state) has no housing/population cap in the generic
`processCity` growth system (that system grows any civ's city by at most +1
population/turn whenever accumulated food crosses `foodNeeded`, with no upper
bound). Left alone across a long peaceful game, a city-state can become an
implausible megacity. `getMinorCivPopulationCeiling` in
`src/systems/minor-civ-economy-system.ts` bounds this, enforced only inside
`processMinorCivEconomyTurn` — the generic city-growth system used by every
other civ is untouched.

**Ceiling table** (`MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND`), keyed off
`resolveNeutralPressureEra` — the same canonical era/maturity source already
used for minor-civ production eligibility, not a second era resolver:

| Pressure era | Population ceiling |
|---|---:|
| 1-2 | 6 |
| 3-5 | 10 |
| 6-8 | 14 |
| 9+ | 18 |

Every band stays at or below the reference-economy single-city max-development
proxy (population 12, `tests/systems/helpers/pacing-reference-economy.ts`) or
close to it, and well below what an unbounded multi-city major civ can reach.
**Difficulty-invariant**: `MINOR_CIV_ECONOMY_TUNING` varies production
multiplier and unit caps by challenge tier, but food yield has no existing
difficulty tuning, so the ceiling does not vary by challenge either.

**At-cap food behavior:** while `city.population >= ceiling`,
`processMinorCivEconomyTurn` (1) clamps any already-banked `city.food` below
`foodNeeded` (so a legacy over-cap save's stale banked food can never
re-trigger growth the instant it's next processed) and (2) feeds `processCity`
a synthetic food yield equal to `population` (zero net surplus), so `food`
stays flat instead of banking toward a multi-level jump. This never happens to
a city below the ceiling — normal growth is untouched there.

**Over-cap legacy saves:** population is never shrunk on load or on the first
post-patch turn. The cap only blocks *further* growth
(`population >= ceiling` suppresses growth for `population` strictly greater
than `ceiling` exactly the same way it does for `population === ceiling`).
Once the era-scaled ceiling rises above an already-over-cap population,
growth resumes normally.

**Rule:** any future minor-civ economy change that can increase food yield
(a new building, a new archetype bonus, a new resource effect) does not need
its own cap-awareness — the suppression is computed fresh every turn from the
live `population` vs. live `getMinorCivPopulationCeiling` result, not from a
one-time check.

## Minor-Civ Era Advancement Grants No Free Content (#948)

`processMinorCivEraUpgrade` in `src/systems/minor-civ-system.ts` no longer
rewrites existing unit types or grants free population when local pressure
era advances (it did both, unconditionally, prior to #948 — the H2 finding
from the #490 audit). It is bookkeeping-only: it advances
`mc.lastEraUpgrade` to the new pressure era and does nothing else.
Era-appropriate defenders come exclusively from production
(`getMinorCivBuildCandidates` / `chooseMinorCivQueueItem`, both already
era-gated via `getMinorCivCompletedTechBand`); population growth comes
exclusively from the ceiling-bounded economy turn above. **Never** reintroduce
`unit.type = <newer type>` or `city.population += N` keyed off world/pressure
era advancement for an economy-enabled minor civ — that is exactly the "magic
spawn" pattern this rule exists to prevent. No `!mc.economy` legacy backstop
is retained: `economy` is normalized for every minor civ on every turn
(`processMinorCivEconomyTurn`) and on every save load (`save-manager.ts`), and
`lastEraUpgrade` starts at the placement-time pressure era, so the upgrade
condition cannot fire before an economy-normalizing pass has already run.
```

- [ ] **Step 4: Run the full targeted verification suite**

Run these in sequence, confirm each exits 0:

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-economy-system.test.ts
bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-system.test.ts
bash scripts/run-with-mise.sh yarn test tests/core/turn-manager.test.ts
bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-coalition-system.test.ts
bash scripts/run-with-mise.sh yarn test tests/systems/quest-chain-system.test.ts
bash scripts/run-with-mise.sh yarn test tests/storage/save-manager.test.ts
```

Then run the full repo-required gates:

```bash
git diff --check
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 5: Commit docs**

```bash
git add .claude/rules/game-balance.md
git commit -m "docs(game-balance): document minor-civ population ceiling and retired era-upgrade magic"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin claude/city-state-population-bounds-d30004
```

```bash
gh pr create --title "fix(minor-civs): bound city-state population growth and retire the magic era upgrade" --body "$(cat <<'EOF'
...(see PR body checklist in issue #948 — fresh audit findings, ceiling table,
at-cap food behavior, over-cap legacy-save behavior, old
processMinorCivEraUpgrade behavior and what was removed/guarded,
production-backed modernization behavior, save/difficulty/hot-seat impact,
long-run evidence, exact tests, explicit out-of-scope list)...

Closes #948

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** population ceiling (Task 1+2), at-cap food behavior (Task 2), over-cap legacy preservation (Task 2 test + doc), era-band source reuse (Task 1, uses `resolveNeutralPressureEra`), magic-upgrade removal (Task 3), no-legacy-backstop justification (Phase 0 audit + Task 3 comment), long-run fixture (Task 4), balance docs (Task 4), full verification + PR (Task 4). #951/#954 interaction: ceiling helper is exported or reachable for future reuse, no mobilization-specific mutation added. Out-of-scope items (#949 full suite, #950 doc scope, #951, #954, #496, #497) are explicitly not touched.
- **Placeholder scan:** no TBD/TODO left in any step; every step has literal code.
- **Type consistency:** `getMinorCivPopulationCeiling(state: GameState, minorCivId: string): number` used identically in Task 1's export, Task 2's wiring, and Task 4's test/doc.
