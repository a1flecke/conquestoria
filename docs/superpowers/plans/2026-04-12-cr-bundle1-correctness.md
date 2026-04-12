# Code Review Bundle 1 — Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate direct state mutation in turn-processing paths, fully wire breakaway diplomacy in both directions, and stop reporting `sciencePerTurn: 0` in hot-seat summaries.

**Architecture:** All three fixes follow the codebase's established pattern — return a new `GameState` object (spread/replace), never mutate. Diplomacy fixes propagate new civ IDs through every other civ's `relationships` map and scrub deleted civ IDs from every civ's `atWarWith` list. The summary fix computes per-turn science from city yields and civ-wide modifiers, reusing existing `resource-system` helpers.

**Tech Stack:** TypeScript, Vitest, single-object `GameState`, EventBus for event emission.

**Reference:** April 12 code review, issues 2, 3, 5. Baseline SHA: `9eae2dc`.

---

## Task 1: Negative test — faction turn must not mutate caller's state

**Files:**
- Test: `tests/systems/faction-system.test.ts`

- [ ] **Step 1: Add failing test at the end of the existing `describe('processFactionTurn', ...)` block (or at the bottom of the file if no such block)**

```typescript
it('does not mutate the caller state when unrest escalates', () => {
  const state = makeState({
    unrestLevel: 1,
    unrestTurns: 4, // one tick from revolt
    cityCount: 6,   // drives enough pressure
    conquestTurn: 0,
  });
  const snapshotUnrestLevel = state.cities['city-1'].unrestLevel;
  const snapshotUnrestTurns = state.cities['city-1'].unrestTurns;
  const unitCountBefore = Object.keys(state.units).length;

  processFactionTurn(state, new EventBus());

  expect(state.cities['city-1'].unrestLevel).toBe(snapshotUnrestLevel);
  expect(state.cities['city-1'].unrestTurns).toBe(snapshotUnrestTurns);
  expect(Object.keys(state.units).length).toBe(unitCountBefore);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test tests/systems/faction-system.test.ts -t "does not mutate the caller state"`
Expected: FAIL — the test should observe mutated `unrestLevel`/`unrestTurns` or new units added on the input `state`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/systems/faction-system.test.ts
git commit -m "test(m4-review): pin faction turn immutability expectation"
```

---

## Task 2: Make `processFactionTurn` return a new state

**Files:**
- Modify: `src/systems/faction-system.ts:110-167`

- [ ] **Step 1: Rewrite `processFactionTurn` to build a new state**

Replace the function body (lines 110-167) with:

```typescript
export function processFactionTurn(state: GameState, bus: EventBus): GameState {
  let cities = { ...state.cities };
  let units = { ...state.units };
  let civilizations = state.civilizations;
  let map = state.map;
  let turnState: GameState = { ...state, cities, units };

  for (const cityId of Object.keys(state.cities)) {
    const baseline = cities[cityId];
    if (!baseline) continue;

    let city = baseline;

    if (city.conquestTurn !== undefined &&
        (state.turn - city.conquestTurn) >= CONQUEST_UNREST_DURATION) {
      city = { ...city, conquestTurn: undefined };
    }

    const pressure = computeUnrestPressure(cityId, { ...turnState, cities });

    if (city.unrestLevel === 0) {
      if (pressure > UNREST_TRIGGER_PRESSURE) {
        city = { ...city, unrestLevel: 1, unrestTurns: 0 };
        bus.emit('faction:unrest-started', { cityId, owner: city.owner });
      }
    } else if (city.unrestLevel === 1) {
      const garrisoned = canGarrisonCity(cityId, { ...turnState, cities });
      if (pressure <= UNREST_TRIGGER_PRESSURE || garrisoned) {
        city = { ...city, unrestLevel: 0, unrestTurns: 0 };
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      } else {
        const nextTurns = city.unrestTurns + 1;
        if (nextTurns >= REVOLT_UNREST_TURNS) {
          city = { ...city, unrestLevel: 2, unrestTurns: 0 };
          const spawned = spawnRebelUnitsImmutable(city, units, map, `revolt-${cityId}-${state.turn}`);
          units = spawned;
          bus.emit('faction:revolt-started', { cityId, owner: city.owner });
        } else {
          city = { ...city, unrestTurns: nextTurns };
        }
      }
    } else if (city.unrestLevel === 2) {
      const nearbyRebels = Object.values(units).filter(
        u => u.owner === 'rebels' && hexDistance(u.position, city.position) <= 3,
      );
      if (nearbyRebels.length === 0 && pressure <= UNREST_TRIGGER_PRESSURE) {
        city = { ...city, unrestLevel: 0, unrestTurns: 0 };
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      } else {
        const nextTurns = city.unrestTurns + 1;
        city = { ...city, unrestTurns: nextTurns };
        cities = { ...cities, [cityId]: city };
        turnState = { ...turnState, cities, units };
        if (nextTurns >= 10) {
          turnState = createBreakawayFromCity(turnState, cityId, bus);
          cities = turnState.cities;
          units = turnState.units;
          civilizations = turnState.civilizations;
          map = turnState.map;
          continue;
        }
      }
    }

    cities = { ...cities, [cityId]: city };
    turnState = { ...turnState, cities, units };
  }

  return { ...turnState, cities, units, civilizations, map };
}
```

- [ ] **Step 2: Replace `spawnRebelUnits` with an immutable variant**

Replace the `spawnRebelUnits` function (lines 89-106) with:

```typescript
function spawnRebelUnitsImmutable(
  city: City,
  units: GameState['units'],
  map: GameState['map'],
  seed: string,
): GameState['units'] {
  const rng = createRng(seed);
  const offsets: HexCoord[] = [
    { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
  ];
  const unitType: UnitType = city.population >= 4 ? 'swordsman' : 'warrior';
  const spawnCount = 1 + Math.floor(rng() * 2);
  let nextUnits = units;

  for (let i = 0; i < spawnCount; i++) {
    const offset = offsets[Math.floor(rng() * offsets.length)];
    const pos: HexCoord = { q: city.position.q + offset.q, r: city.position.r + offset.r };
    const key = `${pos.q},${pos.r}`;
    if (!map.tiles[key]) continue;
    const rebel = createUnit(unitType, 'rebels', pos);
    nextUnits = { ...nextUnits, [rebel.id]: rebel };
  }

  return nextUnits;
}
```

- [ ] **Step 3: Run the test from Task 1**

Run: `yarn test tests/systems/faction-system.test.ts`
Expected: All tests pass — including the new immutability test and all prior faction tests.

- [ ] **Step 4: Commit**

```bash
git add src/systems/faction-system.ts
git commit -m "fix(m4-review): return new state from processFactionTurn"
```

---

## Task 3: Immutable minor-civ ally bonus ticks

**Files:**
- Test: `tests/systems/minor-civ-system.test.ts`
- Modify: `src/systems/minor-civ-system.ts:217-234`

- [ ] **Step 1: Add failing test for immutability of production ally bonus**

Add to the end of `tests/systems/minor-civ-system.test.ts`:

```typescript
it('production_per_turn ally bonus does not mutate caller city objects', () => {
  const { state, allyCivId, cityId } = buildAllyProductionFixture(); // see Step 2
  const originalProgress = state.cities[cityId].productionProgress;
  const cityRef = state.cities[cityId];

  processMinorCivAllyBonuses(state, allyCivId); // or whichever exported entry calls this switch case

  expect(cityRef.productionProgress).toBe(originalProgress);
});
```

- [ ] **Step 2: Add `buildAllyProductionFixture` helper at the top of the test file, wiring a minor civ whose `allyBonus.type === 'production_per_turn'` and a player civ with one city that has a queued build. Use existing `MINOR_CIV_DEFINITIONS` — pick one with the right bonus type, or craft the civ/minor-civ objects directly if none exists.**

- [ ] **Step 3: Run and verify it fails**

Run: `yarn test tests/systems/minor-civ-system.test.ts -t "production_per_turn"`
Expected: FAIL — the cityRef was mutated.

- [ ] **Step 4: Replace the mutating branch (lines 217-223) with an immutable update**

Old:
```typescript
case 'production_per_turn': {
  const firstCityId = civ.cities[0];
  const firstCity = firstCityId ? state.cities[firstCityId] : null;
  if (firstCity && firstCity.productionQueue.length > 0) {
    firstCity.productionProgress += def.allyBonus.amount;
  }
  break;
}
```

New:
```typescript
case 'production_per_turn': {
  const firstCityId = civ.cities[0];
  const firstCity = firstCityId ? state.cities[firstCityId] : null;
  if (firstCity && firstCity.productionQueue.length > 0) {
    state.cities = {
      ...state.cities,
      [firstCityId]: {
        ...firstCity,
        productionProgress: firstCity.productionProgress + def.allyBonus.amount,
      },
    };
  }
  break;
}
```

Note: if the enclosing function receives `state` and mutates it wholesale, also audit the `free_unit` branch (lines 225-234) — replace with:

```typescript
case 'free_unit': {
  if (state.turn % def.allyBonus.everyNTurns === 0) {
    const firstCityId = civ.cities[0];
    const city = firstCityId ? state.cities[firstCityId] : null;
    if (city) {
      const freeUnit = createUnit(def.allyBonus.unitType, civId, city.position);
      state.units = { ...state.units, [freeUnit.id]: freeUnit };
      state.civilizations = {
        ...state.civilizations,
        [civId]: { ...civ, units: [...civ.units, freeUnit.id] },
      };
    }
  }
  break;
}
```

- [ ] **Step 5: Run tests**

Run: `yarn test tests/systems/minor-civ-system.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/systems/minor-civ-system.test.ts src/systems/minor-civ-system.ts
git commit -m "fix(m4-review): immutable minor-civ ally bonus tick"
```

---

## Task 4: `ensureGameIdentity` must not mutate the caller

**Files:**
- Test: `tests/ui/save-panel.test.ts` (or create `tests/storage/save-manager.test.ts` if it doesn't exist)
- Modify: `src/storage/save-manager.ts:11-20` and every caller inside the same file.

- [ ] **Step 1: Check whether `tests/storage/save-manager.test.ts` exists**

Run: `ls tests/storage/ 2>/dev/null`

If it does not exist, create the directory; add the test to a new file.

- [ ] **Step 2: Write failing test**

Add to `tests/storage/save-manager.test.ts` (create if needed):

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { saveGame } from '@/storage/save-manager';

function makeBareState(): GameState {
  return {
    turn: 3,
    era: 1,
    currentPlayer: 'player',
    civilizations: { player: { id: 'player', civType: 'generic' } as unknown as GameState['civilizations'][string] },
    cities: {},
    units: {},
    map: { tiles: {}, width: 10, height: 10, wrapsHorizontally: false } as GameState['map'],
  } as unknown as GameState;
}

describe('saveGame', () => {
  it('does not mutate gameId or gameTitle on the caller state', async () => {
    const state = makeBareState();
    expect(state.gameId).toBeUndefined();
    expect(state.gameTitle).toBeUndefined();

    await saveGame('slot-x', 'Slot X', state);

    expect(state.gameId).toBeUndefined();
    expect(state.gameTitle).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run and verify it fails**

Run: `yarn test tests/storage/save-manager.test.ts`
Expected: FAIL — `state.gameId` is populated by `ensureGameIdentity`.

- [ ] **Step 4: Refactor `ensureGameIdentity` to be pure**

Replace lines 11-20 in `src/storage/save-manager.ts` with:

```typescript
function ensureGameIdentity(state: GameState): GameState {
  if (state.gameId && state.gameTitle) {
    return state;
  }
  const gameId = state.gameId ?? `game-${Date.now()}`;
  const civType = state.hotSeat ? 'Hot Seat' : (state.civilizations[state.currentPlayer]?.civType ?? 'Unknown');
  const gameTitle = state.gameTitle ?? `Recovered ${civType} Campaign`;
  return { ...state, gameId, gameTitle };
}
```

Then audit every caller in `save-manager.ts`. In `buildSaveMeta` (line 22) the returned value is already read via `resolved.*`, so it still works — good. If any caller of `ensureGameIdentity` expects the mutation to persist on the caller's state (e.g. `saveGame` assigning identity back to the *live* state so subsequent autosaves reuse the same id), find that call site and have the caller explicitly assign the returned object back into its own state variable. Grep for `ensureGameIdentity(` to find all call sites.

Run: `grep -n "ensureGameIdentity" src/storage/save-manager.ts`

For each caller, update the pattern to `const withId = ensureGameIdentity(state); /* use withId */` and, only where the *live* game state is owned by the caller (e.g. inside `main.ts` save flow), surface the new state back up. Do NOT reintroduce mutation.

- [ ] **Step 5: Run tests**

Run: `yarn test tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/save-manager.ts tests/storage/save-manager.test.ts
git commit -m "fix(m4-review): make ensureGameIdentity pure"
```

---

## Task 5: Breakaway wires relationship into every civ

**Files:**
- Test: `tests/systems/breakaway-system.test.ts`
- Modify: `src/systems/breakaway-system.ts:72-108`

- [ ] **Step 1: Add failing test**

Append to `tests/systems/breakaway-system.test.ts`:

```typescript
it('propagates the breakaway civ into every existing civ relationship map', () => {
  const baseState = makeStateWithCivs(['player', 'ai-1', 'ai-2']); // existing helper — re-use whatever is already in this file
  const cityId = baseState.civilizations['player'].cities[0];
  const bus = new EventBus();

  const nextState = createBreakawayFromCity(baseState, cityId, bus);
  const breakawayId = `breakaway-${cityId}`;

  for (const civId of ['ai-1', 'ai-2']) {
    expect(nextState.civilizations[civId].diplomacy.relationships).toHaveProperty(breakawayId);
  }
  // And the breakaway knows about every pre-existing civ
  for (const civId of ['player', 'ai-1', 'ai-2']) {
    expect(nextState.civilizations[breakawayId].diplomacy.relationships).toHaveProperty(civId);
  }
});
```

If `makeStateWithCivs` does not exist in the test file, write the minimal fixture inline — only three civs, one city owned by `player`, empty map tiles for the city's `ownedTiles` is fine. Reuse the existing fixture style in the file.

- [ ] **Step 2: Run and verify fail**

Run: `yarn test tests/systems/breakaway-system.test.ts -t "propagates the breakaway civ"`
Expected: FAIL — `ai-1`/`ai-2` have no entry for the breakaway.

- [ ] **Step 3: Propagate relationship into every other civ**

In `src/systems/breakaway-system.ts`, after line 108 (inside `createBreakawayFromCity`, right before `updatedCivilizations[breakawayId] = breakawayCiv;` on line 109), insert:

```typescript
for (const [otherId, otherCiv] of Object.entries(updatedCivilizations)) {
  if (otherId === previousOwner.id || otherId === breakawayId) continue;
  updatedCivilizations[otherId] = {
    ...otherCiv,
    diplomacy: {
      ...otherCiv.diplomacy,
      relationships: {
        ...otherCiv.diplomacy.relationships,
        [breakawayId]: 0,
      },
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `yarn test tests/systems/breakaway-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/systems/breakaway-system.test.ts src/systems/breakaway-system.ts
git commit -m "fix(m4-review): wire breakaway relationship into every civ"
```

---

## Task 6: Reabsorb scrubs breakaway ID from every civ's `atWarWith`

**Files:**
- Test: `tests/systems/breakaway-system.test.ts`
- Modify: `src/systems/breakaway-system.ts:198-226`

- [ ] **Step 1: Add failing test**

Append to `tests/systems/breakaway-system.test.ts`:

```typescript
it('reabsorb removes the breakaway id from every civ atWarWith list', () => {
  const baseState = makeStateWithCivs(['player', 'ai-1', 'ai-2']);
  const cityId = baseState.civilizations['player'].cities[0];
  const bus = new EventBus();

  let state = createBreakawayFromCity(baseState, cityId, bus);
  const breakawayId = `breakaway-${cityId}`;

  // Put ai-1 at war with the breakaway
  state = {
    ...state,
    civilizations: {
      ...state.civilizations,
      'ai-1': {
        ...state.civilizations['ai-1'],
        diplomacy: {
          ...state.civilizations['ai-1'].diplomacy,
          atWarWith: [...state.civilizations['ai-1'].diplomacy.atWarWith, breakawayId],
        },
      },
    },
  };

  // Meet reabsorb preconditions
  state.civilizations['player'].gold = 1000;
  state.civilizations['player'].diplomacy.relationships[breakawayId] = 80;

  const after = tryReabsorbBreakaway(state, 'player', breakawayId);

  expect(after.civilizations[breakawayId]).toBeUndefined();
  expect(after.civilizations['ai-1'].diplomacy.atWarWith).not.toContain(breakawayId);
});
```

- [ ] **Step 2: Run and verify fail**

Run: `yarn test tests/systems/breakaway-system.test.ts -t "reabsorb removes"`
Expected: FAIL — `atWarWith` still contains the deleted id.

- [ ] **Step 3: Scrub `atWarWith` in `tryReabsorbBreakaway`**

In `src/systems/breakaway-system.ts`, inside the `for (const civ of Object.values(updatedCivilizations))` loop starting at line 215, replace the body with:

```typescript
for (const civ of Object.values(updatedCivilizations)) {
  if (civ.id === ownerId) continue;
  const hasRelEntry = civ.diplomacy.relationships[breakawayId] !== undefined;
  const hasWarEntry = civ.diplomacy.atWarWith.includes(breakawayId);
  if (!hasRelEntry && !hasWarEntry) continue;

  const nextRelationships = { ...civ.diplomacy.relationships };
  delete nextRelationships[breakawayId];

  civ.diplomacy = {
    ...civ.diplomacy,
    relationships: nextRelationships,
    atWarWith: civ.diplomacy.atWarWith.filter(id => id !== breakawayId),
  };
}
```

Also apply the same scrub in `reconquerBreakawayCity` if it ever fully destroys the breakaway civ — audit that function: it does NOT currently delete the civ, so no change needed unless a later cleanup step in the same flow removes it. Leave as-is.

- [ ] **Step 4: Run the test**

Run: `yarn test tests/systems/breakaway-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/systems/breakaway-system.test.ts src/systems/breakaway-system.ts
git commit -m "fix(m4-review): scrub reabsorbed breakaway id from atWarWith"
```

---

## Task 7: `turn-summary.sciencePerTurn` is computed, not hardcoded

**Files:**
- Test: `tests/core/hotseat-events.test.ts` (create if absent)
- Modify: `src/core/hotseat-events.ts:53-77`

- [ ] **Step 1: Locate or create test file**

Run: `ls tests/core/hotseat-events.test.ts 2>/dev/null`

If absent, create it.

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { generateSummary } from '@/core/hotseat-events';

describe('generateSummary.sciencePerTurn', () => {
  it('reports the civ-wide science yield for the turn', () => {
    const state: GameState = {
      turn: 5,
      era: 1,
      currentPlayer: 'player',
      civilizations: {
        player: {
          id: 'player',
          cities: ['c1'],
          units: [],
          gold: 0,
          civType: 'generic',
          techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} },
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
          visibility: { tiles: {} },
          score: 0,
        } as unknown as GameState['civilizations'][string],
      },
      cities: {
        c1: {
          id: 'c1', name: 'c1', owner: 'player',
          position: { q: 0, r: 0 },
          population: 3, food: 0, foodNeeded: 20,
          buildings: ['library'], productionQueue: [], productionProgress: 0,
          ownedTiles: [{ q: 0, r: 0 }],
          grid: [[null]], gridSize: 3,
          unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        } as unknown as GameState['cities'][string],
      },
      units: {},
      map: {
        tiles: { '0,0': { q: 0, r: 0, terrain: 'plains', owner: 'player' } },
        width: 10, height: 10, wrapsHorizontally: false,
      } as unknown as GameState['map'],
    } as unknown as GameState;

    const summary = generateSummary(state, 'player');
    expect(summary.sciencePerTurn).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run and verify fail**

Run: `yarn test tests/core/hotseat-events.test.ts`
Expected: FAIL — `sciencePerTurn` is 0.

- [ ] **Step 4: Compute science in `generateSummary`**

In `src/core/hotseat-events.ts`, replace the function with:

```typescript
import type { CouncilInterrupt, GameState, GameEvent } from './types';
import { calculateCityYields } from '@/systems/resource-system';
import { getCivDefinition } from '@/systems/civ-definitions';

// ... existing code above unchanged ...

export function generateSummary(
  state: GameState,
  civId: string,
): TurnSummary {
  const civ = state.civilizations[civId];
  const pending = state.pendingEvents ?? {};

  const allies = civ?.diplomacy?.treaties
    .filter(t => t.type === 'alliance')
    .map(t => t.civA === civId ? t.civB : t.civA) ?? [];

  let sciencePerTurn = 0;
  if (civ) {
    const bonus = getCivDefinition(civ.civType ?? '')?.bonusEffect;
    for (const cityId of civ.cities) {
      const city = state.cities[cityId];
      if (!city) continue;
      const yields = calculateCityYields(city, state.map, bonus);
      sciencePerTurn += yields.science ?? 0;
    }
  }

  return {
    turn: state.turn,
    era: state.era,
    gold: civ?.gold ?? 0,
    cities: civ?.cities.length ?? 0,
    units: civ?.units.length ?? 0,
    currentResearch: civ?.techState.currentResearch ?? null,
    researchProgress: civ?.techState.researchProgress ?? 0,
    sciencePerTurn,
    atWarWith: civ?.diplomacy?.atWarWith ?? [],
    allies,
    events: pending[civId] ?? [],
  };
}
```

If `calculateCityYields` does not return a `.science` field in this codebase, inspect `src/systems/resource-system.ts` and use whichever field represents per-turn science; update the test expectation accordingly.

- [ ] **Step 5: Run the test**

Run: `yarn test tests/core/hotseat-events.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/hotseat-events.ts tests/core/hotseat-events.test.ts
git commit -m "fix(m4-review): compute sciencePerTurn in hot-seat summary"
```

---

## Task 8: Bundle verification

- [ ] **Step 1: Run the full suite**

Run: `yarn test`
Expected: All suites pass, no new skips.

- [ ] **Step 2: Typecheck / build smoke**

Run: `yarn build`
Expected: Success.

- [ ] **Step 3: Final commit if verification turned up touch-ups**

If any adjustments were needed above (e.g. a missing field on `calculateCityYields`), commit them as a single follow-up:

```bash
git add -p
git commit -m "fix(m4-review): bundle 1 verification follow-ups"
```

---

**Done when:** all eight tasks green, `yarn test` passes, commits follow the `fix(m4-review): …` convention.
