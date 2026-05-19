# Fix #215: Encounter Fires Through Fog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix first-contact detection so it only fires when a rival's city or territory is *currently visible*, not merely fogged from a past visit.

**Architecture:** One private function change in `discovery-system.ts` — move `viewerVis` capture earlier and replace three `hasExploredCoord` calls with `getVisibility(viewerVis, coord) === 'visible'`. One existing test and its description need minor updates.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Add a failing negative test

**Files:**
- Modify: `tests/systems/discovery-system.test.ts`

The current test at line 13 ("treats a civ as met after one of its city tiles has been explored") passes because the fixture uses a *breakaway* civ — the breakaway-origin check fires first and is unaffected by our change. We need a separate test that exercises the fog path directly and will fail before the fix.

- [ ] **Step 1: Append this test to `tests/systems/discovery-system.test.ts`** (inside the `describe('discovery-system', ...)` block, before the closing `}`):

```typescript
  it('does not treat a rival as met when their city tile is only in fog, not currently visible', () => {
    const { state } = makeBreakawayFixture({ includeThirdCiv: true });

    // Set up outsider city at q:6,r:0 owned by 'outsider'
    state.cities['outsider-city'] = {
      ...state.cities['city-border'],
      id: 'outsider-city',
      owner: 'outsider',
      name: 'Outsider Camp',
      position: { q: 6, r: 0 },
      ownedTiles: [{ q: 6, r: 0 }, { q: 6, r: 1 }],
    };
    state.civilizations.outsider.cities = ['outsider-city'];
    state.map.tiles['6,0'] = {
      ...state.map.tiles['4,0'],
      coord: { q: 6, r: 0 },
      owner: 'outsider',
    };
    state.map.tiles['6,1'] = {
      ...state.map.tiles['4,0'],
      coord: { q: 6, r: 1 },
      owner: 'outsider',
    };
    state.civilizations.player.knownCivilizations = [];
    state.civilizations.outsider.knownCivilizations = [];

    // Player explored the tile in the past — it is fogged, not currently visible
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';

    const contacts = syncCivilizationContactsFromVisibility(state, 'player');

    expect(contacts).toEqual([]);
    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(false);
  });
```

- [ ] **Step 2: Run the new test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/discovery-system.test.ts
```

Expected: the new test `FAIL`s — `hasMetCivilization` returns `true` (current buggy behaviour).

---

### Task 2: Fix `hasMetCivilizationByCurrentEvidence`

**Files:**
- Modify: `src/systems/discovery-system.ts` (lines 90–128)

- [ ] **Step 3: Replace the function body**

Current code (lines 90–128):

```typescript
function hasMetCivilizationByCurrentEvidence(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  if (target.breakaway?.originOwnerId === viewerCivId) return true;
  if (viewer.breakaway?.originOwnerId === targetCivId) return true;

  if (viewer.diplomacy.atWarWith.includes(targetCivId)) return true;
  if (viewer.diplomacy.treaties.some(t => t.civA === targetCivId || t.civB === targetCivId)) return true;

  const targetCities = target.cities
    .map(cityId => state.cities[cityId])
    .filter((city): city is NonNullable<typeof city> => Boolean(city));
  for (const city of targetCities) {
    if (hasExploredCoord(state, viewerCivId, city.position)) {
      return true;
    }
    if (city.ownedTiles.some(coord => hasExploredCoord(state, viewerCivId, coord))) {
      return true;
    }
  }

  const viewerVis = viewer.visibility;
  for (const unitId of target.units) {
    const unit = state.units[unitId];
    if (!unit) continue;
    if (getVisibility(viewerVis, unit.position) === 'visible') {
      return true;
    }
  }

  const targetTileKeys = Object.values(state.map.tiles)
    .filter(tile => tile.owner === targetCivId)
    .map(tile => hexKey(tile.coord));
  return targetTileKeys.some(key => {
    const coord = state.map.tiles[key]?.coord;
    return coord ? hasExploredCoord(state, viewerCivId, coord) : false;
  });
}
```

Replace with:

```typescript
function hasMetCivilizationByCurrentEvidence(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  if (target.breakaway?.originOwnerId === viewerCivId) return true;
  if (viewer.breakaway?.originOwnerId === targetCivId) return true;

  if (viewer.diplomacy.atWarWith.includes(targetCivId)) return true;
  if (viewer.diplomacy.treaties.some(t => t.civA === targetCivId || t.civB === targetCivId)) return true;

  const viewerVis = viewer.visibility;

  const targetCities = target.cities
    .map(cityId => state.cities[cityId])
    .filter((city): city is NonNullable<typeof city> => Boolean(city));
  for (const city of targetCities) {
    if (getVisibility(viewerVis, city.position) === 'visible') {
      return true;
    }
    if (city.ownedTiles.some(coord => getVisibility(viewerVis, coord) === 'visible')) {
      return true;
    }
  }

  for (const unitId of target.units) {
    const unit = state.units[unitId];
    if (!unit) continue;
    if (getVisibility(viewerVis, unit.position) === 'visible') {
      return true;
    }
  }

  const targetTileKeys = Object.values(state.map.tiles)
    .filter(tile => tile.owner === targetCivId)
    .map(tile => hexKey(tile.coord));
  return targetTileKeys.some(key => {
    const coord = state.map.tiles[key]?.coord;
    return coord ? getVisibility(viewerVis, coord) === 'visible' : false;
  });
}
```

- [ ] **Step 4: Run all discovery-system tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/discovery-system.test.ts
```

Expected: all tests `PASS` including the new negative test.

- [ ] **Step 5: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/systems/discovery-system.ts tests/systems/discovery-system.test.ts
git commit -m "fix(discovery): require current visibility for first-contact, not just fog

hasMetCivilizationByCurrentEvidence previously accepted fog-covered
tiles as evidence of meeting a civ. Players could encounter a rival
solely because they had once walked past a tile that the rival later
claimed — without ever seeing the rival's actual units or cities.

Moves viewerVis capture before the city-check loop and replaces all
three hasExploredCoord calls with getVisibility === 'visible'.

Fixes #215"
```
