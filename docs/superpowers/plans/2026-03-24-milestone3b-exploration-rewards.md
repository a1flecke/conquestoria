# Milestone 3b "Exploration Rewards" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add natural wonders, tribal villages, and Treasurer/Scholar advisors to make exploration rewarding and every map unique.

**Architecture:** Three new systems (wonder-definitions, wonder-system, village-system) with minimal coupling. Wonders and villages are placed during map generation. Wonder effects are read at call sites (combat, yields, vision, healing). Village visits happen on unit move. Two new advisor types fire independently.

**Tech Stack:** TypeScript, Vitest, seeded PRNG (mulberry32 — extracted to shared utility)

---

### Task 1: Expand Types

**Files:**
- Modify: `src/core/types.ts:10-13,40-51,305-308,342-358,360-368,372-408`

- [ ] **Step 1: Add wonder and village types to types.ts**

Add after the `ResourceYield` interface (line 34):

```typescript
// --- Natural Wonders ---

export type WonderEffectType = 'adjacent_yield_bonus' | 'healing' | 'eruption' | 'vision' | 'combat_bonus' | 'none';

export type WonderEffect =
  | { type: 'adjacent_yield_bonus'; yields: Partial<ResourceYield> }
  | { type: 'healing'; hpPerTurn: number }
  | { type: 'eruption'; chance: number }
  | { type: 'vision'; bonus: number }
  | { type: 'combat_bonus'; defenseBonus: number }
  | { type: 'none' };

export interface WonderDefinition {
  id: string;
  name: string;
  description: string;
  yields: ResourceYield;
  discoveryBonus: { type: 'gold' | 'science' | 'production'; amount: number };
  effect: WonderEffect;
  validTerrain: TerrainType[];
}

// --- Tribal Villages ---

export type VillageOutcomeType = 'gold' | 'food' | 'science' | 'free_unit' | 'free_tech' | 'ambush' | 'illness';

export interface TribalVillage {
  id: string;
  position: HexCoord;
}
```

- [ ] **Step 2: Add `wonder` field to HexTile**

In the `HexTile` interface (line 42-51), add after `hasRiver: boolean`:

```typescript
  wonder: string | null;           // wonder definition ID
```

- [ ] **Step 3: Expand AdvisorType**

Change line 307 from:
```typescript
export type AdvisorType = 'builder' | 'explorer' | 'chancellor' | 'warchief';
```
to:
```typescript
export type AdvisorType = 'builder' | 'explorer' | 'chancellor' | 'warchief' | 'treasurer' | 'scholar';
```

- [ ] **Step 4: Add wonder/village fields to GameState**

In the `GameState` interface (line 342-358), add after `pendingEvents?`:

```typescript
  tribalVillages: Record<string, TribalVillage>;
  discoveredWonders: Record<string, string>;       // wonderId -> first discoverer civId
  wonderDiscoverers: Record<string, string[]>;     // wonderId -> all discoverer civIds
```

- [ ] **Step 5: Add new GameEvents entries**

In the `GameEvents` interface (after line 407), add:

```typescript
  'wonder:discovered': { civId: string; wonderId: string; position: HexCoord; isFirstDiscoverer: boolean };
  'wonder:eruption': { wonderId: string; position: HexCoord; tilesAffected: HexCoord[] };
  'village:visited': { civId: string; position: HexCoord; outcome: VillageOutcomeType; message: string };
```

- [ ] **Step 6: Run type check**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | head -50`
Expected: Type errors in files that reference `HexTile` without `wonder` field and `advisorsEnabled` without new keys. This is expected — we'll fix these in subsequent tasks.

- [ ] **Step 7: Export createRng from map-generator.ts and fix HexTile**

In `src/systems/map-generator.ts`, export the `createRng` function (line 6) by changing `function createRng` to `export function createRng`. This shared PRNG will be used by wonder and village systems for reproducibility.

Also in the tile creation object (line 141-151), add `wonder: null`:

```typescript
      tiles[key] = {
        coord: { q, r },
        terrain,
        elevation: terrain === 'mountain' ? 'mountain' : terrain === 'hills' ? 'highland' : terrain === 'volcanic' ? 'highland' : elevation === 'mountain' ? 'highland' : elevation,
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
```

- [ ] **Step 8: Fix advisorsEnabled in game-state.ts**

In `src/core/game-state.ts`, update both `advisorsEnabled` objects (line 115 in `createNewGame` and line 190 in `createHotSeatGame`) to:

```typescript
      advisorsEnabled: { builder: true, explorer: true, chancellor: true, warchief: true, treasurer: true, scholar: true },
```

Also add `tribalVillages: {}`, `discoveredWonders: {}`, `wonderDiscoverers: {}` to both return objects.

In `createNewGame` (line 95-118), add after `pendingEvents` / before the closing brace:

```typescript
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
```

In `createHotSeatGame` (line 168-193), add similarly:

```typescript
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
```

- [ ] **Step 9: Fix advisorsEnabled in advisor-system.test.ts**

In `tests/ui/advisor-system.test.ts`, update every `advisorsEnabled` object literal to include `treasurer: true, scholar: true` (or `false` — match the pattern of the test). There are 5 occurrences at lines 56, 70, 88, 106, 129, and 148. Add `, treasurer: false, scholar: false` to each.

- [ ] **Step 10: Fix migrateLegacySave in main.ts**

In `src/main.ts`, update the `migrateLegacySave` function (line 634-657). After the existing `advisorsEnabled` check (line 650-652), add:

```typescript
  // Add new advisor types if missing (M3b migration)
  if (gameState.settings.advisorsEnabled && !('treasurer' in gameState.settings.advisorsEnabled)) {
    (gameState.settings.advisorsEnabled as any).treasurer = true;
    (gameState.settings.advisorsEnabled as any).scholar = true;
  }
  // Add wonder/village state if missing
  if (!gameState.tribalVillages) (gameState as any).tribalVillages = {};
  if (!gameState.discoveredWonders) (gameState as any).discoveredWonders = {};
  if (!gameState.wonderDiscoverers) (gameState as any).wonderDiscoverers = {};
  // Add wonder field to tiles if missing
  for (const tile of Object.values(gameState.map.tiles)) {
    if (!('wonder' in tile)) (tile as any).wonder = null;
  }
```

- [ ] **Step 11: Run tests to verify nothing is broken**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -20`
Expected: All 228 tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/core/types.ts src/systems/map-generator.ts src/core/game-state.ts src/main.ts tests/ui/advisor-system.test.ts
git commit -m "feat(m3b): expand types for wonders, villages, and new advisors"
```

---

### Task 2: Wonder Definitions

**Files:**
- Create: `src/systems/wonder-definitions.ts`
- Create: `tests/systems/wonder-definitions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/systems/wonder-definitions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WONDER_DEFINITIONS, getWonderDefinition } from '@/systems/wonder-definitions';

describe('Wonder Definitions', () => {
  it('has exactly 15 wonders', () => {
    expect(WONDER_DEFINITIONS).toHaveLength(15);
  });

  it('all wonders have unique IDs', () => {
    const ids = WONDER_DEFINITIONS.map(w => w.id);
    expect(new Set(ids).size).toBe(15);
  });

  it('all wonders have valid terrain types', () => {
    const validTerrains = ['grassland', 'plains', 'desert', 'tundra', 'snow', 'forest', 'hills', 'mountain', 'ocean', 'coast', 'jungle', 'swamp', 'volcanic'];
    for (const w of WONDER_DEFINITIONS) {
      expect(w.validTerrain.length).toBeGreaterThan(0);
      for (const t of w.validTerrain) {
        expect(validTerrains).toContain(t);
      }
    }
  });

  it('all wonders have non-zero yields or discovery bonus', () => {
    for (const w of WONDER_DEFINITIONS) {
      const totalYields = w.yields.food + w.yields.production + w.yields.gold + w.yields.science;
      const hasBonus = w.discoveryBonus.amount > 0;
      expect(totalYields > 0 || hasBonus).toBe(true);
    }
  });

  it('getWonderDefinition returns correct wonder by ID', () => {
    const wonder = getWonderDefinition('great_volcano');
    expect(wonder).toBeDefined();
    expect(wonder!.name).toBe('Great Volcano');
  });

  it('getWonderDefinition returns undefined for unknown ID', () => {
    expect(getWonderDefinition('nonexistent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-definitions.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create wonder-definitions.ts**

Create `src/systems/wonder-definitions.ts`:

```typescript
import type { WonderDefinition } from '@/core/types';

export const WONDER_DEFINITIONS: WonderDefinition[] = [
  {
    id: 'great_volcano',
    name: 'Great Volcano',
    description: 'A massive volcano that occasionally erupts, destroying nearby improvements.',
    yields: { food: 0, production: 3, gold: 0, science: 1 },
    discoveryBonus: { type: 'science', amount: 30 },
    effect: { type: 'eruption', chance: 0.05 },
    validTerrain: ['volcanic'],
  },
  {
    id: 'sacred_mountain',
    name: 'Sacred Mountain',
    description: 'A holy peak that inspires scholars in adjacent tiles.',
    yields: { food: 0, production: 0, gold: 2, science: 2 },
    discoveryBonus: { type: 'science', amount: 25 },
    effect: { type: 'adjacent_yield_bonus', yields: { science: 1 } },
    validTerrain: ['mountain'],
  },
  {
    id: 'crystal_caverns',
    name: 'Crystal Caverns',
    description: 'Caves filled with precious crystals and rare minerals.',
    yields: { food: 0, production: 1, gold: 3, science: 0 },
    discoveryBonus: { type: 'gold', amount: 50 },
    effect: { type: 'none' },
    validTerrain: ['hills'],
  },
  {
    id: 'ancient_forest',
    name: 'Ancient Forest',
    description: 'A primeval forest with healing properties.',
    yields: { food: 2, production: 1, gold: 0, science: 0 },
    discoveryBonus: { type: 'production', amount: 20 },
    effect: { type: 'healing', hpPerTurn: 10 },
    validTerrain: ['forest'],
  },
  {
    id: 'coral_reef',
    name: 'Coral Reef',
    description: 'A vibrant reef teeming with sea life.',
    yields: { food: 2, production: 0, gold: 1, science: 0 },
    discoveryBonus: { type: 'gold', amount: 30 },
    effect: { type: 'adjacent_yield_bonus', yields: { food: 1 } },
    validTerrain: ['coast'],
  },
  {
    id: 'grand_canyon',
    name: 'Grand Canyon',
    description: 'A vast canyon providing natural fortification.',
    yields: { food: 0, production: 0, gold: 2, science: 1 },
    discoveryBonus: { type: 'gold', amount: 25 },
    effect: { type: 'combat_bonus', defenseBonus: 0.30 },
    validTerrain: ['desert'],
  },
  {
    id: 'aurora_fields',
    name: 'Aurora Fields',
    description: 'Frozen plains illuminated by dancing lights.',
    yields: { food: 1, production: 0, gold: 0, science: 3 },
    discoveryBonus: { type: 'science', amount: 40 },
    effect: { type: 'none' },
    validTerrain: ['tundra'],
  },
  {
    id: 'frozen_falls',
    name: 'Frozen Falls',
    description: 'An immense frozen waterfall with a commanding view.',
    yields: { food: 0, production: 2, gold: 1, science: 1 },
    discoveryBonus: { type: 'production', amount: 20 },
    effect: { type: 'vision', bonus: 2 },
    validTerrain: ['snow'],
  },
  {
    id: 'dragon_bones',
    name: 'Dragon Bones',
    description: 'Ancient skeletal remains of a massive creature.',
    yields: { food: 0, production: 2, gold: 0, science: 2 },
    discoveryBonus: { type: 'science', amount: 35 },
    effect: { type: 'combat_bonus', defenseBonus: 0.20 },
    validTerrain: ['plains'],
  },
  {
    id: 'singing_sands',
    name: 'Singing Sands',
    description: 'Dunes that hum with an eerie melody.',
    yields: { food: 1, production: 0, gold: 2, science: 0 },
    discoveryBonus: { type: 'gold', amount: 30 },
    effect: { type: 'none' },
    validTerrain: ['desert'],
  },
  {
    id: 'sunken_ruins',
    name: 'Sunken Ruins',
    description: 'Remnants of a lost civilization beneath the waves.',
    yields: { food: 0, production: 0, gold: 2, science: 2 },
    discoveryBonus: { type: 'science', amount: 40 },
    effect: { type: 'none' },
    validTerrain: ['coast'],
  },
  {
    id: 'floating_islands',
    name: 'Floating Islands',
    description: 'Rocky outcrops that seem to defy gravity.',
    yields: { food: 1, production: 1, gold: 1, science: 1 },
    discoveryBonus: { type: 'production', amount: 25 },
    effect: { type: 'vision', bonus: 1 },
    validTerrain: ['hills'],
  },
  {
    id: 'bioluminescent_bay',
    name: 'Bioluminescent Bay',
    description: 'A bay that glows with otherworldly light.',
    yields: { food: 1, production: 0, gold: 2, science: 1 },
    discoveryBonus: { type: 'gold', amount: 35 },
    effect: { type: 'adjacent_yield_bonus', yields: { gold: 1 } },
    validTerrain: ['coast'],
  },
  {
    id: 'bottomless_lake',
    name: 'Bottomless Lake',
    description: 'A mysterious lake with restorative waters.',
    yields: { food: 0, production: 1, gold: 1, science: 2 },
    discoveryBonus: { type: 'science', amount: 30 },
    effect: { type: 'healing', hpPerTurn: 5 },
    validTerrain: ['swamp'],
  },
  {
    id: 'eternal_storm',
    name: 'Eternal Storm',
    description: 'A perpetual tempest over open waters granting far sight.',
    yields: { food: 0, production: 0, gold: 0, science: 3 },
    discoveryBonus: { type: 'science', amount: 50 },
    effect: { type: 'vision', bonus: 3 },
    validTerrain: ['ocean'],
  },
];

export function getWonderDefinition(id: string): WonderDefinition | undefined {
  return WONDER_DEFINITIONS.find(w => w.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-definitions.test.ts 2>&1 | tail -10`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/wonder-definitions.ts tests/systems/wonder-definitions.test.ts
git commit -m "feat(m3b): add 15 natural wonder definitions"
```

---

### Task 3: Wonder Placement

**Files:**
- Create: `src/systems/wonder-system.ts`
- Create: `tests/systems/wonder-system.test.ts`

- [ ] **Step 1: Write the failing tests for placement**

Create `tests/systems/wonder-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { placeWonders } from '@/systems/wonder-system';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';

function makeMap(size: 'small' | 'medium' | 'large') {
  const dims = { small: { w: 30, h: 30 }, medium: { w: 50, h: 50 }, large: { w: 80, h: 80 } };
  const d = dims[size];
  return generateMap(d.w, d.h, `wonder-test-${size}`);
}

describe('placeWonders', () => {
  it('places up to 5 wonders on a small map', () => {
    const map = makeMap('small');
    const starts = findStartPositions(map, 2);
    const placed = placeWonders(map, starts, 'small', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(5);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('places up to 8 wonders on a medium map', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const placed = placeWonders(map, starts, 'medium', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(8);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('places up to 15 wonders on a large map', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 4);
    const placed = placeWonders(map, starts, 'large', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(15);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('enforces minimum 8-hex distance between wonders', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 2);
    placeWonders(map, starts, 'large', 'wonder-dist-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (let i = 0; i < wonderTiles.length; i++) {
      for (let j = i + 1; j < wonderTiles.length; j++) {
        expect(hexDistance(wonderTiles[i].coord, wonderTiles[j].coord)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('enforces minimum 6-hex distance from start positions', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    placeWonders(map, starts, 'medium', 'wonder-start-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (const wt of wonderTiles) {
      for (const sp of starts) {
        expect(hexDistance(wt.coord, sp)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('replaces tile resource when placing a wonder', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 2);
    placeWonders(map, starts, 'medium', 'wonder-resource-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (const wt of wonderTiles) {
      expect(wt.resource).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-system.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create wonder-system.ts with placeWonders**

Create `src/systems/wonder-system.ts`:

```typescript
import type { GameMap, HexCoord, GameState, ResourceYield } from '@/core/types';
import { WONDER_DEFINITIONS, getWonderDefinition } from './wonder-definitions';
import { hexKey, hexDistance, hexNeighbors } from './hex-utils';
import { createRng } from './map-generator';

const WONDER_COUNTS = { small: 5, medium: 8, large: 15 } as const;

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function placeWonders(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): HexCoord[] {
  const rng = createRng(seed + '-wonders');
  const targetCount = WONDER_COUNTS[mapSize];
  const shuffled = shuffle(WONDER_DEFINITIONS, rng);

  const placedPositions: HexCoord[] = [];

  for (const wonder of shuffled) {
    if (placedPositions.length >= targetCount) break;

    // Find candidate tiles matching this wonder's valid terrain
    const candidates: HexCoord[] = [];
    for (const tile of Object.values(map.tiles)) {
      if (!wonder.validTerrain.includes(tile.terrain)) continue;
      if (tile.wonder !== null) continue;

      // Distance from start positions
      const farEnoughFromStarts = startPositions.every(
        sp => hexDistance(tile.coord, sp) >= 6,
      );
      if (!farEnoughFromStarts) continue;

      // Distance from other wonders
      const farEnoughFromWonders = placedPositions.every(
        wp => hexDistance(tile.coord, wp) >= 8,
      );
      if (!farEnoughFromWonders) continue;

      candidates.push(tile.coord);
    }

    if (candidates.length === 0) continue;

    // Pick a random candidate
    const chosen = candidates[Math.floor(rng() * candidates.length)];
    const tile = map.tiles[hexKey(chosen)];
    tile.wonder = wonder.id;
    tile.resource = null; // Wonder replaces resource
    placedPositions.push(chosen);
  }

  return placedPositions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-system.test.ts 2>&1 | tail -10`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/wonder-system.ts tests/systems/wonder-system.test.ts
git commit -m "feat(m3b): add wonder placement system"
```

---

### Task 4: Wonder Discovery and Yield Integration

**Files:**
- Modify: `src/systems/wonder-system.ts`
- Modify: `src/systems/resource-system.ts:23-81`
- Modify: `tests/systems/wonder-system.test.ts`

- [ ] **Step 1: Write failing tests for discovery and yields**

Append to `tests/systems/wonder-system.test.ts`:

```typescript
import { processWonderDiscovery, getWonderYieldBonus } from '@/systems/wonder-system';
import { calculateCityYields } from '@/systems/resource-system';
import { foundCity } from '@/systems/city-system';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';

function makeGameState(): GameState {
  return createNewGame(undefined, 'wonder-game-test');
}

describe('processWonderDiscovery', () => {
  it('grants discovery bonus to first discoverer', () => {
    const state = makeGameState();
    // Place a wonder manually
    const tile = Object.values(state.map.tiles).find(t => t.terrain === 'hills')!;
    tile.wonder = 'crystal_caverns';

    processWonderDiscovery(state, 'player', 'crystal_caverns');
    expect(state.discoveredWonders['crystal_caverns']).toBe('player');
    expect(state.wonderDiscoverers['crystal_caverns']).toContain('player');
    // Crystal Caverns gives +50 gold
    expect(state.civilizations.player.gold).toBe(50);
  });

  it('does not grant bonus to second discoverer', () => {
    const state = makeGameState();
    const tile = Object.values(state.map.tiles).find(t => t.terrain === 'hills')!;
    tile.wonder = 'crystal_caverns';

    processWonderDiscovery(state, 'player', 'crystal_caverns');
    const goldAfterFirst = state.civilizations.player.gold;

    processWonderDiscovery(state, 'ai-1', 'crystal_caverns');
    expect(state.discoveredWonders['crystal_caverns']).toBe('player'); // still first
    expect(state.wonderDiscoverers['crystal_caverns']).toContain('ai-1');
    expect(state.civilizations['ai-1'].gold).toBe(0); // no bonus
    expect(state.civilizations.player.gold).toBe(goldAfterFirst); // unchanged
  });

  it('records discoverer in wonderDiscoverers', () => {
    const state = makeGameState();
    processWonderDiscovery(state, 'player', 'aurora_fields');
    processWonderDiscovery(state, 'ai-1', 'aurora_fields');
    expect(state.wonderDiscoverers['aurora_fields']).toEqual(['player', 'ai-1']);
  });
});

describe('Wonder yields in calculateCityYields', () => {
  it('includes wonder yields for owned wonder tiles', () => {
    const state = makeGameState();
    // Found a city
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    state.cities[city.id] = city;

    // Place a wonder on one of the city's owned tiles
    const ownedTile = state.map.tiles[hexKey(city.ownedTiles[0])];
    ownedTile.wonder = 'crystal_caverns'; // +0F/+1P/+3G/+0S

    const yields = calculateCityYields(city, state.map);
    // Should include the +3 gold from Crystal Caverns
    expect(yields.gold).toBeGreaterThanOrEqual(3);
  });
});
```

Also add this import at the top of the file:

```typescript
import { hexKey } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { createNewGame } from '@/core/game-state';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-system.test.ts 2>&1 | tail -15`
Expected: FAIL — processWonderDiscovery not exported, wonder yields not calculated.

- [ ] **Step 3: Add processWonderDiscovery to wonder-system.ts**

Append to `src/systems/wonder-system.ts`:

```typescript
export function processWonderDiscovery(
  state: GameState,
  civId: string,
  wonderId: string,
): boolean {
  const wonder = getWonderDefinition(wonderId);
  if (!wonder) return false;

  // Track all discoverers
  if (!state.wonderDiscoverers[wonderId]) {
    state.wonderDiscoverers[wonderId] = [];
  }
  if (state.wonderDiscoverers[wonderId].includes(civId)) return false;
  state.wonderDiscoverers[wonderId].push(civId);

  const isFirst = !(wonderId in state.discoveredWonders);

  if (isFirst) {
    state.discoveredWonders[wonderId] = civId;

    // Grant discovery bonus
    const civ = state.civilizations[civId];
    if (civ) {
      switch (wonder.discoveryBonus.type) {
        case 'gold':
          civ.gold += wonder.discoveryBonus.amount;
          break;
        case 'science':
          if (civ.techState.currentResearch) {
            civ.techState.researchProgress += wonder.discoveryBonus.amount;
          } else {
            // Fallback: convert to gold if no active research
            civ.gold += wonder.discoveryBonus.amount;
          }
          break;
        case 'production': {
          // Add to first city's production progress
          const firstCityId = civ.cities[0];
          const firstCity = firstCityId ? state.cities[firstCityId] : null;
          if (firstCity) {
            firstCity.productionProgress += wonder.discoveryBonus.amount;
          }
          break;
        }
      }
    }
  }

  return isFirst;
}

export function getWonderYieldBonus(wonderId: string): ResourceYield {
  const wonder = getWonderDefinition(wonderId);
  if (!wonder) return { food: 0, production: 0, gold: 0, science: 0 };
  return { ...wonder.yields };
}
```

- [ ] **Step 4: Add wonder yields to calculateCityYields in resource-system.ts**

In `src/systems/resource-system.ts`, add import at top:

```typescript
import { getWonderYieldBonus } from './wonder-system';
import { hexNeighbors } from './hex-utils';
import { getWonderDefinition } from './wonder-definitions';
```

Then inside `calculateCityYields`, after the improvement bonus block (after line 57, before the closing `}` of the for loop at line 58), add:

```typescript
    // Wonder yields (add to terrain yields)
    if (tile.wonder) {
      const wonderYields = getWonderYieldBonus(tile.wonder);
      yields.food += wonderYields.food;
      yields.production += wonderYields.production;
      yields.gold += wonderYields.gold;
      yields.science += wonderYields.science;
    }

    // Adjacent wonder bonus
    const neighbors = hexNeighbors(coord);
    for (const neighbor of neighbors) {
      const neighborTile = map.tiles[hexKey(neighbor)];
      if (neighborTile?.wonder) {
        const wonderDef = getWonderDefinition(neighborTile.wonder);
        if (wonderDef?.effect.type === 'adjacent_yield_bonus') {
          const bonusYields = wonderDef.effect.yields;
          if (bonusYields.food) yields.food += bonusYields.food;
          if (bonusYields.production) yields.production += bonusYields.production;
          if (bonusYields.gold) yields.gold += bonusYields.gold;
          if (bonusYields.science) yields.science += bonusYields.science;
        }
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-system.test.ts 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 6: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All tests pass (existing + new).

- [ ] **Step 7: Commit**

```bash
git add src/systems/wonder-system.ts src/systems/resource-system.ts tests/systems/wonder-system.test.ts
git commit -m "feat(m3b): add wonder discovery, yields, and adjacent bonuses"
```

---

### Task 5: Wonder Effects (Healing, Eruption, Vision, Combat)

**Files:**
- Modify: `src/systems/wonder-system.ts`
- Modify: `src/systems/combat-system.ts:15-31`
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/systems/wonder-system.test.ts`

- [ ] **Step 1: Write failing tests for wonder effects**

Append to `tests/systems/wonder-system.test.ts`:

```typescript
import { processWonderEffects, getWonderVisionBonus, getWonderCombatBonus } from '@/systems/wonder-system';

describe('Wonder Effects', () => {
  it('healing effect adds HP to units on wonder tile (capped at 100)', () => {
    const state = makeGameState();
    // Place ancient_forest (healing 10 HP/turn) on a tile
    const forestTile = Object.values(state.map.tiles).find(t => t.terrain === 'forest')!;
    forestTile.wonder = 'ancient_forest';

    // Place a damaged unit on that tile
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = forestTile.coord;
    unit.health = 70;

    processWonderEffects(state);
    expect(unit.health).toBe(80); // 70 + 10
  });

  it('healing does not exceed 100 HP', () => {
    const state = makeGameState();
    const forestTile = Object.values(state.map.tiles).find(t => t.terrain === 'forest')!;
    forestTile.wonder = 'ancient_forest';

    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = forestTile.coord;
    unit.health = 95;

    processWonderEffects(state);
    expect(unit.health).toBe(100);
  });

  it('eruption effect can destroy adjacent improvements', () => {
    const state = makeGameState();
    const volcanicTile = Object.values(state.map.tiles).find(t => t.terrain === 'volcanic');
    if (!volcanicTile) return; // skip if no volcanic terrain in test map

    volcanicTile.wonder = 'great_volcano';

    // Set up an improvement on an adjacent tile
    const neighbors = hexNeighbors(volcanicTile.coord);
    for (const n of neighbors) {
      const nTile = state.map.tiles[hexKey(n)];
      if (nTile && nTile.terrain !== 'ocean' && nTile.terrain !== 'mountain') {
        nTile.improvement = 'farm';
        nTile.improvementTurnsLeft = 0;
        break;
      }
    }

    // Force eruption by using a guaranteed RNG
    const eruptions = processWonderEffects(state, () => 0.01); // Always erupts (< 0.05)

    expect(eruptions.length).toBeGreaterThan(0);
    expect(eruptions[0].wonderId).toBe('great_volcano');
    expect(eruptions[0].tilesAffected.length).toBeGreaterThan(0);
  });

  it('vision bonus returns correct value for wonder tile', () => {
    expect(getWonderVisionBonus('frozen_falls')).toBe(2);
    expect(getWonderVisionBonus('eternal_storm')).toBe(3);
    expect(getWonderVisionBonus('crystal_caverns')).toBe(0);
    expect(getWonderVisionBonus(null)).toBe(0);
  });

  it('combat bonus returns correct defense value for wonder tile', () => {
    expect(getWonderCombatBonus('grand_canyon')).toBe(0.30);
    expect(getWonderCombatBonus('dragon_bones')).toBe(0.20);
    expect(getWonderCombatBonus('crystal_caverns')).toBe(0);
    expect(getWonderCombatBonus(null)).toBe(0);
  });
});
```

Also add import for `hexNeighbors`:

```typescript
import { hexDistance, hexKey, hexNeighbors } from '@/systems/hex-utils';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-system.test.ts 2>&1 | tail -15`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add processWonderEffects, getWonderVisionBonus, getWonderCombatBonus to wonder-system.ts**

Append to `src/systems/wonder-system.ts`:

```typescript
interface EruptionResult {
  wonderId: string;
  position: HexCoord;
  tilesAffected: HexCoord[];
}

export function processWonderEffects(state: GameState, rng?: () => number): EruptionResult[] {
  const eruptions: EruptionResult[] = [];
  const effectRng = rng ?? (() => Math.random());

  for (const tile of Object.values(state.map.tiles)) {
    if (!tile.wonder) continue;
    const wonder = getWonderDefinition(tile.wonder);
    if (!wonder) continue;

    switch (wonder.effect.type) {
      case 'healing': {
        // Heal units on this tile
        for (const unit of Object.values(state.units)) {
          if (hexKey(unit.position) === hexKey(tile.coord) && unit.health < 100) {
            unit.health = Math.min(100, unit.health + wonder.effect.hpPerTurn);
          }
        }
        break;
      }
      case 'eruption': {
        if (effectRng() < wonder.effect.chance) {
          const affected: HexCoord[] = [];
          const neighbors = hexNeighbors(tile.coord);
          for (const n of neighbors) {
            const nTile = state.map.tiles[hexKey(n)];
            if (nTile && nTile.improvement !== 'none') {
              nTile.improvement = 'none';
              nTile.improvementTurnsLeft = 0;
              affected.push(n);
            }
          }
          if (affected.length > 0) {
            eruptions.push({ wonderId: tile.wonder, position: tile.coord, tilesAffected: affected });
          }
        }
        break;
      }
      // vision and combat_bonus are read-only — handled at call sites
    }
  }

  return eruptions;
}

export function getWonderVisionBonus(wonderId: string | null): number {
  if (!wonderId) return 0;
  const wonder = getWonderDefinition(wonderId);
  if (!wonder || wonder.effect.type !== 'vision') return 0;
  return wonder.effect.bonus;
}

export function getWonderCombatBonus(wonderId: string | null): number {
  if (!wonderId) return 0;
  const wonder = getWonderDefinition(wonderId);
  if (!wonder || wonder.effect.type !== 'combat_bonus') return 0;
  return wonder.effect.defenseBonus;
}
```

- [ ] **Step 4: Add wonder combat bonus to combat-system.ts**

In `src/systems/combat-system.ts`, add import at top:

```typescript
import { getWonderCombatBonus } from './wonder-system';
```

Then after the terrain defense bonus (line 29), add:

```typescript
    // Wonder defense bonus
    if (defTile.wonder) {
      defStrength *= (1 + getWonderCombatBonus(defTile.wonder));
    }
```

- [ ] **Step 5: Add processWonderEffects to turn-manager.ts**

In `src/core/turn-manager.ts`, add import:

```typescript
import { processWonderEffects } from '@/systems/wonder-system';
```

Then after the marketplace processing block (after line 128), before the barbarians block, add:

```typescript
  // --- Process wonder effects (after city processing) ---
  const eruptions = processWonderEffects(newState);
  for (const eruption of eruptions) {
    bus.emit('wonder:eruption', {
      wonderId: eruption.wonderId,
      position: eruption.position,
      tilesAffected: eruption.tilesAffected,
    });
  }
```

(No additional imports needed — `processWonderEffects` handles everything internally.)

- [ ] **Step 6: Add wonder vision bonus to fog-of-war.ts**

In `src/systems/fog-of-war.ts`, add import:

```typescript
import { getWonderVisionBonus } from './wonder-system';
```

Then at line 62, after the terrain vision bonus, add wonder vision bonus:

```typescript
    const bonus = unitTile ? getTerrainVisionBonus(unitTile.terrain) : 0;
    const wonderBonus = unitTile?.wonder ? getWonderVisionBonus(unitTile.wonder) : 0;

    const visible = hexesInRange(unit.position, visionRange + bonus + wonderBonus);
```

Replace the existing lines 62-64:
```typescript
    const bonus = unitTile ? getTerrainVisionBonus(unitTile.terrain) : 0;

    const visible = hexesInRange(unit.position, visionRange + bonus);
```

With:
```typescript
    const bonus = unitTile ? getTerrainVisionBonus(unitTile.terrain) : 0;
    const wonderBonus = unitTile?.wonder ? getWonderVisionBonus(unitTile.wonder) : 0;

    const visible = hexesInRange(unit.position, visionRange + bonus + wonderBonus);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/wonder-system.test.ts 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 8: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/systems/wonder-system.ts src/systems/combat-system.ts src/core/turn-manager.ts src/systems/fog-of-war.ts tests/systems/wonder-system.test.ts
git commit -m "feat(m3b): add wonder effects — healing, eruption, vision, combat bonus"
```

---

### Task 6: Village System

**Files:**
- Create: `src/systems/village-system.ts`
- Create: `tests/systems/village-system.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/systems/village-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { placeVillages, visitVillage, rollVillageOutcome } from '@/systems/village-system';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import type { GameState } from '@/core/types';

function makeMap(size: 'small' | 'medium' | 'large') {
  const dims = { small: { w: 30, h: 30 }, medium: { w: 50, h: 50 }, large: { w: 80, h: 80 } };
  const d = dims[size];
  return generateMap(d.w, d.h, `village-test-${size}`);
}

function makeGameState(): GameState {
  return createNewGame(undefined, 'village-game-test');
}

describe('placeVillages', () => {
  it('places up to 8 villages on a small map', () => {
    const map = makeMap('small');
    const starts = findStartPositions(map, 2);
    const villages = placeVillages(map, starts, 'small', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(8);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('places up to 12 villages on a medium map', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const villages = placeVillages(map, starts, 'medium', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(12);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('places up to 20 villages on a large map', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 4);
    const villages = placeVillages(map, starts, 'large', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(20);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('enforces distance from start positions (min 4)', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const villages = placeVillages(map, starts, 'medium', 'village-dist-test');
    for (const v of Object.values(villages)) {
      for (const sp of starts) {
        expect(hexDistance(v.position, sp)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('enforces distance between villages (min 3)', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 2);
    const villages = placeVillages(map, starts, 'medium', 'village-inter-test');
    const positions = Object.values(villages).map(v => v.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(hexDistance(positions[i], positions[j])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('does not place villages on wonder tiles', () => {
    const map = makeMap('medium');
    // Place a wonder manually
    const hillTile = Object.values(map.tiles).find(t => t.terrain === 'hills')!;
    hillTile.wonder = 'crystal_caverns';

    const starts = findStartPositions(map, 2);
    const villages = placeVillages(map, starts, 'medium', 'village-wonder-test');
    for (const v of Object.values(villages)) {
      const tile = map.tiles[hexKey(v.position)];
      expect(tile.wonder).toBeNull();
    }
  });
});

describe('visitVillage', () => {
  it('removes village from state on visit', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };

    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };

    visitVillage(state, 'v1', unit, () => 0.1); // will roll gold
    expect(state.tribalVillages['v1']).toBeUndefined();
  });

  it('gold outcome adds gold to civ', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const goldBefore = state.civilizations.player.gold;

    visitVillage(state, 'v1', unit, () => 0.1); // 0.1 < 0.25 = gold
    expect(state.civilizations.player.gold).toBeGreaterThan(goldBefore);
  });

  it('illness outcome reduces unit HP (min 1)', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    unit.health = 30;

    visitVillage(state, 'v1', unit, () => 0.96); // 0.96 > 0.95 = illness
    expect(unit.health).toBeLessThan(30);
    expect(unit.health).toBeGreaterThanOrEqual(1);
  });
});

describe('rollVillageOutcome', () => {
  it('returns gold for rng < 0.25', () => {
    expect(rollVillageOutcome(0.1)).toBe('gold');
  });

  it('returns food for rng 0.25-0.45', () => {
    expect(rollVillageOutcome(0.3)).toBe('food');
  });

  it('returns science for rng 0.45-0.60', () => {
    expect(rollVillageOutcome(0.5)).toBe('science');
  });

  it('returns free_unit for rng 0.60-0.75', () => {
    expect(rollVillageOutcome(0.65)).toBe('free_unit');
  });

  it('returns free_tech for rng 0.75-0.85', () => {
    expect(rollVillageOutcome(0.8)).toBe('free_tech');
  });

  it('returns ambush for rng 0.85-0.95', () => {
    expect(rollVillageOutcome(0.9)).toBe('ambush');
  });

  it('returns illness for rng >= 0.95', () => {
    expect(rollVillageOutcome(0.96)).toBe('illness');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/village-system.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create village-system.ts**

Create `src/systems/village-system.ts`:

```typescript
import type { GameMap, HexCoord, GameState, Unit, TribalVillage, VillageOutcomeType } from '@/core/types';
import { hexKey, hexDistance, hexNeighbors } from './hex-utils';
import { createUnit } from './unit-system';
import { TECH_TREE } from './tech-system';
import { createRng } from './map-generator';

const VILLAGE_COUNTS = { small: 8, medium: 12, large: 20 } as const;

const IMPASSABLE_TERRAIN = new Set(['ocean', 'coast', 'mountain']);

export function placeVillages(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): Record<string, TribalVillage> {
  const rng = createRng(seed + '-villages');
  const targetCount = VILLAGE_COUNTS[mapSize];
  const villages: Record<string, TribalVillage> = {};
  const placedPositions: HexCoord[] = [];

  // Collect passable land tiles
  const candidates: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (IMPASSABLE_TERRAIN.has(tile.terrain)) continue;
    if (tile.wonder !== null) continue;
    candidates.push(tile.coord);
  }

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const coord of candidates) {
    if (placedPositions.length >= targetCount) break;

    // Distance from starts
    if (!startPositions.every(sp => hexDistance(coord, sp) >= 4)) continue;

    // Distance from other villages
    if (!placedPositions.every(vp => hexDistance(coord, vp) >= 3)) continue;

    const id = `village-${placedPositions.length}`;
    villages[id] = { id, position: coord };
    placedPositions.push(coord);
  }

  return villages;
}

export function rollVillageOutcome(roll: number): VillageOutcomeType {
  if (roll < 0.25) return 'gold';
  if (roll < 0.45) return 'food';
  if (roll < 0.60) return 'science';
  if (roll < 0.75) return 'free_unit';
  if (roll < 0.85) return 'free_tech';
  if (roll < 0.95) return 'ambush';
  return 'illness';
}

export function visitVillage(
  state: GameState,
  villageId: string,
  unit: Unit,
  rng: () => number,
): { outcome: VillageOutcomeType; message: string } {
  const village = state.tribalVillages[villageId];
  if (!village) return { outcome: 'gold', message: '' };

  // Remove village
  delete state.tribalVillages[villageId];

  const outcome = rollVillageOutcome(rng());
  const civ = state.civilizations[unit.owner];
  let message = '';

  switch (outcome) {
    case 'gold': {
      const amount = 25 + Math.floor(rng() * 26); // 25-50
      if (civ) civ.gold += amount;
      message = `The villagers share their wealth! +${amount} gold.`;
      break;
    }
    case 'food': {
      const amount = 15 + Math.floor(rng() * 16); // 15-30
      // Find nearest city
      const citiesOwned = civ?.cities ?? [];
      let nearestCity = citiesOwned.length > 0 ? state.cities[citiesOwned[0]] : null;
      let nearestDist = Infinity;
      for (const cityId of citiesOwned) {
        const city = state.cities[cityId];
        if (city) {
          const d = hexDistance(village.position, city.position);
          if (d < nearestDist) {
            nearestDist = d;
            nearestCity = city;
          }
        }
      }
      if (nearestCity) {
        nearestCity.food += amount;
        message = `The villagers share food with ${nearestCity.name}! +${amount} food.`;
      } else {
        // Fallback: gold
        const goldAmount = 25 + Math.floor(rng() * 26);
        if (civ) civ.gold += goldAmount;
        message = `The villagers share their wealth! +${goldAmount} gold.`;
      }
      break;
    }
    case 'science': {
      const amount = 10 + Math.floor(rng() * 16); // 10-25
      if (civ?.techState.currentResearch) {
        civ.techState.researchProgress += amount;
        message = `The villagers share ancient knowledge! +${amount} research.`;
      } else {
        // Fallback: gold
        if (civ) civ.gold += 25;
        message = `The villagers share their wealth! +25 gold.`;
      }
      break;
    }
    case 'free_unit': {
      const unitType: 'scout' | 'warrior' = rng() < 0.5 ? 'scout' : 'warrior';
      const newUnit = createUnit(unitType, unit.owner, village.position);
      state.units[newUnit.id] = newUnit;
      if (civ) civ.units.push(newUnit.id);
      message = `A ${unitType} joins your cause!`;
      break;
    }
    case 'free_tech': {
      if (!civ) break;
      const availableTechs = TECH_TREE.filter(t =>
        !civ.techState.completed.includes(t.id) &&
        t.prerequisites.every(p => civ.techState.completed.includes(p)),
      );
      if (availableTechs.length > 0) {
        const tech = availableTechs[Math.floor(rng() * availableTechs.length)];
        civ.techState.completed.push(tech.id);
        if (civ.techState.currentResearch === tech.id) {
          civ.techState.currentResearch = null;
          civ.techState.researchProgress = 0;
        }
        message = `The villagers taught us ${tech.name}!`;
      } else {
        // Fallback: gold
        civ.gold += 50;
        message = `The villagers share their wealth! +50 gold.`;
      }
      break;
    }
    case 'ambush': {
      const neighbors = hexNeighbors(village.position);
      const passable = neighbors.filter(n => {
        const t = state.map.tiles[hexKey(n)];
        return t && !IMPASSABLE_TERRAIN.has(t.terrain);
      });
      const spawnCount = Math.min(1 + Math.floor(rng() * 2), passable.length); // 1-2
      for (let i = 0; i < spawnCount; i++) {
        const barbarian = createUnit('warrior', 'barbarian', passable[i]);
        state.units[barbarian.id] = barbarian;
      }
      message = spawnCount > 0
        ? `It was a trap! Barbarian warriors ambush you!`
        : `The village was abandoned... an eerie silence lingers.`;
      break;
    }
    case 'illness': {
      const damage = 20 + Math.floor(rng() * 21); // 20-40
      unit.health = Math.max(1, unit.health - damage);
      message = `Your unit contracts an illness! -${damage} HP.`;
      break;
    }
  }

  return { outcome, message };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/village-system.test.ts 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/village-system.ts tests/systems/village-system.test.ts
git commit -m "feat(m3b): add tribal village system with placement and visit outcomes"
```

---

### Task 7: Map Generator Integration

**Files:**
- Modify: `src/systems/map-generator.ts:117-162`
- Modify: `src/core/game-state.ts`

- [ ] **Step 1: Add wonder and village placement to generateMap**

In `src/systems/map-generator.ts`, add imports at top:

```typescript
import { placeWonders } from './wonder-system';
import { placeVillages } from './village-system';
import type { TribalVillage } from '@/core/types';
```

Change the `generateMap` function signature to also return villages and wonder positions. Since `generateMap` currently returns only `GameMap`, and villages belong in `GameState`, we'll instead create a new function `generateMapWithFeatures` and update callers, OR we can simply export `placeWonders` and `placeVillages` and call them from `game-state.ts`. The cleaner approach is to call them from `game-state.ts` where we have access to start positions.

Actually, the spec says "During map generation, after terrain and resources, place wonders" — but `generateMap` doesn't know start positions yet (those are computed by `findStartPositions` after `generateMap`). So we'll call wonder/village placement from `game-state.ts`.

- [ ] **Step 2: Add wonder and village placement to createNewGame**

In `src/core/game-state.ts`, add imports:

```typescript
import { placeWonders } from '@/systems/wonder-system';
import { placeVillages } from '@/systems/village-system';
```

In `createNewGame`, after `findStartPositions` (line 21) and before creating civilizations, add:

```typescript
  // Place wonders and villages
  placeWonders(map, startPositions, dims === MAP_DIMENSIONS.large ? 'large' : dims === MAP_DIMENSIONS.medium ? 'medium' : 'small', gameSeed);
  const tribalVillages = placeVillages(map, startPositions, mapSize ?? 'small', gameSeed);
```

Wait, `dims` is an object not directly comparable. Let's use `mapSize` directly:

```typescript
  const actualSize = mapSize ?? 'small';
  placeWonders(map, startPositions, actualSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, actualSize, gameSeed);
```

Then in the return object, change `tribalVillages: {}` to `tribalVillages,`.

Do the same in `createHotSeatGame`:

After `findStartPositions` (line 124), add:

```typescript
  placeWonders(map, startPositions, config.mapSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, config.mapSize, gameSeed);
```

And update `tribalVillages: {}` to `tribalVillages,` in the return object.

- [ ] **Step 3: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/game-state.ts
git commit -m "feat(m3b): integrate wonder/village placement into game creation"
```

---

### Task 8: Treasurer and Scholar Advisors

**Files:**
- Modify: `src/ui/advisor-system.ts:15-188`
- Modify: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/advisor-system.test.ts`:

```typescript
  it('AdvisorType includes treasurer and scholar in message IDs', () => {
    const ids = getAdvisorMessageIds();
    expect(ids).toContain('scholar_no_research');
    expect(ids).toContain('scholar_wonder');
    expect(ids).toContain('scholar_village_science');
    expect(ids).toContain('treasurer_broke');
    expect(ids).toContain('treasurer_trade_route');
    expect(ids).toContain('treasurer_wonder_yields');
  });

  it('scholar triggers on no-research-active condition', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = {
      builder: false, explorer: false, chancellor: false,
      warchief: false, treasurer: false, scholar: true,
    };
    // Need completed tech and no current research, turn >= 2
    state.civilizations.player.techState.completed = ['some_tech'];
    state.civilizations.player.techState.currentResearch = null;
    state.turn = 3;

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('scholar');
    expect(messages[0].message).toContain('idle');
  });

  it('treasurer triggers on low gold', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = {
      builder: false, explorer: false, chancellor: false,
      warchief: false, treasurer: true, scholar: false,
    };
    state.civilizations.player.gold = 5;
    state.turn = 10; // Past the turn 5 guard

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('treasurer');
    expect(messages[0].message).toContain('empty');
  });

  it('treasurer triggers on high gold with no production', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = {
      builder: false, explorer: false, chancellor: false,
      warchief: false, treasurer: true, scholar: false,
    };
    state.civilizations.player.gold = 150;
    // Ensure no production queued
    for (const cityId of state.civilizations.player.cities) {
      state.cities[cityId].productionQueue = [];
    }

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('treasurer');
    expect(messages[0].message).toContain('fortune');
  });

  it('advisorsEnabled defaults include treasurer and scholar', () => {
    const state = makeState();
    expect(state.settings.advisorsEnabled.treasurer).toBe(true);
    expect(state.settings.advisorsEnabled.scholar).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/ui/advisor-system.test.ts 2>&1 | tail -15`
Expected: FAIL — scholar/treasurer messages not defined.

- [ ] **Step 3: Add Scholar and Treasurer messages to advisor-system.ts**

In `src/ui/advisor-system.ts`, remove the `research_tech` explorer message (lines 63-69) and add the following messages to the `ADVISOR_MESSAGES` array (after the warchief messages, before the closing bracket):

```typescript
  // --- Scholar (unlocks when techState.completed.length > 0) ---
  {
    id: 'scholar_wonder',
    advisor: 'scholar',
    icon: '📚',
    message: 'Fascinating! This wonder could advance our knowledge. Settle nearby to benefit.',
    trigger: () => false, // Triggered via event in main.ts on wonder discovery
  },
  {
    id: 'scholar_no_research',
    advisor: 'scholar',
    icon: '📚',
    message: 'Our scholars are idle! Choose a tech to research.',
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ) return false;
      // Scholar unlock gate: must have completed at least one tech
      if (civ.techState.completed.length === 0) return false;
      return civ.techState.currentResearch === null && state.turn >= 2;
    },
  },
  {
    id: 'scholar_tech_complete',
    advisor: 'scholar',
    icon: '📚',
    message: 'Excellent progress! Our understanding deepens.',
    trigger: () => false, // Triggered via event, not polling
  },
  {
    id: 'scholar_village_science',
    advisor: 'scholar',
    icon: '📚',
    message: 'The villagers shared ancient knowledge with us!',
    trigger: () => false, // Triggered via event on village science outcome
  },
  {
    id: 'scholar_village_tech',
    advisor: 'scholar',
    icon: '📚',
    message: 'Remarkable — the villagers taught us something entirely new!',
    trigger: () => false, // Triggered via event on village free_tech outcome
  },
  {
    id: 'scholar_era',
    advisor: 'scholar',
    icon: '📚',
    message: "We're making strides. Continue researching to reach a new era.",
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ || civ.techState.completed.length === 0) return false;
      return state.turn > 0 && state.turn % 20 === 0;
    },
  },

  // --- Treasurer (unlocks when gold >= 50 or has trade route) ---
  {
    id: 'treasurer_rich_idle',
    advisor: 'treasurer',
    icon: '💎',
    message: "We're sitting on a fortune! Invest in buildings or units.",
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ || civ.gold <= 100) return false;
      return civ.cities.every(cityId => {
        const city = state.cities[cityId];
        return !city || city.productionQueue.length === 0;
      });
    },
  },
  {
    id: 'treasurer_broke',
    advisor: 'treasurer',
    icon: '💎',
    message: 'Our coffers are nearly empty. We need gold-producing tiles or trade.',
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ) return false;
      // Only fire after treasurer has been relevant (has cities, not turn 1)
      if (civ.cities.length === 0 || state.turn < 5) return false;
      return civ.gold < 10;
    },
  },
  {
    id: 'treasurer_village_gold',
    advisor: 'treasurer',
    icon: '💎',
    message: 'A generous village! Our coffers grow.',
    trigger: () => false, // Triggered via event, not polling
  },
  {
    id: 'treasurer_trade_route',
    advisor: 'treasurer',
    icon: '💎',
    message: 'Trade is flowing. Each route strengthens our economy.',
    trigger: () => false, // Triggered via event on trade route creation
  },
  {
    id: 'treasurer_wonder_yields',
    advisor: 'treasurer',
    icon: '💎',
    message: 'Our city near a wonder is thriving from its bounty.',
    trigger: () => false, // Triggered via event, not polling
  },
  {
    id: 'treasurer_camp_reward',
    advisor: 'treasurer',
    icon: '💎',
    message: 'The spoils of victory bolster our treasury.',
    trigger: () => false, // Triggered via event, not polling
  },
```

Also update the `research_tech` explorer message — replace it with a simpler version that doesn't overlap with scholar:

Remove the existing explorer `research_tech` message (lines 63-69). The scholar `scholar_no_research` now handles this scenario.

Update the `tutorialStep: 'research_tech'` entry. We need to keep the tutorial step triggering but assign it to scholar or keep it on explorer for tutorial only. Since the spec says "The `'scholar_no_research'` message replaces the existing Explorer `research_tech` message", change the existing explorer research_tech to scholar:

Replace lines 63-69:
```typescript
  {
    id: 'research_tech',
    advisor: 'explorer',
    icon: '🔭',
    message: 'Knowledge is power! Open the Tech panel and choose something to research. Each discovery unlocks new possibilities.',
    trigger: (state) => state.civilizations.player?.techState.currentResearch === null && state.turn >= 2,
    tutorialStep: 'research_tech',
  },
```

With:
```typescript
  {
    id: 'research_tech',
    advisor: 'scholar',
    icon: '📚',
    message: 'Knowledge is power! Open the Tech panel and choose something to research. Each discovery unlocks new possibilities.',
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      return civ?.techState.currentResearch === null && state.turn >= 2;
    },
    tutorialStep: 'research_tech',
  },
```

And update the `tutorial:step` event type assertion in the AdvisorSystem.check method. Line 223 casts to `'builder' | 'explorer'` but now scholar is possible. Update:

```typescript
          this.bus.emit('tutorial:step', {
            step: msg.tutorialStep,
            message: msg.message,
            advisor: msg.advisor as 'builder' | 'explorer' | 'scholar',
          });
```

Wait, the `tutorial:step` event type is `{ step: TutorialStep; message: string; advisor: 'builder' | 'explorer' }`. We'd need to expand that type. Since this is a minor type inconsistency and tutorial steps only fire for builder/explorer/scholar, let's cast it:

```typescript
            advisor: msg.advisor as any,
```

Actually it's cleaner to just leave it. The `tutorial:step` type in `types.ts` line 390 uses `advisor: 'builder' | 'explorer'`. Since scholar replaces the explorer research_tech tutorial step, we should update the type. But that's a minimal change — update line 390 in types.ts:

```typescript
  'tutorial:step': { step: TutorialStep; message: string; advisor: 'builder' | 'explorer' | 'scholar' };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/ui/advisor-system.test.ts 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/advisor-system.ts src/core/types.ts tests/ui/advisor-system.test.ts
git commit -m "feat(m3b): add Treasurer and Scholar advisor messages"
```

---

### Task 9: Main.ts Integration (Village Visit + Wonder Discovery)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add village visit on unit move**

In `src/main.ts`, add imports at top:

```typescript
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery, getWonderVisionBonus } from '@/systems/wonder-system';
import { getWonderDefinition } from '@/systems/wonder-definitions';
```

In the `handleHexTap` function, after the unit move and visibility update block (after line 431, inside the `if (revealed.length > 0)` block or just after visibility update), add village visit check:

After line 427 (`const revealed = updateVisibility(...)`) and before the `if (revealed.length > 0)` block, add:

```typescript
      // Check for tribal village at destination
      const villageAtDest = Object.values(gameState.tribalVillages).find(
        v => hexKey(v.position) === key,
      );
      if (villageAtDest) {
        // Create seeded RNG for village visit
        let rngState = gameState.turn * 16807 + unit.id.charCodeAt(0);
        const villageRng = () => {
          rngState = (rngState * 48271) % 2147483647;
          return rngState / 2147483647;
        };
        const result = visitVillage(gameState, villageAtDest.id, unit, villageRng);
        bus.emit('village:visited', {
          civId: gameState.currentPlayer,
          position: villageAtDest.position,
          outcome: result.outcome,
          message: result.message,
        });
        showNotification(result.message, result.outcome === 'ambush' || result.outcome === 'illness' ? 'warning' : 'success');

        // Trigger event-driven advisor messages for village outcomes
        if (result.outcome === 'gold') advisorSystem.resetMessage('treasurer_village_gold');
        if (result.outcome === 'science') advisorSystem.resetMessage('scholar_village_science');
        if (result.outcome === 'free_tech') advisorSystem.resetMessage('scholar_village_tech');
        advisorSystem.check(gameState);
      }
```

- [ ] **Step 2: Add wonder discovery after visibility update**

After the visibility update in `handleHexTap` (after the village visit block, inside the move branch), add wonder discovery:

```typescript
      // Check for wonder discovery in newly visible tiles
      if (revealed.length > 0) {
        for (const revealedCoord of revealed) {
          const revTile = gameState.map.tiles[hexKey(revealedCoord)];
          if (revTile?.wonder) {
            const isFirst = processWonderDiscovery(gameState, gameState.currentPlayer, revTile.wonder);
            const wonderDef = getWonderDefinition(revTile.wonder);
            bus.emit('wonder:discovered', {
              civId: gameState.currentPlayer,
              wonderId: revTile.wonder,
              position: revealedCoord,
              isFirstDiscoverer: isFirst,
            });
            if (isFirst && wonderDef) {
              showNotification(
                `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`,
                'success',
              );
            } else if (wonderDef) {
              showNotification(`Found ${wonderDef.name}!`, 'info');
            }
          }
        }
```

Replace the existing `if (revealed.length > 0)` block (lines 429-431):
```typescript
      if (revealed.length > 0) {
        bus.emit('fog:revealed', { tiles: revealed });
      }
```

With the expanded version that includes wonder discovery:
```typescript
      if (revealed.length > 0) {
        bus.emit('fog:revealed', { tiles: revealed });

        // Wonder discovery
        for (const revealedCoord of revealed) {
          const revTile = gameState.map.tiles[hexKey(revealedCoord)];
          if (revTile?.wonder) {
            const isFirst = processWonderDiscovery(gameState, gameState.currentPlayer, revTile.wonder);
            const wonderDef = getWonderDefinition(revTile.wonder);
            bus.emit('wonder:discovered', {
              civId: gameState.currentPlayer,
              wonderId: revTile.wonder,
              position: revealedCoord,
              isFirstDiscoverer: isFirst,
            });
            if (isFirst && wonderDef) {
              showNotification(
                `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`,
                'success',
              );
            } else if (wonderDef) {
              showNotification(`Found ${wonderDef.name}!`, 'info');
            }
          }
        }
      }
```

- [ ] **Step 3: Add treasurer advisor trigger on barbarian camp destruction**

In `handleHexTap`, after the barbarian camp reward notification (around line 406), add:

```typescript
            advisorSystem.resetMessage('treasurer_camp_reward');
            advisorSystem.check(gameState);
```

- [ ] **Step 4: Extract checkWonderDiscovery helper and wire into foundCityAction**

Create a helper function in main.ts (DRY — used in both handleHexTap and foundCityAction):

```typescript
function checkWonderDiscovery(revealed: HexCoord[]): void {
  for (const revealedCoord of revealed) {
    const revTile = gameState.map.tiles[hexKey(revealedCoord)];
    if (revTile?.wonder) {
      const isFirst = processWonderDiscovery(gameState, gameState.currentPlayer, revTile.wonder);
      const wonderDef = getWonderDefinition(revTile.wonder);
      bus.emit('wonder:discovered', {
        civId: gameState.currentPlayer,
        wonderId: revTile.wonder,
        position: revealedCoord,
        isFirstDiscoverer: isFirst,
      });
      if (isFirst && wonderDef) {
        showNotification(
          `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`,
          'success',
        );
      } else if (wonderDef) {
        showNotification(`Found ${wonderDef.name}!`, 'info');
      }
      // Trigger scholar wonder advisor message
      advisorSystem.resetMessage('scholar_wonder');
      advisorSystem.check(gameState);
    }
  }
}
```

Then call `checkWonderDiscovery(revealed)` both in `handleHexTap` after fog reveal and in `foundCityAction` after visibility update. For `foundCityAction`, we need to capture the revealed tiles from `updateVisibility`. Change line 337:

```typescript
  const revealed = updateVisibility(currentCiv().visibility, playerUnits, gameState.map, cityPositions);
  checkWonderDiscovery(revealed);
```

Note: `updateVisibility` already returns revealed tiles (we can see this in `handleHexTap` line 427).

- [ ] **Step 5: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(m3b): integrate village visits and wonder discovery into main game loop"
```

---

### Task 10: Renderer Updates (Wonder and Village Icons)

**Files:**
- Modify: `src/renderer/hex-renderer.ts:85-127`

- [ ] **Step 1: Add wonder and village rendering**

In `src/renderer/hex-renderer.ts`, update the `drawHex` function to also accept wonder state. We need to know about villages too. Since the renderer only has access to `HexTile` (which has the `wonder` field), wonders are straightforward. For villages, we'll need to pass tribal village positions.

Update the `drawHexMap` function signature to accept village positions:

```typescript
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
): void {
```

In the `drawHex` function (line 85-127), after the improvement indicator block (after line 119) and before the ownership indicator, add:

```typescript
  // Draw wonder indicator
  if (tile.wonder) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${size * 0.55}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', cx, cy);
    // Glow effect
    ctx.shadowColor = '#e8c170';
    ctx.shadowBlur = size * 0.3;
    ctx.fillStyle = '#e8c170';
    ctx.fillText('✦', cx, cy);
    ctx.shadowBlur = 0;
  }
```

For villages, we need to pass the info through. In `drawHexMap`, pass village set to `drawHex`:

Update the `drawHex` call to also receive `isVillage`:

```typescript
    const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
    drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage);
```

Update `drawHex` signature:

```typescript
function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tile: HexTile,
  isVillage: boolean = false,
): void {
```

After the wonder indicator, add village indicator:

```typescript
  // Draw village indicator
  if (isVillage && !tile.wonder) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏕️', cx, cy);
  }
```

- [ ] **Step 2: Update render-loop.ts to pass village positions**

Read `src/renderer/render-loop.ts` and update the `drawHexMap` call to pass village positions from game state.

In `render-loop.ts`, where `drawHexMap` is called, pass:

```typescript
const villagePositions = new Set(
  Object.values(this.gameState.tribalVillages ?? {}).map(v => `${v.position.q},${v.position.r}`),
);
drawHexMap(ctx, this.gameState.map, this.camera, villagePositions);
```

- [ ] **Step 3: Run build to verify no type errors**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hex-renderer.ts src/renderer/render-loop.ts
git commit -m "feat(m3b): render wonder and village icons on hex map"
```

---

### Task 11: Final Verification and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1`
Expected: All tests pass (228 existing + ~31 new ≈ 259 tests).

- [ ] **Step 2: Run build**

Run: `eval "$(mise activate bash)" && yarn build 2>&1`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify test count**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | grep -E "Tests|test files"`
Expected: ~259 tests across ~28 test files.

- [ ] **Step 4: Final commit if any cleanup needed**

Only if changes were made during verification.
