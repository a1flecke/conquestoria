# Resource Accessibility MR 1 — Map Gen + Settler Cost

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make special resources more likely to exist near each player's starting area, and reduce the early-game cost of founding a second city, so players have shorter paths to resources in the first 20 turns.

**Architecture:** Two independent changes — (1) raise the global resource probability constant from 0.15 to 0.20 and add a new `guaranteeStartResources()` function called from both single-player and hot-seat game creation after start positions are known, (2) lower settler production cost for era 1 and 2. Both are data-only changes with no new UI. All RNG uses seeded `createRng` — map seeds remain reproducible.

**Tech Stack:** TypeScript, vitest. No canvas, no DOM.

---

## Files

- Modify: `src/systems/map-generator.ts` — raise constant, add `guaranteeStartResources`
- Modify: `src/core/game-state.ts` — call `guaranteeStartResources` in `createNewGame` and `createHotSeatGame` after `findStartPositions`
- Modify: `src/systems/city-system.ts:247–253` — update `SETTLER_COST_BY_ERA`
- Modify: `tests/systems/map-generator.test.ts` — 5 new tests
- Modify: `tests/systems/city-system.test.ts` — add/update settler cost assertions for eras 1 and 2
- Modify: `tests/systems/production-costs.test.ts` — update canonical cost/catalog/discount expectations
- Modify: `tests/systems/pacing-audit.test.ts` — update era 1 settler audit expectation
- Modify: `tests/ui/city-panel.test.ts` — update player-visible settler cost and queue ETA expectations
- Modify: `tests/core/game-state.test.ts` — add single-player and hot-seat wiring regressions
- Create: `tests/core/game-state-resource-guarantee.test.ts` — spy on both game creation paths calling `guaranteeStartResources`

---

### Task 1: Raise resource probability and lower settler costs

Write the regression tests first, then make the one-line constant changes.

**Files:**
- Modify: `src/systems/map-generator.ts:211`
- Modify: `src/systems/city-system.ts:248–249`

- [ ] **Step 1: Add explicit settler-cost regression tests**

In `tests/systems/city-system.test.ts`, import `getSettlerProductionCost` from `@/systems/city-system` if it is not already imported. Add or update tests that assert:

```typescript
expect(getSettlerProductionCost(1)).toBe(16);
expect(getSettlerProductionCost(2)).toBe(24);
expect(getSettlerProductionCost(3)).toBe(40);
```

Run:
```bash
bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts tests/systems/production-costs.test.ts
```
Expected before implementation: FAIL because era 1 still costs 24 and era 2 still costs 32.

- [ ] **Step 2: Edit `DEFAULT_RESOURCE_PROBABILITY`**

In `src/systems/map-generator.ts`, change:
```typescript
const DEFAULT_RESOURCE_PROBABILITY = 0.15;
```
to:
```typescript
const DEFAULT_RESOURCE_PROBABILITY = 0.20;
```

- [ ] **Step 3: Edit `SETTLER_COST_BY_ERA`**

In `src/systems/city-system.ts`, change:
```typescript
export const SETTLER_COST_BY_ERA: Record<number, number> = {
  1: 24,
  2: 32,
  3: 40,
  4: 48,
  5: 56,
};
```
to:
```typescript
export const SETTLER_COST_BY_ERA: Record<number, number> = {
  1: 16,
  2: 24,
  3: 40,
  4: 48,
  5: 56,
};
```

- [ ] **Step 4: Verify city-system tests pass**

Run:
```bash
bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts tests/systems/production-costs.test.ts tests/systems/pacing-audit.test.ts tests/ui/city-panel.test.ts
```
Expected: All city-system tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/map-generator.ts src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(resources): raise resource probability 0.15→0.20, lower era 1-2 settler costs"
```

---

### Task 2: Write failing tests for `guaranteeStartResources`

Write the tests first; the function does not exist yet, so these must fail.

**Files:**
- Modify: `tests/systems/map-generator.test.ts`

- [ ] **Step 1: Add the test suite**

Fold these additions into the existing imports at the top of `tests/systems/map-generator.test.ts` instead of adding duplicate imports at the bottom. Add `guaranteeStartResources` to the existing `@/systems/map-generator` import, and add `HexCoord` to the existing type import. Then add the suite at the bottom of the file:

```typescript
const LUXURY_IDS = new Set(RESOURCE_DEFINITIONS.filter(d => d.type === 'luxury').map(d => d.id));
const STRATEGIC_IDS = new Set(RESOURCE_DEFINITIONS.filter(d => d.type === 'strategic').map(d => d.id));

describe('guaranteeStartResources', () => {
  function makeSmallMap(): GameMap {
    // 20×20 procedural map — large enough to test radius 5 guarantees
    return generateMap(20, 20, 'guarantee-test-seed');
  }

  it('places at least one luxury resource within radius 5 of each start (positive)', () => {
    const map = makeSmallMap();
    // Strip all resources first so we control the scenario
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }, { q: 15, r: 15 }];
    const rng = createRng('guarantee-luxury-test');
    guaranteeStartResources(map, starts, rng);

    for (const start of starts) {
      const neighborhood: string[] = [];
      for (let dq = -5; dq <= 5; dq++) {
        for (let dr = -5; dr <= 5; dr++) {
          if (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) <= 10) { // axial radius
            neighborhood.push(hexKey({ q: start.q + dq, r: start.r + dr }));
          }
        }
      }
      const hasLuxury = neighborhood.some(k => {
        const tile = map.tiles[k];
        return tile?.resource && LUXURY_IDS.has(tile.resource);
      });
      expect(hasLuxury).toBe(true);
    }
  });

  it('places at least one strategic resource within radius 5 of each start (positive)', () => {
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }, { q: 15, r: 15 }];
    const rng = createRng('guarantee-strategic-test');
    guaranteeStartResources(map, starts, rng);

    for (const start of starts) {
      const neighborhood: string[] = [];
      for (let dq = -5; dq <= 5; dq++) {
        for (let dr = -5; dr <= 5; dr++) {
          if (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) <= 10) {
            neighborhood.push(hexKey({ q: start.q + dq, r: start.r + dr }));
          }
        }
      }
      const hasStrategic = neighborhood.some(k => {
        const tile = map.tiles[k];
        return tile?.resource && STRATEGIC_IDS.has(tile.resource);
      });
      expect(hasStrategic).toBe(true);
    }
  });

  it('does not overwrite existing resources', () => {
    const map = makeSmallMap();
    // Place a known resource and record its key
    const start: HexCoord = { q: 5, r: 5 };
    const nearKey = hexKey({ q: 5, r: 6 });
    const nearTile = map.tiles[nearKey];
    expect(nearTile).toBeDefined();
    nearTile.terrain = 'grassland';
    nearTile.resource = 'silk';

    const resourcesBefore = Object.fromEntries(
      Object.entries(map.tiles).map(([k, t]) => [k, t.resource]),
    );
    const rng = createRng('no-overwrite-test');
    guaranteeStartResources(map, [start], rng);

    for (const [k, originalResource] of Object.entries(resourcesBefore)) {
      if (originalResource !== null) {
        expect(map.tiles[k].resource).toBe(originalResource);
      }
    }
  });

  it('is deterministic: same seed produces same result', () => {
    const map1 = makeSmallMap();
    const map2 = makeSmallMap();
    for (const tile of Object.values(map1.tiles)) tile.resource = null;
    for (const tile of Object.values(map2.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }];

    guaranteeStartResources(map1, starts, createRng('determinism-test'));
    guaranteeStartResources(map2, starts, createRng('determinism-test'));

    for (const k of Object.keys(map1.tiles)) {
      expect(map1.tiles[k].resource).toBe(map2.tiles[k].resource);
    }
  });

  it('does not crash or loop when no eligible terrain exists within radius 5', () => {
    // Create a tiny all-ocean map — no eligible land tiles
    const map = generateMap(8, 8, 'ocean-test-seed');
    for (const tile of Object.values(map.tiles)) {
      tile.resource = null;
      tile.terrain = 'ocean'; // force all ocean
    }
    const start: HexCoord = { q: 4, r: 4 };
    const rng = createRng('ocean-test');
    expect(() => guaranteeStartResources(map, [start], rng)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail (function not yet exported)**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/systems/map-generator.test.ts
```
Expected: Tests fail because `guaranteeStartResources` is not exported yet.

---

### Task 3: Implement `guaranteeStartResources` and wire into `game-state.ts`

**Files:**
- Modify: `src/systems/map-generator.ts` — add `guaranteeStartResources` and helper
- Modify: `src/core/game-state.ts` — add calls in `createNewGame` and `createHotSeatGame`
- Modify: `tests/core/game-state.test.ts` — add wiring regressions for both creation paths

- [ ] **Step 1: Add `guaranteeStartResources` to `map-generator.ts`**

Add after the `placeResources` function (around line 237), before `isLandTerrain`:

```typescript
/**
 * For each civ start position, guarantee at least one luxury and one strategic
 * resource exists within radius 5. Tiles are never overwritten. If no eligible
 * terrain exists within radius 5, the guarantee is silently skipped.
 *
 * Must be called AFTER findStartPositions() and BEFORE placeWonders().
 * Uses a separate seeded RNG so it does not perturb unrelated generation.
 */
export function guaranteeStartResources(
  map: GameMap,
  startPositions: HexCoord[],
  rng: () => number,
): void {
  const terrainResourceMap = buildTerrainResourceMap();
  const luxuryIds = new Set<ResourceType>(RESOURCE_DEFINITIONS.filter(d => d.type === 'luxury').map(d => d.id));
  const strategicIds = new Set<ResourceType>(RESOURCE_DEFINITIONS.filter(d => d.type === 'strategic').map(d => d.id));

  for (const start of startPositions) {
    const neighborhood = getCandidateNeighborhood(map, start, 5);
    const neighborhoodData = neighborhood
      .map(coord => ({ coord, tile: map.tiles[hexKey(coord)] }))
      .filter((item): item is { coord: HexCoord; tile: HexTile } => !!item.tile);

    const hasLuxury = neighborhoodData.some(({ tile }) =>
      tile.resource !== null && luxuryIds.has(tile.resource),
    );
    if (!hasLuxury) {
      guaranteePlaceResource(neighborhoodData, luxuryIds, terrainResourceMap, start, map, rng);
    }

    const hasStrategic = neighborhoodData.some(({ tile }) =>
      tile.resource !== null && strategicIds.has(tile.resource),
    );
    if (!hasStrategic) {
      guaranteePlaceResource(neighborhoodData, strategicIds, terrainResourceMap, start, map, rng);
    }
  }
}

function guaranteePlaceResource(
  neighborhoodData: Array<{ coord: HexCoord; tile: HexTile }>,
  targetIds: Set<ResourceType>,
  terrainResourceMap: Record<string, ResourceType[]>,
  start: HexCoord,
  map: GameMap,
  rng: () => number,
): void {
  // Eligible: no existing resource, terrain can host a resource from targetIds
  const eligible = neighborhoodData.filter(({ tile }) => {
    if (tile.resource !== null) return false;
    const candidates = terrainResourceMap[tile.terrain] ?? [];
    return candidates.some(r => targetIds.has(r));
  });
  if (eligible.length === 0) return;

  // Assign a stable random tie-breaker per item before sorting
  const keyed = eligible.map(item => ({
    ...item,
    dist: map.wrapsHorizontally
      ? wrappedHexDistance(item.coord, start, map.width)
      : hexDistance(item.coord, start),
    tie: rng(),
  }));
  keyed.sort((a, b) => a.dist !== b.dist ? a.dist - b.dist : a.tie - b.tie);

  const target = keyed[0];
  const candidates = (terrainResourceMap[target.tile.terrain] ?? []).filter(r => targetIds.has(r));
  if (candidates.length === 0) return;
  target.tile.resource = candidates[Math.floor(rng() * candidates.length)];
}
```

- [ ] **Step 2: Wire the call in `game-state.ts`**

In `src/core/game-state.ts`, add one import and call the helper in both creation paths just before `placeWonders`.

Add to the imports at the top of `game-state.ts`:
```typescript
import {
  generateMap, findStartPositions, createRng, /* ... existing ... */
  guaranteeStartResources,
} from '@/systems/map-generator';
```

Then, right before `placeWonders(map, startPositions, actualSize, gameSeed);` (line 175), insert:
```typescript
  // Guarantee each civ has at least one luxury and one strategic resource within
  // radius 5. Runs after start positions are known; uses its own seeded RNG.
  guaranteeStartResources(map, startPositions, createRng(gameSeed + '-resource-guarantee'));
```

The resulting block looks like:
```typescript
  // Place wonders and villages
  guaranteeStartResources(map, startPositions, createRng(gameSeed + '-resource-guarantee'));
  placeWonders(map, startPositions, actualSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, actualSize, gameSeed);
```

Repeat the same call before the hot-seat `placeWonders(map, startPositions, config.mapSize, gameSeed);` call in `createHotSeatGame`.

- [ ] **Step 3: Add game creation wiring regressions**

In `tests/core/game-state.test.ts`, add tests proving every initialized civilization start has one luxury and one strategic resource within radius 5 for both `createNewGame` and `createHotSeatGame`. Use `RESOURCE_DEFINITIONS`, `hexesInRange`/`getWrappedHexesInRange` or existing map coordinate helpers, and each civ's starting unit/city position to inspect the generated map.

Also add `tests/core/game-state-resource-guarantee.test.ts` with a Vitest partial mock for `@/systems/map-generator` that spies on `guaranteeStartResources` and delegates to the real implementation. Assert `createNewGame` and `createHotSeatGame` each call the helper exactly once with the returned state's map, one start position per major civilization, and an RNG function. This prevents lucky generated maps from masking missing game-state wiring.

- [ ] **Step 4: Run the targeted tests**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/systems/map-generator.test.ts tests/systems/city-system.test.ts tests/systems/production-costs.test.ts tests/systems/pacing-audit.test.ts tests/ui/city-panel.test.ts tests/core/game-state.test.ts tests/core/game-state-resource-guarantee.test.ts
```
Expected: All map-generator, city-system, and game-state tests pass.

- [ ] **Step 5: Run source rule checks**

```bash
scripts/check-src-rule-violations.sh src/systems/map-generator.ts src/systems/city-system.ts src/core/game-state.ts
```
Expected: no rule violations.

- [ ] **Step 6: Build to confirm no TypeScript errors**

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: Build succeeds with no TS errors.

- [ ] **Step 7: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/systems/map-generator.ts src/core/game-state.ts tests/systems/map-generator.test.ts tests/core/game-state.test.ts tests/core/game-state-resource-guarantee.test.ts tests/systems/production-costs.test.ts tests/systems/pacing-audit.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(resources): guaranteeStartResources — ensure luxury+strategic within radius 5 of each start"
```

---

## Plan Review Findings Addressed

- Both game creation paths must call `guaranteeStartResources`; single-player-only wiring leaves hot-seat players behind.
- Settler cost coverage must be explicit because `origin/main` does not contain era 1/2 assertions to update.
- Test snippets must be folded into existing imports and type imports to avoid duplicate imports and missing `HexCoord`.
- `guaranteePlaceResource` should use `ResourceType`-typed candidates instead of loose `string` assignment.
- Existing production-cost, pacing-audit, and city-panel expectations must be updated because they intentionally render/assert canonical settler costs and ETAs.
- Game creation wiring tests must directly detect the helper call; generated-map assertions alone can pass by luck on seeds that already have nearby resources.
- Targeted Vitest commands should use `yarn vitest run ...`; this package's `yarn test` script runs the full suite and hook smoke tests.
- Verification must include source-rule checks, targeted mirrored tests, build, and full test suite before push/PR.
