# Milestone 2a "Deeper World" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the game world with a deeper tech tree (5 tracks × ~8 techs), new terrain types (jungle, swamp, volcanic) with rivers, and a city interior grid with adjacency bonuses and auto-suggest placement.

**Architecture:** Extends existing type system and systems with new terrain/tech/building definitions. New `adjacency-system.ts` and `river-system.ts` modules. City grid is a 5×5 array on the City type, rendered via a new `city-grid.ts` DOM component. New Building fields are optional to avoid breaking existing code until Task 8 expands all buildings.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, DOM/CSS

**Prerequisites:** Run `eval "$(mise activate bash)"` before any yarn/node commands. Existing codebase has 92 passing tests.

---

## File Structure

**New files:**
- `src/systems/river-system.ts` — river generation algorithm, river yield/combat helpers
- `src/systems/adjacency-system.ts` — adjacency bonus definitions and calculation, auto-suggest
- `src/ui/city-grid.ts` — DOM-based city interior grid view

**New test files:**
- `tests/systems/river-system.test.ts`
- `tests/systems/adjacency-system.test.ts`

**Modified files:**
- `src/core/types.ts` — new terrain types, tech tracks, city grid fields, river data, new buildings, new events
- `src/systems/tech-system.ts` — expand TECH_TREE to 40 techs with cross-track prereqs
- `src/systems/map-generator.ts` — jungle/swamp/volcanic terrain generation
- `src/systems/resource-system.ts` — new terrain yields, river bonuses, adjacency bonuses
- `src/systems/combat-system.ts` — river crossing penalty, new terrain defense bonuses
- `src/systems/fog-of-war.ts` — jungle vision penalty
- `src/systems/improvement-system.ts` — new terrain validity
- `src/systems/city-system.ts` — expanded buildings, city grid initialization, grid slot unlocking
- `src/renderer/hex-renderer.ts` — new terrain colors, river edge rendering
- `src/ui/tech-panel.ts` — render 5 tracks
- `src/ui/city-panel.ts` — add grid view tab
- `src/main.ts` — wire up tech/city panels properly (replace stubs)
- `src/core/game-state.ts` — minor update for river-enabled maps

**Modified test files:**
- `tests/systems/tech-system.test.ts`
- `tests/systems/map-generator.test.ts`
- `tests/systems/resource-system.test.ts`
- `tests/systems/combat-system.test.ts`
- `tests/systems/fog-of-war.test.ts`
- `tests/systems/city-system.test.ts`
- `tests/systems/improvement-system.test.ts`

---

## Task 1: Update Core Types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add new terrain types, tech tracks, and city grid fields**

In `src/core/types.ts`, make the following changes:

1. Expand `TerrainType` (around line 1-12):

```typescript
export type TerrainType =
  | 'grassland' | 'plains' | 'desert' | 'tundra' | 'snow'
  | 'forest' | 'hills' | 'mountain' | 'ocean' | 'coast'
  | 'jungle' | 'swamp' | 'volcanic';
```

2. Expand `TechTrack` (around line 117):

```typescript
export type TechTrack = 'military' | 'economy' | 'science' | 'civics' | 'exploration';
```

3. Add river fields to `HexTile` (around line 41-49) — add `hasRiver: boolean` after `improvementTurnsLeft`:

```typescript
export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;
  improvement: ImprovementType;
  owner: string | null;
  improvementTurnsLeft: number;
  hasRiver: boolean;
}
```

4. Add rivers to `GameMap` (around line 51-56):

```typescript
export interface GameMap {
  width: number;
  height: number;
  tiles: Record<string, HexTile>;
  wrapsHorizontally: boolean;
  rivers: Array<{ from: HexCoord; to: HexCoord }>;
}
```

5. Add grid fields to `City` (around line 101-113):

```typescript
export interface City {
  id: string;
  name: string;
  owner: string;
  position: HexCoord;
  population: number;
  food: number;
  foodNeeded: number;
  buildings: string[];
  productionQueue: string[];
  productionProgress: number;
  ownedTiles: HexCoord[];
  grid: (string | null)[][];
  gridSize: number;
}
```

6. Add new building interface fields (around line 93-99). **Make new fields optional** to avoid breaking existing BUILDINGS until Task 8 expands them:

```typescript
export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  adjacencyBonuses?: AdjacencyBonus[];
}

export type BuildingCategory = 'production' | 'food' | 'science' | 'economy' | 'military' | 'culture';

export interface AdjacencyBonus {
  adjacentTo: string;
  yields: Partial<ResourceYield>;
}
```

> **Note:** These fields are optional now so existing BUILDINGS in `city-system.ts` still compile. Task 8 will provide all fields for all 21 buildings.

7. Add new events to `GameEvents` (around line 221-247):

```typescript
  'grid:slot-unlocked': { cityId: string; newGridSize: number };
  'grid:building-placed': { cityId: string; buildingId: string; row: number; col: number };
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: Some tests may fail due to missing `hasRiver` and `rivers` fields — we'll fix those in subsequent tasks as we update each system. Note which tests fail.

- [ ] **Step 3: Fix any test compilation errors**

Update test files that create `HexTile` or `GameMap` objects to include the new required fields:
- `hasRiver: false` on all HexTile objects
- `rivers: []` on all GameMap objects
- `grid: [[null,null,null],[null,null,null],[null,null,null]]` and `gridSize: 3` on City objects
- Any `trackPriorities` in test mocks needs `civics` and `exploration` entries added (e.g., `civics: 0.5, exploration: 0.5`)

Search for all places where these are created in tests and source files. Key files to check:
- `src/systems/map-generator.ts` — add `hasRiver: false` to tile creation
- `src/systems/city-system.ts` — add `grid` and `gridSize` to foundCity
- Any test that creates mock tiles/maps/cities

- [ ] **Step 4: Run tests to verify all pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All 92 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/systems/map-generator.ts src/systems/city-system.ts tests/
git commit -m "feat(types): add jungle/swamp/volcanic terrain, civics/exploration tech tracks, city grid, and river support"
```

---

## Task 2: Expand Tech Tree (15 → 40 techs)

**Files:**
- Modify: `src/systems/tech-system.ts`
- Modify: `tests/systems/tech-system.test.ts`

- [ ] **Step 1: Write failing tests for expanded tech tree**

Add to `tests/systems/tech-system.test.ts`:

```typescript
describe('expanded tech tree', () => {
  it('has 40 techs total', () => {
    expect(TECH_TREE.length).toBe(40);
  });

  it('has 5 tracks with ~8 techs each', () => {
    const tracks = ['military', 'economy', 'science', 'civics', 'exploration'];
    for (const track of tracks) {
      const count = TECH_TREE.filter(t => t.track === track).length;
      expect(count).toBeGreaterThanOrEqual(7);
      expect(count).toBeLessThanOrEqual(9);
    }
  });

  it('supports cross-track prerequisites', () => {
    const ironForging = TECH_TREE.find(t => t.id === 'iron-forging');
    expect(ironForging).toBeDefined();
    // Iron forging should require mining-tech from economy track
    expect(ironForging!.prerequisites).toContain('mining-tech');
  });

  it('all prerequisite references are valid tech IDs', () => {
    const ids = new Set(TECH_TREE.map(t => t.id));
    for (const tech of TECH_TREE) {
      for (const prereq of tech.prerequisites) {
        expect(ids.has(prereq)).toBe(true);
      }
    }
  });

  it('getAvailableTechs respects cross-track prerequisites', () => {
    const state = createTechState();
    // Complete fire and gathering (era 1 basics)
    state.completed = ['fire', 'gathering'];
    const available = getAvailableTechs(state);
    const availableIds = available.map(t => t.id);
    // Writing requires fire (completed) — should be available
    expect(availableIds).toContain('writing');
    // Pottery requires gathering (completed) — should be available
    expect(availableIds).toContain('pottery');
  });

  it('techs span eras 1-5', () => {
    const eras = new Set(TECH_TREE.map(t => t.era));
    expect(eras).toContain(1);
    expect(eras).toContain(2);
    expect(eras).toContain(3);
    expect(eras).toContain(4);
    expect(eras).toContain(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: New tests fail (only 15 techs, only 3 tracks).

- [ ] **Step 3: Expand TECH_TREE to 40 techs**

Replace the `TECH_TREE` array in `src/systems/tech-system.ts` with the expanded version:

```typescript
export const TECH_TREE: Tech[] = [
  // === MILITARY TRACK (8 techs) ===
  { id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 20, prerequisites: [], unlocks: ['Warriors deal +2 damage'], era: 1 },
  { id: 'archery', name: 'Archery', track: 'military', cost: 35, prerequisites: ['stone-weapons'], unlocks: ['Unlock Archer unit'], era: 1 },
  { id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Barracks building'], era: 2 },
  { id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 55, prerequisites: ['animal-husbandry'], unlocks: ['Unlock Stable, mounted units'], era: 2 },
  { id: 'fortification', name: 'Fortification', track: 'military', cost: 60, prerequisites: ['bronze-working'], unlocks: ['Unlock Walls building'], era: 3 },
  { id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'mining-tech'], unlocks: ['Stronger melee units'], era: 3 },
  { id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 90, prerequisites: ['iron-forging', 'engineering'], unlocks: ['Unlock Catapult unit'], era: 4 },
  { id: 'tactics', name: 'Tactics', track: 'military', cost: 100, prerequisites: ['iron-forging'], unlocks: ['Units get +10% combat bonus'], era: 4 },

  // === ECONOMY TRACK (8 techs) ===
  { id: 'gathering', name: 'Gathering', track: 'economy', cost: 15, prerequisites: [], unlocks: ['Unlock Granary building'], era: 1 },
  { id: 'pottery', name: 'Pottery', track: 'economy', cost: 25, prerequisites: ['gathering'], unlocks: ['Unlock Herbalist building'], era: 1 },
  { id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 30, prerequisites: ['gathering'], unlocks: ['Reveal Horses resource'], era: 1 },
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 45, prerequisites: ['pottery'], unlocks: ['Farms yield +1 food'], era: 2 },
  { id: 'currency', name: 'Currency', track: 'economy', cost: 55, prerequisites: ['pottery'], unlocks: ['Unlock Marketplace building'], era: 2 },
  { id: 'mining-tech', name: 'Advanced Mining', track: 'economy', cost: 65, prerequisites: ['animal-husbandry'], unlocks: ['Mines yield +1 production'], era: 3 },
  { id: 'trade-routes', name: 'Trade Routes', track: 'economy', cost: 75, prerequisites: ['currency'], unlocks: ['Enable trade routes between cities'], era: 3 },
  { id: 'banking', name: 'Banking', track: 'economy', cost: 95, prerequisites: ['trade-routes', 'mathematics'], unlocks: ['+20% gold in all cities'], era: 4 },

  // === SCIENCE TRACK (8 techs) ===
  { id: 'fire', name: 'Fire', track: 'science', cost: 15, prerequisites: [], unlocks: ['Unlock basic research'], era: 1 },
  { id: 'writing', name: 'Writing', track: 'science', cost: 30, prerequisites: ['fire'], unlocks: ['Unlock Library building'], era: 1 },
  { id: 'wheel', name: 'The Wheel', track: 'science', cost: 40, prerequisites: ['fire'], unlocks: ['Unlock Workshop building'], era: 2 },
  { id: 'mathematics', name: 'Mathematics', track: 'science', cost: 60, prerequisites: ['writing'], unlocks: ['Unlock Archive building'], era: 2 },
  { id: 'engineering', name: 'Engineering', track: 'science', cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: ['Unlock Aqueduct, Forge'], era: 3 },
  { id: 'philosophy', name: 'Philosophy', track: 'science', cost: 70, prerequisites: ['writing'], unlocks: ['Unlock Temple building'], era: 3 },
  { id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics'], unlocks: ['Unlock Observatory building'], era: 4 },
  { id: 'medicine', name: 'Medicine', track: 'science', cost: 85, prerequisites: ['philosophy', 'pottery'], unlocks: ['City population grows faster'], era: 4 },

  // === CIVICS TRACK (8 techs) ===
  { id: 'tribal-council', name: 'Tribal Council', track: 'civics', cost: 15, prerequisites: [], unlocks: ['Basic governance'], era: 1 },
  { id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 30, prerequisites: ['tribal-council'], unlocks: ['Unlock Monument building'], era: 1 },
  { id: 'early-empire', name: 'Early Empire', track: 'civics', cost: 45, prerequisites: ['code-of-laws'], unlocks: ['Cities claim +1 tile radius'], era: 2 },
  { id: 'state-workforce', name: 'State Workforce', track: 'civics', cost: 55, prerequisites: ['early-empire'], unlocks: ['Unlock Lumbermill, Quarry'], era: 2 },
  { id: 'diplomacy-tech', name: 'Diplomacy', track: 'civics', cost: 65, prerequisites: ['early-empire', 'writing'], unlocks: ['Unlock Non-Aggression Pacts'], era: 3 },
  { id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 75, prerequisites: ['state-workforce'], unlocks: ['Unlock Forum building'], era: 3 },
  { id: 'drama-poetry', name: 'Drama & Poetry', track: 'civics', cost: 80, prerequisites: ['philosophy', 'code-of-laws'], unlocks: ['Unlock Amphitheater building'], era: 4 },
  { id: 'political-philosophy', name: 'Political Philosophy', track: 'civics', cost: 100, prerequisites: ['civil-service', 'philosophy'], unlocks: ['Unlock alliances'], era: 5 },

  // === EXPLORATION TRACK (8 techs) ===
  { id: 'pathfinding', name: 'Pathfinding', track: 'exploration', cost: 15, prerequisites: [], unlocks: ['Scouts get +1 vision'], era: 1 },
  { id: 'cartography', name: 'Cartography', track: 'exploration', cost: 30, prerequisites: ['pathfinding'], unlocks: ['Reveal map edges'], era: 1 },
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 45, prerequisites: ['pathfinding'], unlocks: ['Units can embark on coast'], era: 2 },
  { id: 'celestial-navigation', name: 'Celestial Navigation', track: 'exploration', cost: 55, prerequisites: ['sailing', 'fire'], unlocks: ['Units can cross ocean'], era: 2 },
  { id: 'road-building', name: 'Road Building', track: 'exploration', cost: 50, prerequisites: ['wheel', 'pathfinding'], unlocks: ['Workers can build roads'], era: 3 },
  { id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: ['Unlock Harbor building'], era: 3 },
  { id: 'exploration-tech', name: 'Exploration', track: 'exploration', cost: 85, prerequisites: ['celestial-navigation'], unlocks: ['All units +1 vision range'], era: 4 },
  { id: 'military-logistics', name: 'Military Logistics', track: 'exploration', cost: 100, prerequisites: ['road-building', 'tactics'], unlocks: ['Units move +1 on roads'], era: 5 },
];
```

Also update `createTechState()` to include the two new tracks in `trackPriorities`:

```typescript
export function createTechState(): TechState {
  return {
    completed: [],
    currentResearch: null,
    researchProgress: 0,
    trackPriorities: {
      military: 'medium',
      economy: 'medium',
      science: 'medium',
      civics: 'medium',
      exploration: 'medium',
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass including new tech tree tests.

- [ ] **Step 5: Commit**

```bash
git add src/systems/tech-system.ts tests/systems/tech-system.test.ts
git commit -m "feat(tech): expand tech tree to 40 techs across 5 tracks with cross-track prerequisites"
```

---

## Task 3: New Terrain Generation (Jungle, Swamp, Volcanic)

**Files:**
- Modify: `src/systems/map-generator.ts`
- Modify: `tests/systems/map-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/map-generator.test.ts`:

```typescript
describe('new terrain types', () => {
  it('generates jungle tiles', () => {
    const map = generateMap(30, 30, 'jungle-test');
    const jungleTiles = Object.values(map.tiles).filter(t => t.terrain === 'jungle');
    expect(jungleTiles.length).toBeGreaterThan(0);
  });

  it('generates swamp tiles', () => {
    const map = generateMap(30, 30, 'swamp-test');
    const swampTiles = Object.values(map.tiles).filter(t => t.terrain === 'swamp');
    expect(swampTiles.length).toBeGreaterThan(0);
  });

  it('generates volcanic tiles', () => {
    // Volcanic is rare — use multiple seeds
    let found = false;
    for (const seed of ['vol-1', 'vol-2', 'vol-3', 'vol-4', 'vol-5']) {
      const map = generateMap(30, 30, seed);
      if (Object.values(map.tiles).some(t => t.terrain === 'volcanic')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('all tiles have hasRiver field', () => {
    const map = generateMap(30, 30, 'river-field-test');
    for (const tile of Object.values(map.tiles)) {
      expect(tile.hasRiver).toBeDefined();
    }
  });

  it('map has rivers array', () => {
    const map = generateMap(30, 30, 'rivers-test');
    expect(Array.isArray(map.rivers)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: New terrain tests fail.

- [ ] **Step 3: Update getTerrain to include new types**

In `src/systems/map-generator.ts`, update the `getTerrain` function to generate jungle, swamp, and volcanic terrain. The current logic (around lines 68-98) determines terrain based on noise values. Add:

- **Jungle:** High temperature (>0.65) AND high moisture (>0.5) AND lowland → jungle instead of forest
- **Swamp:** Low elevation AND very high moisture (>0.7) AND not polar → swamp
- **Volcanic:** Near mountains AND random chance (<0.05) → volcanic

Update the `getTerrain` function:

```typescript
function getTerrain(
  landNoise: number,
  moistureNoise: number,
  elevationNoise: number,
  tempNoise: number,
  q: number,
  r: number,
  height: number,
): TerrainType {
  // Polar regions
  const distFromEdge = Math.min(r, height - 1 - r) / (height / 2);
  if (distFromEdge < 0.1) return tempNoise > 0.5 ? 'tundra' : 'snow';

  // Ocean and coast
  if (landNoise < -0.15) return 'ocean';
  if (landNoise < 0) return 'coast';

  const elevation = getElevation(elevationNoise);

  // Mountains
  if (elevation === 'mountain') return 'mountain';

  // Volcanic — rare, near high elevation
  if (elevationNoise > 0.45 && moistureNoise < 0.2 && landNoise > 0.3) return 'volcanic';

  // Hills
  if (elevation === 'highland') {
    if (moistureNoise > 0.5) return 'forest';
    return 'hills';
  }

  // Lowland terrain by climate
  // Swamp — low-lying, very wet
  if (moistureNoise > 0.7 && landNoise < 0.15 && tempNoise > 0.3) return 'swamp';

  // Jungle — hot and wet
  if (tempNoise > 0.65 && moistureNoise > 0.5) return 'jungle';

  // Forest — moderate moisture
  if (moistureNoise > 0.5) return 'forest';

  // Desert — hot and dry
  if (tempNoise > 0.6 && moistureNoise < 0.3) return 'desert';

  // Plains vs grassland
  if (moistureNoise > 0.3) return 'grassland';
  return 'plains';
}
```

Also ensure `generateMap` initializes `hasRiver: false` on each tile and `rivers: []` on the GameMap. Update the tile creation in the generateMap loop:

```typescript
// In the generateMap loop where tiles are created:
tiles[key] = {
  coord: { q, r },
  terrain,
  elevation,
  resource: null,
  improvement: 'none',
  owner: null,
  improvementTurnsLeft: 0,
  hasRiver: false,
};
```

And the return statement:

```typescript
return {
  width,
  height,
  tiles,
  wrapsHorizontally: false,
  rivers: [],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/map-generator.ts tests/systems/map-generator.test.ts
git commit -m "feat(terrain): add jungle, swamp, and volcanic terrain generation"
```

---

## Task 4: River System

**Files:**
- Create: `src/systems/river-system.ts`
- Create: `tests/systems/river-system.test.ts`
- Modify: `src/systems/map-generator.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/river-system.test.ts`:

```typescript
import { generateRivers, getRiverYieldBonus, getRiverDefensePenalty } from '@/systems/river-system';
import { generateMap } from '@/systems/map-generator';

describe('river system', () => {
  describe('generateRivers', () => {
    it('creates rivers on a map', () => {
      const map = generateMap(30, 30, 'river-gen-test');
      const rivers = generateRivers(map, 'river-gen-test');
      expect(rivers.length).toBeGreaterThan(0);
    });

    it('rivers connect adjacent hexes', () => {
      const map = generateMap(30, 30, 'river-adj-test');
      const rivers = generateRivers(map, 'river-adj-test');
      for (const river of rivers) {
        const dq = Math.abs(river.from.q - river.to.q);
        const dr = Math.abs(river.from.r - river.to.r);
        // Adjacent hexes differ by at most 1 in each coordinate
        expect(dq).toBeLessThanOrEqual(1);
        expect(dr).toBeLessThanOrEqual(1);
      }
    });

    it('rivers start at high elevation and flow toward water', () => {
      const map = generateMap(30, 30, 'river-flow-test');
      const rivers = generateRivers(map, 'river-flow-test');
      if (rivers.length > 0) {
        // First segment should start at highland/mountain
        const startTile = map.tiles[`${rivers[0].from.q},${rivers[0].from.r}`];
        expect(['highland', 'mountain']).toContain(startTile?.elevation);
      }
    });
  });

  describe('getRiverYieldBonus', () => {
    it('returns +1 gold for river tiles', () => {
      const bonus = getRiverYieldBonus(true);
      expect(bonus.gold).toBe(1);
    });

    it('returns no bonus for non-river tiles', () => {
      const bonus = getRiverYieldBonus(false);
      expect(bonus.gold).toBe(0);
    });
  });

  describe('getRiverDefensePenalty', () => {
    it('returns penalty when attacking across a river', () => {
      const penalty = getRiverDefensePenalty(true);
      expect(penalty).toBeLessThan(0);
    });

    it('returns no penalty without river', () => {
      const penalty = getRiverDefensePenalty(false);
      expect(penalty).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: Tests fail (module not found).

- [ ] **Step 3: Implement river system**

Create `src/systems/river-system.ts`:

```typescript
import type { GameMap, HexCoord, ResourceYield } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

export function generateRivers(
  map: GameMap,
  seed: string,
): Array<{ from: HexCoord; to: HexCoord }> {
  const rivers: Array<{ from: HexCoord; to: HexCoord }> = [];
  const riverTiles = new Set<string>();

  // Simple seeded RNG
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const rng = (): number => {
    hash = (hash * 1664525 + 1013904223) | 0;
    return (hash >>> 0) / 4294967296;
  };

  // Find potential river sources (highland/mountain tiles not ocean/coast)
  const sources: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (
      (tile.elevation === 'highland' || tile.elevation === 'mountain') &&
      tile.terrain !== 'ocean' &&
      tile.terrain !== 'coast'
    ) {
      sources.push(tile.coord);
    }
  }

  // Generate 3-6 rivers
  const riverCount = Math.min(sources.length, 3 + Math.floor(rng() * 4));

  // Shuffle sources
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  for (let r = 0; r < riverCount; r++) {
    const source = sources[r];
    if (!source) break;

    let current = source;
    const visited = new Set<string>();
    visited.add(hexKey(current));

    // Flow downhill toward ocean/coast
    for (let step = 0; step < 15; step++) {
      const neighbors = hexNeighbors(current);
      let bestNext: HexCoord | null = null;
      let bestScore = -Infinity;

      for (const neighbor of neighbors) {
        const key = hexKey(neighbor);
        if (visited.has(key)) continue;
        const tile = map.tiles[key];
        if (!tile) continue;

        // Score: prefer lower elevation, ocean/coast terminates
        let score = 0;
        if (tile.terrain === 'ocean' || tile.terrain === 'coast') score = 100;
        else if (tile.elevation === 'lowland') score = 3;
        else if (tile.elevation === 'highland') score = 1;
        else score = 0;

        // Avoid existing rivers
        if (riverTiles.has(key)) score -= 5;
        // Add randomness
        score += rng() * 2;

        if (score > bestScore) {
          bestScore = score;
          bestNext = neighbor;
        }
      }

      if (!bestNext) break;

      rivers.push({ from: current, to: bestNext });
      riverTiles.add(hexKey(current));
      riverTiles.add(hexKey(bestNext));

      // Stop at water
      const nextTile = map.tiles[hexKey(bestNext)];
      if (nextTile && (nextTile.terrain === 'ocean' || nextTile.terrain === 'coast')) {
        break;
      }

      visited.add(hexKey(bestNext));
      current = bestNext;
    }
  }

  return rivers;
}

export function applyRiversToMap(
  map: GameMap,
  rivers: Array<{ from: HexCoord; to: HexCoord }>,
): void {
  map.rivers = rivers;
  for (const segment of rivers) {
    const fromKey = hexKey(segment.from);
    const toKey = hexKey(segment.to);
    if (map.tiles[fromKey]) map.tiles[fromKey].hasRiver = true;
    if (map.tiles[toKey]) map.tiles[toKey].hasRiver = true;
  }
}

export function getRiverYieldBonus(hasRiver: boolean): ResourceYield {
  return {
    food: 0,
    production: 0,
    gold: hasRiver ? 1 : 0,
    science: 0,
  };
}

export function getRiverDefensePenalty(attackingAcrossRiver: boolean): number {
  return attackingAcrossRiver ? -0.2 : 0;
}

export function isRiverBetween(
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
): boolean {
  return map.rivers.some(
    r =>
      (hexKey(r.from) === hexKey(from) && hexKey(r.to) === hexKey(to)) ||
      (hexKey(r.from) === hexKey(to) && hexKey(r.to) === hexKey(from)),
  );
}
```

- [ ] **Step 4: Integrate rivers into map generator**

In `src/systems/map-generator.ts`, add at the end of `generateMap`, before the return statement:

```typescript
import { generateRivers, applyRiversToMap } from './river-system';

// Inside generateMap, after all tiles are created but before return:
const rivers = generateRivers(mapResult, seed);
applyRiversToMap(mapResult, rivers);
```

Where `mapResult` is the map object being built. You'll need to construct the map object first, then apply rivers, then return it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/river-system.ts tests/systems/river-system.test.ts src/systems/map-generator.ts
git commit -m "feat(rivers): add river generation system with yield bonuses and defense penalties"
```

---

## Task 5: Update Terrain-Dependent Systems

**Files:**
- Modify: `src/systems/resource-system.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/systems/improvement-system.ts`
- Modify: `src/systems/unit-system.ts`
- Modify tests for each

- [ ] **Step 1: Write failing tests for new terrain yields**

Add to `tests/systems/resource-system.test.ts`:

```typescript
import { TERRAIN_YIELDS } from '@/systems/resource-system';

describe('new terrain yields', () => {
  it('jungle yields 2 food', () => {
    expect(TERRAIN_YIELDS.jungle.food).toBe(2);
  });

  it('swamp yields 1 food', () => {
    expect(TERRAIN_YIELDS.swamp.food).toBe(1);
  });

  it('volcanic yields 0 food 0 production', () => {
    expect(TERRAIN_YIELDS.volcanic.food).toBe(0);
    expect(TERRAIN_YIELDS.volcanic.production).toBe(0);
  });
});
```

Add to `tests/systems/combat-system.test.ts`:

```typescript
describe('new terrain defense bonuses', () => {
  it('jungle provides 0.15 defense bonus', () => {
    expect(getTerrainDefenseBonus('jungle')).toBe(0.15);
  });

  it('swamp provides no defense bonus', () => {
    expect(getTerrainDefenseBonus('swamp')).toBe(0);
  });
});
```

Add to `tests/systems/fog-of-war.test.ts`:

```typescript
import { getTerrainVisionBonus } from '@/systems/fog-of-war';

describe('new terrain vision', () => {
  it('jungle has -1 vision penalty', () => {
    expect(getTerrainVisionBonus('jungle')).toBe(-1);
  });

  it('swamp has no vision bonus', () => {
    expect(getTerrainVisionBonus('swamp')).toBe(0);
  });
});
```

Add to `tests/systems/improvement-system.test.ts`:

```typescript
import { canBuildImprovement } from '@/systems/improvement-system';

describe('new terrain improvements', () => {
  it('can build farm on jungle', () => {
    const tile = { terrain: 'jungle', improvement: 'none', improvementTurnsLeft: 0 } as any;
    expect(canBuildImprovement(tile, 'farm')).toBe(true);
  });

  it('cannot build mine on swamp', () => {
    const tile = { terrain: 'swamp', improvement: 'none', improvementTurnsLeft: 0 } as any;
    expect(canBuildImprovement(tile, 'mine')).toBe(false);
  });

  it('can build mine on volcanic', () => {
    const tile = { terrain: 'volcanic', improvement: 'none', improvementTurnsLeft: 0 } as any;
    expect(canBuildImprovement(tile, 'mine')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: New tests fail.

- [ ] **Step 3: Update resource-system.ts**

First, **export `TERRAIN_YIELDS`** — change `const TERRAIN_YIELDS` to `export const TERRAIN_YIELDS` on line 6 of `src/systems/resource-system.ts`. This is needed for the city grid UI in Task 10.

Then add new entries to `TERRAIN_YIELDS`:

```typescript
  jungle: { food: 2, production: 0, gold: 0, science: 0 },
  swamp: { food: 1, production: 0, gold: 0, science: 0 },
  volcanic: { food: 0, production: 0, gold: 0, science: 0 },
```

Update `calculateCityYields` to include river bonuses. After calculating tile yields, add:

```typescript
// River bonus
if (tile.hasRiver) {
  totalYield.gold += 1;
  // +1 food if farm on river
  if (tile.improvement === 'farm' && tile.improvementTurnsLeft === 0) {
    totalYield.food += 1;
  }
}
```

- [ ] **Step 4: Update combat-system.ts**

First, **export `getTerrainDefenseBonus`** — change `function getTerrainDefenseBonus` to `export function getTerrainDefenseBonus` in `src/systems/combat-system.ts` (line 5). This allows tests to import it directly.

Add to `getTerrainDefenseBonus`:

```typescript
  jungle: 0.15,
```

(Swamp and volcanic get 0 — no change needed since the default is 0.)

- [ ] **Step 5: Update fog-of-war.ts**

**Export `getTerrainVisionBonus`** — change `function getTerrainVisionBonus` to `export function getTerrainVisionBonus` in `src/systems/fog-of-war.ts` (line 81). Update the function:

```typescript
export function getTerrainVisionBonus(terrain: string): number {
  if (terrain === 'hills') return 1;
  if (terrain === 'jungle') return -1;
  return 0;
}
```

- [ ] **Step 6: Update improvement-system.ts**

Add jungle to farm valid terrain, volcanic to mine valid terrain:

```typescript
const VALID_TERRAIN: Record<string, string[]> = {
  farm: ['grassland', 'plains', 'desert', 'forest', 'jungle'],
  mine: ['hills', 'plains', 'mountain', 'volcanic'],
};
```

- [ ] **Step 7: Update unit-system.ts movement costs**

In `getMovementCost` function, add terrain costs for new types:

```typescript
  jungle: 2,  // dense vegetation, slow
  swamp: 2,   // difficult terrain
  volcanic: 2, // rough terrain
```

- [ ] **Step 8: Run all tests**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/systems/resource-system.ts src/systems/combat-system.ts src/systems/fog-of-war.ts src/systems/improvement-system.ts src/systems/unit-system.ts tests/
git commit -m "feat(terrain): add yields, combat bonuses, vision, movement costs for jungle/swamp/volcanic"
```

---

## Task 6: Update Renderer for New Terrain & Rivers

**Files:**
- Modify: `src/renderer/hex-renderer.ts`

- [ ] **Step 1: Add new terrain colors and river rendering**

In `src/renderer/hex-renderer.ts`, add to `TERRAIN_COLORS`:

```typescript
  jungle: '#2d5a2d',
  swamp: '#4a6b4a',
  volcanic: '#5a3a3a',
```

Add `Camera` to the imports if not already present: `import { Camera } from './camera';`

Add river rendering to `drawHexMap`. After drawing all hex tiles, add a second pass to draw rivers:

```typescript
export function drawRivers(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
): void {
  ctx.strokeStyle = '#4a8faf';
  ctx.lineWidth = 3 * camera.zoom;
  ctx.lineCap = 'round';

  for (const river of map.rivers) {
    if (!camera.isHexVisible(river.from) && !camera.isHexVisible(river.to)) continue;

    const fromPixel = hexToPixel(river.from, camera.hexSize);
    const toPixel = hexToPixel(river.to, camera.hexSize);
    const fromScreen = camera.worldToScreen(fromPixel.x, fromPixel.y);
    const toScreen = camera.worldToScreen(toPixel.x, toPixel.y);

    // Draw river along the edge between hexes (midpoint of edge)
    const midX = (fromScreen.x + toScreen.x) / 2;
    const midY = (fromScreen.y + toScreen.y) / 2;

    // Draw a thicker line segment at the shared edge
    const dx = toScreen.x - fromScreen.x;
    const dy = toScreen.y - fromScreen.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len; // perpendicular
    const ny = dx / len;
    const edgeLen = camera.hexSize * camera.zoom * 0.4;

    ctx.beginPath();
    ctx.moveTo(midX + nx * edgeLen, midY + ny * edgeLen);
    ctx.lineTo(midX - nx * edgeLen, midY - ny * edgeLen);
    ctx.stroke();
  }
}
```

Add the import for `hexToPixel` from hex-utils and `GameMap` from types at the top of the file.

- [ ] **Step 2: Update render-loop.ts to call drawRivers**

In `src/renderer/render-loop.ts`, import `drawRivers` and call it after `drawHexMap`:

```typescript
import { drawHexMap, drawRivers } from './hex-renderer';

// In render(), after drawHexMap:
drawRivers(this.ctx, this.state.map, this.camera);
```

- [ ] **Step 3: Verify build compiles**

Run: `eval "$(mise activate bash)" && yarn build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hex-renderer.ts src/renderer/render-loop.ts
git commit -m "feat(renderer): add jungle/swamp/volcanic terrain colors and river edge rendering"
```

---

## Task 7: Adjacency System

**Files:**
- Create: `src/systems/adjacency-system.ts`
- Create: `tests/systems/adjacency-system.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/adjacency-system.test.ts`:

```typescript
import {
  ADJACENCY_RULES,
  calculateAdjacencyBonuses,
  findOptimalSlot,
} from '@/systems/adjacency-system';

describe('adjacency system', () => {
  describe('ADJACENCY_RULES', () => {
    it('defines adjacency bonuses for buildings', () => {
      expect(ADJACENCY_RULES.length).toBeGreaterThan(0);
    });

    it('library next to temple gives science bonus', () => {
      const rule = ADJACENCY_RULES.find(
        r => r.building === 'library' && r.adjacentTo === 'temple',
      );
      expect(rule).toBeDefined();
      expect(rule!.bonus.science).toBeGreaterThan(0);
    });
  });

  describe('calculateAdjacencyBonuses', () => {
    it('returns bonuses for adjacent buildings', () => {
      // 3x3 grid with library at (1,0) and temple at (1,1)
      const grid: (string | null)[][] = [
        [null, null, null],
        ['library', 'temple', null],
        [null, null, null],
      ];
      const bonuses = calculateAdjacencyBonuses(grid, 3);
      // Library should get bonus from temple
      expect(bonuses['1,0'].science).toBeGreaterThan(0);
    });

    it('returns empty bonuses for isolated buildings', () => {
      const grid: (string | null)[][] = [
        ['library', null, null],
        [null, null, null],
        [null, null, null],
      ];
      const bonuses = calculateAdjacencyBonuses(grid, 3);
      expect(bonuses['0,0'].food).toBe(0);
      expect(bonuses['0,0'].production).toBe(0);
      expect(bonuses['0,0'].gold).toBe(0);
      expect(bonuses['0,0'].science).toBe(0);
    });
  });

  describe('findOptimalSlot', () => {
    it('suggests slot that maximizes adjacency bonuses', () => {
      const grid: (string | null)[][] = [
        [null, null, null],
        [null, 'city-center', null],
        [null, null, null],
      ];
      const slot = findOptimalSlot(grid, 3, 'marketplace');
      expect(slot).toBeDefined();
    });

    it('returns null if no empty slots', () => {
      const grid: (string | null)[][] = [
        ['a', 'b', 'c'],
        ['d', 'city-center', 'f'],
        ['g', 'h', 'i'],
      ];
      const slot = findOptimalSlot(grid, 3, 'marketplace');
      expect(slot).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: Tests fail (module not found).

- [ ] **Step 3: Implement adjacency system**

Create `src/systems/adjacency-system.ts`:

```typescript
import type { ResourceYield } from '@/core/types';

export interface AdjacencyRule {
  building: string;
  adjacentTo: string;
  bonus: Partial<ResourceYield>;
}

export const ADJACENCY_RULES: AdjacencyRule[] = [
  // Library bonuses
  { building: 'library', adjacentTo: 'temple', bonus: { science: 2 } },
  { building: 'library', adjacentTo: 'city-center', bonus: { science: 1 } },
  { building: 'library', adjacentTo: 'archive', bonus: { science: 1 } },

  // Marketplace bonuses
  { building: 'marketplace', adjacentTo: 'workshop', bonus: { gold: 1, production: 1 } },
  { building: 'marketplace', adjacentTo: 'city-center', bonus: { gold: 1 } },
  { building: 'marketplace', adjacentTo: 'harbor', bonus: { gold: 2 } },

  // Workshop bonuses
  { building: 'workshop', adjacentTo: 'city-center', bonus: { production: 1 } },
  { building: 'workshop', adjacentTo: 'forge', bonus: { production: 2 } },

  // Granary bonuses
  { building: 'granary', adjacentTo: 'city-center', bonus: { food: 1 } },
  { building: 'granary', adjacentTo: 'herbalist', bonus: { food: 1 } },
  { building: 'granary', adjacentTo: 'aqueduct', bonus: { food: 2 } },

  // Barracks bonuses
  { building: 'barracks', adjacentTo: 'walls', bonus: { production: 1 } },
  { building: 'barracks', adjacentTo: 'stable', bonus: { production: 1 } },

  // Temple bonuses
  { building: 'temple', adjacentTo: 'monument', bonus: { science: 1 } },
  { building: 'temple', adjacentTo: 'shrine', bonus: { science: 1 } },

  // Forge bonuses
  { building: 'forge', adjacentTo: 'quarry-building', bonus: { production: 1 } },

  // Archive bonuses
  { building: 'archive', adjacentTo: 'observatory', bonus: { science: 2 } },

  // Amphitheater bonuses
  { building: 'amphitheater', adjacentTo: 'forum', bonus: { gold: 1, science: 1 } },
];

function getGridNeighbors(row: number, col: number, gridSize: number): Array<{ row: number; col: number }> {
  const neighbors: Array<{ row: number; col: number }> = [];
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
  for (const [dr, dc] of deltas) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
      neighbors.push({ row: nr, col: nc });
    }
  }
  return neighbors;
}

export function calculateAdjacencyBonuses(
  grid: (string | null)[][],
  gridSize: number,
): Record<string, ResourceYield> {
  const bonuses: Record<string, ResourceYield> = {};

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const buildingId = grid[r]?.[c];
      if (!buildingId) continue;

      const key = `${r},${c}`;
      bonuses[key] = { food: 0, production: 0, gold: 0, science: 0 };

      const neighbors = getGridNeighbors(r, c, gridSize);
      for (const { row: nr, col: nc } of neighbors) {
        const neighborId = grid[nr]?.[nc];
        if (!neighborId) continue;

        // Check rules where this building benefits from the neighbor
        for (const rule of ADJACENCY_RULES) {
          if (rule.building === buildingId && rule.adjacentTo === neighborId) {
            bonuses[key].food += rule.bonus.food ?? 0;
            bonuses[key].production += rule.bonus.production ?? 0;
            bonuses[key].gold += rule.bonus.gold ?? 0;
            bonuses[key].science += rule.bonus.science ?? 0;
          }
        }
      }
    }
  }

  return bonuses;
}

export function getTotalAdjacencyYields(
  grid: (string | null)[][],
  gridSize: number,
): ResourceYield {
  const bonuses = calculateAdjacencyBonuses(grid, gridSize);
  const total: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  for (const bonus of Object.values(bonuses)) {
    total.food += bonus.food;
    total.production += bonus.production;
    total.gold += bonus.gold;
    total.science += bonus.science;
  }
  return total;
}

export function findOptimalSlot(
  grid: (string | null)[][],
  gridSize: number,
  buildingId: string,
): { row: number; col: number } | null {
  let bestSlot: { row: number; col: number } | null = null;
  let bestScore = -1;

  // Center of grid (unlocked area)
  const offset = Math.floor((5 - gridSize) / 2);

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r]?.[c] !== null) continue; // occupied

      // Temporarily place building
      grid[r][c] = buildingId;
      const bonuses = calculateAdjacencyBonuses(grid, gridSize);
      grid[r][c] = null; // restore

      // Score = total bonus yields for the placed building
      const key = `${r},${c}`;
      const bonus = bonuses[key];
      if (!bonus) continue;

      const score = bonus.food + bonus.production + bonus.gold + bonus.science;
      if (score > bestScore) {
        bestScore = score;
        bestSlot = { row: r, col: c };
      }
    }
  }

  // If no bonus slot found, pick first empty
  if (!bestSlot) {
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r]?.[c] === null) {
          return { row: r, col: c };
        }
      }
    }
  }

  return bestSlot;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/adjacency-system.ts tests/systems/adjacency-system.test.ts
git commit -m "feat(adjacency): add building adjacency bonus system with optimal slot finder"
```

---

## Task 8: Expand Buildings & City Grid

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/city-system.test.ts`:

```typescript
import { foundCity, BUILDINGS, getAvailableBuildings } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

describe('expanded buildings', () => {
  it('has at least 20 buildings defined', () => {
    expect(Object.keys(BUILDINGS).length).toBeGreaterThanOrEqual(20);
  });

  it('all buildings have a category', () => {
    for (const building of Object.values(BUILDINGS)) {
      expect(building.category).toBeDefined();
      expect(['production', 'food', 'science', 'economy', 'military', 'culture']).toContain(building.category);
    }
  });

  it('getAvailableBuildings filters by tech requirements', () => {
    const map = generateMap(30, 30, 'building-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    // With no techs, only buildings with no tech requirement should be available
    const available = getAvailableBuildings(city, []);
    for (const b of available) {
      expect(b.techRequired).toBeNull();
    }
  });
});

describe('city grid', () => {
  it('foundCity initializes a 3x3 grid', () => {
    const map = generateMap(30, 30, 'grid-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    expect(city.gridSize).toBe(3);
    expect(city.grid.length).toBe(5);
    expect(city.grid[0].length).toBe(5);
  });

  it('city center is placed in the center of the grid', () => {
    const map = generateMap(30, 30, 'grid-center');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    expect(city.grid[2][2]).toBe('city-center');
  });

  it('only center 3x3 slots are unlocked initially', () => {
    const map = generateMap(30, 30, 'grid-lock');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    // Center 3x3 = rows 1-3, cols 1-3
    // Outer ring should not have buildings
    expect(city.grid[0][0]).toBeNull();
    expect(city.grid[4][4]).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: New tests fail.

- [ ] **Step 3: Expand BUILDINGS and update foundCity**

In `src/systems/city-system.ts`, replace the `BUILDINGS` object with the expanded version:

```typescript
export const BUILDINGS: Record<string, Building> = {
  // Food
  granary: { id: 'granary', name: 'Granary', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 40, description: 'Stores food for growth', techRequired: null, adjacencyBonuses: [] },
  herbalist: { id: 'herbalist', name: 'Herbalist', category: 'food', yields: { food: 1, production: 0, gold: 0, science: 0 }, productionCost: 35, description: 'Herbal medicine boosts health', techRequired: null, adjacencyBonuses: [] },
  aqueduct: { id: 'aqueduct', name: 'Aqueduct', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 80, description: 'Brings fresh water for growth', techRequired: 'engineering', adjacencyBonuses: [] },

  // Production
  workshop: { id: 'workshop', name: 'Workshop', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 50, description: 'Tools boost production', techRequired: null, adjacencyBonuses: [] },
  forge: { id: 'forge', name: 'Forge', category: 'production', yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 70, description: 'Metalworking facility', techRequired: 'engineering', adjacencyBonuses: [] },
  lumbermill: { id: 'lumbermill', name: 'Lumbermill', category: 'production', yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 50, description: 'Processes timber efficiently', techRequired: 'state-workforce', adjacencyBonuses: [] },
  'quarry-building': { id: 'quarry-building', name: 'Quarry', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 55, description: 'Cuts stone for construction', techRequired: 'state-workforce', adjacencyBonuses: [] },

  // Science
  library: { id: 'library', name: 'Library', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 60, description: 'Knowledge repository', techRequired: 'writing', adjacencyBonuses: [] },
  archive: { id: 'archive', name: 'Archive', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 75, description: 'Preserves ancient knowledge', techRequired: 'mathematics', adjacencyBonuses: [] },
  observatory: { id: 'observatory', name: 'Observatory', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 100, description: 'Studies the stars', techRequired: 'astronomy', adjacencyBonuses: [] },

  // Economy
  marketplace: { id: 'marketplace', name: 'Marketplace', category: 'economy', yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 50, description: 'Center of trade', techRequired: 'currency', adjacencyBonuses: [] },
  harbor: { id: 'harbor', name: 'Harbor', category: 'economy', yields: { food: 1, production: 0, gold: 3, science: 0 }, productionCost: 80, description: 'Enables sea trade', techRequired: 'harbor-tech', adjacencyBonuses: [] },

  // Military
  barracks: { id: 'barracks', name: 'Barracks', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 40, description: 'Trains soldiers', techRequired: null, adjacencyBonuses: [] },
  walls: { id: 'walls', name: 'Walls', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 60, description: 'Defends the city', techRequired: 'fortification', adjacencyBonuses: [] },
  stable: { id: 'stable', name: 'Stable', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 55, description: 'Trains mounted units', techRequired: 'horseback-riding', adjacencyBonuses: [] },

  // Culture
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center', techRequired: 'philosophy', adjacencyBonuses: [] },
  monument: { id: 'monument', name: 'Monument', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 30, description: 'Commemorates your civilization', techRequired: 'code-of-laws', adjacencyBonuses: [] },
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture', techRequired: 'drama-poetry', adjacencyBonuses: [] },
  shrine: { id: 'shrine', name: 'Shrine', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 25, description: 'Place of worship', techRequired: null, adjacencyBonuses: [] },
  forum: { id: 'forum', name: 'Forum', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 70, description: 'Public gathering place', techRequired: 'civil-service', adjacencyBonuses: [] },
};
```

Update `foundCity` to initialize the city grid:

```typescript
export function foundCity(owner: string, position: HexCoord, map: GameMap): City {
  // ... existing logic for nameIndex, claiming tiles ...

  // Initialize 5x5 grid (all null)
  const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => null),
  );
  // Place city center in the middle
  grid[2][2] = 'city-center';

  return {
    id: `city-${nextCityId++}`,
    name: CITY_NAMES[cityNameIndex % CITY_NAMES.length],
    owner,
    position,
    population: 1,
    food: 0,
    foodNeeded: 15,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles,
    grid,
    gridSize: 3,
  };
}
```

Update `getAvailableBuildings` to filter by tech requirements:

```typescript
export function getAvailableBuildings(city: City, completedTechs: string[]): Building[] {
  return Object.values(BUILDINGS).filter(b => {
    if (b.id === 'city-center') return false;
    if (city.buildings.includes(b.id)) return false;
    if (b.techRequired && !completedTechs.includes(b.techRequired)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Add grid expansion and gold purchase functions**

Add to `src/systems/city-system.ts`:

```typescript
/** Auto-expand grid when population threshold is reached. Call from processCity after growth. */
export function checkGridExpansion(city: City): boolean {
  if (city.population >= 6 && city.gridSize < 5) {
    city.gridSize = 5;
    return true;
  }
  if (city.population >= 3 && city.gridSize < 4) {
    city.gridSize = 4;
    return true;
  }
  return false;
}

/** Purchase grid expansion with gold. Returns cost deducted, or 0 if purchase fails. */
export function purchaseGridExpansion(city: City, currentGold: number): number {
  if (city.gridSize >= 5) return 0;
  const cost = city.gridSize < 4 ? 50 : 150;
  if (currentGold < cost) return 0;
  city.gridSize = city.gridSize < 4 ? 4 : 5;
  return cost;
}
```

Update `processCity` — after the population growth block (`if (grew)`), add:

```typescript
if (grew) {
  // ... existing growth logic ...
  const gridExpanded = checkGridExpansion(city);
  if (gridExpanded) {
    bus.emit('grid:slot-unlocked', { cityId: city.id, newGridSize: city.gridSize });
  }
}
```

- [ ] **Step 5: Add tests for grid expansion and gold purchase**

Add to `tests/systems/city-system.test.ts`:

```typescript
import { checkGridExpansion, purchaseGridExpansion } from '@/systems/city-system';

describe('grid expansion', () => {
  it('expands to 4x4 at population 3', () => {
    const map = generateMap(30, 30, 'expand-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    city.population = 3;
    expect(checkGridExpansion(city)).toBe(true);
    expect(city.gridSize).toBe(4);
  });

  it('expands to 5x5 at population 6', () => {
    const map = generateMap(30, 30, 'expand-test-2');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    city.population = 6;
    city.gridSize = 4;
    expect(checkGridExpansion(city)).toBe(true);
    expect(city.gridSize).toBe(5);
  });

  it('purchase grid expansion costs 50 gold for 4x4', () => {
    const map = generateMap(30, 30, 'buy-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const cost = purchaseGridExpansion(city, 60);
    expect(cost).toBe(50);
    expect(city.gridSize).toBe(4);
  });

  it('purchase fails with insufficient gold', () => {
    const map = generateMap(30, 30, 'buy-test-2');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const cost = purchaseGridExpansion(city, 30);
    expect(cost).toBe(0);
    expect(city.gridSize).toBe(3);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): expand to 21 buildings with categories/tech reqs, city grid, and gold purchase"
```

---

## Task 9: Integrate Adjacency into Resource System

**Files:**
- Modify: `src/systems/resource-system.ts`
- Modify: `tests/systems/resource-system.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/systems/resource-system.test.ts`:

```typescript
import { calculateCityYields } from '@/systems/resource-system';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

describe('adjacency yields in city calculation', () => {
  it('includes adjacency bonuses in city yields', () => {
    const map = generateMap(30, 30, 'adj-yield');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    // Place library adjacent to city-center (which gives +1 science)
    city.grid[2][1] = 'library';
    city.buildings = ['library'];

    const yields = calculateCityYields(city, map);
    // Base science from library (2) + adjacency to city-center (+1) = at least 3
    expect(yields.science).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: Fails (adjacency not included in calculateCityYields yet).

- [ ] **Step 3: Integrate adjacency bonuses into calculateCityYields**

In `src/systems/resource-system.ts`, import and use the adjacency system:

```typescript
import { getTotalAdjacencyYields } from './adjacency-system';

// In calculateCityYields, after all other yield calculations, add:
  // Adjacency bonuses from city grid
  if (city.grid) {
    const adjYields = getTotalAdjacencyYields(city.grid, city.gridSize);
    totalYield.food += adjYields.food;
    totalYield.production += adjYields.production;
    totalYield.gold += adjYields.gold;
    totalYield.science += adjYields.science;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/resource-system.ts tests/systems/resource-system.test.ts
git commit -m "feat(yields): integrate adjacency bonuses into city yield calculations"
```

---

## Task 10: City Grid UI

**Files:**
- Create: `src/ui/city-grid.ts`
- Modify: `src/ui/city-panel.ts`

- [ ] **Step 1: Create city grid UI component**

Create `src/ui/city-grid.ts`:

```typescript
import type { City, GameMap, HexTile } from '@/core/types';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import { BUILDINGS } from '@/systems/city-system';
import { calculateAdjacencyBonuses, findOptimalSlot } from '@/systems/adjacency-system';
import { TERRAIN_YIELDS } from '@/systems/resource-system';

const BUILDING_ICONS: Record<string, string> = {
  'city-center': '🏛️',
  granary: '🌾',
  herbalist: '🌿',
  aqueduct: '💧',
  workshop: '⚒️',
  forge: '🔥',
  lumbermill: '🪵',
  'quarry-building': '🪨',
  library: '📚',
  archive: '📜',
  observatory: '🔭',
  marketplace: '🏪',
  harbor: '⚓',
  barracks: '⚔️',
  walls: '🧱',
  stable: '🐴',
  temple: '🕍',
  monument: '🗿',
  amphitheater: '🎭',
  shrine: '⛩️',
  forum: '🏛️',
};

const TERRAIN_ICONS: Record<string, string> = {
  grassland: '🌿',
  plains: '🌾',
  desert: '🏜️',
  forest: '🌲',
  hills: '⛰️',
  jungle: '🌴',
  swamp: '🌊',
  volcanic: '🌋',
  tundra: '❄️',
  coast: '🏖️',
};

interface CityGridCallbacks {
  onSlotTap: (row: number, col: number) => void;
  onBuyExpansion: () => void;
  onClose: () => void;
}

export function createCityGrid(
  container: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-grid';
  panel.style.cssText = 'padding:16px;';

  const adjBonuses = calculateAdjacencyBonuses(city.grid, city.gridSize);
  const suggestedSlot = suggestedBuilding
    ? findOptimalSlot(city.grid, city.gridSize, suggestedBuilding)
    : null;

  // Get terrain for edge slots from owned tiles
  const ownedTileMap: Record<string, HexTile> = {};
  const surroundingHexes = hexesInRange(city.position, 1);
  for (let i = 0; i < surroundingHexes.length && i < 8; i++) {
    const key = hexKey(surroundingHexes[i]);
    if (map.tiles[key]) {
      ownedTileMap[`edge-${i}`] = map.tiles[key];
    }
  }

  let html = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;max-width:380px;margin:0 auto;">';

  // Map edge slots to surrounding hex indices
  const edgeSlots: Record<string, number> = {
    '0,1': 0, '0,2': 1, '0,3': 2,
    '1,0': 3, '1,4': 4,
    '2,0': 5, '2,4': 6,
    '3,0': 7, '3,4': 8,
    '4,1': 9, '4,2': 10, '4,3': 11,
    '0,0': 12, '0,4': 13, '4,0': 14, '4,4': 15,
  };

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const building = city.grid[r]?.[c];
      const isUnlocked = isSlotUnlocked(r, c, city.gridSize);
      const isSuggested = suggestedSlot && suggestedSlot.row === r && suggestedSlot.col === c;
      const adjKey = `${r},${c}`;
      const bonus = adjBonuses[adjKey];

      if (!isUnlocked) {
        // Locked slot
        const popNeeded = r < 1 || r > 3 || c < 1 || c > 3 ? 6 : 3;
        const buyCost = popNeeded === 3 ? 50 : 150;
        html += `<div class="grid-locked" style="aspect-ratio:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:10px;color:rgba(255,255,255,0.15);cursor:pointer;">
          <span>🔒</span>
          <span style="margin-top:2px;">Pop ${popNeeded}</span>
          <span style="font-size:8px;">💰${buyCost}</span>
        </div>`;
      } else if (building) {
        // Building placed
        const icon = BUILDING_ICONS[building] ?? '🏗️';
        const bDef = BUILDINGS[building];
        const name = bDef?.name ?? building;
        let bonusText = '';
        if (bonus && (bonus.food + bonus.production + bonus.gold + bonus.science > 0)) {
          const parts: string[] = [];
          if (bonus.food > 0) parts.push(`+${bonus.food}🍞`);
          if (bonus.production > 0) parts.push(`+${bonus.production}⚒️`);
          if (bonus.gold > 0) parts.push(`+${bonus.gold}💰`);
          if (bonus.science > 0) parts.push(`+${bonus.science}🔬`);
          bonusText = `<span style="font-size:7px;color:#e8c170;">${parts.join(' ')}</span>`;
        }
        const bgColor = building === 'city-center' ? 'rgba(232,193,112,0.3)' : 'rgba(107,155,75,0.2)';
        const borderColor = building === 'city-center' ? '#e8c170' : 'rgba(107,155,75,0.5)';
        html += `<div style="aspect-ratio:1;background:${bgColor};border:2px solid ${borderColor};border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:10px;">
          <span style="font-size:18px;">${icon}</span>
          <span style="font-size:7px;margin-top:1px;">${name}</span>
          ${bonusText}
        </div>`;
      } else {
        // Empty unlocked slot
        const edgeKey = `${r},${c}`;
        const edgeIdx = edgeSlots[edgeKey];
        const edgeTile = edgeIdx !== undefined ? ownedTileMap[`edge-${edgeIdx}`] : null;

        let terrainInfo = '';
        if (edgeTile && r !== 2 && c !== 2) {
          const tIcon = TERRAIN_ICONS[edgeTile.terrain] ?? '?';
          const tYield = TERRAIN_YIELDS[edgeTile.terrain];
          const yieldParts: string[] = [];
          if (tYield?.food) yieldParts.push(`${tYield.food}🍞`);
          if (tYield?.production) yieldParts.push(`${tYield.production}⚒️`);
          if (edgeTile.hasRiver) yieldParts.push('+1💰');
          terrainInfo = `<span style="font-size:14px;">${tIcon}</span>
            <span style="font-size:7px;color:rgba(255,255,255,0.5);">${edgeTile.terrain}</span>
            <span style="font-size:7px;color:rgba(255,255,255,0.4);">${yieldParts.join(' ')}</span>`;
        } else {
          terrainInfo = '<span style="font-size:14px;color:rgba(255,255,255,0.25);">+</span>';
        }

        const border = isSuggested
          ? 'border:2px dashed #e8c170;animation:pulse 1.5s infinite;'
          : 'border:2px dashed rgba(255,255,255,0.15);';
        const bg = edgeTile
          ? `background:rgba(255,255,255,0.04);`
          : 'background:rgba(255,255,255,0.06);';

        html += `<div class="grid-slot" data-row="${r}" data-col="${c}" style="aspect-ratio:1;${bg}${border}border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;font-size:10px;">
          ${terrainInfo}
          ${isSuggested ? '<span style="font-size:7px;color:#e8c170;">✨ suggested</span>' : ''}
        </div>`;
      }
    }
  }

  html += '</div>';
  html += '<style>@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }</style>';

  panel.innerHTML = html;
  container.appendChild(panel);

  // Click handlers for empty slots
  panel.querySelectorAll('.grid-slot').forEach(el => {
    el.addEventListener('click', () => {
      const row = parseInt((el as HTMLElement).dataset.row!);
      const col = parseInt((el as HTMLElement).dataset.col!);
      callbacks.onSlotTap(row, col);
    });
  });

  // Click handlers for locked slots (gold purchase)
  panel.querySelectorAll('.grid-locked').forEach(el => {
    el.addEventListener('click', () => {
      callbacks.onBuyExpansion();
    });
  });

  return panel;
}

function isSlotUnlocked(row: number, col: number, gridSize: number): boolean {
  const offset = Math.floor((5 - gridSize) / 2);
  return row >= offset && row < 5 - offset && col >= offset && col < 5 - offset;
}
```

- [ ] **Step 2: Update city panel with grid tab**

In `src/ui/city-panel.ts`, add a tab toggle at the top and integrate the grid view. Add a "Grid View" button that shows/hides the grid:

After the yields display section, add:

```typescript
import { createCityGrid } from './city-grid';

// Inside createCityPanel, after the yields display, add tab buttons:
  html += `
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <div id="tab-list" style="padding:6px 16px;background:rgba(255,255,255,0.15);border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">List</div>
      <div id="tab-grid" style="padding:6px 16px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:12px;">Grid</div>
    </div>
    <div id="city-list-view">
  `;
  // ... existing list content ...
  html += '</div>';
  html += '<div id="city-grid-view" style="display:none;"></div>';
```

After `panel.innerHTML = html`, add grid view setup:

```typescript
  // Tab switching
  const listTab = panel.querySelector('#tab-list') as HTMLElement;
  const gridTab = panel.querySelector('#tab-grid') as HTMLElement;
  const listView = panel.querySelector('#city-list-view') as HTMLElement;
  const gridView = panel.querySelector('#city-grid-view') as HTMLElement;

  listTab?.addEventListener('click', () => {
    listView.style.display = 'block';
    gridView.style.display = 'none';
    listTab.style.background = 'rgba(255,255,255,0.15)';
    gridTab.style.background = 'rgba(255,255,255,0.05)';
  });

  gridTab?.addEventListener('click', () => {
    listView.style.display = 'none';
    gridView.style.display = 'block';
    gridTab.style.background = 'rgba(255,255,255,0.15)';
    listTab.style.background = 'rgba(255,255,255,0.05)';
    // Create grid if not already created
    if (!gridView.hasChildNodes()) {
      createCityGrid(gridView, city, state.map, {
        onSlotTap: (row, col) => {
          // For now, just show notification
          callbacks.onClose();
        },
        onBuyExpansion: () => {
          // Attempt gold purchase via purchaseGridExpansion
          // Wired up in main.ts Task 12
          callbacks.onClose();
        },
        onClose: callbacks.onClose,
      });
    }
  });
```

- [ ] **Step 3: Verify build compiles**

Run: `eval "$(mise activate bash)" && yarn build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/city-grid.ts src/ui/city-panel.ts
git commit -m "feat(ui): add city interior grid view with terrain display and adjacency bonuses"
```

---

## Task 11: Update Tech Panel for 5 Tracks

**Files:**
- Modify: `src/ui/tech-panel.ts`

- [ ] **Step 1: Update tech panel to show 5 tracks**

In `src/ui/tech-panel.ts`, update the tracks array and icons:

```typescript
  const tracks: TechTrack[] = ['military', 'economy', 'science', 'civics', 'exploration'];
  const trackIcons: Record<string, string> = {
    military: '⚔️',
    economy: '💰',
    science: '🔬',
    civics: '📜',
    exploration: '🧭',
  };
```

- [ ] **Step 2: Verify build compiles**

Run: `eval "$(mise activate bash)" && yarn build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/tech-panel.ts
git commit -m "feat(ui): update tech panel to display 5 tracks including civics and exploration"
```

---

## Task 12: Wire Up Tech & City Panels in Main

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace togglePanel stubs with real panel creation**

In `src/main.ts`, replace the `togglePanel` function stub with real implementations. Import the panel creators:

```typescript
import { createTechPanel } from '@/ui/tech-panel';
import { createCityPanel } from '@/ui/city-panel';
import { startResearch } from '@/systems/tech-system';
```

Replace the `togglePanel` function:

```typescript
function togglePanel(panel: string): void {
  // Remove any existing panel
  document.getElementById('tech-panel')?.remove();
  document.getElementById('city-panel')?.remove();

  if (panel === 'tech') {
    createTechPanel(uiLayer, gameState, {
      onStartResearch: (techId) => {
        gameState.civilizations.player.techState = startResearch(
          gameState.civilizations.player.techState,
          techId,
        );
        renderLoop.setGameState(gameState);
        updateHUD();
        showNotification(`Researching ${techId}...`, 'info');
      },
      onClose: () => {},
    });
  } else if (panel === 'city') {
    // Find the first player city
    const playerCityId = gameState.civilizations.player.cities[0];
    const city = playerCityId ? gameState.cities[playerCityId] : null;
    if (!city) {
      showNotification('No cities founded yet!', 'info');
      return;
    }
    createCityPanel(uiLayer, city, gameState, {
      onBuild: (cityId, itemId) => {
        const targetCity = gameState.cities[cityId];
        if (targetCity) {
          targetCity.productionQueue = [itemId];
          targetCity.productionProgress = 0;
          renderLoop.setGameState(gameState);
          showNotification(`${targetCity.name}: building ${itemId}`, 'info');
        }
      },
      onClose: () => {},
    });
  }
}
```

- [ ] **Step 2: Verify build compiles and tests pass**

Run: `eval "$(mise activate bash)" && yarn build && yarn test`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): wire up tech and city panel buttons to real panel views"
```

---

## Task 13: Integration Test & Polish

- [ ] **Step 1: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test`
Expected: All tests pass (92 original + new tests).

- [ ] **Step 2: Run production build**

Run: `eval "$(mise activate bash)" && yarn build`
Expected: Build succeeds.

- [ ] **Step 3: Verify the build output**

Run: `ls -la dist/ && ls -la dist/assets/`
Expected: index.html, manifest.json, sw.js, and JS bundle present.

- [ ] **Step 4: Commit any final fixes**

If any fixes were needed:

```bash
git add -A
git commit -m "fix: integration fixes for M2a deeper world"
```

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```

---

## Summary

**13 tasks** covering M2a "Deeper World":

| # | Task | Key Changes |
|---|------|-------------|
| 1 | Update core types | New terrain types, tech tracks, city grid, river fields |
| 2 | Expand tech tree | 15 → 40 techs, 5 tracks, cross-track prereqs |
| 3 | New terrain generation | Jungle, swamp, volcanic in map generator |
| 4 | River system | River generation, yield bonuses, defense penalties |
| 5 | Terrain-dependent systems | Yields, combat, vision, movement, improvements |
| 6 | Renderer updates | New terrain colors, river edge rendering |
| 7 | Adjacency system | Adjacency rules, bonus calculation, optimal slot finder |
| 8 | Expanded buildings & grid | 7 → 21 buildings, city grid initialization |
| 9 | Adjacency integration | Adjacency bonuses in city yield calculation |
| 10 | City grid UI | DOM grid view with terrain display |
| 11 | Tech panel update | 5 tracks in tech panel |
| 12 | Wire up panels | Replace panel stubs with real views |
| 13 | Integration & deploy | Full test, build, push |
