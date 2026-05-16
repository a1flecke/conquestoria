# Spec: Persist ID Counters in GameState

**Date:** 2026-05-16  
**Status:** Approved  
**Fixes:** CI pipeline failure (TS2352 in id-reset.test.ts) + root-cause architectural bug

---

## Problem

Three module-level counters (`nextUnitId`, `nextCityId`, `nextCampId`) live outside
`GameState`. On page reload JavaScript re-initialises every module, resetting all three
to 1. If the player then loads a save whose entities already use IDs 1…N, the next
entity created gets a colliding ID and silently overwrites the existing entry.

The broken commit (`32562a1`) fixed units only via `syncUnitIdCounter()` called from
`startGame()`. Cities and barbarian camps were left vulnerable to the same collision.
`nextSpyId` is dead code — spies inherit unit IDs via `createSpyFromUnit(unitId)`.

---

## Solution

Move all three counters into `GameState` as the field `idCounters: IdCounters`.
Creation functions accept `counters: IdCounters` as a required parameter and mutate it
(`counters.nextUnitId++`). Old saves are migrated on first load via the existing
`migrateLegacySave()` mechanism.

---

## Data Model

### New interface — `src/core/types.ts`

```typescript
export interface IdCounters {
  nextUnitId: number;
  nextCityId: number;
  nextCampId: number;
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
site — the compiler is the safety net.

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
```

Every call site passes `gameState.idCounters` (or `newState.idCounters` in places that
hold a local mutation copy). TypeScript enforces this — missing call sites are build
errors, not runtime surprises.

---

## Initialization

### New games (`createNewGame`, `createHotSeatGame`)

The four `reset*()` calls are removed. The returned `GameState` object includes:

```typescript
idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1 },
```

Because `createNewGame` builds initial units and cities using the counter as it
constructs state, the counter values in the returned object correctly reflect all
entities created during setup.

### Loaded games — migration

`migrateLegacySave()` gains a guard at the top:

```typescript
if (!gameState.idCounters) {
  gameState.idCounters = scanIdCounters(gameState);
}
```

`scanIdCounters` lives in a new `src/core/id-counters.ts` module (exported so tests can import it directly):

```typescript
function scanIdCounters(state: GameState): IdCounters {
  let maxUnit = 0, maxCity = 0, maxCamp = 0;
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
  return {
    nextUnitId: maxUnit + 1,
    nextCityId: maxCity + 1,
    nextCampId: maxCamp + 1,
  };
}
```

Runs once per old save. Subsequent loads find `idCounters` present and skip the scan.

### `startGame()` cleanup

The `syncUnitIdCounter(gameState.units)` call added by the broken commit is removed —
migration now covers all three counters before `startGame()` runs.

---

## Dead Code Removal

| Symbol | File | Action |
|---|---|---|
| `let nextUnitId` | `unit-system.ts` | Remove |
| `resetUnitId()` | `unit-system.ts` | Remove |
| `syncUnitIdCounter()` | `unit-system.ts` | Remove |
| `let nextCityId` | `city-system.ts` | Remove |
| `resetCityId()` | `city-system.ts` | Remove |
| `let nextCampId` | `barbarian-system.ts` | Remove |
| `resetCampId()` | `barbarian-system.ts` | Remove |
| `let nextSpyId` | `espionage-system.ts` | Remove (never incremented) |
| `_resetSpyIdCounter()` | `espionage-system.ts` | Remove |
| `_resetSpyIdCounter()` callers | `game-state.ts` ×2 | Remove |

---

## Testing

### `tests/systems/id-counters.test.ts` (new)

Unit tests for counter mutation — no `beforeEach` module resets, each test builds its
own `IdCounters` object:

1. `createUnit` increments `counters.nextUnitId` and embeds the ID
2. `foundCity` increments `counters.nextCityId` and embeds the ID
3. `spawnBarbarianCamp` increments `counters.nextCampId` and embeds the ID
4. Starting counter value is used verbatim — counter at 5 yields `unit-5`
5. Two independent `IdCounters` objects don't interfere
6. Multiple creations with the same counters object yield sequential, non-colliding IDs
7. `scanIdCounters` on empty state returns `{ 1, 1, 1 }`
8. `scanIdCounters` finds the maximum (not count) across non-sequential IDs
9. `scanIdCounters` ignores IDs that don't match `unit-N` / `city-N` / `camp-N`
10. `scanIdCounters` handles gaps (e.g. `unit-3`, `unit-847` → next is 848)

### `tests/core/migrate-id-counters.test.ts` (new)

Migration regression tests — use a minimal `GameState`-shaped fixture:

1. Old save (no `idCounters`) → migration adds correct counters from scan
2. New save (has `idCounters`) → migration leaves them unchanged
3. After migration, new unit ID never collides with any existing unit ID
4. After migration, new city ID never collides with any existing city ID
5. After migration, new camp ID never collides with any existing camp ID
6. Two sequential in-session loads: load save A (high IDs), then load save B (lower IDs)
   → save B counters come from save B's `idCounters`, not leaked from save A

### `tests/core/game-state.test.ts` (updated or new assertions)

1. `createNewGame` returns `GameState` with `idCounters` present
2. `createNewGame` counter values satisfy: `nextUnitId` = (units created during setup) + 1, `nextCityId` = (cities founded during setup) + 1, `nextCampId` = (camps spawned during setup) + 1
3. `createHotSeatGame` same assertions

### Existing tests

All 183 test files are expected to continue passing. The compiler enforces every
`createUnit` / `foundCity` / `spawnBarbarianCamp` call site — missing `counters`
arguments are build errors. Tests that previously called `resetUnitId()` etc. are
rewritten to use local `IdCounters` objects.

---

## Future-Proofing

When adding a new ID-generating system, the checklist is:

1. Add the field to `IdCounters` — TypeScript immediately flags every creation site and
   every `GameState` literal that doesn't include it
2. Add the regex scan in `scanIdCounters` — enforced by a comment marking the scan as
   the migration contract
3. Set the initial value in `createNewGame` and `createHotSeatGame` — TypeScript flags
   these too because `idCounters` is required
4. Accept `counters: IdCounters` in the creation function

Steps 1 and 3 are compiler-enforced. Step 2 requires human discipline; the comment in
`scanIdCounters` makes this expectation explicit.

---

## Module-Level Mutable State Audit

All `src/systems/*.ts` and `src/core/*.ts` will be scanned for `let` variables at
module scope that are mutated during gameplay but not serialised into `GameState`. Any
found will be called out in the PR. Known clean examples (intentionally ephemeral):
audio context, render loop, sprite cache.

---

## Files Touched

| File | Change |
|---|---|
| `src/core/types.ts` | Add `IdCounters` interface; add `idCounters` to `GameState` |
| `src/systems/unit-system.ts` | Remove module var + resets; add `counters` param |
| `src/systems/city-system.ts` | Remove module var + resets; add `counters` param |
| `src/systems/barbarian-system.ts` | Remove module var + resets; add `counters` param |
| `src/systems/espionage-system.ts` | Remove dead `nextSpyId` + `_resetSpyIdCounter` |
| `src/core/game-state.ts` | Remove reset calls; add `idCounters` to initial state; pass counters to creation calls |
| `src/core/turn-manager.ts` | Pass `newState.idCounters` to `createUnit` |
| `src/core/id-counters.ts` | New module — `IdCounters` helpers: `scanIdCounters`, `emptyIdCounters` |
| `src/main.ts` | Remove `syncUnitIdCounter` from `startGame`; add migration guard; pass `gameState.idCounters` to creation calls |
| `src/ai/basic-ai.ts` | Pass counters to `createUnit` / `foundCity` |
| `src/systems/village-system.ts` | Pass counters to `createUnit` |
| `src/systems/faction-system.ts` | Pass counters to `createUnit` |
| `src/systems/minor-civ-system.ts` | Pass counters to `createUnit` / `foundCity` |
| `tests/systems/id-reset.test.ts` | Rewrite using local `IdCounters` objects |
| `tests/systems/id-counters.test.ts` | New — unit tests for counter mutation |
| `tests/core/migrate-id-counters.test.ts` | New — migration regression tests |
