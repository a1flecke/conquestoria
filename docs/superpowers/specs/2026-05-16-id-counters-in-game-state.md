# Spec: Persist ID Counters in GameState

**Date:** 2026-05-16  
**Status:** Approved  
**Fixes:** CI pipeline failure (TS2352 in id-reset.test.ts) + root-cause architectural bug

---

## Problem

Four module-level counters live outside `GameState`:

| Counter | File | ID format | Stored in |
|---|---|---|---|
| `nextUnitId` | `unit-system.ts` | `unit-N` | `GameState.units` |
| `nextCityId` | `city-system.ts` | `city-N` | `GameState.cities` |
| `nextCampId` | `barbarian-system.ts` | `camp-N` | `GameState.barbarianCamps` |
| `questIdCounter` | `quest-system.ts` | `quest-N` | `GameState.minorCivs[id].activeQuests` |

On page reload JavaScript re-initialises every module, resetting all four counters. If
the player loads a save whose entities already use IDs 1…N, the next entity created gets
a colliding ID and silently overwrites the existing entry.

The broken commit (`32562a1`) fixed units only via `syncUnitIdCounter()` called from
`startGame()`. Cities, barbarian camps, and quests were left vulnerable to the same
collision. Additionally, `questIdCounter` was **never reset** in `createNewGame()` or
`createHotSeatGame()` — so quest IDs were already leaking between in-session game starts.

`nextSpyId` is dead code — spies inherit unit IDs via `createSpyFromUnit(unitId)` and
`nextSpyId` is never incremented. It is removed without replacement.

---

## Solution

Move all four counters into `GameState` as the field `idCounters: IdCounters`.
Creation functions accept `counters: IdCounters` as a required parameter and mutate it.
Old saves are migrated on first load via the existing `migrateLegacySave()` mechanism.

---

## Data Model

### New interface — `src/core/types.ts`

```typescript
export interface IdCounters {
  nextUnitId:  number;
  nextCityId:  number;
  nextCampId:  number;
  nextQuestId: number;
}
```

Added to `GameState` as a **required** field:

```typescript
export interface GameState {
  // ...existing fields unchanged...
  idCounters: IdCounters;
}
```

Required (not optional) so TypeScript enforces it at every `GameState` construction
site — the compiler is the safety net. Old saves lack this field in JSON; TypeScript
does not validate JSON at parse time, so `idCounters` will be `undefined` on a
freshly-loaded old save. `migrateLegacySave()` must run before any ID-generating
operation post-load (this is already the case — see Initialization).

---

## Function Signatures

`counters` is inserted before existing optional parameters so no overloads are needed.

```typescript
// unit-system.ts
createUnit(type, owner, position, counters: IdCounters, bonusEffect?)

// city-system.ts
foundCity(owner, position, map, counters: IdCounters, options?)

// barbarian-system.ts
spawnBarbarianCamp(map, occupiedPositions, existingCamps, seed, counters: IdCounters)

// quest-system.ts
generateQuest(archetype, minorCivId, majorCivId, currentTurn, state, rng, counters: IdCounters)
```

Every call site passes `gameState.idCounters` (or `newState.idCounters` in places that
hold a local mutation copy). TypeScript enforces this — missing call sites are build
errors, not runtime surprises.

The body of each function replaces its module counter reference with the parameter:

```typescript
// Before: id: `unit-${nextUnitId++}`
// After:  id: `unit-${counters.nextUnitId++}`

// Before: questIdCounter++; id: `quest-${questIdCounter}`
// After:  id: `quest-${counters.nextQuestId++}`   // normalised to post-increment
```

---

## New Module — `src/core/id-counters.ts`

Houses the two exported helpers tests and migration both need:

```typescript
import type { GameState, IdCounters } from './types';

/** Return a fresh counter set for a brand-new game (before any entities are created). */
export function emptyIdCounters(): IdCounters {
  return { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
}

/**
 * Reconstruct IdCounters from an existing GameState by scanning entity IDs.
 * Used once by migrateLegacySave() for saves predating this field.
 *
 * EXTENSION CONTRACT: when adding a new counter to IdCounters, add a matching
 * scan block here so old saves are migrated correctly.
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

Using `Pick<GameState, ...>` rather than the full `GameState` keeps the function
testable with minimal fixtures.

---

## Initialization

### New games (`createNewGame`, `createHotSeatGame`)

The four `reset*()` calls are removed. The returned `GameState` object is initialised
with `idCounters: emptyIdCounters()` **before** any entities are created. Because
`createUnit`, `foundCity`, `spawnBarbarianCamp`, and `generateQuest` all mutate
`state.idCounters` via reference as they run, the counters in the returned object
correctly reflect the post-setup high-water mark.

```typescript
// Early in createNewGame, before entity creation:
const state: GameState = {
  ...
  idCounters: emptyIdCounters(),   // { nextUnitId: 1, nextCityId: 1, ... }
  units: {},
  cities: {},
  ...
};

// Then all creation calls pass state.idCounters:
const settler = createUnit('settler', civId, pos, state.idCounters);
// → state.idCounters.nextUnitId is now 2
state.units[settler.id] = settler;
// ... by the time createNewGame returns, counters reflect all setup entities
```

### Loaded games — migration

`migrateLegacySave()` gains a guard **at the very top**, before any other migration
logic touches game state:

```typescript
if (!gameState.idCounters) {
  gameState.idCounters = scanIdCounters(gameState);
}
```

This runs once per old save. Subsequent loads find `idCounters` present in the
serialised JSON and skip the scan entirely. Because migration always runs before
`startGame()` — and `startGame()` is the earliest point at which ID-generating
operations can occur — there is no window where `idCounters` is undefined while
game code runs.

### `startGame()` cleanup

The `syncUnitIdCounter(gameState.units)` call added by the broken commit is removed —
`migrateLegacySave()` now covers all four counters before `startGame()` runs.

---

## Dead Code Removal

| Symbol | File | Reason |
|---|---|---|
| `let nextUnitId` | `unit-system.ts` | Replaced by `counters.nextUnitId` |
| `resetUnitId()` | `unit-system.ts` | No callers remain |
| `syncUnitIdCounter()` | `unit-system.ts` | Replaced by `scanIdCounters` |
| `let nextCityId` | `city-system.ts` | Replaced by `counters.nextCityId` |
| `resetCityId()` | `city-system.ts` | No callers remain |
| `let nextCampId` | `barbarian-system.ts` | Replaced by `counters.nextCampId` |
| `resetCampId()` | `barbarian-system.ts` | No callers remain |
| `let questIdCounter` | `quest-system.ts` | Replaced by `counters.nextQuestId` |
| `resetQuestId()` | `quest-system.ts` | Never called; no callers remain |
| `let nextSpyId` | `espionage-system.ts` | Never incremented (dead code) |
| `_resetSpyIdCounter()` | `espionage-system.ts` | Resets a counter never used |
| `_resetSpyIdCounter()` callers | `game-state.ts` ×2 | Dead with above |

---

## Testing

### `tests/systems/id-counters.test.ts` (new — replaces id-reset.test.ts)

All tests use local `IdCounters` objects. No `beforeEach` module resets. No shared
state between tests.

**Counter mutation (createUnit / foundCity / spawnBarbarianCamp / generateQuest):**
1. `createUnit` uses `counters.nextUnitId`, increments it, embeds the result in the ID
2. `foundCity` uses `counters.nextCityId`, increments it
3. `spawnBarbarianCamp` uses `counters.nextCampId`, increments it
4. `generateQuest` uses `counters.nextQuestId`, increments it
5. Starting value is used verbatim — counter at 5 yields `unit-5`
6. Two independent `IdCounters` objects don't interfere with each other
7. Multiple sequential creations with the same counters object yield non-colliding IDs

**`scanIdCounters`:**
8. Empty state returns `{ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }`
9. Finds the maximum across non-sequential IDs (e.g. `unit-3`, `unit-847` → next is 848)
10. Ignores IDs that don't match the expected `type-N` pattern
11. Scans quests nested inside `minorCivs[id].activeQuests`
12. Two independent calls on different states return independent results

### `tests/core/migrate-id-counters.test.ts` (new)

Uses a minimal `GameState`-shaped fixture (only the fields `scanIdCounters` needs).

1. Old save (no `idCounters`) → `migrateLegacySave` adds correct counters from scan
2. New save (has `idCounters`) → `migrateLegacySave` leaves them unchanged (no re-scan)
3. After migration of old save: new unit ID doesn't collide with any existing unit ID
4. After migration of old save: new city ID doesn't collide with any existing city ID
5. After migration of old save: new camp ID doesn't collide with any existing camp ID
6. After migration of old save: new quest ID doesn't collide with any existing quest ID
7. Two sequential in-session loads: load save A (high IDs), load save B (lower IDs) →
   save B's `idCounters` come from save B's serialised data, not leaked from save A

### `tests/core/game-state.test.ts` (updated)

1. `createNewGame` returns `GameState` with `idCounters` present and all fields ≥ 1
2. `createNewGame` counters are consistent with entities in the returned state:
   `nextUnitId` = (count of units created during setup) + 1, same pattern for city/camp/quest
3. `createHotSeatGame` same assertions

### Existing tests — cleanup required

The following test files import removed symbols and must be updated. For `_resetSpyIdCounter`
callers: remove the import and all `beforeEach`/inline calls (they were no-ops since
`nextSpyId` was never incremented). For `resetUnitId` callers: replace
`beforeEach(() => resetUnitId())` with a locally-scoped `IdCounters` object passed to
`createUnit`.

| Test file | Symbol to remove | Action |
|---|---|---|
| `tests/systems/id-reset.test.ts` | `resetUnitId`, `resetCityId`, `resetCampId`, `_resetSpyIdCounter`, `syncUnitIdCounter` | Delete file; superseded by `id-counters.test.ts` |
| `tests/systems/playtest-fixes.test.ts` | `resetUnitId` | Replace `beforeEach` reset with local `IdCounters` |
| `tests/systems/espionage-system.test.ts` | `_resetSpyIdCounter` | Remove import + calls |
| `tests/systems/detection-system.test.ts` | `_resetSpyIdCounter` | Remove import + calls |
| `tests/ui/advisor-spymaster.test.ts` | `_resetSpyIdCounter` | Remove import + calls |
| `tests/ui/espionage-panel.test.ts` | `_resetSpyIdCounter` | Remove import + calls |
| `tests/integration/spy-lifecycle.test.ts` | `_resetSpyIdCounter` | Remove import + calls |
| `tests/integration/m4a-espionage-integration.test.ts` | `_resetSpyIdCounter` | Remove import + calls (4 sites) |
| `tests/ai/ai-espionage.test.ts` | `_resetSpyIdCounter` | Remove import + calls |

---

## Future-Proofing

When adding a new ID-generating system, the checklist is:

1. Add the field to `IdCounters` — TypeScript immediately flags every `GameState`
   literal and every creation call site that doesn't include it
2. Add a scan block in `scanIdCounters` in `id-counters.ts` — the `EXTENSION CONTRACT`
   comment marks this as a required step
3. Set the initial value in `emptyIdCounters()` — TypeScript flags this too
4. Accept `counters: IdCounters` in the creation function

Steps 1, 3, and 4 are compiler-enforced. Step 2 requires human discipline; the
`EXTENSION CONTRACT` comment in `scanIdCounters` makes the expectation explicit.

---

## Module-Level Mutable State Audit

All `src/systems/*.ts` and `src/core/*.ts` will be scanned during implementation for
`let` variables at module scope that are mutated during gameplay but not serialised into
`GameState`. Any found beyond the four counters addressed here will be called out in the
PR. Known clean examples (intentionally ephemeral): audio context, render loop, sprite
cache.

---

## Files Touched

| File | Change |
|---|---|
| `src/core/types.ts` | Add `IdCounters` interface; add `idCounters: IdCounters` to `GameState` |
| `src/core/id-counters.ts` | **New** — exports `emptyIdCounters()` and `scanIdCounters()` |
| `src/systems/unit-system.ts` | Remove module var + `resetUnitId` + `syncUnitIdCounter`; add `counters` param to `createUnit` |
| `src/systems/city-system.ts` | Remove module var + `resetCityId`; add `counters` param to `foundCity` |
| `src/systems/barbarian-system.ts` | Remove module var + `resetCampId`; add `counters` param to `spawnBarbarianCamp` |
| `src/systems/quest-system.ts` | Remove module var + `resetQuestId`; add `counters` param to `generateQuest`; normalise to post-increment |
| `src/systems/espionage-system.ts` | Remove dead `nextSpyId` + `_resetSpyIdCounter`; add `counters` param to `createUnit` call |
| `src/core/game-state.ts` | Remove all `reset*` calls; initialise `idCounters: emptyIdCounters()`; pass `state.idCounters` to all creation calls |
| `src/core/turn-manager.ts` | Pass `newState.idCounters` to `createUnit` (2 call sites) |
| `src/main.ts` | Remove `syncUnitIdCounter` import + call from `startGame`; add `scanIdCounters` migration guard to `migrateLegacySave`; pass `gameState.idCounters` to `createUnit` / `foundCity` call sites (3 sites) |
| `src/ai/basic-ai.ts` | Pass `newState.idCounters` to `createUnit` + `foundCity` |
| `src/systems/village-system.ts` | Pass counters to `createUnit` (2 call sites) |
| `src/systems/faction-system.ts` | Pass counters to `createUnit` |
| `src/systems/minor-civ-system.ts` | Pass counters to `createUnit` (4 sites), `foundCity` (2 sites), `generateQuest` (1 site) |
| `tests/systems/id-reset.test.ts` | **Delete** — superseded by `id-counters.test.ts` |
| `tests/systems/id-counters.test.ts` | **New** — counter mutation + `scanIdCounters` unit tests |
| `tests/core/migrate-id-counters.test.ts` | **New** — migration regression tests |
| `tests/systems/playtest-fixes.test.ts` | Replace `resetUnitId` with local `IdCounters` |
| `tests/systems/espionage-system.test.ts` | Remove `_resetSpyIdCounter` import + calls |
| `tests/systems/detection-system.test.ts` | Remove `_resetSpyIdCounter` import + calls |
| `tests/ui/advisor-spymaster.test.ts` | Remove `_resetSpyIdCounter` import + calls |
| `tests/ui/espionage-panel.test.ts` | Remove `_resetSpyIdCounter` import + calls |
| `tests/integration/spy-lifecycle.test.ts` | Remove `_resetSpyIdCounter` import + calls |
| `tests/integration/m4a-espionage-integration.test.ts` | Remove `_resetSpyIdCounter` import + calls (4 sites) |
| `tests/ai/ai-espionage.test.ts` | Remove `_resetSpyIdCounter` import + calls |
