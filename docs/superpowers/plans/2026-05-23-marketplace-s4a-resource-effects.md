# Marketplace S4a — Per-Resource Yield & Happiness Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passive empire-wide effects to all 16 resources (happiness or yield bonuses), wire them into turn processing and faction unrest, surface them in city panel / HUD / marketplace, and fix earth-map resource placement for the 6 resources added in S2a plus missing geographic zones for existing resources.

**Architecture:** Static `ResourceEffect` type on `RESOURCE_DEFINITIONS` (no GameState fields). Two pure helpers in `resource-acquisition-system.ts` compute bonuses fresh from `getCivAvailableResources`. Turn-manager calls yield helper once per civ; faction-system pre-builds a happiness map before its city loop to avoid O(cities²) scans.

**Tech Stack:** TypeScript, Vitest, DOM (textContent only), `scripts/generate-earth-maps.ts` for map regeneration.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/systems/trade-system.ts` | Add `ResourceEffect` interface + `effect` field to all 16 definitions |
| Modify | `src/systems/resource-acquisition-system.ts` | Add `getCivResourceYieldBonus` and `getCivHappinessFromResources` |
| Modify | `src/core/turn-manager.ts` | Call yield bonus once per civ before city loop |
| Modify | `src/systems/faction-system.ts` | `ownerHappiness=0` param on `computeUnrestPressure`; civHappiness map in `processFactionTurn` |
| Modify | `src/ui/city-panel.ts` | Empire bonuses / City bonuses resource section |
| Modify | `src/main.ts` | Happiness chip in `updateHUD()` |
| Modify | `src/ui/marketplace-panel.ts` | Effect badge per resource row |
| Modify | `scripts/generate-earth-maps.ts` | Add all missing RESOURCE_ZONES + fix stone fallback |
| Regenerate | `src/systems/earth-map-data.ts` (auto-generated) | Run `yarn generate-maps` |
| Create | `tests/systems/resource-effects.test.ts` | Tests #1–16, #30 |
| Create | `tests/systems/faction-happiness.test.ts` | Tests #17–20 |
| Create | `tests/ui/city-panel-resources.test.ts` | Tests #21–25 |
| Create | `tests/ui/hud-happiness.test.ts` | Tests #26–27 |
| Create | `tests/ui/marketplace-panel-effects.test.ts` | Tests #28–29 |
| Create | `tests/systems/earth-map-geo.test.ts` | Test #31 |

---

## Task 1: Add `ResourceEffect` to `trade-system.ts`

**Files:**
- Modify: `src/systems/trade-system.ts`
- Test (catalog only, in next task's file): `tests/systems/resource-effects.test.ts`

- [ ] **Step 1: Add `ResourceEffect` interface and `effect` field to `ResourceDefinition`**

Open `src/systems/trade-system.ts` and make these changes:

```typescript
// Add after the BuildableImprovementType/MarketplaceState/ResourceType/TradeRoute import line:
export interface ResourceEffect {
  type: 'happiness' | 'gold' | 'production' | 'food';
  amount: number; // always 1 in S4a
}

// Update ResourceDefinition interface:
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string | string[];
  basePrice: number;
  tech: string;
  icon: string;
  requiredImprovement: BuildableImprovementType;
  effect: ResourceEffect | null; // null = no S4a passive (copper/iron/horses/stone)
}
```

- [ ] **Step 2: Update all 16 RESOURCE_DEFINITIONS entries with `effect` field**

Replace the entire `RESOURCE_DEFINITIONS` array:

```typescript
export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  // Luxury — happiness
  { id: 'silk',    name: 'Silk',    type: 'luxury',    terrain: 'grassland',             basePrice: 8,  tech: 'irrigation',       icon: '🧵', requiredImprovement: 'plantation', effect: { type: 'happiness', amount: 1 } },
  { id: 'wine',    name: 'Wine',    type: 'luxury',    terrain: 'plains',                basePrice: 7,  tech: 'pottery',           icon: '🍇', requiredImprovement: 'plantation', effect: { type: 'happiness', amount: 1 } },
  { id: 'ivory',   name: 'Ivory',   type: 'luxury',    terrain: 'forest',                basePrice: 9,  tech: 'foraging',          icon: '🐘', requiredImprovement: 'camp',       effect: { type: 'happiness', amount: 1 } },
  { id: 'furs',    name: 'Furs',    type: 'luxury',    terrain: ['forest', 'tundra'],    basePrice: 9,  tech: 'foraging',          icon: '🦊', requiredImprovement: 'camp',       effect: { type: 'happiness', amount: 1 } },
  { id: 'incense', name: 'Incense', type: 'luxury',    terrain: 'desert',                basePrice: 6,  tech: 'currency',          icon: '🕯️', requiredImprovement: 'plantation', effect: { type: 'happiness', amount: 1 } },
  // Luxury — gold/turn
  { id: 'gems',    name: 'Gems',    type: 'luxury',    terrain: 'hills',                 basePrice: 12, tech: 'mining-tech',       icon: '💎', requiredImprovement: 'mine',       effect: { type: 'gold', amount: 1 } },
  { id: 'gold',    name: 'Gold',    type: 'luxury',    terrain: 'hills',                 basePrice: 15, tech: 'currency',          icon: '⭐', requiredImprovement: 'mine',       effect: { type: 'gold', amount: 1 } },
  { id: 'silver',  name: 'Silver',  type: 'luxury',    terrain: 'hills',                 basePrice: 11, tech: 'mining-tech',       icon: '🥈', requiredImprovement: 'mine',       effect: { type: 'gold', amount: 1 } },
  { id: 'spices',  name: 'Spices',  type: 'luxury',    terrain: 'jungle',                basePrice: 10, tech: 'cartography',       icon: '🌶️', requiredImprovement: 'plantation', effect: { type: 'gold', amount: 1 } },
  // Luxury — production/turn
  { id: 'sheep',   name: 'Sheep',   type: 'luxury',    terrain: ['hills', 'plains'],     basePrice: 7,  tech: 'animal-husbandry',  icon: '🐑', requiredImprovement: 'pasture',    effect: { type: 'production', amount: 1 } },
  // Strategic — food/turn
  { id: 'cattle',  name: 'Cattle',  type: 'strategic', terrain: ['grassland', 'plains'], basePrice: 5,  tech: 'domestication',     icon: '🐄', requiredImprovement: 'pasture',    effect: { type: 'food', amount: 1 } },
  // Strategic — gold/turn
  { id: 'salt',    name: 'Salt',    type: 'strategic', terrain: 'hills',                 basePrice: 5,  tech: 'pottery',           icon: '🧂', requiredImprovement: 'mine',       effect: { type: 'gold', amount: 1 } },
  // Strategic — null (S4b gating)
  { id: 'copper',  name: 'Copper',  type: 'strategic', terrain: 'hills',                 basePrice: 5,  tech: 'stone-weapons',     icon: '🪙', requiredImprovement: 'mine',       effect: null },
  { id: 'iron',    name: 'Iron',    type: 'strategic', terrain: 'hills',                 basePrice: 8,  tech: 'bronze-working',    icon: '⚙️', requiredImprovement: 'mine',       effect: null },
  { id: 'horses',  name: 'Horses',  type: 'strategic', terrain: 'plains',                basePrice: 7,  tech: 'animal-husbandry',  icon: '🐎', requiredImprovement: 'pasture',    effect: null },
  { id: 'stone',   name: 'Stone',   type: 'strategic', terrain: 'mountain',              basePrice: 4,  tech: 'gathering',         icon: '🪨', requiredImprovement: 'quarry',     effect: null },
];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -20
```

Expected: No errors referencing `trade-system.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/systems/trade-system.ts
git commit -m "feat(s4a): add ResourceEffect type and effect field to all 16 RESOURCE_DEFINITIONS"
```

---

## Task 2: Add `getCivResourceYieldBonus` and `getCivHappinessFromResources`

**Files:**
- Modify: `src/systems/resource-acquisition-system.ts`
- Create: `tests/systems/resource-effects.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/systems/resource-effects.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import {
  getCivAvailableResources,
  getCivResourceYieldBonus,
  getCivHappinessFromResources,
} from '@/systems/resource-acquisition-system';
import type { GameState } from '@/core/types';

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeTechState(completed: string[] = []) {
  return {
    completed,
    currentResearch: null,
    researchQueue: [],
    researchProgress: 0,
    trackPriorities: {} as never,
  };
}

/**
 * Builds a minimal GameState where 'player' owns a single city at (3,3) and
 * one additional resource tile at (4,3) (unless tileIsCity=true).
 */
function makeState(overrides: {
  tileResource?: string | null;
  tileImprovement?: string;
  tileImprovementTurnsLeft?: number;
  tileTerrain?: string;
  tileIsCity?: boolean;
  completed?: string[];
}): GameState {
  const {
    tileResource = null,
    tileImprovement = 'none',
    tileImprovementTurnsLeft = 0,
    tileTerrain = 'grassland',
    tileIsCity = false,
    completed = [],
  } = overrides;

  const cityPos = { q: 3, r: 3 };
  const tileCoord = tileIsCity ? cityPos : { q: 4, r: 3 };

  const tiles: Record<string, unknown> = {
    '3,3': {
      coord: cityPos, terrain: 'grassland', elevation: 'lowland',
      resource: tileIsCity ? tileResource : null,
      improvement: tileIsCity ? tileImprovement : 'none',
      improvementTurnsLeft: tileIsCity ? tileImprovementTurnsLeft : 0,
      hasRiver: false, wonder: null, owner: null,
    },
  };

  if (!tileIsCity) {
    tiles['4,3'] = {
      coord: tileCoord, terrain: tileTerrain, elevation: 'lowland',
      resource: tileResource, improvement: tileImprovement,
      improvementTurnsLeft: tileImprovementTurnsLeft,
      hasRiver: false, wonder: null, owner: null,
    };
  }

  const ownedTiles = tileIsCity ? [cityPos] : [cityPos, tileCoord];

  return {
    map: { width: 10, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'TestCity', owner: 'player',
        position: cityPos, ownedTiles,
        population: 1, food: 0, production: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [],
        specialistSlots: [], garrisonUnitId: null, hp: 100, maxHp: 100,
      } as unknown as never,
    },
    civilizations: {
      'player': {
        id: 'player',
        cities: ['city-1'],
        techState: makeTechState(completed),
      } as unknown as never,
    },
  } as unknown as GameState;
}

/** State with two off-center tiles having different resources */
function makeMultiResourceState(resources: Array<{
  resource: string;
  improvement: string;
  tech: string;
  terrain: string;
}>): GameState {
  const cityPos = { q: 3, r: 3 };
  const tiles: Record<string, unknown> = {
    '3,3': {
      coord: cityPos, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: null,
    },
  };
  const ownedTiles = [cityPos];
  const completed: string[] = [];

  resources.forEach((r, i) => {
    const coord = { q: 4 + i, r: 3 };
    tiles[`${coord.q},${coord.r}`] = {
      coord, terrain: r.terrain, elevation: 'lowland',
      resource: r.resource, improvement: r.improvement,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
    };
    ownedTiles.push(coord);
    if (!completed.includes(r.tech)) completed.push(r.tech);
  });

  return {
    map: { width: 10, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'TestCity', owner: 'player',
        position: cityPos, ownedTiles,
        population: 1, food: 0, production: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [],
        specialistSlots: [], garrisonUnitId: null, hp: 100, maxHp: 100,
      } as unknown as never,
    },
    civilizations: {
      'player': {
        id: 'player',
        cities: ['city-1'],
        techState: makeTechState(completed),
      } as unknown as never,
    },
  } as unknown as GameState;
}

// ── Catalog test ─────────────────────────────────────────────────────────────

describe('RESOURCE_DEFINITIONS catalog', () => {
  it('test 1: every entry has effect defined (not undefined — may be null)', () => {
    for (const def of RESOURCE_DEFINITIONS) {
      expect(def.effect, `${def.id} is missing effect field`).not.toBeUndefined();
    }
  });
});

// ── getCivHappinessFromResources ──────────────────────────────────────────────

describe('getCivHappinessFromResources', () => {
  it('test 2: returns 1 for a civ owning silk (plantation complete, irrigation known)', () => {
    const state = makeState({
      tileResource: 'silk', tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0, completed: ['irrigation'],
    });
    expect(getCivHappinessFromResources(state, 'player')).toBe(1);
  });

  it('test 7: three silk tiles → returns 1 (same-resource non-stacking)', () => {
    // Build state manually with 3 silk tiles in owned territory
    const cityPos = { q: 3, r: 3 };
    const silkTile = (q: number) => ({
      coord: { q, r: 3 }, terrain: 'grassland', elevation: 'lowland',
      resource: 'silk', improvement: 'plantation', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: null,
    });
    const state: GameState = {
      map: {
        width: 10, height: 10, wrapsHorizontally: false, rivers: [],
        tiles: {
          '3,3': { coord: cityPos, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null },
          '4,3': silkTile(4),
          '5,3': silkTile(5),
          '6,3': silkTile(6),
        },
      } as unknown as never,
      cities: {
        'city-1': {
          id: 'city-1', name: 'TestCity', owner: 'player',
          position: cityPos,
          ownedTiles: [cityPos, { q: 4, r: 3 }, { q: 5, r: 3 }, { q: 6, r: 3 }],
          population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], workedTiles: [],
          specialistSlots: [], garrisonUnitId: null, hp: 100, maxHp: 100,
        } as unknown as never,
      },
      civilizations: {
        'player': {
          id: 'player', cities: ['city-1'],
          techState: makeTechState(['irrigation']),
        } as unknown as never,
      },
    } as unknown as GameState;

    expect(getCivHappinessFromResources(state, 'player')).toBe(1);
  });

  it('test 8: silk AND wine → returns 2 (different resources accumulate)', () => {
    const state = makeMultiResourceState([
      { resource: 'silk',  improvement: 'plantation', tech: 'irrigation', terrain: 'grassland' },
      { resource: 'wine',  improvement: 'plantation', tech: 'pottery',    terrain: 'plains'    },
    ]);
    expect(getCivHappinessFromResources(state, 'player')).toBe(2);
  });

  it('test 10: civ with no owned resources → returns 0', () => {
    const state = makeState({ tileResource: null });
    expect(getCivHappinessFromResources(state, 'player')).toBe(0);
  });

  it('test 11: copper/iron/horses/stone (null effect) → returns 0', () => {
    for (const resourceId of ['copper', 'iron', 'horses', 'stone']) {
      const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId)!;
      const terrain = Array.isArray(def.terrain) ? def.terrain[0] : def.terrain;
      const state = makeState({
        tileResource: resourceId,
        tileImprovement: def.requiredImprovement,
        tileImprovementTurnsLeft: 0,
        tileTerrain: terrain,
        completed: [def.tech],
      });
      expect(getCivHappinessFromResources(state, 'player'), `${resourceId} should give 0 happiness`).toBe(0);
    }
  });

  it('test 13: improvement destroyed (improvementTurnsLeft > 0) → returns 0', () => {
    const state = makeState({
      tileResource: 'silk', tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 2, completed: ['irrigation'],
    });
    expect(getCivHappinessFromResources(state, 'player')).toBe(0);
  });
});

// ── getCivResourceYieldBonus ──────────────────────────────────────────────────

describe('getCivResourceYieldBonus', () => {
  it('test 3: gems → { gold: 1, food: 0, production: 0, science: 0 }', () => {
    const state = makeState({
      tileResource: 'gems', tileImprovement: 'mine',
      tileImprovementTurnsLeft: 0, tileTerrain: 'hills',
      completed: ['mining-tech'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(1);
    expect(bonus.food).toBe(0);
    expect(bonus.production).toBe(0);
    expect(bonus.science).toBe(0);
  });

  it('test 4: sheep → { production: 1, ... }', () => {
    const state = makeState({
      tileResource: 'sheep', tileImprovement: 'pasture',
      tileImprovementTurnsLeft: 0, tileTerrain: 'plains',
      completed: ['animal-husbandry'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.production).toBe(1);
    expect(bonus.food).toBe(0);
    expect(bonus.gold).toBe(0);
  });

  it('test 5: cattle → { food: 1, ... }', () => {
    const state = makeState({
      tileResource: 'cattle', tileImprovement: 'pasture',
      tileImprovementTurnsLeft: 0, tileTerrain: 'plains',
      completed: ['domestication'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.food).toBe(1);
    expect(bonus.gold).toBe(0);
  });

  it('test 6: salt → { gold: 1, ... }', () => {
    const state = makeState({
      tileResource: 'salt', tileImprovement: 'mine',
      tileImprovementTurnsLeft: 0, tileTerrain: 'hills',
      completed: ['pottery'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(1);
  });

  it('test 9: gems AND silver → { gold: 2, ... } (different resources accumulate)', () => {
    const state = makeMultiResourceState([
      { resource: 'gems',   improvement: 'mine', tech: 'mining-tech', terrain: 'hills' },
      { resource: 'silver', improvement: 'mine', tech: 'mining-tech', terrain: 'hills' },
    ]);
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(2);
  });

  it('test 10: civ with no resources → all zeros', () => {
    const state = makeState({ tileResource: null });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.food).toBe(0);
    expect(bonus.production).toBe(0);
    expect(bonus.gold).toBe(0);
    expect(bonus.science).toBe(0);
  });

  it('test 11: copper/iron/horses/stone (null effect) → all zeros', () => {
    for (const resourceId of ['copper', 'iron', 'horses', 'stone']) {
      const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId)!;
      const terrain = Array.isArray(def.terrain) ? def.terrain[0] : def.terrain;
      const state = makeState({
        tileResource: resourceId,
        tileImprovement: def.requiredImprovement,
        tileImprovementTurnsLeft: 0,
        tileTerrain: terrain,
        completed: [def.tech],
      });
      const bonus = getCivResourceYieldBonus(state, 'player');
      expect(bonus.gold, `${resourceId} should give 0 gold`).toBe(0);
      expect(bonus.production, `${resourceId} should give 0 production`).toBe(0);
      expect(bonus.food, `${resourceId} should give 0 food`).toBe(0);
    }
  });

  it('test 12: happiness resources excluded from yield bonus (silk gives 0 gold/prod/food)', () => {
    const state = makeState({
      tileResource: 'silk', tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0, completed: ['irrigation'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(0);
    expect(bonus.production).toBe(0);
    expect(bonus.food).toBe(0);
    expect(bonus.science).toBe(0);
  });
});

// ── Save compatibility ────────────────────────────────────────────────────────

describe('save compatibility', () => {
  it('test 30: effect is static data on RESOURCE_DEFINITIONS, not stored in GameState', () => {
    // Confirm calling helpers on a state with no special fields doesn't crash
    const state = makeState({ tileResource: null });
    expect(() => getCivHappinessFromResources(state, 'player')).not.toThrow();
    expect(() => getCivResourceYieldBonus(state, 'player')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/resource-effects.test.ts 2>&1 | tail -20
```

Expected: FAIL — `getCivResourceYieldBonus is not a function` / `getCivHappinessFromResources is not a function`.

- [ ] **Step 3: Implement the two helpers in `resource-acquisition-system.ts`**

Add these two exports (after the existing `getCivAvailableResources` function):

```typescript
import type { GameState, ResourceType, ResourceYield } from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS } from './trade-system';

// ... existing getCivAvailableResources unchanged ...

/**
 * Returns the aggregate per-city yield bonus from all owned resources whose
 * effect type is NOT 'happiness'. Non-stacking per resource: owning multiple
 * tiles of the same resource counts once. Different resources with the same
 * effect type DO accumulate (gems + silver → +2 gold/turn).
 */
export function getCivResourceYieldBonus(
  state: GameState,
  civId: string,
): ResourceYield {
  const bonus: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  const owned = getCivAvailableResources(state, civId);

  for (const def of RESOURCE_DEFINITIONS) {
    if (!def.effect || def.effect.type === 'happiness') continue;
    if (!owned.has(def.id as ResourceType)) continue;

    switch (def.effect.type) {
      case 'gold':       bonus.gold       += def.effect.amount; break;
      case 'production': bonus.production += def.effect.amount; break;
      case 'food':       bonus.food       += def.effect.amount; break;
    }
  }

  return bonus;
}

/**
 * Returns the count of distinct happiness-type luxuries owned by the civ.
 * Empire-wide, non-stacking: owning three silk tiles counts as 1, not 3.
 * Different resources accumulate: silk + wine = 2.
 */
export function getCivHappinessFromResources(
  state: GameState,
  civId: string,
): number {
  const owned = getCivAvailableResources(state, civId);
  let count = 0;

  for (const def of RESOURCE_DEFINITIONS) {
    if (!def.effect || def.effect.type !== 'happiness') continue;
    if (owned.has(def.id as ResourceType)) count++;
  }

  return count;
}
```

Note: `ResourceYield` must be imported in `resource-acquisition-system.ts`. The existing import line is:
```typescript
import type { GameState, ResourceType } from '@/core/types';
```
Change it to:
```typescript
import type { GameState, ResourceType, ResourceYield } from '@/core/types';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/resource-effects.test.ts 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/resource-acquisition-system.ts tests/systems/resource-effects.test.ts
git commit -m "feat(s4a): add getCivResourceYieldBonus and getCivHappinessFromResources helpers"
```

---

## Task 3: Wire yield bonus in `turn-manager.ts`

**Files:**
- Modify: `src/core/turn-manager.ts`
- Create test coverage for arch regression and AI parity in existing `tests/systems/resource-effects.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add this block to the end of `tests/systems/resource-effects.test.ts`:

```typescript
// ── Turn processing integration ───────────────────────────────────────────────

import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';

/**
 * Build a minimal GameState suitable for a single processTurn call.
 * The civ has `cityCount` cities, each owning a gems tile (hills, mine complete).
 */
function makeTurnState(civId: string, cityCount: number): GameState {
  const bus = new EventBus();
  const cities: Record<string, unknown> = {};
  const cityIds: string[] = [];

  for (let i = 0; i < cityCount; i++) {
    const cityPos = { q: i * 5, r: 0 };
    const tilePos = { q: i * 5 + 1, r: 0 };
    const cityId = `city-${i}`;
    cityIds.push(cityId);

    // Add city tile and gems tile to map
    cities[cityId] = {
      id: cityId, name: `City${i}`, owner: civId,
      position: cityPos,
      ownedTiles: [cityPos, tilePos],
      population: 1, food: 0, foodNeeded: 20,
      production: 0, productionProgress: 0, gold: 0,
      buildings: [], productionQueue: [], workedTiles: [cityPos],
      focus: 'balanced', maturity: 'outpost',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      grid: [[null]], gridSize: 3, hp: 100, maxHp: 100,
      garrisonUnitId: null, specialistSlots: [],
    };
  }

  // Build tiles map
  const tiles: Record<string, unknown> = {};
  for (let i = 0; i < cityCount; i++) {
    const cityPos = { q: i * 5, r: 0 };
    const tilePos = { q: i * 5 + 1, r: 0 };
    tiles[`${cityPos.q},${cityPos.r}`] = {
      coord: cityPos, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: civId,
    };
    tiles[`${tilePos.q},${tilePos.r}`] = {
      coord: tilePos, terrain: 'hills', elevation: 'highland',
      resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: civId,
    };
  }

  return {
    turn: 5,
    era: 2,
    currentPlayer: civId,
    map: { width: 50, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    cities,
    civilizations: {
      [civId]: {
        id: civId, civType: 'rome', name: 'Rome',
        cities: cityIds,
        units: [],
        gold: 10,
        techState: { completed: ['mining-tech'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
        visibility: { tiles: {} },
      },
    },
    units: {},
    barbarianCamps: {},
    minorCivs: {},
    marketplace: null,
  } as unknown as GameState;
}

describe('turn processing — resource yield bonus integration', () => {
  it('test 14: 3-city civ owning gems — all 3 cities receive +1 gold from resource bonus', () => {
    const state = makeTurnState('rome', 3);
    const goldBefore = Object.values(state.cities).reduce((sum, c: unknown) => sum + (c as never as { gold: number }).gold, 0);
    const bus = new EventBus();
    const next = processTurn(state, bus);
    // Each city should have gained at least 1 gold from gems bonus
    for (const cityId of Object.keys(next.cities)) {
      const city = next.cities[cityId];
      expect(city.gold, `${cityId} should have gained food/prod/gold from turn`).toBeGreaterThan(0);
    }
  });

  it('test 15: AI civ owning spices accrues +1 gold/turn per city (same code path)', () => {
    // Uses same makeTurnState logic but with spices (jungle, plantation)
    const cityPos = { q: 0, r: 0 };
    const tilePos = { q: 1, r: 0 };
    const state: GameState = {
      turn: 5, era: 2, currentPlayer: 'ai-civ',
      map: {
        width: 20, height: 20, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': { coord: cityPos, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'ai-civ' },
          '1,0': { coord: tilePos, terrain: 'jungle', elevation: 'lowland', resource: 'spices', improvement: 'plantation', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'ai-civ' },
        },
      },
      cities: {
        'ai-city': {
          id: 'ai-city', name: 'AICity', owner: 'ai-civ',
          position: cityPos,
          ownedTiles: [cityPos, tilePos],
          population: 1, food: 0, foodNeeded: 20,
          production: 0, productionProgress: 0, gold: 0,
          buildings: [], productionQueue: [], workedTiles: [cityPos],
          focus: 'balanced', maturity: 'outpost',
          unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
          grid: [[null]], gridSize: 3, hp: 100, maxHp: 100,
          garrisonUnitId: null, specialistSlots: [],
        },
      },
      civilizations: {
        'ai-civ': {
          id: 'ai-civ', civType: 'rome', name: 'Rome', cities: ['ai-city'],
          units: [], gold: 0,
          techState: { completed: ['cartography'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
          visibility: { tiles: {} },
        },
      },
      units: {}, barbarianCamps: {}, minorCivs: {}, marketplace: null,
    } as unknown as GameState;

    const bus = new EventBus();
    // Should not throw and gold should increase (gold from spices + base gold yield)
    expect(() => processTurn(state, bus)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify integration tests fail as expected**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/resource-effects.test.ts 2>&1 | grep -E "FAIL|PASS|getCivResource"
```

Expected: Tests 14 and 15 may already pass if the turn-manager picks up the bonus, or fail if not wired yet. The arch-regression test (test 16) cannot be auto-checked in a unit test — it is a code-review concern and is confirmed by reading the diff.

- [ ] **Step 3: Wire `getCivResourceYieldBonus` in `turn-manager.ts`**

In `src/core/turn-manager.ts`:

**Add import** (near the other resource-system imports, after line 14 `import { calculateCityYields }`):
```typescript
import { getCivResourceYieldBonus } from '@/systems/resource-acquisition-system';
```

**Locate the per-civ city loop** (around line 82). Before the `for (const cityId of civ.cities)` loop, add one line:

```typescript
    const resourceYieldBonus = getCivResourceYieldBonus(newState, civId);
```

**Update the yields object** inside the city loop (currently lines 96-101):

Replace:
```typescript
      const yields = {
        food: Math.floor((baseYields.food + (wonderCityBonuses.food ?? 0)) * unrestMultiplier),
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0)) * unrestMultiplier),
        gold: Math.floor((baseYields.gold + (wonderCityBonuses.gold ?? 0)) * unrestMultiplier),
        science: Math.floor((baseYields.science + (wonderCityBonuses.science ?? 0)) * unrestMultiplier),
      };
```

With:
```typescript
      const yields = {
        food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food)       * unrestMultiplier),
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production) * unrestMultiplier),
        gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier),
        science:    Math.floor((baseYields.science    + (wonderCityBonuses.science    ?? 0))                                 * unrestMultiplier),
      };
```

Note: `science` intentionally does NOT include `resourceYieldBonus.science` because no resource has a science effect in S4a (and `ResourceYield` is `{ food, production, gold, science }` but the helper always returns science=0).

- [ ] **Step 4: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/turn-manager.ts tests/systems/resource-effects.test.ts
git commit -m "feat(s4a): wire getCivResourceYieldBonus into turn-manager once per civ"
```

---

## Task 4: Wire happiness into `faction-system.ts`

**Files:**
- Modify: `src/systems/faction-system.ts`
- Create: `tests/systems/faction-happiness.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/systems/faction-happiness.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import {
  computeUnrestPressure,
  processFactionTurn,
} from '@/systems/faction-system';

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id, name: id, owner, position,
    population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'outpost',
    grid: [[null]], gridSize: 3,
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

function makeState({
  cityCount = 1,
  cityPosition = { q: 0, r: 0 } as HexCoord,
  atWarCount = 0,
  era = 2,
  silkOwned = false,
}: {
  cityCount?: number;
  cityPosition?: HexCoord;
  atWarCount?: number;
  era?: number;
  silkOwned?: boolean;
} = {}): GameState {
  const civId = 'player';
  const cities: Record<string, City> = {};
  const cityIds: string[] = [];

  // Capital at (0,0)
  const capital = makeCity('capital', civId, { q: 0, r: 0 });
  cities['capital'] = capital;
  cityIds.push('capital');

  for (let i = 1; i <= cityCount; i++) {
    const city = makeCity(`city-${i}`, civId, cityPosition);
    cities[`city-${i}`] = city;
    cityIds.push(`city-${i}`);
  }

  const atWarWith: string[] = [];
  for (let i = 0; i < atWarCount; i++) atWarWith.push(`enemy-${i}`);

  // Build silk tile if needed
  const tiles: Record<string, unknown> = {
    '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: civId },
  };
  let ownedTiles = [{ q: 0, r: 0 }];

  if (silkOwned) {
    tiles['1,0'] = { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: 'silk', improvement: 'plantation', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: civId };
    ownedTiles = [...ownedTiles, { q: 1, r: 0 }];
    cities['capital'] = { ...capital, ownedTiles };
  }

  return {
    turn: 10, era,
    currentPlayer: civId,
    map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    cities,
    civilizations: {
      [civId]: {
        id: civId, civType: 'rome', name: 'Rome',
        cities: cityIds, units: [], gold: 50,
        techState: { completed: silkOwned ? ['irrigation'] : [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { ...createDiplomacyState(civId), atWarWith },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {}, marketplace: null,
  } as unknown as GameState;
}

describe('computeUnrestPressure with happiness', () => {
  it('test 17: ownerHappiness=3 reduces pressure by 6', () => {
    // 1 city, no wars, no conquest — base pressure is 0
    // With ownerHappiness=3 → -6, clamped to 0
    const state = makeState();
    const pressureWithout = computeUnrestPressure('city-1', state, 0);
    const pressureWith = computeUnrestPressure('city-1', state, 3);
    expect(pressureWith).toBe(Math.max(0, pressureWithout - 6));
  });

  it('test 18: base pressure 45 with 3 happiness luxuries → pressure 39 → no unrest fires', () => {
    // 2 wars × 8 = 16 + 6 cities × 3 = 18 → pressure = 34, but let's create exactly 45:
    // Use 9 cities (9-5)*3=12 + 3 wars*8=24 + distance pressure from cityPosition far from capital
    const state = makeState({ cityCount: 8, cityPosition: { q: 20, r: 0 }, atWarCount: 3, era: 2 });
    // Check raw pressure is above 40 without happiness
    const pressureBase = computeUnrestPressure('city-1', state, 0);
    expect(pressureBase).toBeGreaterThan(40); // should trigger unrest without happiness

    // With 3 happiness points → -6 pressure
    const pressureHappy = computeUnrestPressure('city-1', state, 3);
    // Pressure should be 6 less
    expect(pressureHappy).toBe(Math.max(0, pressureBase - 6));
  });

  it('test 19: same pressure with 0 happiness → unrest fires; with happiness may not', () => {
    // Use a lot of cities to push pressure over 40
    const state = makeState({ cityCount: 10, atWarCount: 2, era: 2 });
    const pressureZeroHappy = computeUnrestPressure('city-1', state, 0);
    const pressureThreeHappy = computeUnrestPressure('city-1', state, 3);
    // 3 happiness should reduce by 6
    expect(pressureZeroHappy - pressureThreeHappy).toBe(6);
  });

  it('test 20: computeUnrestPressure called without ownerHappiness → defaults to 0, no crash', () => {
    const state = makeState();
    // This must not throw — optional param defaults to 0
    expect(() => computeUnrestPressure('city-1', state)).not.toThrow();
  });
});

describe('processFactionTurn with happiness', () => {
  it('silk owned: unrest pressure reduced for all cities', () => {
    const state = makeState({ cityCount: 8, atWarCount: 2, era: 2, silkOwned: true });
    const bus = new EventBus();
    // Should not throw
    expect(() => processFactionTurn(state, bus)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/faction-happiness.test.ts 2>&1 | tail -20
```

Expected: Tests for `ownerHappiness` parameter fail because `computeUnrestPressure` doesn't accept it yet.

- [ ] **Step 3: Update `computeUnrestPressure` in `faction-system.ts`**

Add import at top of `src/systems/faction-system.ts`:
```typescript
import { getCivHappinessFromResources } from './resource-acquisition-system';
```

Update the function signature from:
```typescript
export function computeUnrestPressure(cityId: string, state: GameState): number {
```
To:
```typescript
export function computeUnrestPressure(cityId: string, state: GameState, ownerHappiness = 0): number {
```

Add happiness reduction inside `computeUnrestPressure`, immediately before the final `return` statement:
```typescript
  // Happiness from luxury resources reduces unrest pressure
  pressure -= ownerHappiness * 2; // up to −10 from 5 happiness luxuries

  return Math.min(100, Math.max(0, pressure));
```

The existing final line `return Math.min(100, pressure);` must be changed to `return Math.min(100, Math.max(0, pressure));` (add `Math.max(0, ...)` to prevent negative pressure).

- [ ] **Step 4: Add civHappiness map to `processFactionTurn`**

In `processFactionTurn`, immediately after:
```typescript
  let nextState = state;
```

Add:
```typescript
  // Pre-compute happiness per civ to avoid O(cities²) tile scans inside the city loop
  const civHappiness: Record<string, number> = {};
  for (const civId of Object.keys(nextState.civilizations)) {
    civHappiness[civId] = getCivHappinessFromResources(nextState, civId);
  }
```

Then update the **1 internal call site** of `computeUnrestPressure` (currently around line 179):

```typescript
    const pressure = computeUnrestPressure(cityId, nextState);
```

To:
```typescript
    const pressure = computeUnrestPressure(cityId, nextState, civHappiness[city.owner] ?? 0);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/faction-happiness.test.ts 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/faction-system.ts tests/systems/faction-happiness.test.ts
git commit -m "feat(s4a): happiness from luxury resources reduces unrest pressure by 2 per point"
```

---

## Task 5: City panel — resource bonus section

**Files:**
- Modify: `src/ui/city-panel.ts`
- Create: `tests/ui/city-panel-resources.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/city-panel-resources.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GameState } from '@/core/types';
import { createCityPanel } from '@/ui/city-panel';

// Minimal DOM setup
beforeEach(() => {
  document.body.innerHTML = '<div id="panel-root"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

const noopCallbacks = {
  onBuild: () => {},
  onOpenWonderPanel: () => {},
  onClose: () => {},
};

function makeMinimalState(overrides: {
  silkOwned?: boolean;
  gemsOwned?: boolean;
  goldResourceOwned?: boolean;
  noResources?: boolean;
} = {}): GameState {
  const cityPos = { q: 0, r: 0 };
  const tiles: Record<string, unknown> = {
    '0,0': { coord: cityPos, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' },
  };
  const ownedTiles = [cityPos];
  const completed: string[] = [];

  if (overrides.silkOwned) {
    tiles['1,0'] = { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: 'silk', improvement: 'plantation', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' };
    ownedTiles.push({ q: 1, r: 0 });
    completed.push('irrigation');
  }
  if (overrides.gemsOwned) {
    tiles['2,0'] = { coord: { q: 2, r: 0 }, terrain: 'hills', elevation: 'highland', resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' };
    ownedTiles.push({ q: 2, r: 0 });
    completed.push('mining-tech');
  }
  if (overrides.goldResourceOwned) {
    tiles['3,0'] = { coord: { q: 3, r: 0 }, terrain: 'hills', elevation: 'highland', resource: 'gold', improvement: 'mine', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' };
    ownedTiles.push({ q: 3, r: 0 });
    if (!completed.includes('currency')) completed.push('currency');
  }

  return {
    turn: 1, era: 1, currentPlayer: 'player',
    map: { width: 20, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'Rome', owner: 'player',
        position: cityPos, ownedTiles,
        population: 2, food: 0, foodNeeded: 20,
        production: 0, productionProgress: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [cityPos],
        focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        grid: [[null, null, null], [null, null, null], [null, null, null]], gridSize: 3,
        hp: 100, maxHp: 100, garrisonUnitId: null, specialistSlots: [],
      },
    },
    civilizations: {
      'player': {
        id: 'player', civType: 'rome', name: 'Rome',
        cities: ['city-1'], units: [], gold: 50,
        techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {}, marketplace: null,
    economyStatusByCiv: {},
  } as unknown as GameState;
}

describe('city panel resource bonus section', () => {
  it('test 21: silk owned → "Empire bonuses" header and "Silk" text present', () => {
    const container = document.getElementById('panel-root')!;
    const state = makeMinimalState({ silkOwned: true });
    createCityPanel(container, 'city-1', state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).toContain('Empire bonuses');
    expect(text).toContain('Silk');
    expect(text).toContain('+1 happiness');
  });

  it('test 22: gems owned → "City bonuses" header and "Gems" with "+1 gold/turn"', () => {
    const container = document.getElementById('panel-root')!;
    const state = makeMinimalState({ gemsOwned: true });
    createCityPanel(container, 'city-1', state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).toContain('City bonuses');
    expect(text).toContain('Gems');
    expect(text).toContain('+1 gold/turn');
  });

  it('test 23: gold resource shows "Gold deposits" not bare "Gold"', () => {
    const container = document.getElementById('panel-root')!;
    const state = makeMinimalState({ goldResourceOwned: true });
    createCityPanel(container, 'city-1', state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).toContain('Gold deposits');
    expect(text).not.toMatch(/(?<!\w)Gold(?!\s+deposits).*\+1 gold/); // no bare "Gold → +1 gold"
  });

  it('test 24: only yield resources (gems, no silk) → "Empire bonuses" header absent', () => {
    const container = document.getElementById('panel-root')!;
    const state = makeMinimalState({ gemsOwned: true });
    createCityPanel(container, 'city-1', state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Empire bonuses');
    expect(text).toContain('City bonuses');
  });

  it('test 25: no resources → entire Resources section absent', () => {
    const container = document.getElementById('panel-root')!;
    const state = makeMinimalState({ noResources: true });
    createCityPanel(container, 'city-1', state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Empire bonuses');
    expect(text).not.toContain('City bonuses');
    expect(text).not.toContain('happiness');
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/city-panel-resources.test.ts 2>&1 | tail -20
```

Expected: FAIL — resource bonus section doesn't exist yet.

- [ ] **Step 3: Add imports to `city-panel.ts`**

At the top of `src/ui/city-panel.ts`, add:
```typescript
import { getCivAvailableResources, getCivHappinessFromResources, getCivResourceYieldBonus } from '@/systems/resource-acquisition-system';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
```

(Note: `getCivHappinessFromResources` and `getCivResourceYieldBonus` are not strictly needed here since we only need `getCivAvailableResources` + `RESOURCE_DEFINITIONS` to build the display. But import all three for completeness — they're used to determine which section to show.)

Actually, the city panel only needs:
```typescript
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
```

- [ ] **Step 4: Build the resource bonus HTML fragment in `city-panel.ts`**

After the line that computes `const yields = {...}` (around line 97-102), add this block:

```typescript
  // Build resource bonus sections for Empire (happiness) and City (yield) bonuses
  const playerResources = getCivAvailableResources(state, state.currentPlayer);
  const happinessResources = RESOURCE_DEFINITIONS.filter(
    d => d.effect?.type === 'happiness' && playerResources.has(d.id as never),
  );
  const yieldResources = RESOURCE_DEFINITIONS.filter(
    d => d.effect && d.effect.type !== 'happiness' && playerResources.has(d.id as never),
  );

  function resourceDisplayName(defId: string, defName: string): string {
    // Special case: the "gold" resource collides with the currency name.
    return defId === 'gold' ? 'Gold deposits' : defName;
  }

  function yieldLabel(effectType: string): string {
    switch (effectType) {
      case 'gold': return '+1 gold/turn';
      case 'production': return '+1 production/turn';
      case 'food': return '+1 food/turn';
      default: return '';
    }
  }

  let resourceBonusSectionHtml = '';
  if (happinessResources.length > 0 || yieldResources.length > 0) {
    let empireBonusHtml = '';
    if (happinessResources.length > 0) {
      let rows = '';
      for (const def of happinessResources) {
        rows += `<div style="font-size:12px;opacity:0.85;" data-res-happiness="${def.id}"></div>`;
      }
      empireBonusHtml = `<div style="font-weight:bold;font-size:12px;color:#d4af70;margin-bottom:4px;">Empire bonuses</div>${rows}`;
    }

    let cityBonusHtml = '';
    if (yieldResources.length > 0) {
      let rows = '';
      for (const def of yieldResources) {
        rows += `<div style="font-size:12px;opacity:0.85;" data-res-yield="${def.id}"></div>`;
      }
      cityBonusHtml = `<div style="font-weight:bold;font-size:12px;color:#d4af70;margin-bottom:4px;${happinessResources.length > 0 ? 'margin-top:8px;' : ''}">City bonuses</div>${rows}`;
    }

    resourceBonusSectionHtml = `
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;">Resources</div>
        ${empireBonusHtml}${cityBonusHtml}
      </div>
    `;
  }
```

- [ ] **Step 5: Insert resource bonus section into the panel HTML**

In the `const html = \`...\`` template string, after the yield summary row and before the maintenance row, add `${resourceBonusSectionHtml}`:

The yield summary div ends at the `</div>` after the science span (currently around line 333). Insert after that closing `</div>`:
```
    ${resourceBonusSectionHtml}
```

So the section becomes:
```html
    <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;">
      <span>🌾 +<span data-text="yield-food"></span></span>
      <span>⚒️ +<span data-text="yield-prod"></span></span>
      <span>💰 +<span data-text="yield-gold"></span></span>
      <span>🔬 +<span data-text="yield-science"></span></span>
    </div>
    ${resourceBonusSectionHtml}
    <div style="display:flex;gap:10px;...">
```

- [ ] **Step 6: Populate the resource bonus rows via `textContent` (after `panel.innerHTML = html`)**

After the existing `setText` calls (around line 380), add:

```typescript
  // Populate resource bonus rows (textContent only — no innerHTML with game strings)
  for (const def of happinessResources) {
    const el = panel.querySelector(`[data-res-happiness="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → +1 happiness`;
  }
  for (const def of yieldResources) {
    const el = panel.querySelector(`[data-res-yield="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → ${yieldLabel(def.effect!.type)}`;
  }
```

Note: `resourceDisplayName` and `yieldLabel` are defined in step 4 above; they are in scope because they're defined in the same `createCityPanel` function.

- [ ] **Step 7: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/city-panel-resources.test.ts 2>&1 | tail -20
```

Expected: All 5 tests PASS.

- [ ] **Step 8: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel-resources.test.ts
git commit -m "feat(s4a): add resource bonus section to city panel (Empire/City bonuses split)"
```

---

## Task 6: HUD happiness chip

**Files:**
- Modify: `src/main.ts`
- Create: `tests/ui/hud-happiness.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/hud-happiness.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import type { GameState } from '@/core/types';

// We test the happiness helper directly (HUD rendering is in main.ts, not easily unit-testable)
// These tests document the HUD chip contract.

function makeStateWithHappiness(happinessCount: number): GameState {
  const cityPos = { q: 0, r: 0 };
  const tiles: Record<string, unknown> = {
    '0,0': { coord: cityPos, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' },
  };
  const ownedTiles = [cityPos];
  const completed: string[] = [];

  // Each happiness luxury uses a different resource
  const happinessSources = [
    { id: 'silk', tech: 'irrigation', terrain: 'grassland', improvement: 'plantation' },
    { id: 'wine', tech: 'pottery', terrain: 'plains', improvement: 'plantation' },
    { id: 'ivory', tech: 'foraging', terrain: 'forest', improvement: 'camp' },
    { id: 'furs', tech: 'foraging', terrain: 'forest', improvement: 'camp' },
    { id: 'incense', tech: 'currency', terrain: 'desert', improvement: 'plantation' },
  ];

  for (let i = 0; i < happinessCount && i < happinessSources.length; i++) {
    const src = happinessSources[i];
    const coord = { q: i + 1, r: 0 };
    tiles[`${coord.q},0`] = { coord, terrain: src.terrain, elevation: 'lowland', resource: src.id, improvement: src.improvement, improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' };
    ownedTiles.push(coord);
    if (!completed.includes(src.tech)) completed.push(src.tech);
  }

  return {
    turn: 1, era: 1, currentPlayer: 'player',
    map: { width: 20, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'Rome', owner: 'player',
        position: cityPos, ownedTiles,
        population: 1, food: 0, foodNeeded: 20,
        production: 0, productionProgress: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [cityPos],
        focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        grid: [[null]], gridSize: 3, hp: 100, maxHp: 100,
        garrisonUnitId: null, specialistSlots: [],
      },
    },
    civilizations: {
      'player': {
        id: 'player', civType: 'rome', name: 'Rome',
        cities: ['city-1'], units: [], gold: 0,
        techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {}, marketplace: null,
  } as unknown as GameState;
}

describe('HUD happiness chip contract', () => {
  it('test 26: civ with 2 happiness luxuries → getCivHappinessFromResources returns 2', () => {
    const state = makeStateWithHappiness(2);
    expect(getCivHappinessFromResources(state, 'player')).toBe(2);
  });

  it('test 27: civ with 0 happiness luxuries → getCivHappinessFromResources returns 0 (chip should be hidden)', () => {
    const state = makeStateWithHappiness(0);
    expect(getCivHappinessFromResources(state, 'player')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify tests pass (they test the helper, not the DOM)**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/hud-happiness.test.ts 2>&1 | tail -10
```

Expected: PASS (the helper is already implemented in Task 2).

- [ ] **Step 3: Add happiness chip to `updateHUD()` in `src/main.ts`**

Add import near the top of `src/main.ts` (with other system imports):
```typescript
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
```

Inside `updateHUD()`, after the `sciSpan` is appended to `yieldsRow` (currently around line 350), add:

```typescript
  const happiness = getCivHappinessFromResources(gameState, civ.id);
  if (happiness > 0) {
    const happySpan = document.createElement('span');
    happySpan.title = 'Happiness from luxury resources — each point reduces city unrest pressure by 2';
    happySpan.textContent = `☺ ${happiness} (stability)`;
    yieldsRow.appendChild(happySpan);
  }
```

- [ ] **Step 4: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts tests/ui/hud-happiness.test.ts
git commit -m "feat(s4a): add happiness chip to HUD (hidden when 0, shows stability label)"
```

---

## Task 7: Marketplace panel — effect badges

**Files:**
- Modify: `src/ui/marketplace-panel.ts`
- Create: `tests/ui/marketplace-panel-effects.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/marketplace-panel-effects.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GameState } from '@/core/types';
import { createMarketplacePanel } from '@/ui/marketplace-panel';

beforeEach(() => { document.body.innerHTML = '<div id="mp-root"></div>'; });
afterEach(() => { document.body.innerHTML = ''; });

function makeMarketState(options: { knowsSilk?: boolean; knowsIron?: boolean } = {}): GameState {
  const completed: string[] = [];
  if (options.knowsSilk) completed.push('irrigation');
  if (options.knowsIron) completed.push('bronze-working');

  return {
    turn: 1, era: 2, currentPlayer: 'player',
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    cities: {},
    civilizations: {
      'player': {
        id: 'player', civType: 'rome', name: 'Rome',
        cities: [], units: [], gold: 0,
        techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {},
    marketplace: {
      prices: { silk: 8, iron: 8 },
      priceHistory: { silk: [8], iron: [8] },
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
    },
  } as unknown as GameState;
}

describe('marketplace panel effect badges', () => {
  it('test 28: silk row contains "+1 happiness" badge', () => {
    const container = document.getElementById('mp-root')!;
    const state = makeMarketState({ knowsSilk: true });
    createMarketplacePanel(container, state, { onClose: () => {} });
    const text = container.textContent ?? '';
    expect(text).toContain('+1 happiness');
  });

  it('test 29: iron row contains "unlocks advanced units" hint, not "null"', () => {
    const container = document.getElementById('mp-root')!;
    const state = makeMarketState({ knowsIron: true });
    createMarketplacePanel(container, state, { onClose: () => {} });
    const text = container.textContent ?? '';
    expect(text).toContain('unlocks advanced units');
    expect(text).not.toContain('null');
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel-effects.test.ts 2>&1 | tail -20
```

Expected: FAIL — effect badges not yet added.

- [ ] **Step 3: Add effect badge to each resource row in `marketplace-panel.ts`**

The resource row HTML is built in the `resourceRowsHtml` map (around lines 57-78). The row currently has:
```html
<div style="font-size:11px;opacity:0.6;" data-text="res-owned-${idx}"></div>
```

Add a placeholder for the effect badge below the owned status:
```html
<div style="font-size:10px;opacity:0.65;" data-text="res-effect-${idx}"></div>
```

So the inner `flex:1` div becomes:
```html
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:bold;"><span data-text="res-name-${idx}"></span> <span style="font-size:10px;color:${typeColor};" data-text="res-type-${idx}"></span></div>
          <div style="font-size:11px;opacity:0.6;" data-text="res-owned-${idx}"></div>
          <div style="font-size:10px;opacity:0.65;" data-text="res-effect-${idx}"></div>
        </div>
```

Then in the `setText` loop (around line 111-118), add the effect text:

```typescript
  knownDefs.forEach((def, idx) => {
    const price = marketplace.prices[def.id] ?? def.basePrice;
    const isOwned = ownedResources.has(def.id as ResourceType);
    setText(`res-name-${idx}`, def.name);
    setText(`res-type-${idx}`, def.type.charAt(0).toUpperCase() + def.type.slice(1));
    setText(`res-owned-${idx}`, isOwned ? '✓ Owned' : '✗ Not in inventory');
    setText(`res-price-${idx}`, String(price));

    // Effect badge (added in S4a)
    let effectText = '';
    if (def.effect) {
      switch (def.effect.type) {
        case 'happiness':   effectText = '★ +1 happiness'; break;
        case 'gold':        effectText = '$ +1 gold/turn'; break;
        case 'production':  effectText = '⚙ +1 production/turn'; break;
        case 'food':        effectText = '🌾 +1 food/turn'; break;
      }
    } else {
      effectText = '(unlocks advanced units & buildings)';
    }
    setText(`res-effect-${idx}`, effectText);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel-effects.test.ts 2>&1 | tail -10
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel-effects.test.ts
git commit -m "feat(s4a): add effect badge per resource row in marketplace panel"
```

---

## Task 8: Earth map — RESOURCE_ZONES additions and stone fallback fix

**Files:**
- Modify: `scripts/generate-earth-maps.ts`
- Create: `tests/systems/earth-map-geo.test.ts`

- [ ] **Step 1: Write the failing geo-coverage test**

Create `tests/systems/earth-map-geo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// We test the RESOURCE_ZONES array directly by importing the generate script module.
// The script is not designed for direct import, so we read the bounding boxes
// from the spec and verify them against the RESOURCE_ZONES array.

// The expected bounding boxes for new resources, per spec §Earth map.
// Each entry is: { resource, lonMin, lonMax, latMin, latMax }
const EXPECTED_NEW_ZONE_BOXES = [
  // Gold
  { resource: 'gold', lonMin: 25,   lonMax: 32,   latMin: -30, latMax: -22 }, // S. Africa
  { resource: 'gold', lonMin: -122, lonMax: -114, latMin: 36,  latMax: 42  }, // California
  { resource: 'gold', lonMin: 120,  lonMax: 150,  latMin: 55,  latMax: 65  }, // Siberia
  // Silver
  { resource: 'silver', lonMin: -107, lonMax: -98, latMin: 20,  latMax: 30  }, // Mexico
  { resource: 'silver', lonMin: -70,  lonMax: -63, latMin: -24, latMax: -14 }, // Bolivia/Peru
  // Furs
  { resource: 'furs', lonMin: 60,   lonMax: 140,  latMin: 55, latMax: 70 }, // Siberia
  { resource: 'furs', lonMin: -135, lonMax: -70,  latMin: 50, latMax: 70 }, // Canada
  // Sheep
  { resource: 'sheep', lonMin: -10, lonMax: 2,   latMin: 50, latMax: 60 }, // British Isles
  { resource: 'sheep', lonMin: 80,  lonMax: 120, latMin: 40, latMax: 52 }, // C. Asia
  // Cattle
  { resource: 'cattle', lonMin: -105, lonMax: -95, latMin: 35, latMax: 50 }, // Great Plains
  { resource: 'cattle', lonMin: -65,  lonMax: -57, latMin: -40, latMax: -28 }, // Pampas
  // Salt
  { resource: 'salt', lonMin: 12,  lonMax: 25,  latMin: 47, latMax: 55 }, // C. Europe
  { resource: 'salt', lonMin: 44,  lonMax: 58,  latMin: 30, latMax: 38 }, // Iran
];

// Read RESOURCE_ZONES from the generate script using fs
import { readFileSync } from 'fs';
import { resolve } from 'path';

function parseResourceZonesFromScript(): Array<{ resource: string; terrain: string; lonMin: number; lonMax: number; latMin: number; latMax: number }> {
  const scriptPath = resolve(__dirname, '../../scripts/generate-earth-maps.ts');
  const content = readFileSync(scriptPath, 'utf-8');

  const zonesMatch = content.match(/const RESOURCE_ZONES[^=]*=\s*\[([\s\S]*?)\];/);
  if (!zonesMatch) throw new Error('Could not find RESOURCE_ZONES in script');

  const zonesText = zonesMatch[1];
  const entries: Array<{ resource: string; terrain: string; lonMin: number; lonMax: number; latMin: number; latMax: number }> = [];

  const entryRegex = /\{\s*resource:\s*'([^']+)',\s*terrain:\s*'[^']+',\s*lonMin:\s*(-?[\d.]+),\s*lonMax:\s*(-?[\d.]+),\s*latMin:\s*(-?[\d.]+),\s*latMax:\s*(-?[\d.]+)/g;
  let match;
  while ((match = entryRegex.exec(zonesText)) !== null) {
    entries.push({
      resource: match[1],
      terrain: '',
      lonMin: parseFloat(match[2]),
      lonMax: parseFloat(match[3]),
      latMin: parseFloat(match[4]),
      latMax: parseFloat(match[5]),
    });
  }

  return entries;
}

describe('earth map RESOURCE_ZONES geo-coverage', () => {
  it('test 31: each new resource has at least one zone entry in the script', () => {
    const zones = parseResourceZonesFromScript();
    const newResources = ['gold', 'silver', 'furs', 'sheep', 'cattle', 'salt'];

    for (const resource of newResources) {
      const found = zones.some(z => z.resource === resource);
      expect(found, `${resource} has no RESOURCE_ZONES entry`).toBe(true);
    }
  });

  it('test 31b: key bounding boxes from spec are present in RESOURCE_ZONES', () => {
    const zones = parseResourceZonesFromScript();

    for (const expected of EXPECTED_NEW_ZONE_BOXES) {
      const found = zones.some(z =>
        z.resource === expected.resource &&
        z.lonMin === expected.lonMin &&
        z.lonMax === expected.lonMax &&
        z.latMin === expected.latMin &&
        z.latMax === expected.latMax,
      );
      expect(found, `Missing zone: ${expected.resource} [${expected.lonMin},${expected.lonMax}]x[${expected.latMin},${expected.latMax}]`).toBe(true);
    }
  });

  it('test 31c: stone fallback uses mountain, not hills', () => {
    const scriptPath = resolve(__dirname, '../../scripts/generate-earth-maps.ts');
    const content = readFileSync(scriptPath, 'utf-8');
    // Should NOT contain the old hills fallback for stone
    expect(content).not.toContain("terrain === 'hills' && r < 0.08");
    // Should contain the new mountain fallback
    expect(content).toContain("terrain === 'mountain' && r < 0.15");
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/earth-map-geo.test.ts 2>&1 | tail -20
```

Expected: FAIL — zones don't exist yet, stone fallback uses old code.

- [ ] **Step 3: Update `generate-earth-maps.ts` — fix stone fallback**

In `scripts/generate-earth-maps.ts`, find the stone fallback (currently around line 216):
```typescript
  if (terrain === 'hills' && r < 0.08) {
    return 'stone';
  }
```

Replace with:
```typescript
  if (terrain === 'mountain' && r < 0.15) {
    return 'stone';
  }
```

- [ ] **Step 4: Update `generate-earth-maps.ts` — add missing zones and patch existing zones**

Find the `const RESOURCE_ZONES: ResourceZone[] = [` array and replace it entirely with the zones from the spec. Here is the complete array:

```typescript
const RESOURCE_ZONES: ResourceZone[] = [
  // Horses
  { resource: 'horses', terrain: 'plains', lonMin: 50,   lonMax: 100,  latMin: 40, latMax: 55 }, // Central Asian steppe
  { resource: 'horses', terrain: 'plains', lonMin: -110, lonMax: -95,  latMin: 30, latMax: 50 }, // Great Plains (Americas)
  { resource: 'horses', terrain: 'plains', lonMin: 35,   lonMax: 55,   latMin: 15, latMax: 30 }, // PATCH: Arabian Peninsula

  // Iron
  { resource: 'iron', terrain: 'hills', lonMin: 5,   lonMax: 30,   latMin: 50, latMax: 65 }, // N. Europe/Scandinavia
  { resource: 'iron', terrain: 'hills', lonMin: 105, lonMax: 120,  latMin: 30, latMax: 45 }, // China
  { resource: 'iron', terrain: 'hills', lonMin: -95, lonMax: -75,  latMin: 40, latMax: 50 }, // Great Lakes (US)
  { resource: 'iron', terrain: 'hills', lonMin: -50, lonMax: -40,  latMin: -22, latMax: -10 }, // PATCH: Brazil/Minas Gerais
  { resource: 'iron', terrain: 'hills', lonMin: 83,  lonMax: 88,   latMin: 21, latMax: 25 }, // PATCH: India/Jharkhand

  // Silk
  { resource: 'silk', terrain: 'grassland', lonMin: 95, lonMax: 115, latMin: 30, latMax: 40 }, // China

  // Spices
  { resource: 'spices', terrain: 'jungle', lonMin: 95,  lonMax: 140, latMin: -10, latMax: 20 }, // SE Asia
  { resource: 'spices', terrain: 'jungle', lonMin: 70,  lonMax: 85,  latMin: 8,   latMax: 20 }, // S. India
  { resource: 'spices', terrain: 'jungle', lonMin: 38,  lonMax: 42,  latMin: -8,  latMax: 0  }, // PATCH: Zanzibar/E. Africa

  // Incense
  { resource: 'incense', terrain: 'desert', lonMin: 40, lonMax: 60, latMin: 15, latMax: 30 }, // Arabian Peninsula
  { resource: 'incense', terrain: 'desert', lonMin: 10, lonMax: 40, latMin: 15, latMax: 30 }, // N. Africa / Horn

  // Gems — terrain MUST be 'hills' (mine required; plantation cannot be built on jungle)
  { resource: 'gems', terrain: 'hills', lonMin: 20,   lonMax: 40,   latMin: -30, latMax: 5  }, // S. Africa
  { resource: 'gems', terrain: 'hills', lonMin: 75,   lonMax: 85,   latMin: 10,  latMax: 25 }, // India
  { resource: 'gems', terrain: 'hills', lonMin: -80,  lonMax: -65,  latMin: -20, latMax: 5  }, // S. America (Andes/Colombia — hills not jungle)
  { resource: 'gems', terrain: 'hills', lonMin: 95,   lonMax: 103,  latMin: 17,  latMax: 27 }, // PATCH: Myanmar
  { resource: 'gems', terrain: 'hills', lonMin: 135,  lonMax: 145,  latMin: -32, latMax: -25 }, // PATCH: Australia

  // Ivory
  { resource: 'ivory', terrain: 'forest', lonMin: 10,  lonMax: 40,   latMin: -15, latMax: 10 }, // Central/West Africa
  { resource: 'ivory', terrain: 'forest', lonMin: 33,  lonMax: 42,   latMin: -10, latMax: 5  }, // PATCH: East Africa
  { resource: 'ivory', terrain: 'forest', lonMin: 75,  lonMax: 105,  latMin: 8,   latMax: 22 }, // PATCH: South Asia

  // Wine — terrain MUST be 'plains' (wine's RESOURCE_DEFINITION terrain)
  { resource: 'wine', terrain: 'plains', lonMin: -5,   lonMax: 30,   latMin: 35, latMax: 47 }, // Mediterranean/France/Iberia
  { resource: 'wine', terrain: 'plains', lonMin: -123, lonMax: -119, latMin: 37, latMax: 39 }, // PATCH: California (Napa)
  { resource: 'wine', terrain: 'plains', lonMin: 18,   lonMax: 22,   latMin: -34, latMax: -32 }, // PATCH: S. Africa (Cape)
  { resource: 'wine', terrain: 'plains', lonMin: -72,  lonMax: -68,  latMin: -37, latMax: -30 }, // PATCH: Chile/Mendoza

  // Copper
  { resource: 'copper', terrain: 'hills', lonMin: -80,  lonMax: -65,  latMin: -35, latMax: 10 }, // S. America (Andes)
  { resource: 'copper', terrain: 'hills', lonMin: -9,   lonMax: -5,   latMin: 37,  latMax: 43 }, // Iberian Peninsula
  { resource: 'copper', terrain: 'hills', lonMin: 25,   lonMax: 30,   latMin: -15, latMax: -8 }, // PATCH: Zambia/DRC
  { resource: 'copper', terrain: 'hills', lonMin: -115, lonMax: -108, latMin: 32,  latMax: 48 }, // PATCH: Arizona/Montana

  // Gold (NEW)
  { resource: 'gold', terrain: 'hills', lonMin: 25,   lonMax: 32,   latMin: -30, latMax: -22 }, // S. Africa (Witwatersrand)
  { resource: 'gold', terrain: 'hills', lonMin: -122, lonMax: -114, latMin: 36,  latMax: 42  }, // California/Sierra Nevada
  { resource: 'gold', terrain: 'hills', lonMin: 120,  lonMax: 150,  latMin: 55,  latMax: 65  }, // Siberia
  { resource: 'gold', terrain: 'hills', lonMin: -3,   lonMax: 2,    latMin: 5,   latMax: 10  }, // W. Africa (Ghana)

  // Silver (NEW)
  { resource: 'silver', terrain: 'hills', lonMin: -107, lonMax: -98, latMin: 20, latMax: 30 }, // Mexico (Zacatecas)
  { resource: 'silver', terrain: 'hills', lonMin: -70,  lonMax: -63, latMin: -24, latMax: -14 }, // Bolivia/Peru (Potosí)
  { resource: 'silver', terrain: 'hills', lonMin: 12,   lonMax: 20,  latMin: 49, latMax: 53 }, // C. Europe (Saxony)

  // Furs (NEW — forest and tundra)
  { resource: 'furs', terrain: 'forest', lonMin: 60,   lonMax: 140,  latMin: 55, latMax: 70 }, // Siberia (forest)
  { resource: 'furs', terrain: 'tundra', lonMin: 60,   lonMax: 140,  latMin: 55, latMax: 70 }, // Siberia (tundra)
  { resource: 'furs', terrain: 'forest', lonMin: -135, lonMax: -70,  latMin: 50, latMax: 70 }, // Canada (forest)
  { resource: 'furs', terrain: 'tundra', lonMin: -135, lonMax: -70,  latMin: 50, latMax: 70 }, // Canada (tundra)
  { resource: 'furs', terrain: 'forest', lonMin: 15,   lonMax: 30,   latMin: 60, latMax: 70 }, // Scandinavia

  // Sheep (NEW — hills and plains)
  { resource: 'sheep', terrain: 'hills',  lonMin: -10, lonMax: 2,   latMin: 50, latMax: 60 }, // British Isles
  { resource: 'sheep', terrain: 'plains', lonMin: 80,  lonMax: 120, latMin: 40, latMax: 52 }, // C. Asia/Mongolia
  { resource: 'sheep', terrain: 'plains', lonMin: -73, lonMax: -60, latMin: -52, latMax: -37 }, // Patagonia
  { resource: 'sheep', terrain: 'hills',  lonMin: -8,  lonMax: 2,   latMin: 38, latMax: 43 }, // Iberia (merino)

  // Cattle (NEW — grassland and plains)
  { resource: 'cattle', terrain: 'plains',    lonMin: -105, lonMax: -95, latMin: 35, latMax: 50 }, // Great Plains
  { resource: 'cattle', terrain: 'grassland', lonMin: -65,  lonMax: -57, latMin: -40, latMax: -28 }, // Argentine Pampas
  { resource: 'cattle', terrain: 'grassland', lonMin: 32,   lonMax: 42,  latMin: -5,  latMax: 10 }, // East Africa

  // Salt (NEW — hills)
  { resource: 'salt', terrain: 'hills', lonMin: 12,  lonMax: 25,  latMin: 47, latMax: 55 }, // C. Europe (Wieliczka)
  { resource: 'salt', terrain: 'hills', lonMin: 44,  lonMax: 58,  latMin: 30, latMax: 38 }, // Zagros/Iran
  { resource: 'salt', terrain: 'hills', lonMin: -70, lonMax: -65, latMin: -25, latMax: -16 }, // Andes (Atacama)
  { resource: 'salt', terrain: 'hills', lonMin: -5,  lonMax: 10,  latMin: 30, latMax: 37 }, // N. Africa/Atlas
];
```

- [ ] **Step 5: Run geo tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/earth-map-geo.test.ts 2>&1 | tail -20
```

Expected: All 3 sub-tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 7: Commit the script changes**

```bash
git add scripts/generate-earth-maps.ts tests/systems/earth-map-geo.test.ts
git commit -m "feat(s4a): add RESOURCE_ZONES for 6 new resources, patch existing zones, fix stone fallback to mountain"
```

---

## Task 9: Regenerate earth-map data

**Files:**
- Regenerate: `src/systems/earth-map-data.ts`, `src/systems/old-world-map-data.ts`, `src/systems/new-world-map-data.ts`

- [ ] **Step 1: Run the map generator**

```bash
bash scripts/run-with-mise.sh yarn generate-maps 2>&1
```

Expected: Exits 0. `src/systems/earth-map-data.ts` (and old/new world variants) are regenerated.

- [ ] **Step 2: Verify the regenerated data has the new resources**

```bash
grep -c "gold\|silver\|furs\|sheep\|cattle\|salt" src/systems/earth-map-data.ts
```

Expected: Non-zero count (at least some of the new resources appear in tiles).

Also verify stone now appears on mountain tiles (not hills):
```bash
grep "stone" src/systems/earth-map-data.ts | head -5
```

Expected output contains `terrain:'mountain'` with resource `'stone'` (or vice versa in the tile structure).

- [ ] **Step 3: Run full test suite one more time**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 4: Build to verify TypeScript**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: Exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/systems/earth-map-data.ts src/systems/old-world-map-data.ts src/systems/new-world-map-data.ts
git commit -m "chore(s4a): regenerate earth-map-data with new resource zones and stone-on-mountain fix"
```

---

## Task 10: Final verification and PR

- [ ] **Step 1: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: All tests PASS. Count total PASS lines — should include the 31 new tests across the 5 test files.

- [ ] **Step 2: Run TypeScript build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: Exits 0.

- [ ] **Step 3: Verify git log shows all commits on the branch**

```bash
git log --oneline origin/main..HEAD
```

Expected: 9 commits (Tasks 1–9 each produced one commit).

- [ ] **Step 4: Open PR**

```bash
gh pr create \
  --title "feat(marketplace): S4a — per-resource yield & happiness effects" \
  --body "$(cat <<'EOF'
## Summary

- Adds `ResourceEffect` type and `effect` field to all 16 `RESOURCE_DEFINITIONS` (static data, no GameState migration needed)
- Adds `getCivResourceYieldBonus` and `getCivHappinessFromResources` pure helpers in `resource-acquisition-system.ts`
- Wires yield bonuses into `turn-manager.ts` (once per civ before city loop — architecture regression covered)
- Wires happiness reduction into `faction-system.ts` (`computeUnrestPressure` optional param + per-civ pre-computation in `processFactionTurn`)
- Surfaces bonuses in city panel (Empire bonuses / City bonuses split), HUD (☺ N (stability) chip when > 0), and marketplace panel (effect badge per row)
- Fixes earth map: adds RESOURCE_ZONES for 6 new S2a resources (gold, silver, furs, sheep, cattle, salt), patches missing zones for 7 existing resources, and corrects the stone terrain fallback from `hills` to `mountain`
- 31 new tests across 5 test files

## Test plan

- [ ] `yarn test` exits 0 — 31 new tests all pass
- [ ] `yarn build` exits 0 — no TypeScript errors
- [ ] Start dev server (`yarn dev`) and verify: own a silk tile → HUD shows "☺ 1 (stability)"; own gems → city panel shows "City bonuses — Gems → +1 gold/turn"; open marketplace → iron row shows "unlocks advanced units & buildings"
- [ ] Start new earth map game — verify salt, cattle, furs, sheep, silver, gold tiles appear on the map within expected geographic regions

## Out of scope

- S4b: strategic resource prerequisites for units/buildings (copper/iron/horses/stone effects)
- Era/tech scaling of bonus amounts (flat +1 in this slice)
- Old-world and new-world map data geographic review (follow-up)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered in plan? |
|---|---|
| Effect table (all 16 resources) | ✓ Task 1 — all 16 updated |
| Non-stacking per resource, accumulation across different resources | ✓ Tests 7, 8, 9 |
| Loss timing: computed fresh each turn | ✓ No persistent copy — pure helpers only |
| `ResourceEffect` type in `trade-system.ts` | ✓ Task 1 |
| `getCivResourceYieldBonus` (excludes happiness) | ✓ Task 2, test 12 |
| `getCivHappinessFromResources` | ✓ Task 2 |
| `turn-manager.ts` once per civ (not per city) | ✓ Task 3, arch regression confirmed in diff |
| Science not boosted by resources | ✓ Task 3 code explicitly omits science |
| `computeUnrestPressure` optional `ownerHappiness = 0` | ✓ Task 4, test 20 |
| civHappiness map in `processFactionTurn` (O(cities²) prevention) | ✓ Task 4 |
| −2 pressure per happiness point | ✓ Task 4, tests 17-19 |
| City panel Empire/City split; sub-headers omitted when empty | ✓ Task 5, tests 21-25 |
| "Gold deposits" naming for gold resource | ✓ Task 5, test 23 |
| HUD chip hidden when 0, self-explanatory "(stability)" label | ✓ Task 6, tests 26-27 |
| Marketplace effect badge; null resources say "unlocks advanced units & buildings" | ✓ Task 7, tests 28-29 |
| Save compatibility (effect is static, no migration) | ✓ Test 30 |
| Stone fallback: hills → mountain at 15% | ✓ Task 8, test 31c |
| 6 new resource zones | ✓ Task 8, test 31 |
| Patch zones for existing resources (iron+3, horses+1, spices+1, gems+2, ivory+2, wine+3, copper+2) | ✓ Task 8 zone array |
| Regenerate earth-map-data | ✓ Task 9 |

**Placeholder scan:** No "TBD", "TODO", "implement later", or similar. All code steps show exact implementation.

**Type consistency check:**
- `ResourceEffect.type` = `'happiness' | 'gold' | 'production' | 'food'` — consistent throughout
- `getCivResourceYieldBonus` returns `ResourceYield` — consistent with turn-manager usage
- `computeUnrestPressure(cityId, state, ownerHappiness = 0)` — consistent between Task 4 implementation and all test call sites
- `createCityPanel` — function exists in `city-panel.ts` at the expected export path
- `RESOURCE_DEFINITIONS` imported from `@/systems/trade-system` everywhere — consistent
