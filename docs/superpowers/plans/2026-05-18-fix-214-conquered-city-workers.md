# Fix #214: Conquered City Residents Cannot Work Land — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a city is captured, automatically assign its residents to valid worked tiles instead of leaving `workedTiles = []`.

**Architecture:** After `recalculateTerritory()` returns inside `resolveMajorCityCapture()`, call `normalizeCityWorkAfterTerritoryChange(territoryResult.state, cityId)` and pass its updated state to `buildCaptureResult`. This function already handles the reassignment: for automatic city focus it re-runs `assignCityFocus`; for `'custom'` focus it prunes only invalid tiles.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Write a failing test

**Files:**
- Modify: `tests/systems/city-capture-system.test.ts`

The existing test helpers at the top of the file (`makeExposedCityCaptureState`) create a city at `{ q: 1, r: 0 }` owned by `ai-1` with customisable population and buildings. Use them. Note the tile at `{ q: 1, r: 0 }` is owned by `ai-1` and at `{ q: 1, r: 1 }` also.

- [ ] **Step 1: Add this test inside `describe('city-capture-system', ...)`**

```typescript
  it('assigns worked tiles to conquered city residents after occupation', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });

    // Give the city some worked tiles before capture
    state.cities.athens.workedTiles = [{ q: 1, r: 1 }];

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', 1);
    const captured = result.state.cities.athens;

    expect(captured).toBeDefined();
    // Population halves (4 → 2), workers must be reassigned to valid tiles
    expect(captured!.workedTiles.length).toBeGreaterThan(0);
    // Every worked tile must be in the city's ownedTiles
    const ownedKeys = new Set((captured!.ownedTiles ?? []).map(c => `${c.q},${c.r}`));
    for (const worked of captured!.workedTiles) {
      expect(ownedKeys.has(`${worked.q},${worked.r}`)).toBe(true);
    }
    // Workers must not exceed halved population
    expect(captured!.workedTiles.length).toBeLessThanOrEqual(captured!.population);
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-capture-system.test.ts
```

Expected: new test `FAIL`s — `workedTiles.length` is `0` after capture.

---

### Task 2: Apply the fix

**Files:**
- Modify: `src/systems/city-capture-system.ts`

- [ ] **Step 3: Add import for `normalizeCityWorkAfterTerritoryChange`**

At the top of the file, add to the imports:

```typescript
import { normalizeCityWorkAfterTerritoryChange } from '@/systems/city-work-system';
```

- [ ] **Step 4: Update `buildCaptureResult` to accept the cityId and apply work normalization**

Current `buildCaptureResult` (lines 66–82):

```typescript
function buildCaptureResult(
  beforeTerritoryState: GameState,
  territoryResult: TerritoryRecalculationResult,
  outcome: MajorCityCaptureResult['outcome'],
  goldAwarded: number,
): MajorCityCaptureResult {
  return {
    state: territoryResult.state,
    outcome,
    goldAwarded,
    territoryEvents: buildTerritoryTileFlippedEvents(
      beforeTerritoryState,
      territoryResult.state,
      territoryResult.resolutions,
    ),
  };
}
```

Replace with:

```typescript
function buildCaptureResult(
  beforeTerritoryState: GameState,
  territoryResult: TerritoryRecalculationResult,
  outcome: MajorCityCaptureResult['outcome'],
  goldAwarded: number,
  capturedCityId?: string,
): MajorCityCaptureResult {
  const postWorkState = capturedCityId
    ? normalizeCityWorkAfterTerritoryChange(territoryResult.state, capturedCityId).state
    : territoryResult.state;
  return {
    state: postWorkState,
    outcome,
    goldAwarded,
    territoryEvents: buildTerritoryTileFlippedEvents(
      beforeTerritoryState,
      postWorkState,
      territoryResult.resolutions,
    ),
  };
}
```

- [ ] **Step 5: Pass `cityId` at every `buildCaptureResult` call site**

There are three call sites. Update each one to pass `cityId` as the fifth argument:

**Line 127 (reconquer-breakaway path):**
```typescript
    return buildCaptureResult(nextState, territoryResult, 'occupied', 0, cityId);
```

**Line 175 (occupy path):**
```typescript
    return buildCaptureResult(nextState, territoryResult, 'occupied', 0, cityId);
```

**Line ~208 (raze path):**
```typescript
  return buildCaptureResult(nextState, territoryResult, 'razed', goldAwarded, cityId);
```

- [ ] **Step 6: Run the capture-system tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-capture-system.test.ts
```

Expected: all tests `PASS` including the new one.

- [ ] **Step 7: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/systems/city-capture-system.ts tests/systems/city-capture-system.test.ts
git commit -m "fix(capture): reassign city workers after conquest

After recalculateTerritory ran normalizeCityWorkClaims and stripped
stale workers from a conquered city, nothing re-assigned citizens to
the valid tiles now owned by the captor. buildCaptureResult now calls
normalizeCityWorkAfterTerritoryChange for the captured city, which
re-runs assignCityFocus so residents immediately work land again.

Fixes #214"
```
