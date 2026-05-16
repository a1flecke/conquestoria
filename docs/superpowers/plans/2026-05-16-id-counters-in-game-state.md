# ID Counters in GameState — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all four ID-generating counters (unit, city, camp, quest) into `GameState.idCounters` so they are persisted with saves, eliminating the reload-collision bug and the between-game quest-counter leak.

**Architecture:** Add `IdCounters` to `GameState` as a required field. Creation functions (`createUnit`, `foundCity`, `spawnBarbarianCamp`, `generateQuest`) accept a `counters: IdCounters` parameter and mutate it. `migrateLegacySave()` initialises the field on old saves via `scanIdCounters()`. All module-level counter variables and their reset functions are deleted.

**Tech Stack:** TypeScript, Vitest, `src/core/types.ts`, `src/core/id-counters.ts` (new)

**Spec:** `docs/superpowers/specs/2026-05-16-id-counters-in-game-state.md`

---

### Task 1: Add `IdCounters` to types + create `id-counters.ts`

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/id-counters.ts`

- [ ] **Step 1: Add `IdCounters` interface and `idCounters` field to `GameState`**

In `src/core/types.ts`, add the interface just before `GameState`:

```typescript
export interface IdCounters {
  nextUnitId:  number;
  nextCityId:  number;
  nextCampId:  number;
  nextQuestId: number;
}
```

Then add `idCounters: IdCounters;` to `GameState` after the existing `espionage?` line (around line 1009):

```typescript
  espionage?: EspionageState;
  idCounters: IdCounters;           // ← add this line
  embargoes: Embargo[];
```

- [ ] **Step 2: Create `src/core/id-counters.ts`**

```typescript
import type { GameState, IdCounters } from './types';

/**
 * Return a fresh counter set for a brand-new game (before any entities are created).
 */
export function emptyIdCounters(): IdCounters {
  return { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
}

/**
 * Reconstruct IdCounters from an existing GameState by scanning entity IDs.
 * Used once by migrateLegacySave() for saves predating this field.
 *
 * EXTENSION CONTRACT: when adding a new counter to IdCounters, add a matching
 * scan block here AND add the field to emptyIdCounters() above.
 */
export function scanIdCounters(
  state: Pick<GameState, 'units' | 'cities' | 'barbarianCamps' | 'minorCivs'>,
): IdCounters {
  let maxUnit = 0, maxCity = 0, maxCamp = 0, maxQuest = 0;

  for (const id of Object.keys(state.units)) {
    const n = /^unit-(\d+)$/.exec(id);
    if (n) maxUnit = Math.max(maxUnit, +n[1]);
  }
  for (const id of Object.keys(state.cities)) {
    const n = /^city-(\d+)$/.exec(id);
    if (n) maxCity = Math.max(maxCity, +n[1]);
  }
  for (const id of Object.keys(state.barbarianCamps)) {
    const n = /^camp-(\d+)$/.exec(id);
    if (n) maxCamp = Math.max(maxCamp, +n[1]);
  }
  for (const mc of Object.values(state.minorCivs)) {
    for (const id of Object.keys(mc.activeQuests)) {
      const n = /^quest-(\d+)$/.exec(id);
      if (n) maxQuest = Math.max(maxQuest, +n[1]);
    }
  }

  return {
    nextUnitId:  maxUnit  + 1,
    nextCityId:  maxCity  + 1,
    nextCampId:  maxCamp  + 1,
    nextQuestId: maxQuest + 1,
  };
}
```

- [ ] **Step 3: Verify the new module compiles in isolation**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep 'id-counters\|IdCounters' | head -20
```

Expected: errors about `GameState` missing `idCounters` at construction sites — that's correct, we haven't updated those yet. No errors inside `id-counters.ts` itself.

- [ ] **Step 4: Commit foundation**

```bash
git add src/core/types.ts src/core/id-counters.ts
git commit -m "feat: add IdCounters interface to GameState and id-counters.ts helpers"
```

---

### Task 2: Write new `tests/systems/id-counters.test.ts` (will fail until Task 3)

**Files:**
- Create: `tests/systems/id-counters.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { generateQuest } from '@/systems/quest-system';
import { emptyIdCounters, scanIdCounters } from '@/core/id-counters';
import type { IdCounters } from '@/core/types';

// Minimal map for foundCity
const makeMap = () => ({
  width: 5, height: 5, wrapsHorizontally: false, rivers: [],
  tiles: {
    '0,0': { coord: { q: 0, r: 0 }, terrain: 'plains' as const, elevation: 'flat' as any,
              resource: null, improvement: 'none' as const, improvementTurnsLeft: 0,
              owner: null, hasRiver: false, wonder: null },
  },
});

// Minimal state for scanIdCounters
const makeState = (
  unitIds: string[] = [],
  cityIds: string[] = [],
  campIds: string[] = [],
  questsByMc: Record<string, string[]> = {},
) => ({
  units:          Object.fromEntries(unitIds.map(id => [id, { id }])),
  cities:         Object.fromEntries(cityIds.map(id => [id, { id }])),
  barbarianCamps: Object.fromEntries(campIds.map(id => [id, { id }])),
  minorCivs:      Object.fromEntries(
    Object.entries(questsByMc).map(([mcId, qIds]) => [
      mcId,
      { activeQuests: Object.fromEntries(qIds.map(qId => [qId, { id: qId }])) },
    ]),
  ),
});

// ── createUnit ────────────────────────────────────────────────────────────────

describe('createUnit uses and increments counters.nextUnitId', () => {
  it('uses the current counter value and embeds it in the ID', () => {
    const c: IdCounters = { nextUnitId: 7, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const u = createUnit('warrior', 'player', { q: 0, r: 0 }, c);
    expect(u.id).toBe('unit-7');
    expect(c.nextUnitId).toBe(8);
  });

  it('sequential calls yield non-colliding IDs', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const a = createUnit('warrior', 'p1', { q: 0, r: 0 }, c);
    const b = createUnit('settler', 'p1', { q: 1, r: 0 }, c);
    expect(a.id).toBe('unit-1');
    expect(b.id).toBe('unit-2');
    expect(a.id).not.toBe(b.id);
  });

  it('two independent counter objects do not interfere', () => {
    const c1: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const c2: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const u1 = createUnit('warrior', 'p1', { q: 0, r: 0 }, c1);
    const u2 = createUnit('warrior', 'p2', { q: 0, r: 0 }, c2);
    expect(u1.id).toBe('unit-1');
    expect(u2.id).toBe('unit-1');
    expect(c1.nextUnitId).toBe(2);
    expect(c2.nextUnitId).toBe(2);
  });
});

// ── foundCity ─────────────────────────────────────────────────────────────────

describe('foundCity uses and increments counters.nextCityId', () => {
  it('uses the current counter value and embeds it in the ID', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 5, nextCampId: 1, nextQuestId: 1 };
    const city = foundCity('player', { q: 0, r: 0 }, makeMap() as any, c);
    expect(city.id).toBe('city-5');
    expect(c.nextCityId).toBe(6);
  });

  it('does not affect nextUnitId', () => {
    const c: IdCounters = { nextUnitId: 3, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    foundCity('player', { q: 0, r: 0 }, makeMap() as any, c);
    expect(c.nextUnitId).toBe(3);
  });
});

// ── spawnBarbarianCamp ────────────────────────────────────────────────────────

describe('spawnBarbarianCamp uses and increments counters.nextCampId', () => {
  it('embeds the counter value in the camp ID', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 3, nextQuestId: 1 };
    const map = makeMap() as any;
    // Give map a plains tile far from any city
    map.tiles['3,3'] = { coord: { q: 3, r: 3 }, terrain: 'plains', elevation: 'flat',
                         resource: null, improvement: 'none', improvementTurnsLeft: 0,
                         owner: null, hasRiver: false, wonder: null };
    const camp = spawnBarbarianCamp(map, [], [], 42, c);
    if (camp) {
      expect(camp.id).toBe('camp-3');
      expect(c.nextCampId).toBe(4);
    }
    // If no valid position found the function returns null — counter unchanged
  });
});

// ── generateQuest ─────────────────────────────────────────────────────────────

describe('generateQuest uses and increments counters.nextQuestId', () => {
  it('embeds the counter value in the quest ID when a quest is generated', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 4 };
    const rng = () => 0; // deterministic
    const state = {
      barbarianCamps: { 'camp-1': { id: 'camp-1', position: { q: 0, r: 0 }, strength: 5, spawnCooldown: 0 } },
      era: 1,
      minorCivs: {
        'mc-test': {
          id: 'mc-test', definitionId: 'test', cityId: 'city-1',
          units: [], activeQuests: {}, isDestroyed: false,
          garrisonCooldown: 0, lastEraUpgrade: 0,
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] },
        },
      },
      cities: { 'city-1': { id: 'city-1', position: { q: 0, r: 0 }, name: 'Test', population: 1,
                             buildings: [], productionQueue: [], productionProgress: 0,
                             owner: 'mc-test', workedTiles: [], focus: 'balanced' as const,
                             maturity: 0, lastWorkedYields: { food: 0, production: 0, gold: 0, science: 0 } } },
      units: {},
    } as any;
    const quest = generateQuest('militaristic', 'mc-test', 'player', 1, state, rng, c);
    if (quest) {
      expect(quest.id).toBe('quest-4');
      expect(c.nextQuestId).toBe(5);
    }
  });
});

// ── scanIdCounters ─────────────────────────────────────────────────────────────

describe('scanIdCounters', () => {
  it('returns {1,1,1,1} for empty state', () => {
    expect(scanIdCounters(makeState())).toEqual(
      { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    );
  });

  it('finds the maximum, not the count, across non-sequential IDs', () => {
    const result = scanIdCounters(makeState(['unit-3', 'unit-847']));
    expect(result.nextUnitId).toBe(848);
  });

  it('ignores IDs that do not match the type-N pattern', () => {
    const result = scanIdCounters(makeState(['barbarian-warrior-1', 'mc-unit-xyz']));
    expect(result.nextUnitId).toBe(1);
  });

  it('scans all three flat collections independently', () => {
    const result = scanIdCounters(makeState(
      ['unit-5'],
      ['city-3'],
      ['camp-10'],
    ));
    expect(result).toEqual({ nextUnitId: 6, nextCityId: 4, nextCampId: 11, nextQuestId: 1 });
  });

  it('scans quests nested inside minorCivs', () => {
    const result = scanIdCounters(makeState([], [], [], {
      'mc-a': ['quest-2', 'quest-9'],
      'mc-b': ['quest-5'],
    }));
    expect(result.nextQuestId).toBe(10);
  });

  it('two independent calls on different states return independent results', () => {
    const r1 = scanIdCounters(makeState(['unit-100']));
    const r2 = scanIdCounters(makeState(['unit-3']));
    expect(r1.nextUnitId).toBe(101);
    expect(r2.nextUnitId).toBe(4);
  });
});

// ── emptyIdCounters ───────────────────────────────────────────────────────────

describe('emptyIdCounters', () => {
  it('returns a fresh object starting at 1 for all counters', () => {
    expect(emptyIdCounters()).toEqual(
      { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    );
  });

  it('returns a new object each call (not a shared reference)', () => {
    const a = emptyIdCounters();
    const b = emptyIdCounters();
    a.nextUnitId = 99;
    expect(b.nextUnitId).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failures on counter-using tests (creation fns not updated yet)**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/id-counters.test.ts 2>&1 | tail -20
```

Expected: type errors or test failures because `createUnit` etc. don't accept `counters` yet.

- [ ] **Step 3: Commit test file**

```bash
git add tests/systems/id-counters.test.ts
git commit -m "test: add id-counters.test.ts (red — creation fns not yet updated)"
```

---

### Task 3: Update creation functions

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/barbarian-system.ts`
- Modify: `src/systems/quest-system.ts`

- [ ] **Step 1: Update `createUnit` in `src/systems/unit-system.ts`**

Add `import type { IdCounters } from '@/core/types';` to the imports at the top.

Change the function signature — add `counters: IdCounters` before the optional `bonusEffect`:

```typescript
export function createUnit(
  type: UnitType,
  owner: string,
  position: HexCoord,
  counters: IdCounters,
  bonusEffect?: CivBonusEffect,
): Unit {
```

Change the ID line:
```typescript
    id: `unit-${counters.nextUnitId++}`,
```

- [ ] **Step 2: Update `foundCity` in `src/systems/city-system.ts`**

Add `import type { IdCounters } from '@/core/types';` (or add to existing type import).

Change the signature — add `counters: IdCounters` before the optional `options`:

```typescript
export function foundCity(
  owner: string,
  position: HexCoord,
  map: GameMap,
  counters: IdCounters,
  options: FoundCityOptions = {},
): City {
```

Change the ID line:
```typescript
    id: `city-${counters.nextCityId++}`,
```

- [ ] **Step 3: Update `spawnBarbarianCamp` in `src/systems/barbarian-system.ts`**

Add `import type { IdCounters } from '@/core/types';` to imports.

Add `counters: IdCounters` as the last parameter:

```typescript
export function spawnBarbarianCamp(
  map: GameMap,
  cityPositions: HexCoord[],
  existingCamps: BarbarianCamp[],
  seed: number,
  counters: IdCounters,
): BarbarianCamp | null {
```

Change the ID line:
```typescript
    id: `camp-${counters.nextCampId++}`,
```

- [ ] **Step 4: Update `generateQuest` and `makeQuest` in `src/systems/quest-system.ts`**

Add `import type { IdCounters } from '@/core/types';` to imports.

Add `counters: IdCounters` as the last parameter of `generateQuest`:

```typescript
export function generateQuest(
  archetype: MinorCivArchetype,
  minorCivId: string,
  majorCivId: string,
  currentTurn: number,
  state: Pick<GameState, 'barbarianCamps' | 'era' | 'minorCivs' | 'cities' | 'units'>,
  rng: () => number,
  counters: IdCounters,
): Quest | null {
```

Pass `counters` to `makeQuest` in all three call sites within `generateQuest`:

```typescript
      return makeQuest(candidate.type, candidate.target, currentTurn, minorCivId, counters);
    }
  }
  const fallback = candidates[candidates.length - 1];
  return makeQuest(fallback.type, fallback.target, currentTurn, minorCivId, counters);
```

Update `makeQuest` signature (it's private) and remove `questIdCounter++`:

```typescript
function makeQuest(
  type: QuestType,
  target: QuestTarget,
  currentTurn: number,
  minorCivId: string | undefined,
  counters: IdCounters,
): Quest {
  // DELETE the `questIdCounter++;` line that was here
  const reward = getRewardForType(type);
  return {
    id: `quest-${counters.nextQuestId++}`,   // ← replaces `quest-${questIdCounter}`
    type,
    description: getQuestDescription(type, target),
    target,
    reward,
    issuedTurn: currentTurn,
    issuedBy: minorCivId,
  };
}
```

- [ ] **Step 5: Run tests on just the new test file — expect green for id-counters.test.ts**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/id-counters.test.ts 2>&1 | tail -20
```

Expected: tests pass (or only fail on unrelated call sites not yet updated).

- [ ] **Step 6: Commit**

```bash
git add src/systems/unit-system.ts src/systems/city-system.ts src/systems/barbarian-system.ts src/systems/quest-system.ts
git commit -m "feat: add counters param to createUnit, foundCity, spawnBarbarianCamp, generateQuest"
```

---

### Task 4: Update `src/core/game-state.ts`

**Files:**
- Modify: `src/core/game-state.ts`

- [ ] **Step 1: Update imports**

Add to the import block at the top:
```typescript
import { emptyIdCounters } from './id-counters';
```

Remove `resetUnitId` from the `unit-system` import.
Remove `resetCityId` from the `city-system` import.
Remove `resetCampId` from the `barbarian-system` import.
Remove `_resetSpyIdCounter` from the `espionage-system` import.

- [ ] **Step 2: Update `createNewGame`**

Remove the four reset lines at the top of `createNewGame`:
```typescript
// DELETE these four lines:
resetUnitId();
resetCityId();
resetCampId();
_resetSpyIdCounter();
```

Add `const idCounters = emptyIdCounters();` immediately after (before any entity creation):
```typescript
const idCounters = emptyIdCounters();
```

Pass `idCounters` to the two `createUnit` calls for the player:
```typescript
  const playerSettler = createUnit('settler', 'player', startPositions[0], idCounters, playerCivDef?.bonusEffect);
  const playerWarrior = createUnit('warrior', 'player', startPositions[0], idCounters, playerCivDef?.bonusEffect);
```

Pass `idCounters` to the AI `createUnit` calls:
```typescript
    const aiSettler = createUnit('settler', civId, startPositions[index + 1], idCounters, aiCivDef?.bonusEffect);
    const aiWarrior = createUnit('warrior', civId, startPositions[index + 1], idCounters, aiCivDef?.bonusEffect);
```

Pass `idCounters` to `spawnBarbarianCamp`:
```typescript
    const camp = spawnBarbarianCamp(map, cityPositions, Object.values(barbarianCamps), barbSeedBase + i, idCounters);
```

Add `idCounters` to the `state` object literal:
```typescript
  const state: GameState = {
    turn: 1,
    era: 1,
    // ...existing fields...
    idCounters,         // ← add this line
    embargoes: [],
```

- [ ] **Step 3: Update `createHotSeatGame`**

Same pattern — remove four reset lines, add `const idCounters = emptyIdCounters();`, pass to all `createUnit` and `spawnBarbarianCamp` calls, add to state literal.

```typescript
// DELETE:
resetUnitId();
resetCityId();
resetCampId();
_resetSpyIdCounter();

// ADD before entity creation:
const idCounters = emptyIdCounters();
```

Player unit creation:
```typescript
    const settler = createUnit('settler', player.slotId, startPositions[i], idCounters, civDef?.bonusEffect);
    const warrior = createUnit('warrior', player.slotId, startPositions[i], idCounters, civDef?.bonusEffect);
```

Camp creation:
```typescript
    const camp = spawnBarbarianCamp(map, startPositions, Object.values(barbarianCamps), hotSeatBarbSeed + i, idCounters);
```

State literal:
```typescript
  const state: GameState = {
    // ...
    idCounters,
    // ...
  };
```

- [ ] **Step 4: Update `placeMinorCivs` call sites within `game-state.ts`**

`placeMinorCivs(state, ...)` is called after the state literal, so `state.idCounters` is already set. The minor-civ system's internal `createUnit`/`foundCity` calls will use `state.idCounters` — those updates happen in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.ts
git commit -m "feat: update game-state.ts to use idCounters from state, remove reset calls"
```

---

### Task 5: Update all remaining call sites

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/systems/village-system.ts`
- Modify: `src/systems/faction-system.ts`
- Modify: `src/systems/espionage-system.ts`

- [ ] **Step 1: Update `src/core/turn-manager.ts`** (2 `createUnit` calls)

Line ~137 — city trains unit:
```typescript
        const newUnit = createUnit(result.completedUnit, civId, city.position, newState.idCounters, civDef?.bonusEffect);
```

Line ~464 — barbarian spawns raider:
```typescript
    const raider = createUnit('warrior', 'barbarian', spawn.position, newState.idCounters);
```

- [ ] **Step 2: Update `src/main.ts`** (3 `createUnit` calls, 1 `foundCity` call, remove `syncUnitIdCounter`)

Remove `syncUnitIdCounter` from the `unit-system` import line.

Remove `syncUnitIdCounter(gameState.units);` from `startGame()`.

Add migration guard to `migrateLegacySave()` — add this import at the top of `main.ts`:
```typescript
import { scanIdCounters } from '@/core/id-counters';
```

At the very top of `migrateLegacySave()`, before any other logic:
```typescript
function migrateLegacySave(): void {
  if (!gameState.idCounters) {
    gameState.idCounters = scanIdCounters(gameState);
  }
  // ...existing migration code...
```

Three `createUnit` calls — all use `gameState.idCounters`:

Line ~944 (spy exfiltrate):
```typescript
        const newUnit = createUnit(spy.unitType, gameState.currentPlayer, spawnPos, gameState.idCounters);
```

Line ~986 (spy unembed):
```typescript
        const newUnit = createUnit(spy.unitType, gameState.currentPlayer, city.position, gameState.idCounters);
```

Line ~2262 (spy expelled, recreate at capital):
```typescript
          const newUnit = createUnit(spy.unitType, spyOwner, capital.position, gameState.idCounters);
```

One `foundCity` call (line ~1395, player founds city):
```typescript
  const city = foundCity(cp, unit.position, gameState.map, gameState.idCounters, {
    civType: currentCiv().civType,
    namingPool: civDef?.cityNames,
    civName: civDef?.name ?? currentCiv().name,
    usedNames: collectUsedCityNames(gameState),
  });
```

- [ ] **Step 3: Update `src/ai/basic-ai.ts`** (1 `createUnit`, 1 `foundCity`)

`foundCity` call (line ~320):
```typescript
      const city = foundCity(civId, settler.position, newState.map, newState.idCounters, {
        civType: civ.civType,
        namingPool: civDef?.cityNames,
        civName: civDef?.name ?? civ.name,
        usedNames: collectUsedCityNames(newState),
      });
```

`createUnit` call (line ~882, spy expelled from AI):
```typescript
            const newUnit = createUnit(capturedSpy.unitType, victimCivId, capital.position, newState.idCounters);
```

- [ ] **Step 4: Update `src/systems/minor-civ-system.ts`** (4 `createUnit`, 2 `foundCity`, 1 `generateQuest`)

All functions here take `state: GameState`, so use `state.idCounters` throughout.

`placeMinorCivs` — `foundCity` call (~line 83):
```typescript
    const city = foundCity(`mc-${def.id}`, pos, state.map, state.idCounters, {
```

`placeMinorCivs` — `createUnit` call (~line 99):
```typescript
    const garrison = createUnit('warrior', `mc-${def.id}`, pos, state.idCounters);
```

`processTurn` ally bonus `createUnit` (~line 241):
```typescript
            const freeUnit = createUnit(def.allyBonus.unitType, civId, spawnCity.position, state.idCounters);
```

Minor civ re-garrison `createUnit` (~line 321):
```typescript
          const garrison = createUnit('warrior', mc.id, city.position, state.idCounters);
```

Guerrilla `createUnit` (~line 393):
```typescript
  const guerrilla = createUnit('warrior', mc.id, city.position, state.idCounters);
```

Minor civ rebuild after barbarian `foundCity` (~line 475):
```typescript
    const city = foundCity(`mc-${def.id}`, camp.position, state.map, state.idCounters, {
```

Rebuild garrison `createUnit` (~line 483):
```typescript
    const garrison = createUnit('warrior', `mc-${def.id}`, camp.position, state.idCounters);
```

`generateQuest` call (~line 199):
```typescript
        const newQuest = generateQuest(def.archetype, mc.id, civId, state.turn, state, rng, state.idCounters);
```

- [ ] **Step 5: Update `src/systems/village-system.ts`** (2 `createUnit` calls)

`visitVillage` takes `state: GameState`, so:

Free unit reward (~line 156):
```typescript
      const newUnit = createUnit(unitType, unit.owner, village.position, state.idCounters);
```

Ambush barbarians (~line 197):
```typescript
        const barbarian = createUnit('warrior', 'barbarian', passable[i], state.idCounters);
```

- [ ] **Step 6: Update `src/systems/faction-system.ts`** (1 `createUnit`)

`spawnRebelUnits(city, state, seed)` takes `state: GameState`:
```typescript
    const rebel = createUnit(unitType, 'rebels', pos, state.idCounters);
```

- [ ] **Step 7: Update `src/systems/espionage-system.ts`** (1 `createUnit`)

`processEspionageTurn(state: GameState, bus)` — the arms_smuggling rebel spawn (~line 1290):
```typescript
              const hostileUnit = createUnit('warrior', 'rebels', pos, state.idCounters);
```

- [ ] **Step 8: Verify build is green**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: `✓ built in ...` with no TypeScript errors.

- [ ] **Step 9: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: test failures only in files that still reference removed symbols (`resetUnitId`, `_resetSpyIdCounter`, etc.) — the new `id-counters.test.ts` should be green.

- [ ] **Step 10: Commit**

```bash
git add src/core/turn-manager.ts src/main.ts src/ai/basic-ai.ts src/systems/minor-civ-system.ts src/systems/village-system.ts src/systems/faction-system.ts src/systems/espionage-system.ts
git commit -m "feat: update all createUnit/foundCity/spawnBarbarianCamp/generateQuest call sites to pass idCounters"
```

---

### Task 6: Remove dead code

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/barbarian-system.ts`
- Modify: `src/systems/quest-system.ts`
- Modify: `src/systems/espionage-system.ts`

- [ ] **Step 1: `src/systems/unit-system.ts`** — remove module var + two exported functions

Delete:
```typescript
let nextUnitId = 1;
```

Delete `resetUnitId()` entirely:
```typescript
export function resetUnitId(): void {
  nextUnitId = 1;
}
```

Delete `syncUnitIdCounter()` entirely:
```typescript
export function syncUnitIdCounter(units: Record<string, unknown>): void {
  ...
}
```

- [ ] **Step 2: `src/systems/city-system.ts`** — remove module var + exported function

Delete:
```typescript
let nextCityId = 1;
```

Delete `resetCityId()` entirely:
```typescript
export function resetCityId(): void {
  nextCityId = 1;
}
```

- [ ] **Step 3: `src/systems/barbarian-system.ts`** — remove module var + exported function

Delete:
```typescript
let nextCampId = 1;
```

Delete `resetCampId()` entirely:
```typescript
export function resetCampId(): void {
  nextCampId = 1;
}
```

- [ ] **Step 4: `src/systems/quest-system.ts`** — remove module var + exported function

Delete:
```typescript
let questIdCounter = 0;
```

Delete `resetQuestId()` entirely:
```typescript
export function resetQuestId(): void {
  questIdCounter = 0;
}
```

- [ ] **Step 5: `src/systems/espionage-system.ts`** — remove dead spy counter

Delete:
```typescript
let nextSpyId = 1;
```

Delete `_resetSpyIdCounter()` entirely:
```typescript
// Reset the ID counter (for testing)
export function _resetSpyIdCounter(): void {
  nextSpyId = 1;
}
```

- [ ] **Step 6: Verify build is still green**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: `✓ built in ...` — no errors.

- [ ] **Step 7: Commit**

```bash
git add src/systems/unit-system.ts src/systems/city-system.ts src/systems/barbarian-system.ts src/systems/quest-system.ts src/systems/espionage-system.ts
git commit -m "refactor: remove module-level ID counter vars and dead reset functions"
```

---

### Task 7: Write `tests/core/migrate-id-counters.test.ts` + update `tests/core/game-state.test.ts`

**Files:**
- Create: `tests/core/migrate-id-counters.test.ts`
- Modify: `tests/core/game-state.test.ts`

- [ ] **Step 1: Create `tests/core/migrate-id-counters.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { scanIdCounters, emptyIdCounters } from '@/core/id-counters';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import type { GameState, IdCounters } from '@/core/types';

// Minimal GameState-shaped fixture for migration tests
function makeOldSave(overrides: Partial<{
  unitIds: string[];
  cityIds: string[];
  campIds: string[];
  questsByMc: Record<string, string[]>;
}> = {}): Pick<GameState, 'units' | 'cities' | 'barbarianCamps' | 'minorCivs'> & { idCounters?: IdCounters } {
  const { unitIds = [], cityIds = [], campIds = [], questsByMc = {} } = overrides;
  return {
    units:          Object.fromEntries(unitIds.map(id => [id, { id } as any])),
    cities:         Object.fromEntries(cityIds.map(id => [id, { id } as any])),
    barbarianCamps: Object.fromEntries(campIds.map(id => [id, { id } as any])),
    minorCivs:      Object.fromEntries(
      Object.entries(questsByMc).map(([mcId, qIds]) => [
        mcId,
        { activeQuests: Object.fromEntries(qIds.map(qId => [qId, { id: qId }])) } as any,
      ]),
    ),
    // No idCounters field — simulates old save
  };
}

describe('migration: old saves without idCounters', () => {
  it('scanIdCounters initialises correct counters from save with units up to unit-50', () => {
    const save = makeOldSave({ unitIds: ['unit-1', 'unit-50', 'unit-23'] });
    const counters = scanIdCounters(save as any);
    expect(counters.nextUnitId).toBe(51);
    expect(counters.nextCityId).toBe(1);
    expect(counters.nextCampId).toBe(1);
    expect(counters.nextQuestId).toBe(1);
  });

  it('new unit after migration does not collide with existing unit IDs', () => {
    const existingIds = ['unit-1', 'unit-2', 'unit-3'];
    const save = makeOldSave({ unitIds: existingIds });
    const counters = scanIdCounters(save as any);
    const newUnit = createUnit('warrior', 'player', { q: 0, r: 0 }, counters);
    expect(existingIds.includes(newUnit.id)).toBe(false);
    expect(newUnit.id).toBe('unit-4');
  });

  it('new city after migration does not collide with existing city IDs', () => {
    const existingIds = ['city-1', 'city-2', 'city-5'];
    const save = makeOldSave({ cityIds: existingIds });
    const counters = scanIdCounters(save as any);
    const map = {
      width: 5, height: 5, wrapsHorizontally: false, rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plains' as const, elevation: 'flat' as any,
                  resource: null, improvement: 'none' as const, improvementTurnsLeft: 0,
                  owner: null, hasRiver: false, wonder: null },
      },
    } as any;
    const newCity = foundCity('player', { q: 0, r: 0 }, map, counters);
    expect(existingIds.includes(newCity.id)).toBe(false);
    expect(newCity.id).toBe('city-6');
  });

  it('new camp after migration does not collide with existing camp IDs', () => {
    const save = makeOldSave({ campIds: ['camp-1', 'camp-2'] });
    const counters = scanIdCounters(save as any);
    expect(counters.nextCampId).toBe(3);
  });

  it('new quest after migration does not collide with existing quest IDs', () => {
    const save = makeOldSave({ questsByMc: { 'mc-a': ['quest-1', 'quest-7'] } });
    const counters = scanIdCounters(save as any);
    expect(counters.nextQuestId).toBe(8);
  });
});

describe('migration: new saves already have idCounters', () => {
  it('idCounters is left unchanged when already present', () => {
    // Simulate the check in migrateLegacySave: if idCounters present, skip scan
    const save = makeOldSave({ unitIds: ['unit-1', 'unit-2'] }) as any;
    save.idCounters = { nextUnitId: 99, nextCityId: 5, nextCampId: 3, nextQuestId: 2 };
    // The guard: if (!save.idCounters) save.idCounters = scanIdCounters(save)
    if (!save.idCounters) save.idCounters = scanIdCounters(save);
    expect(save.idCounters.nextUnitId).toBe(99); // unchanged
  });
});

describe('session isolation: sequential loads do not leak counters', () => {
  it('loading save B after save A uses save B counters, not save A', () => {
    // Save A: units up to unit-100
    const saveA = makeOldSave({ unitIds: Array.from({ length: 100 }, (_, i) => `unit-${i + 1}`) }) as any;
    const countersA = scanIdCounters(saveA);
    expect(countersA.nextUnitId).toBe(101);

    // Save B: units up to unit-3 only (a new game started separately)
    const saveB = makeOldSave({ unitIds: ['unit-1', 'unit-2', 'unit-3'] }) as any;
    const countersB = scanIdCounters(saveB);
    expect(countersB.nextUnitId).toBe(4); // independent of save A

    // Counters are embedded in state — no shared module state bleeds between them
    saveA.idCounters = countersA;
    saveB.idCounters = countersB;
    expect(saveA.idCounters.nextUnitId).toBe(101);
    expect(saveB.idCounters.nextUnitId).toBe(4);
  });
});
```

- [ ] **Step 2: Add `idCounters` assertions to `tests/core/game-state.test.ts`**

Add a new `describe` block at the end of the file:

```typescript
describe('idCounters in createNewGame / createHotSeatGame', () => {
  it('createNewGame returns a state with idCounters present', () => {
    const state = createNewGame(undefined, 'counters-test');
    expect(state.idCounters).toBeDefined();
    expect(typeof state.idCounters.nextUnitId).toBe('number');
    expect(typeof state.idCounters.nextCityId).toBe('number');
    expect(typeof state.idCounters.nextCampId).toBe('number');
    expect(typeof state.idCounters.nextQuestId).toBe('number');
  });

  it('createNewGame counter reflects entities created during setup', () => {
    const state = createNewGame(undefined, 'counters-setup-test');
    const unitCount = Object.keys(state.units).length;
    const cityCount = Object.keys(state.cities).length;
    const campCount = Object.keys(state.barbarianCamps).length;
    // Counters must be strictly greater than the IDs used (nextId = lastUsed + 1)
    expect(state.idCounters.nextUnitId).toBe(unitCount + 1);
    expect(state.idCounters.nextCityId).toBe(cityCount + 1);
    expect(state.idCounters.nextCampId).toBe(campCount + 1);
  });

  it('createHotSeatGame returns a state with idCounters present', () => {
    const state = createHotSeatGame({
      players: [
        { slotId: 'p1', name: 'Alice', isHuman: true, civType: 'generic' },
        { slotId: 'p2', name: 'Bob', isHuman: true, civType: 'generic' },
      ],
      mapSize: 'small',
    });
    expect(state.idCounters).toBeDefined();
    const unitCount = Object.keys(state.units).length;
    expect(state.idCounters.nextUnitId).toBe(unitCount + 1);
  });
});
```

- [ ] **Step 3: Run new tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/core/migrate-id-counters.test.ts tests/core/game-state.test.ts 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/core/migrate-id-counters.test.ts tests/core/game-state.test.ts
git commit -m "test: add migration regression tests and game-state idCounters assertions"
```

---

### Task 8: Clean up old test files

**Files:**
- Delete: `tests/systems/id-reset.test.ts`
- Modify: `tests/systems/playtest-fixes.test.ts`
- Modify: `tests/systems/espionage-system.test.ts`
- Modify: `tests/systems/detection-system.test.ts`
- Modify: `tests/ui/advisor-spymaster.test.ts`
- Modify: `tests/ui/espionage-panel.test.ts`
- Modify: `tests/integration/spy-lifecycle.test.ts`
- Modify: `tests/integration/m4a-espionage-integration.test.ts`
- Modify: `tests/ai/ai-espionage.test.ts`

- [ ] **Step 1: Delete `tests/systems/id-reset.test.ts`**

```bash
rm /Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/fix-pipeline/tests/systems/id-reset.test.ts
```

- [ ] **Step 2: Update `tests/systems/playtest-fixes.test.ts`**

Remove `resetUnitId` from the import. Replace the three `beforeEach(() => resetUnitId())` with a local `IdCounters` approach: add a shared `counters` variable in each `describe` block and pass it to `createUnit`:

In the import line, remove `resetUnitId`:
```typescript
import {
  createUnit, resetUnitTurn, healUnit, restUnit, canHeal,
  getUnmovedUnits, HEAL_PASSIVE, HEAL_RESTING, HEAL_IN_CITY, HEAL_IN_TERRITORY,
} from '@/systems/unit-system';
```

Add IdCounters import:
```typescript
import { emptyIdCounters } from '@/core/id-counters';
import type { IdCounters } from '@/core/types';
```

Replace each `beforeEach(() => resetUnitId())` with a `let counters: IdCounters;` declaration and `beforeEach(() => { counters = emptyIdCounters(); })`.

Update every `createUnit(...)` call in this file to pass `counters` as the 4th argument.

- [ ] **Step 3: Remove `_resetSpyIdCounter` from 7 test files**

For each of the following files, remove:
1. The `_resetSpyIdCounter` from the import line
2. All `_resetSpyIdCounter()` calls (typically in `beforeEach`)

Files:
- `tests/systems/espionage-system.test.ts`
- `tests/systems/detection-system.test.ts`
- `tests/ui/advisor-spymaster.test.ts`
- `tests/ui/espionage-panel.test.ts`
- `tests/integration/spy-lifecycle.test.ts`
- `tests/integration/m4a-espionage-integration.test.ts` (4 call sites)
- `tests/ai/ai-espionage.test.ts`

For `m4a-espionage-integration.test.ts` specifically, grep for all four `_resetSpyIdCounter()` calls and remove each one along with any surrounding empty `beforeEach` block if that was its only content.

- [ ] **Step 4: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -15
```

Expected: all 183+ test files pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add -u tests/
git commit -m "test: delete id-reset.test.ts, remove dead reset calls from 9 test files"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: `✓ built in ...` — 0 TypeScript errors.

- [ ] **Step 2: Full test run**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: all test files pass.

- [ ] **Step 3: Verify dead symbols are completely gone**

```bash
grep -r 'resetUnitId\|resetCityId\|resetCampId\|resetQuestId\|_resetSpyIdCounter\|nextSpyId\|syncUnitIdCounter\|nextUnitId\|nextCityId\|nextCampId\|questIdCounter' \
  /Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/fix-pipeline/src/ \
  /Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/fix-pipeline/tests/ \
  2>/dev/null | grep -v 'node_modules\|id-counters.ts\|id-counters.test.ts\|migrate-id-counters\|game-state.test.ts'
```

Expected: no output (all references gone from src/ and tests/).
