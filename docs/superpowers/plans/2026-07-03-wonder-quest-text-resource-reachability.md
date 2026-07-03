# Wonder Quest Text + Resource Reachability (#432) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix misleading wonder quest text that implies a special mechanic that doesn't exist, fix a data bug that makes one wonder (`palace-of-the-sun`) permanently unbuildable on any map, and make specific-resource wonder requirements (`stone`, `iron`, `gold`) actually reachable near every civ start instead of only generically-categorized luxury/strategic resources.

**Architecture:** Three independent fixes sharing one file pair (`legendary-wonder-definitions.ts` + `map-generator.ts`). Parts A and C are one-line data corrections. Part B extends the existing `guaranteeStartResources` (`map-generator.ts`) with a third, additive guarantee pass derived from `LEGENDARY_WONDER_DEFINITIONS` data (not a hardcoded resource list), with radius escalation since `guaranteePlaceResource`'s current silent-no-op-on-zero-eligible-tiles behavior would otherwise make a "guarantee" not actually guaranteed for `stone`/`iron`/`gold`, each of which requires exactly one terrain type (`mountain` / `hills` / `hills`).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints
- `guaranteeStartResources`'s existing generic luxury/strategic guarantee passes must run in their current order, before the new specific-resource pass is appended — this preserves RNG-consumption order for any code relying on `guaranteeStartResources`'s determinism-per-seed guarantee (tested in `tests/systems/map-generator.test.ts:400-413`). The new pass is purely additive at the end of the function body, not interleaved.
- `guaranteePlaceResource`'s return type changes from `void` to `boolean` (whether it placed something) so the new escalation logic can detect failure and retry at a larger radius. This is a backward-compatible change — existing callers that ignore the return value are unaffected.
- Run `bash scripts/run-with-mise.sh yarn test` after each task; all tests must pass before moving to the next task.

---

### Task 1: Fix misleading quest-step descriptions

**Files:**
- Modify: `src/systems/legendary-wonder-definitions.ts:22` (Oracle of Delphi — `complete-pilgrimage-route`)
- Modify: `src/systems/legendary-wonder-definitions.ts:56` (Sun Spire — `complete-sacred-route`)
- Test: `tests/systems/legendary-wonder-definitions.test.ts` (new test in the existing `describe('legendary-wonder-definitions', ...)` block)

**Interfaces:** None — pure string literal changes, no signature changes.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/legendary-wonder-definitions.test.ts`, inside the existing `describe('legendary-wonder-definitions', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('quest step descriptions do not imply a special route mechanic that does not exist (#432)', () => {
    // Both complete-pilgrimage-route and complete-sacred-route evaluate identically to
    // any other generic trade_route step (legendary-wonder-system.ts:204-206) — the
    // flavor text must not claim otherwise.
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const step of definition.questSteps) {
        expect(step.description.toLowerCase()).not.toContain('pilgrimage');
        expect(step.description.toLowerCase()).not.toContain('sacred');
      }
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/legendary-wonder-definitions.test.ts -t "432"`
Expected: FAIL — both descriptions still contain the flagged words.

- [ ] **Step 3: Fix the descriptions**

In `src/systems/legendary-wonder-definitions.ts`, change line 22:
```typescript
      { id: 'complete-pilgrimage-route', type: 'trade_route', description: 'Establish a pilgrimage trade route.' },
```
to:
```typescript
      { id: 'complete-pilgrimage-route', type: 'trade_route', description: 'Establish a trade route.' },
```

And change line 56:
```typescript
      { id: 'complete-sacred-route', type: 'trade_route', description: 'Establish a sacred trade route.' },
```
to:
```typescript
      { id: 'complete-sacred-route', type: 'trade_route', description: 'Establish a trade route.' },
```

(Only the `description` string changes — `id` stays the same on both, since `legendary-wonder-system.ts:204-206` switches on `stepId`, not on the description text.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/legendary-wonder-definitions.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/legendary-wonder-definitions.ts tests/systems/legendary-wonder-definitions.test.ts
git commit -m "fix(wonders): remove misleading pilgrimage/sacred route flavor text (#432)

Both quest steps evaluate as a generic trade-route check
(legendary-wonder-system.ts:204-206) — the descriptions implied a
special mechanic that was never built."
```

---

### Task 2: Fix the `gold_resource` typo + add a completeness test

**Files:**
- Modify: `src/systems/legendary-wonder-definitions.ts:367` (`palace-of-the-sun`)
- Test: `tests/systems/legendary-wonder-definitions.test.ts`

**Interfaces:** None.

**Context:** `palace-of-the-sun` has `requiredResources: ['gold_resource']`. No resource with id `gold_resource` exists — `resource-definitions.ts:27` defines the gold resource as `id: 'gold'`. This makes the wonder unconditionally unbuildable on any map, any seed, for any civ.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/legendary-wonder-definitions.test.ts`:

```typescript
  it('every requiredResources id exists in RESOURCE_DEFINITIONS (#432 — catches the gold_resource-style typo class)', () => {
    const validIds = new Set(RESOURCE_DEFINITIONS.map(def => def.id));
    for (const definition of getLegendaryWonderDefinitions()) {
      for (const resourceId of definition.requiredResources) {
        expect(validIds.has(resourceId), `${definition.id} requires unknown resource id "${resourceId}"`).toBe(true);
      }
    }
  });
```

Add `RESOURCE_DEFINITIONS` to the test file's imports — the current import block is:
```typescript
import { describe, expect, it } from 'vitest';
import { getApprovedM4LegendaryWonderRoster } from '@/systems/approved-legendary-wonder-roster';
import {
  getLateEraWonderTechRequirements,
  getLegendaryWonderDefinitions,
} from '@/systems/legendary-wonder-definitions';
```
Add a new line: `import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';`

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/legendary-wonder-definitions.test.ts -t "RESOURCE_DEFINITIONS"`
Expected: FAIL — `palace-of-the-sun requires unknown resource id "gold_resource"`.

- [ ] **Step 3: Fix the typo**

In `src/systems/legendary-wonder-definitions.ts`, change line 367:
```typescript
    requiredResources: ['gold_resource'],
```
to:
```typescript
    requiredResources: ['gold'],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/legendary-wonder-definitions.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/legendary-wonder-definitions.ts tests/systems/legendary-wonder-definitions.test.ts
git commit -m "fix(wonders): palace-of-the-sun required a resource id that never existed (#432)

requiredResources: ['gold_resource'] never matched anything in
RESOURCE_DEFINITIONS (the real id is 'gold') — this wonder was
unconditionally unbuildable on any map, for any civ, on any seed.
Also adds a completeness test so this typo class can't recur silently."
```

---

### Task 3: Extend `guaranteeStartResources` with a specific-resource guarantee pass

**Files:**
- Modify: `src/systems/map-generator.ts` (change `guaranteePlaceResource`'s return type to `boolean`; add a new specific-resource guarantee pass to `guaranteeStartResources`)
- Test: `tests/systems/map-generator.test.ts`

**Interfaces:**
- Consumes: `LEGENDARY_WONDER_DEFINITIONS` (from `@/systems/legendary-wonder-definitions`, not yet imported in `map-generator.ts` — verified no circular import risk: `legendary-wonder-definitions.ts` only imports from `@/core/types` and `@/systems/approved-legendary-wonder-roster`).
- Produces: `guaranteePlaceResource` now returns `boolean` (`true` if it placed a resource, `false` if no eligible tile existed in the given neighborhood) — this return value is new; Task 3 itself is the only consumer, but it's a genuine API change worth calling out for any future caller.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/map-generator.test.ts`, inside the existing `describe('guaranteeStartResources', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('places stone, iron, and gold within radius 5 of each start (#432 — specific resources beyond generic luxury/strategic)', () => {
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }, { q: 15, r: 15 }];

    guaranteeStartResources(map, starts, createRng('guarantee-specific-test'));

    for (const start of starts) {
      expect(hasResourceTypeWithinRadius(map, start, new Set(['stone']), 5)).toBe(true);
      expect(hasResourceTypeWithinRadius(map, start, new Set(['iron']), 5)).toBe(true);
      expect(hasResourceTypeWithinRadius(map, start, new Set(['gold']), 5)).toBe(true);
    }
  });

  it('escalates search radius when no eligible terrain for a specific resource exists within radius 5 (#432)', () => {
    // stone requires 'mountain' terrain and iron/gold require 'hills' — build a map
    // where the only mountain/hills tiles are well outside radius 5 of the start, to
    // prove guaranteeStartResources finds them anyway instead of silently giving up.
    const map = generateMap(40, 40, 'radius-escalation-test');
    for (const tile of Object.values(map.tiles)) {
      tile.resource = null;
      tile.terrain = 'grassland';
    }
    const start: HexCoord = { q: 20, r: 20 };
    // Place real mountain/hills tiles ~12 hexes away — outside the base radius-5 search.
    const farMountain = map.tiles[hexKey({ q: 20, r: 32 })];
    const farHills = map.tiles[hexKey({ q: 32, r: 20 })];
    expect(farMountain).toBeDefined();
    expect(farHills).toBeDefined();
    farMountain.terrain = 'mountain';
    farHills.terrain = 'hills';

    guaranteeStartResources(map, [start], createRng('radius-escalation-test'));

    expect(hasResourceTypeWithinRadius(map, start, new Set(['stone']), 40)).toBe(true);
    expect(hasResourceTypeWithinRadius(map, start, new Set(['iron', 'gold']), 40)).toBe(true);
  });

  it('picks up a synthetic new required resource automatically — proves the guarantee is data-driven, not a hardcoded id list (#432)', () => {
    const syntheticWonders = [
      { id: 'test-only-wonder', name: 'Test Wonder', era: 2, productionCost: 1, requiredTechs: [], requiredResources: ['silk'], cityRequirement: 'any' as const, questSteps: [], reward: { summary: '' } },
    ];
    expect(getEarlyWonderRequiredResourceIds(syntheticWonders)).toEqual(new Set(['silk']));
    // And the real production data still resolves to exactly the three known ids —
    // proves the default parameter reads LEGENDARY_WONDER_DEFINITIONS, not the test fixture.
    expect(getEarlyWonderRequiredResourceIds()).toEqual(new Set(['stone', 'iron', 'gold']));
  });
```

Add `getEarlyWonderRequiredResourceIds` to the test file's imports: `import { getEarlyWonderRequiredResourceIds } from '@/systems/map-generator';` (this requires Step 4 below to `export` the function, not leave it module-private — see the note there).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/map-generator.test.ts -t "432"`
Expected: FAIL on all three — the first two because `guaranteeStartResources` doesn't guarantee `stone`/`iron`/`gold` specifically yet, and the third because `getEarlyWonderRequiredResourceIds` isn't exported from `map-generator.ts` yet (import/compile error).

- [ ] **Step 3: Change `guaranteePlaceResource`'s return type to `boolean`**

In `src/systems/map-generator.ts`, modify the function signature and both return points:

```typescript
function guaranteePlaceResource(
  neighborhoodData: Array<{ coord: HexCoord; tile: HexTile }>,
  targetIds: Set<ResourceType>,
  terrainResourceMap: Record<string, ResourceType[]>,
  start: HexCoord,
  map: GameMap,
  rng: () => number,
): boolean {
  const eligible = neighborhoodData.filter(({ tile }) => {
    if (tile.resource !== null) return false;
    const candidates = terrainResourceMap[tile.terrain] ?? [];
    return candidates.some(resource => targetIds.has(resource));
  });
  if (eligible.length === 0) return false;

  const keyed = eligible.map(item => ({
    ...item,
    distance: map.wrapsHorizontally
      ? wrappedHexDistance(item.coord, start, map.width)
      : hexDistance(item.coord, start),
    tie: rng(),
  }));
  keyed.sort((a, b) => a.distance - b.distance || a.tie - b.tie);

  const target = keyed[0];
  const candidates = (terrainResourceMap[target.tile.terrain] ?? [])
    .filter(resource => targetIds.has(resource));
  if (candidates.length === 0) return false;
  target.tile.resource = candidates[Math.floor(rng() * candidates.length)];
  return true;
}
```

(Only the return type and the two early-return points change from `void`/implicit-return to explicit `boolean` — the body logic is unchanged.)

- [ ] **Step 4: Add the specific-resource guarantee pass to `guaranteeStartResources`**

Add the imports at the top of `map-generator.ts` (find the existing imports block and add these lines):
```typescript
import { LEGENDARY_WONDER_DEFINITIONS } from '@/systems/legendary-wonder-definitions';
import type { LegendaryWonderDefinition } from '@/core/types';
```
(Check first whether `LegendaryWonderDefinition` is already imported from `@/core/types` in this file via `grep -n "LegendaryWonderDefinition" src/systems/map-generator.ts` — if the file already has a `import type { ... } from '@/core/types'` block, add `LegendaryWonderDefinition` to that existing list instead of creating a second import line.)

Then modify `guaranteeStartResources` — the current end of the function reads:

```typescript
    const hasStrategic = neighborhoodData.some(({ tile }) =>
      isTargetResource(tile.resource, strategicIds),
    );
    if (!hasStrategic) {
      guaranteePlaceResource(neighborhoodData, strategicIds, terrainResourceMap, start, map, rng);
    }
  }
}
```

Change it to:

```typescript
    const hasStrategic = neighborhoodData.some(({ tile }) =>
      isTargetResource(tile.resource, strategicIds),
    );
    if (!hasStrategic) {
      guaranteePlaceResource(neighborhoodData, strategicIds, terrainResourceMap, start, map, rng);
    }
  }

  guaranteeSpecificWonderResources(map, startPositions, terrainResourceMap, rng);
}

// Specific resource ids (not just "any luxury"/"any strategic") required by
// early-game legendary wonders. Derived from wonder data, not hardcoded, so a
// future wonder introducing a new required resource is picked up automatically.
// Exported (and parameterized with a real default) so a test can inject a
// synthetic wonder list and prove this reads data rather than a hardcoded set.
export function getEarlyWonderRequiredResourceIds(
  wonders: LegendaryWonderDefinition[] = LEGENDARY_WONDER_DEFINITIONS,
): Set<ResourceType> {
  return new Set(
    wonders
      .filter(wonder => wonder.era <= 3)
      .flatMap(wonder => wonder.requiredResources) as ResourceType[],
  );
}

// stone (mountain-only) and iron/gold (hills-only) can legitimately have zero
// eligible tiles within a small radius on terrain-sparse starts. guaranteePlaceResource
// silently no-ops when nothing is eligible, so a fixed radius alone would not actually
// guarantee anything — escalate outward until placed or genuinely nothing exists on
// the whole map (mirrors the existing "does not crash when no eligible terrain exists"
// guarantee for the generic luxury/strategic passes).
const SPECIFIC_RESOURCE_GUARANTEE_RADII = [5, 10, 20, 40];

function guaranteeSpecificWonderResources(
  map: GameMap,
  startPositions: HexCoord[],
  terrainResourceMap: Record<string, ResourceType[]>,
  rng: () => number,
): void {
  const specificIds = getEarlyWonderRequiredResourceIds();

  for (const start of startPositions) {
    for (const resourceId of specificIds) {
      const targetSet = new Set<ResourceType>([resourceId]);
      const alreadyPresent = getCandidateNeighborhood(map, start, 5)
        .map(coord => map.tiles[hexKey(coord)])
        .some(tile => tile !== undefined && isTargetResource(tile.resource, targetSet));
      if (alreadyPresent) continue;

      for (const radius of SPECIFIC_RESOURCE_GUARANTEE_RADII) {
        const neighborhoodData = getCandidateNeighborhood(map, start, radius)
          .map(coord => ({ coord, tile: map.tiles[hexKey(coord)] }))
          .filter((item): item is { coord: HexCoord; tile: HexTile } => item.tile !== undefined);
        const placed = guaranteePlaceResource(neighborhoodData, targetSet, terrainResourceMap, start, map, rng);
        if (placed) break;
      }
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/map-generator.test.ts`
Expected: all tests PASS, including the pre-existing `guaranteeStartResources` tests (determinism, no-overwrite, no-crash-on-all-ocean) — these must stay green since the new pass is purely additive.

- [ ] **Step 6: Commit**

```bash
git add src/systems/map-generator.ts tests/systems/map-generator.test.ts
git commit -m "feat(map-gen): guarantee specific wonder-required resources near every start (#432)

guaranteeStartResources previously only guaranteed a generic
luxury/strategic category — a civ could spawn with zero stone, iron,
or gold within reach and be permanently unable to build the wonders
that need them. Adds a third, additive pass derived from
LEGENDARY_WONDER_DEFINITIONS (not a hardcoded id list) with radius
escalation, since a fixed radius-5 search can legitimately have zero
eligible mountain/hills tiles on some starts."
```

---

## Final verification checklist (run after all tasks complete)

- [ ] `bash scripts/run-with-mise.sh yarn build` exits 0.
- [ ] `bash scripts/run-with-mise.sh yarn test` exits 0.
- [ ] `grep -rn "pilgrimage\|sacred" src/systems/legendary-wonder-definitions.ts` returns nothing (both flavor-text instances removed).
- [ ] `grep -n "gold_resource" src/systems/legendary-wonder-definitions.ts` returns nothing.
- [ ] `git diff origin/main --stat` (or against the correct merge-base if origin/main has moved — check with `git merge-base HEAD origin/main` first, per `spec-fidelity.md`) shows only `legendary-wonder-definitions.ts`, `map-generator.ts`, and their two test files changed.
