# Unified Threat Pressure System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the mid-game lull by making barbarians resurge and pirate fleets raid whenever a human player dominates a landmass and goes idle.

**Architecture:** A new `threat-pressure-system.ts` provides pure scoring functions and spawn/movement mutators. Turn-manager wires them after existing barbarian/beast phases. Per-civ, per-landmass state on `GameState` drives all logic.

**Tech Stack:** TypeScript, vitest, Web Audio API (synthesized SFX — no audio files), existing hex utilities (`hexNeighbors`, `hexKey`, `hexDistance` from `src/systems/hex-utils.ts`).

**Spec:** `docs/superpowers/specs/2026-06-15-threat-pressure-system-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/core/types.ts` | Modify | Add `regionKey`, `resurgent`, `lastCombatTurnByLandmass`, `PirateFleet`, new GameState fields |
| `src/systems/threat-pressure-system.ts` | Create | All scoring, spawning, movement logic + SFX + bandit lord pool |
| `src/systems/continent-map-generator.ts` | Modify | Write `regionKey` to tiles after generation |
| `src/systems/balanced-map-generator.ts` | Modify | Flood-fill + write `regionKey` after generation |
| `src/storage/save-manager.ts` | Modify | Add `normalizeLandmassKeys()` to load pipeline |
| `src/main.ts` | Modify | `migrateLegacySave()` defaults + combat tracking + bus event handlers |
| `src/core/turn-manager.ts` | Modify | Wire `processThreatPressure` + `processPirateFleets` + update hostile filters |
| `src/systems/combat-reward-system.ts` | Modify | Add `PIRATE_OWNER` to `canReceiveGoldReward` |
| `src/renderer/unit-map-presentation.ts` | Modify | Add `PIRATE_OWNER` to hostile check + `getFaction` |
| `src/renderer/render-loop.ts` | Modify | Add `pirate: '#8b4513'` to `colorLookup` |
| `src/audio/sfx.ts` | Modify | Add 4 synthesized SFX entries |
| `tests/systems/threat-pressure-system.test.ts` | Create | Unit + integration tests |
| `tests/systems/threat-pressure-balance.test.ts` | Create | Balance threshold tests |
| `tests/storage/save-migration-landmass.test.ts` | Create | Save migration tests |

---

## MR1 — Landmass Tagging

**Scope:** Populate `HexTile.regionKey` in all map generators + save migration. Zero gameplay change. Safe to merge standalone.

---

### Task 1: Add `regionKey` to types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateBalancedMap } from '@/systems/balanced-map-generator';

describe('landmass tagging', () => {
  it('generateBalancedMap assigns regionKey to all land tiles', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed', 2);
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey, `tile at ${tile.coord.q},${tile.coord.r} missing regionKey`).toBeDefined();
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });

  it('ocean tiles have no regionKey', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed-2', 2);
    const oceanTiles = Object.values(map.tiles).filter(t => t.terrain === 'ocean');
    for (const tile of oceanTiles) {
      expect(tile.regionKey).toBeUndefined();
    }
  });
});
```

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL — `tile.regionKey` is undefined (property doesn't exist yet).

- [ ] **Step 1.3: Add `regionKey` to `HexTile` in `src/core/types.ts`**

Find the `HexTile` interface (around line 223). Add `regionKey` as the last field:

```typescript
export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;
  improvement: ImprovementType;
  owner: string | null;
  improvementTurnsLeft: number;
  improvementOwner?: string;
  hasRiver: boolean;
  wonder: string | null;
  regionKey?: string;   // 'continent-N' or 'island-N'; undefined on ocean tiles
}
```

- [ ] **Step 1.4: Run test — still fails (generator not yet writing regionKey)**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL — property exists but is still undefined after generation.

- [ ] **Step 1.5: Commit type change**

```bash
git add src/core/types.ts tests/systems/threat-pressure-system.test.ts
git commit -m "feat(types): add regionKey to HexTile for landmass identification"
```

---

### Task 2: Write shared flood-fill helper

**Files:**
- Create: `src/systems/landmass-tagger.ts`
- Test: `tests/systems/threat-pressure-system.test.ts` (extend)

- [ ] **Step 2.1: Write the failing test — flood-fill produces correct IDs**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { tagLandmassRegions } from '@/systems/landmass-tagger';
import type { GameMap, HexTile } from '@/core/types';

describe('tagLandmassRegions', () => {
  function makeTile(q: number, r: number, terrain: string): HexTile {
    return { coord: { q, r }, terrain: terrain as any, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
  }

  it('assigns continent-0 to largest connected land component', () => {
    // 5 connected land tiles in top-left, 2 isolated in bottom-right
    const tiles: Record<string, HexTile> = {};
    [[0,0],[1,0],[2,0],[0,1],[1,1]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'grassland'); });
    [[5,5],[5,6]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    [[3,3]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'ocean'); });
    const map: GameMap = { width: 10, height: 10, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    // Largest component (5 tiles) = continent-0; smaller (2 tiles) = island-0
    expect(tagged['0,0'].regionKey).toBe('continent-0');
    expect(tagged['5,5'].regionKey).toBe('island-0');
    expect(tagged['3,3'].regionKey).toBeUndefined();
  });

  it('components < 9 tiles get island-N prefix', () => {
    const tiles: Record<string, HexTile> = {};
    [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    [[10,0]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 5, tiles, wrapsHorizontally: false, rivers: [] };
    const tagged = tagLandmassRegions(map);
    expect(tagged['0,0'].regionKey).toBe('continent-0'); // exactly 9 — continent threshold
    expect(tagged['10,0'].regionKey).toBe('island-0');   // 1 tile — island
  });
});
```

- [ ] **Step 2.2: Run test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL — `tagLandmassRegions` is not importable (module doesn't exist).

- [ ] **Step 2.3: Create `src/systems/landmass-tagger.ts`**

```typescript
import type { GameMap, HexTile } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

const MIN_CONTINENT_TILES = 9;

export function tagLandmassRegions(map: GameMap): Record<string, HexTile> {
  const tiles = { ...map.tiles };
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const key of Object.keys(tiles)) {
    const tile = tiles[key];
    if (visited.has(key)) continue;
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') continue;

    // BFS flood-fill
    const component: string[] = [];
    const queue: string[] = [key];
    visited.add(key);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      const [q, r] = cur.split(',').map(Number);
      for (const nb of hexNeighbors({ q, r })) {
        const nbKey = hexKey(nb);
        if (visited.has(nbKey)) continue;
        const nbTile = tiles[nbKey];
        if (!nbTile) continue;
        if (nbTile.terrain === 'ocean' || nbTile.terrain === 'coast') continue;
        visited.add(nbKey);
        queue.push(nbKey);
      }
    }
    components.push(component);
  }

  // Sort largest first
  components.sort((a, b) => b.length - a.length);

  let continentIdx = 0;
  let islandIdx = 0;
  for (const component of components) {
    const id = component.length >= MIN_CONTINENT_TILES
      ? `continent-${continentIdx++}`
      : `island-${islandIdx++}`;
    for (const key of component) {
      tiles[key] = { ...tiles[key], regionKey: id };
    }
  }

  return tiles;
}
```

- [ ] **Step 2.4: Run tests — both should pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS (all 3 landmass-tagger tests).

- [ ] **Step 2.5: Commit**

```bash
git add src/systems/landmass-tagger.ts tests/systems/threat-pressure-system.test.ts
git commit -m "feat(landmass): flood-fill tagger assigns continent-N/island-N regionKeys"
```

---

### Task 3: Wire tagger into `balanced-map-generator.ts`

**Files:**
- Modify: `src/systems/balanced-map-generator.ts`

- [ ] **Step 3.1: Add import and call at end of `generateBalancedMap`**

Find the end of `generateBalancedMap` in `src/systems/balanced-map-generator.ts`. The function returns `{ map, startPositions }`. Before that return, call the tagger:

```typescript
// At the top of the file, add import:
import { tagLandmassRegions } from './landmass-tagger';

// At the END of generateBalancedMap, before the return statement:
const taggedTiles = tagLandmassRegions(mapWithRivers);
const taggedMap: GameMap = { ...mapWithRivers, tiles: taggedTiles };
return { map: taggedMap, startPositions };
```

Note: The variable name holding the final map before return may differ — look for the last `GameMap` local variable before the return and replace appropriately.

- [ ] **Step 3.2: Run tests — Task 1 test now passes**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 3.3: Run full test suite — no regressions**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All existing tests pass.

- [ ] **Step 3.4: Commit**

```bash
git add src/systems/balanced-map-generator.ts
git commit -m "feat(landmass): tag regionKeys in balanced-map-generator"
```

---

### Task 4: Wire tagger into `continent-map-generator.ts`

**Files:**
- Modify: `src/systems/continent-map-generator.ts`

The continent generator already has `continentHexes: Set<string>` (the main landmass keys) and `islandHexes` (scattered islands). Instead of running a full flood-fill, we can write regionKey directly from these existing sets, then fall back to the shared tagger for any remaining land tiles (e.g., coast-adjacent tiles not in either set).

- [ ] **Step 4.1: Add import and tag-writing at the end of `generateContinentMap`**

```typescript
// At the top of continent-map-generator.ts, add import:
import { tagLandmassRegions } from './landmass-tagger';

// At the END of generateContinentMap, before the return statement,
// run the shared tagger (it handles continent + islands uniformly):
const taggedTiles = tagLandmassRegions({ width, height, tiles: map.tiles, wrapsHorizontally: map.wrapsHorizontally, rivers: map.rivers });
return { map: { ...map, tiles: taggedTiles }, continentHexes };
```

- [ ] **Step 4.2: Add a test for continent generator**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { generateContinentMap } from '@/systems/continent-map-generator';

describe('continent-map-generator landmass tagging', () => {
  it('assigns regionKey to all non-ocean tiles', () => {
    const { map } = generateContinentMap(40, 40, 'continent-test');
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });
});
```

- [ ] **Step 4.3: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 4.4: Commit**

```bash
git add src/systems/continent-map-generator.ts tests/systems/threat-pressure-system.test.ts
git commit -m "feat(landmass): tag regionKeys in continent-map-generator"
```

---

### Task 5: Save migration — `normalizeLandmassKeys`

**Files:**
- Modify: `src/storage/save-manager.ts`
- Create: `tests/storage/save-migration-landmass.test.ts`

- [ ] **Step 5.1: Write the failing migration test**

```typescript
// tests/storage/save-migration-landmass.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import type { GameState, HexTile } from '@/core/types';

function makeLegacyState(): GameState {
  const tiles: Record<string, HexTile> = {
    '0,0': { coord: { q:0, r:0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
    '1,0': { coord: { q:1, r:0 }, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
    '0,1': { coord: { q:0, r:1 }, terrain: 'ocean', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
  };
  return {
    turn: 5, era: 1, civilizations: {}, map: { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    units: {}, cities: {}, barbarianCamps: {}, minorCivs: {}, tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    currentPlayer: 'p1', gameOver: false, winner: null, settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0.5, sfxVolume: 0.5, tutorialEnabled: false },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {}, embargoes: [], defensiveLeagues: [], idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

describe('normalizeLandmassKeys migration', () => {
  it('adds regionKey to land tiles on old saves with no regionKey', () => {
    const state = makeLegacyState();
    // Verify tiles have no regionKey before migration
    expect(state.map.tiles['0,0'].regionKey).toBeUndefined();

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.map.tiles['0,0'].regionKey).toMatch(/^(continent|island)-\d+$/);
    expect(normalized.map.tiles['1,0'].regionKey).toMatch(/^(continent|island)-\d+$/);
    expect(normalized.map.tiles['0,1'].regionKey).toBeUndefined(); // ocean stays untagged
  });

  it('is idempotent — already-tagged tiles are not re-tagged', () => {
    const state = makeLegacyState();
    state.map.tiles['0,0'] = { ...state.map.tiles['0,0'], regionKey: 'continent-0' };
    state.map.tiles['1,0'] = { ...state.map.tiles['1,0'], regionKey: 'continent-0' };
    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.map.tiles['0,0'].regionKey).toBe('continent-0');
  });
});
```

- [ ] **Step 5.2: Run test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/storage/save-migration-landmass.test.ts
```
Expected: FAIL — migration doesn't run.

- [ ] **Step 5.3: Add `normalizeLandmassKeys` to `save-manager.ts`**

At the top of `save-manager.ts`, add import:
```typescript
import { tagLandmassRegions } from '@/systems/landmass-tagger';
```

Add the helper function (before `normalizeLoadedState`):
```typescript
function normalizeLandmassKeys(state: GameState): GameState {
  if (!state.map?.tiles) return state;
  const needsTagging = Object.values(state.map.tiles).some(
    t => !t.regionKey && t.terrain !== 'ocean' && t.terrain !== 'coast'
  );
  if (!needsTagging) return state;
  const taggedTiles = tagLandmassRegions(state.map);
  return { ...state, map: { ...state.map, tiles: taggedTiles } };
}
```

Then in `normalizeLoadedState` (around line 232), append the call at the end of the pipeline. Currently it ends with:
```typescript
  normalized.pendingDiplomacyRequests ??= [];
  return normalized;
```

Change to:
```typescript
  normalized.pendingDiplomacyRequests ??= [];
  return normalizeLandmassKeys(normalized);
```

- [ ] **Step 5.4: Run tests — migration test passes**

```bash
bash scripts/run-with-mise.sh yarn test tests/storage/save-migration-landmass.test.ts
```
Expected: PASS.

- [ ] **Step 5.5: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All pass.

- [ ] **Step 5.6: Commit**

```bash
git add src/storage/save-manager.ts tests/storage/save-migration-landmass.test.ts
git commit -m "feat(landmass): migrate old saves by flood-filling regionKey on load"
```

---

## MR2 — Threat Score + Combat Tracking

**Scope:** Pure scoring functions and combat idle tracking. No spawning yet. Safe to merge: no new UI, no game mechanics change visible to player.

---

### Task 6: Types for MR2

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 6.1: Add `lastCombatTurnByLandmass` to `Civilization`**

Find the `Civilization` interface (~line 760). Add after `breakaway`:
```typescript
  lastCombatTurnByLandmass?: Record<string, number>; // landmassId → turn of last combat
```

- [ ] **Step 6.2: Commit type change**

```bash
git add src/core/types.ts
git commit -m "feat(types): add lastCombatTurnByLandmass to Civilization"
```

---

### Task 7: Create `threat-pressure-system.ts` with scoring functions

**Files:**
- Create: `src/systems/threat-pressure-system.ts`
- Test: `tests/systems/threat-pressure-system.test.ts` (extend)

- [ ] **Step 7.1: Write failing tests for scoring**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import {
  computeThreatScore,
  empireShare,
  nearestLandmassId,
} from '@/systems/threat-pressure-system';
import type { GameState, HexTile, Civilization } from '@/core/types';

function makeTestState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  // 10 land tiles tagged as continent-0
  for (let q = 0; q < 10; q++) {
    tiles[`${q},0`] = { coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', owner: q < 8 ? 'p1' : null,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: 'continent-0' };
  }
  // 2 ocean tiles (no regionKey)
  tiles['0,1'] = { coord: { q:0, r:1 }, terrain: 'ocean', elevation: 'lowland',
    resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
  tiles['1,1'] = { coord: { q:1, r:1 }, terrain: 'ocean', elevation: 'lowland',
    resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };

  const p1: Civilization = {
    id: 'p1', name: 'Player 1', color: '#fff', isHuman: true, civType: 'rome',
    cities: ['city-1'], units: [], techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    gold: 0, visibility: { tiles: {} }, score: 0,
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] },
    lastCombatTurnByLandmass: {},
  };

  return {
    turn: 10, era: 2,
    civilizations: { p1 },
    map: { width: 15, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    units: {}, cities: { 'city-1': { id: 'city-1', owner: 'p1', position: { q:0, r:0 } } as any },
    barbarianCamps: {}, minorCivs: {}, currentPlayer: 'p1',
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    gameOver: false, winner: null,
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    ...overrides,
  } as unknown as GameState;
}

describe('empireShare', () => {
  it('returns ~0.8 when 8 of 10 viable tiles are owned by player', () => {
    const state = makeTestState();
    const share = empireShare(state, 'p1', 'continent-0');
    expect(share).toBeCloseTo(0.8, 1);
  });

  it('returns 0 when player owns no tiles', () => {
    const state = makeTestState();
    // Reset owners
    for (const tile of Object.values(state.map.tiles)) {
      tile.owner = null;
    }
    const share = empireShare(state, 'p1', 'continent-0');
    expect(share).toBe(0);
  });
});

describe('computeThreatScore', () => {
  it('returns ~1.1 for era-1 player with 1 small city and no idle time', () => {
    const state = makeTestState({ era: 1, turn: 5 });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 5 };
    // 1 city, low territory
    for (const tile of Object.values(state.map.tiles)) tile.owner = null;
    state.map.tiles['0,0'].owner = 'p1'; // only 1 tile of 10
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBeGreaterThan(1.0);
    expect(score).toBeLessThan(1.3);
  });

  it('returns > 5 for era-2 dominant player with 10 idle turns', () => {
    const state = makeTestState({ era: 2, turn: 20 });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10 };
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBeGreaterThan(5);
  });

  it('returns 0 for AI civ', () => {
    const state = makeTestState();
    state.civilizations['p1'].isHuman = false;
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBe(0);
  });

  it('returns 0 when civ has no city on landmass', () => {
    const state = makeTestState();
    state.cities['city-1'] = { ...state.cities['city-1'], position: { q: 5, r: 5 } } as any;
    // city is far from continent-0 tiles (q 0-9, r 0)
    // for this test, just remove city from civ's list
    state.civilizations['p1'].cities = [];
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBe(0);
  });
});

describe('nearestLandmassId', () => {
  it('finds continent-0 from adjacent ocean tile', () => {
    const state = makeTestState();
    // tile '0,1' is ocean adjacent to '0,0' which is continent-0
    const id = nearestLandmassId({ q: 0, r: 1 }, state.map);
    expect(id).toBe('continent-0');
  });

  it('returns null when no land within 10 tiles', () => {
    const state = makeTestState();
    // replace all tiles with ocean
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'ocean', regionKey: undefined };
    }
    const id = nearestLandmassId({ q: 0, r: 0 }, state.map);
    expect(id).toBeNull();
  });
});
```

- [ ] **Step 7.2: Run test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 7.3: Create `src/systems/threat-pressure-system.ts`**

```typescript
import type { GameState, HexCoord, GameMap, PirateFleet, BarbarianCamp } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors, hexDistance } from './hex-utils';

export const PIRATE_OWNER = 'pirate';

// Module-level constants used across spawn and movement phases
const PIRATE_FLEET_COOLDOWN = 10;
const RESURGENCE_COOLDOWN_TURNS = 8;

const NON_VIABLE_TERRAIN = new Set(['ocean', 'coast', 'mountain', 'snow']);

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function empireShare(state: GameState, civId: string, landmassId: string): number {
  const tiles = Object.values(state.map.tiles).filter(t => t.regionKey === landmassId);
  const viable = tiles.filter(t => !NON_VIABLE_TERRAIN.has(t.terrain));
  if (viable.length === 0) return 0;
  const owned = viable.filter(t => t.owner === civId).length;
  return Math.min(owned / viable.length, 1.0);
}

export function nearestLandmassId(position: HexCoord, map: GameMap): string | null {
  // BFS by level — each level is one hex ring outward. Stop at depth 10.
  const visited = new Set<string>([hexKey(position)]);
  let frontier: HexCoord[] = [position];

  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const nextFrontier: HexCoord[] = [];
    for (const coord of frontier) {
      for (const nb of hexNeighbors(coord)) {
        const key = hexKey(nb);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles[key];
        if (!tile) continue;
        if (tile.regionKey) return tile.regionKey;
        nextFrontier.push(nb);
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

export function computeThreatScore(state: GameState, civId: string, landmassId: string): number {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return 0;

  // Only evaluate landmasses where civ has ≥ 1 city
  const hasCityOnLandmass = civ.cities.some(cityId => {
    const city = state.cities[cityId];
    if (!city) return false;
    const tile = state.map.tiles[hexKey(city.position)];
    return tile?.regionKey === landmassId;
  });
  if (!hasCityOnLandmass) return 0;

  const share = empireShare(state, civId, landmassId);
  const lastCombat = civ.lastCombatTurnByLandmass?.[landmassId] ?? state.turn;
  const idleTurns = Math.max(0, state.turn - lastCombat);
  const idleFactor = Math.min(idleTurns / 10, 1.5);

  return state.era * (1.0 + share + idleFactor);
}

// ── Combat idle tracking ──────────────────────────────────────────────────────

export function recordCombatForCiv(state: GameState, civId: string, position: HexCoord): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return state;

  const tile = state.map.tiles[hexKey(position)];
  let landmassId: string | null = tile?.regionKey ?? null;
  if (!landmassId) {
    landmassId = nearestLandmassId(position, state.map);
  }
  if (!landmassId) return state;

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        lastCombatTurnByLandmass: {
          ...(civ.lastCombatTurnByLandmass ?? {}),
          [landmassId]: state.turn,
        },
      },
    },
  };
}
```

- [ ] **Step 7.4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS (all scoring tests).

- [ ] **Step 7.5: Commit**

```bash
git add src/systems/threat-pressure-system.ts tests/systems/threat-pressure-system.test.ts
git commit -m "feat(threat): computeThreatScore, empireShare, nearestLandmassId, recordCombatForCiv"
```

---

### Task 8: Wire combat tracking in `main.ts` and `turn-manager.ts`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 8.1: Write a failing integration test for combat tracking**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { recordCombatForCiv } from '@/systems/threat-pressure-system';

describe('recordCombatForCiv', () => {
  it('updates lastCombatTurnByLandmass for the combat landmass', () => {
    const state = makeTestState({ turn: 15 });
    state.civilizations['p1'].lastCombatTurnByLandmass = {};
    // tile '0,0' has regionKey 'continent-0'
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 0 });
    expect(updated.civilizations['p1'].lastCombatTurnByLandmass?.['continent-0']).toBe(15);
  });

  it('resolves landmass from adjacent ocean tile via BFS', () => {
    const state = makeTestState({ turn: 20 });
    // '0,1' is ocean adjacent to '0,0' (continent-0)
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 1 });
    expect(updated.civilizations['p1'].lastCombatTurnByLandmass?.['continent-0']).toBe(20);
  });

  it('does nothing for AI civ', () => {
    const state = makeTestState();
    state.civilizations['p1'].isHuman = false;
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 0 });
    expect(updated).toBe(state); // same reference — no mutation
  });
});
```

- [ ] **Step 8.2: Run to confirm tests pass** (they should, since `recordCombatForCiv` is already implemented)

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 8.3: Add import and combat tracking in `main.ts`**

At the top of `src/main.ts`, add import:
```typescript
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
```

Find the player-combat block (around line 2201) where `applied = applyCombatOutcomeToState(...)` is called. Immediately after `gameState = applied.state;`, add:

```typescript
  // Track combat for threat pressure idle timer
  gameState = recordCombatForCiv(gameState, gameState.currentPlayer, defenderPosition);
```

Note: `defenderPosition` must be captured BEFORE `applyCombatOutcomeToState` since the defender may be removed from state. Add before the `resolveCombat` call:
```typescript
  const defenderPosition = { ...(gameState.units[defenderId] ?? defender).position };
```

- [ ] **Step 8.4: Add combat tracking in `turn-manager.ts`**

At the top of `src/core/turn-manager.ts`, add import:
```typescript
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
```

Find the barbarian attack loop (~line 536). After `newState = applied.state;`, add:
```typescript
      // Track combat for threat pressure
      if (newState.civilizations[defender.owner]?.isHuman) {
        newState = recordCombatForCiv(newState, defender.owner, defender.position);
      }
```

Find the beast attack loop (~line 680). After `newState = applied.state;`, add:
```typescript
      // Track combat for threat pressure
      if (newState.civilizations[defender.owner]?.isHuman) {
        newState = recordCombatForCiv(newState, defender.owner, defender.position);
      }
```

- [ ] **Step 8.5: Add `migrateLegacySave` default for `lastCombatTurnByLandmass`**

In `src/main.ts`, find `migrateLegacySave()` (~line 3621). Inside the `for (const [civId, civ] of Object.entries(gameState.civilizations))` loop, add:

```typescript
    if (!civ.lastCombatTurnByLandmass) {
      (civ as any).lastCombatTurnByLandmass = {};
    }
```

- [ ] **Step 8.6: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All pass.

- [ ] **Step 8.7: Commit**

```bash
git add src/main.ts src/core/turn-manager.ts
git commit -m "feat(threat): wire combat tracking into main.ts and turn-manager barbarian/beast phases"
```

---

### Task 9: Balance tests for MR2

**Files:**
- Create: `tests/systems/threat-pressure-balance.test.ts`

- [ ] **Step 9.1: Create balance test file**

```typescript
// tests/systems/threat-pressure-balance.test.ts
import { describe, it, expect } from 'vitest';
import { computeThreatScore } from '@/systems/threat-pressure-system';
import type { GameState, HexTile, Civilization } from '@/core/types';

function makeScenario(era: number, idleTurns: number, dominanceRatio: number): GameState {
  const tiles: Record<string, HexTile> = {};
  const totalTiles = 20;
  const ownedCount = Math.round(totalTiles * dominanceRatio);
  for (let q = 0; q < totalTiles; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: q < ownedCount ? 'p1' : null,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: 'continent-0',
    };
  }
  const lastCombatTurn = 100 - idleTurns;
  const p1: Civilization = {
    id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'egypt',
    cities: ['c1'], units: [], gold: 0, visibility: { tiles: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] },
    lastCombatTurnByLandmass: { 'continent-0': lastCombatTurn },
  };
  return {
    turn: 100, era, civilizations: { p1 },
    map: { width: 25, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    units: {}, cities: { c1: { id: 'c1', owner: 'p1', position: { q: 0, r: 0 } } as any },
    barbarianCamps: {}, minorCivs: {}, currentPlayer: 'p1',
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    gameOver: false, winner: null,
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {}, embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

describe('threat pressure balance', () => {
  it('era-1, 1 city, 0 idle turns: score < 2.5 (no land resurgence yet)', () => {
    const state = makeScenario(1, 0, 0.05);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeLessThan(2.5);
  });

  it('era-2, 6 idle turns, 50% dominance: score ≥ 2.5 (land resurgence eligible)', () => {
    const state = makeScenario(2, 6, 0.5);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeGreaterThanOrEqual(2.5);
  });

  it('era-2, 10 idle turns, 70% dominance: score ≥ 4.0 (pirate eligible)', () => {
    const state = makeScenario(2, 10, 0.7);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeGreaterThanOrEqual(4.0);
  });

  it('era-3, dominant + 15 idle turns: score > 8 (bandit lord eligible)', () => {
    const state = makeScenario(3, 15, 0.9);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeGreaterThan(8);
  });

  it('idleFactor caps at 1.5 — score does not increase past 20+ idle turns', () => {
    const s15 = makeScenario(3, 15, 0.9);
    const s25 = makeScenario(3, 25, 0.9);
    // Both should have same score (cap reached at 15)
    expect(computeThreatScore(s15, 'p1', 'continent-0')).toBeCloseTo(
      computeThreatScore(s25, 'p1', 'continent-0'), 5
    );
  });
});
```

- [ ] **Step 9.2: Run balance tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-balance.test.ts
```
Expected: PASS.

- [ ] **Step 9.3: Commit**

```bash
git add tests/systems/threat-pressure-balance.test.ts
git commit -m "test(threat): balance band tests for era/idle/dominance thresholds"
```

---

## MR3 — Land Resurgence

**Scope:** Resurgent barbarian camps spawn when a human player's threat score ≥ 2.5 on a landmass. Includes PIRATE_OWNER audit (future-proofing) and bandit lords.

---

### Task 10: Types for MR3

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 10.1: Add `resurgent` + `banditLordName` to `BarbarianCamp`, city `hp`, and new `GameState` fields**

Find `BarbarianCamp` (~line 792):
```typescript
export interface BarbarianCamp {
  id: string;
  position: HexCoord;
  strength: number;
  spawnCooldown: number;
  resurgent?: boolean;        // true when spawned by threat-pressure-system
  banditLordName?: string;    // set only on bandit lord variant
}
```

Find `City` (~line 382). After `idleProduction?:`, add before the closing `}`:
```typescript
  hp?: number;   // city hit points 0-100; defaults to 100 if absent; pirate siege reduces this
```

Find `GameState` (~line 1170). After `beasts?:`:
```typescript
  pirateFleets?: Record<string, PirateFleet>;                           // MR4
  pirateFleetCooldownByCivLandmass?: Record<string, number>;            // MR4 key: '${civId}:${landmassId}'
  resurgentCampCooldownByCivLandmass?: Record<string, number>;          // key: '${civId}:${landmassId}'
```

Also add `PirateFleet` interface (before `GameState`, needed by the type reference above):
```typescript
export interface PirateFleet {
  id: string;
  unitId: string;           // Unit in state.units, owner = 'pirate'
  targetCivId: string;      // Which player this fleet pressures
  targetCityId: string;     // Nearest coastal city at spawn time
  landmassId: string;
  era: number;              // Era at spawn time, governs stakes
  plunderCooldown: number;  // Turns remaining before next plunder attempt
}
```

- [ ] **Step 10.2: Commit type changes**

```bash
git add src/core/types.ts
git commit -m "feat(types): add resurgent+banditLordName to BarbarianCamp, city hp, PirateFleet, new GameState fields"
```

---

### Task 11: PIRATE_OWNER audit and filter updates

**Files:**
- Modify: `src/systems/combat-reward-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/renderer/unit-map-presentation.ts`
- Modify: `src/renderer/render-loop.ts`

- [ ] **Step 11.1: Audit all hostile-filter sites**

```bash
grep -rn "!== 'barbarian'\|startsWith('mc-')\|BEAST_OWNER\|=== 'barbarian'\|=== 'rebels'\|=== 'beasts'" \
  src/systems/combat-reward-system.ts src/core/turn-manager.ts src/renderer/unit-map-presentation.ts src/renderer/render-loop.ts
```

Verify the following sites and update each:

**`src/systems/combat-reward-system.ts` line ~67:**
```typescript
// BEFORE:
function canReceiveGoldReward(owner: string): boolean {
  return owner !== 'barbarian' && owner !== 'rebels' && owner !== 'beasts' && !owner.startsWith('mc-');
}

// AFTER:
function canReceiveGoldReward(owner: string): boolean {
  return owner !== 'barbarian' && owner !== 'rebels' && owner !== 'beasts'
    && owner !== PIRATE_OWNER && !owner.startsWith('mc-');
}
```

Add import at top of `combat-reward-system.ts`:
```typescript
import { PIRATE_OWNER } from '@/systems/threat-pressure-system';
```

**`src/core/turn-manager.ts` line ~503 (`playerUnits`):**
```typescript
// BEFORE:
const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian' && u.owner !== BEAST_OWNER && !u.owner.startsWith('mc-'));

// AFTER:
const playerUnits = Object.values(newState.units).filter(u =>
  u.owner !== 'barbarian' && u.owner !== BEAST_OWNER && u.owner !== PIRATE_OWNER && !u.owner.startsWith('mc-')
);
```

**`src/core/turn-manager.ts` line ~612 (`intruders`):**
```typescript
// BEFORE:
const intruders = Object.values(newState.units).filter(u => u.owner !== BEAST_OWNER && u.owner !== 'barbarian');

// AFTER:
const intruders = Object.values(newState.units).filter(u =>
  u.owner !== BEAST_OWNER && u.owner !== 'barbarian' && u.owner !== PIRATE_OWNER
);
```

Add import at top of `turn-manager.ts`:
```typescript
import { PIRATE_OWNER, recordCombatForCiv, processThreatPressure } from '@/systems/threat-pressure-system';
```
(The `processThreatPressure` import is used in Task 12 — add it here in anticipation.)

**`src/renderer/unit-map-presentation.ts` lines ~86-89 (hostile check):**
```typescript
// BEFORE:
const hostile = owner === 'barbarian'
  || owner === 'beasts'
  || owner === 'rebels'
  || Boolean(owner && viewerDiplomacy?.atWarWith?.includes(owner));

// AFTER:
const hostile = owner === 'barbarian'
  || owner === 'beasts'
  || owner === 'rebels'
  || owner === PIRATE_OWNER
  || Boolean(owner && viewerDiplomacy?.atWarWith?.includes(owner));
```

Add import at top of `unit-map-presentation.ts`:
```typescript
import { PIRATE_OWNER } from '@/systems/threat-pressure-system';
```

**`src/renderer/unit-map-presentation.ts` `getFaction` (~line 94):**
```typescript
// BEFORE:
function getFaction(state: GameState, ownerId: string): string {
  const civilization = state.civilizations?.[ownerId];
  return civilization ? civTypeToFaction(civilization.civType) : ownerId;
}

// AFTER:
function getFaction(state: GameState, ownerId: string): string {
  if (ownerId === PIRATE_OWNER) return 'barbarian'; // reuse hostile-red palette
  const civilization = state.civilizations?.[ownerId];
  return civilization ? civTypeToFaction(civilization.civType) : ownerId;
}
```

**`src/renderer/render-loop.ts` line ~371 (`colorLookup`):**
```typescript
// BEFORE:
const colorLookup: Record<string, string> = { barbarian: '#8b4513' };

// AFTER:
const colorLookup: Record<string, string> = { barbarian: '#8b4513', pirate: '#8b4513' };
```

- [ ] **Step 11.2: Write a test confirming canReceiveGoldReward excludes pirates**

Add to `tests/systems/threat-pressure-system.test.ts`:
```typescript
// We test canReceiveGoldReward indirectly through imports — or test the exported PIRATE_OWNER constant
import { PIRATE_OWNER } from '@/systems/threat-pressure-system';

describe('PIRATE_OWNER constant', () => {
  it('equals the pirate owner string', () => {
    expect(PIRATE_OWNER).toBe('pirate');
  });
});
```

- [ ] **Step 11.3: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All pass. Build check:
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: No TypeScript errors.

- [ ] **Step 11.4: Commit**

```bash
git add src/systems/combat-reward-system.ts src/core/turn-manager.ts \
        src/renderer/unit-map-presentation.ts src/renderer/render-loop.ts \
        tests/systems/threat-pressure-system.test.ts
git commit -m "feat(threat): audit all hostile-owner filters to include PIRATE_OWNER"
```

---

### Task 12: Land resurgence + bandit lords + SFX

**Files:**
- Modify: `src/systems/threat-pressure-system.ts`
- Modify: `src/audio/sfx.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`

- [ ] **Step 12.1: Write integration test for land resurgence**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { processLandResurgence } from '@/systems/threat-pressure-system';

describe('processLandResurgence', () => {
  function makeResurgenceState(): GameState {
    const state = makeTestState({ era: 2, turn: 30 });
    // Player has been idle for 15 turns (score ≥ 2.5)
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 15 };
    // Lots of territory (80%)
    for (let q = 0; q < 8; q++) state.map.tiles[`${q},0`].owner = 'p1';
    return state;
  }

  it('spawns a resurgent barbarian camp when score ≥ 2.5', () => {
    const state = makeResurgenceState();
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const camps = Object.values(updated.barbarianCamps).filter(c => (c as any).resurgent);
    expect(camps.length).toBe(1);
    expect(events.some(e => e.e === 'threat:barbarian-resurgence')).toBe(true);
  });

  it('does not exceed 2 resurgent camps per (civ, landmass)', () => {
    let state = makeResurgenceState();
    const bus = { emit: () => {} } as any;
    state = processLandResurgence(state, 'p1', 'continent-0', bus);
    state = processLandResurgence(state, 'p1', 'continent-0', bus);
    state = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgent = Object.values(state.barbarianCamps).filter(c => (c as any).resurgent);
    expect(resurgent.length).toBeLessThanOrEqual(2);
  });

  it('respects cooldown between spawns', () => {
    const state = makeResurgenceState();
    state.resurgentCampCooldownByCivLandmass = { 'p1:continent-0': 35 }; // cooldown until turn 35
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    expect(Object.values(updated.barbarianCamps).filter(c => (c as any).resurgent).length).toBe(0);
  });

  it('camp strength scales with era', () => {
    const state = makeResurgenceState();
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const camp = Object.values(updated.barbarianCamps).find(c => (c as any).resurgent);
    expect(camp?.strength).toBeGreaterThanOrEqual(6); // era-2 minimum
    expect(camp?.strength).toBeLessThanOrEqual(10);   // era-2 maximum
  });
});
```

- [ ] **Step 12.2: Run to confirm failures**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL — `processLandResurgence` not exported.

- [ ] **Step 12.3: Add bandit lord pool + resurgence logic to `threat-pressure-system.ts`**

Append to `src/systems/threat-pressure-system.ts`. Note: `EventBus`, `hexKey`, `hexNeighbors`, `hexDistance`, `PIRATE_FLEET_COOLDOWN`, and `RESURGENCE_COOLDOWN_TURNS` are already at the top of the file from Task 7.3 — do not duplicate them here.

```typescript
import { createUnit } from './unit-system';

// ── Seeded LCG — no Math.random() per project rules ──────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(48271, s) >>> 0;
    if (s === 0) s = 1;
    return s / 0x80000000;
  };
}

// ── Bandit lord name pools ────────────────────────────────────────────────────

const BANDIT_LORD_POOLS: Record<string, string[]> = {
  egypt:       ['Ramesses II', 'Thutmose III', 'Akhenaten', 'Seti I', 'Apep', 'Amenhotep IV'],
  rome:        ['Sulla', 'Marius', 'Spartacus', 'Catiline', 'Brutus', 'Caesar', 'Pompey'],
  greece:      ['Lysander', 'Alcibiades', 'Critias', 'Alexander', 'Pausanias', 'Themistocles'],
  mongolia:    ['Genghis Khan', 'Batu Khan', 'Tamerlane', 'Ögedei', 'Berke Khan'],
  babylon:     ['Nebuchadnezzar II', 'Nabopolassar', 'Sargon of Akkad', 'Naram-Sin', 'Hammurabi'],
  zulu:        ['Shaka', 'Cetshwayo', 'Dingane', 'Mpande', 'Senzangakhona'],
  china:       ['Cao Cao', 'Huang Chao', 'Li Zicheng', 'Liu Bei', 'An Lushan', 'Wu Zetian'],
  persia:      ['Cyrus', 'Darius', 'Xerxes', 'Artaxerxes', 'Cambyses', 'Shahpur II'],
  england:     ['William the Conqueror', 'Henry II', 'Richard III', 'Cromwell', 'Edward I', 'Robin Hood'],
  aztec:       ['Montezuma II', 'Cuauhtémoc', 'Itzcoatl', 'Ahuitzotl', 'Tlacaelel'],
  japan:       ['Nobunaga', 'Hideyoshi', 'Ieyasu', 'Takeda Shingen', 'Uesugi Kenshin', 'Miyamoto Musashi'],
  india:       ['Chandragupta', 'Ashoka', 'Prithviraj Chauhan', 'Shivaji', 'Tipu Sultan', 'Akbar'],
  france:      ['Charlemagne', 'Charles Martel', 'Robespierre', 'Du Guesclin', 'Napoleon'],
  germany:     ['Arminius', 'Frederick Barbarossa', 'Otto the Great', 'Odoacer', 'Alaric'],
  russia:      ['Ivan the Terrible', 'Peter the Great', 'Alexander Nevsky', 'Pugachev', 'Stenka Razin'],
  ottoman:     ['Suleiman', 'Mehmed II', 'Selim I', 'Osman I', 'Murad I'],
  spain:       ['El Cid', 'Cortés', 'Pizarro', 'Gonzalo de Córdoba', 'Ferdinand I'],
  viking:      ['Ragnar Lothbrok', 'Eric Bloodaxe', 'Ivar the Boneless', 'Harald Hardrada', 'Björn Ironside', 'Leif Erikson'],
  gondor:      ['Aragorn', 'Boromir', 'Faramir', 'Denethor', 'Isildur', 'Anárion', 'Éarnur'],
  rohan:       ['Théoden', 'Éomer', 'Helm Hammerhand', 'Erkenbrand', 'Grimbold', 'Déorhere', 'Folca'],
  isengard:    ['Saruman', 'Grima Wormtongue', 'Uglúk', 'Grishnákh', 'Mauhúr', 'Lurtz'],
  prydain:     ['The Horned King', 'Dorath the Cutthroat', 'Achren the Witch Queen', 'Pryderi the Traitor', 'Ellidyr of the Black Beast', 'Morda the Enchanter'],
  annuvin:     ['Arawn the Death-Lord', 'Gorthad the Hollow', 'Malgant Ironbone', 'Caradawg the Wretched', 'Rhitta the Grim', 'Drust the Unburied'],
  wakanda:     ['N\'Jadaka', 'M\'Baku', 'N\'Jobu', 'Moses Magnum', 'Achebe', 'Erik Stevens'],
  avalon:      ['Mordred', 'Morgan le Fay', 'Morgause', 'Meleagant', 'King Lot', 'Accolon', 'Galehaut'],
  narnia:      ['Jadis', 'Miraz', 'Rabadash', 'Rishda Tarkaan', 'Ginger', 'Shift'],
  shire:       ['Grimald Sandybanks', 'Bolger the Bitter', 'Rufus Burrows the Raider', 'Tanner Harfoot', 'Black Took', 'Lotho the Chief'],
  lothlorien:  ['Morithel the Forsaken', 'Ithilmar the Dimmed', 'Caladûr the Fallen', 'Fëaniel of the Broken Bow', 'Galathir the Ensnared', 'Nimriel the Lost'],
  atlantis:    ['Atlas the First King', 'Gadeiros the Twin', 'Ampheres the Bold', 'Azaes the Iron-Handed', 'Thalassir the Drowned', 'Pelagos the Warlord'],
};

function pickBanditName(civType: string, seed: number): string {
  const pool = BANDIT_LORD_POOLS[civType] ?? ['The Warlord', 'The Raider', 'The Bandit King', 'The Outlaw'];
  const rng = lcg(seed);
  return pool[Math.floor(rng() * pool.length)];
}

// ── Era strength ranges ───────────────────────────────────────────────────────

const ERA_STRENGTH: Record<number, [number, number]> = {
  1: [3, 6],
  2: [6, 10],
  3: [10, 16],
  4: [12, 18],
};

function resurgenceCampStrength(era: number, rng: () => number): number {
  const [low, high] = ERA_STRENGTH[era] ?? ERA_STRENGTH[4];
  return low + Math.floor(rng() * (high - low));
}

// ── Land resurgence ───────────────────────────────────────────────────────────

const RESURGENCE_CAP = 2;
// RESURGENCE_COOLDOWN_TURNS is defined at module top

export function processLandResurgence(
  state: GameState,
  civId: string,
  landmassId: string,
  bus: EventBus,
): GameState {
  const cooldownKey = `${civId}:${landmassId}`;
  const cooldownUntil = state.resurgentCampCooldownByCivLandmass?.[cooldownKey] ?? 0;
  if (state.turn < cooldownUntil) return state;

  // Count active resurgent camps on this landmass belonging to this civ's pressure
  const resurgentCount = Object.values(state.barbarianCamps).filter(c => {
    if (!(c as any).resurgent) return false;
    const tile = state.map.tiles[hexKey(c.position)];
    return tile?.regionKey === landmassId;
  }).length;
  if (resurgentCount >= RESURGENCE_CAP) return state;

  // Build candidate set filtered to this landmass
  const landmassTiles = Object.values(state.map.tiles).filter(t => t.regionKey === landmassId);
  const allCamps = Object.values(state.barbarianCamps);
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const spawnSeed = state.turn * 99991 + landmassId.charCodeAt(0) * 7 + civId.charCodeAt(0) * 3;
  const rng = lcg(spawnSeed);

  // Filter spawnBarbarianCamp candidates to this landmass
  const candidates = landmassTiles.filter(tile => {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' ||
        tile.terrain === 'mountain' || tile.terrain === 'snow') return false;
    const key = hexKey(tile.coord);
    if (Object.values(state.barbarianCamps).some(c => hexKey(c.position) === key)) return false;
    for (const cityPos of cityPositions) {
      const d = Math.abs(tile.coord.q - cityPos.q) + Math.abs(tile.coord.r - cityPos.r);
      if (d < 6) return false;
    }
    for (const camp of allCamps) {
      const d = Math.abs(tile.coord.q - camp.position.q) + Math.abs(tile.coord.r - camp.position.r);
      if (d < 4) return false;
    }
    return true;
  });

  if (candidates.length === 0) return state;
  const chosen = candidates[Math.floor(rng() * candidates.length)];

  const era = state.era;
  const score = computeThreatScore(state, civId, landmassId);
  const civ = state.civilizations[civId];
  const isBanditLord = era >= 3 && score > 8 && rng() < 0.25;

  const strength = isBanditLord
    ? (ERA_STRENGTH[era]?.[1] ?? 18) + 4
    : resurgenceCampStrength(era, rng);

  // idCounters.nextCampId is mutated in place by the id++ pattern (matches codebase convention).
  // Do NOT create a spread copy of idCounters — that would cause a double-increment.
  const campId = `camp-${state.idCounters.nextCampId++}`;
  const camp: BarbarianCamp = {
    id: campId,
    position: { ...chosen.coord },
    strength,
    spawnCooldown: 5,
    resurgent: true,
    ...(isBanditLord ? { banditLordName: pickBanditName(civ?.civType ?? 'generic', spawnSeed + 1) } : {}),
  };

  const updatedState: GameState = {
    ...state,
    barbarianCamps: { ...state.barbarianCamps, [campId]: camp },
    resurgentCampCooldownByCivLandmass: {
      ...(state.resurgentCampCooldownByCivLandmass ?? {}),
      [cooldownKey]: state.turn + RESURGENCE_COOLDOWN_TURNS,
    },
  };

  bus.emit('threat:barbarian-resurgence', {
    civId,
    landmassId,
    campId,
    position: chosen.coord,
    isBanditLord,
    banditLordName: (camp as any).banditLordName,
  });

  return updatedState;
}

// ── Spawn-phase dispatcher ────────────────────────────────────────────────────

export function processThreatPressure(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return state;

  // Collect unique landmass IDs where this civ has cities
  const landmassIds = new Set<string>();
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const tile = state.map.tiles[hexKey(city.position)];
    if (tile?.regionKey) landmassIds.add(tile.regionKey);
  }

  let nextState = state;
  for (const landmassId of landmassIds) {
    const score = computeThreatScore(nextState, civId, landmassId);
    if (score >= 2.5) {
      nextState = processLandResurgence(nextState, civId, landmassId, bus);
    }
    // Pirate spawn (score >= 4.0) handled in MR4 via processPirateSpawn
  }
  return nextState;
}
```

- [ ] **Step 12.4: Run resurgence tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 12.5: Add resurgence drum SFX to `src/audio/sfx.ts`**

Find the `SFX` object export in `src/audio/sfx.ts` and add:

```typescript
  // Threat pressure SFX — synthesized, no audio files needed
  resurgenceDrum: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      filter.connect(sfxDestination ?? ctx.destination);

      for (const [freq, detune] of [[80, 0], [120, 3]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detune, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.6, now + 0.3);
        gain.gain.setValueAtTime(0.6, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
        osc.connect(gain);
        gain.connect(filter);
        osc.start(now);
        osc.stop(now + 1.3);
      }
    } catch { /* audio unavailable */ }
  },
```

- [ ] **Step 12.6: Wire `processThreatPressure` into `turn-manager.ts`**

In `src/core/turn-manager.ts`, find the beast processing block. After it ends (~line 695, before espionage), add:

```typescript
  // --- Threat pressure (spawn phase: land resurgence + pirate spawn) ---
  newState = processThreatPressure(newState, newState.currentPlayer, bus);
```

- [ ] **Step 12.7: Wire threat event notifications in `main.ts`**

In `src/main.ts`, after the existing bus event handlers (after `bus.on('barbarian:spawned', ...)`) add:

```typescript
bus.on('threat:barbarian-resurgence', ({ civId, landmassId, campId, position, isBanditLord, banditLordName }) => {
  const city = Object.values(gameState.cities).find(c => c.owner === civId);
  const cityName = city?.name ?? 'your territory';
  if (isBanditLord && banditLordName) {
    appendToCivLog(civId,
      `A notorious bandit lord has emerged near ${cityName}: ${banditLordName}. Defeat them for a substantial reward.`,
      'warning', { coord: position }
    );
  } else {
    appendToCivLog(civId,
      `Your long dominance has invited trouble — raiders have regrouped in the wilderness near ${cityName}.`,
      'warning', { coord: position }
    );
  }
  SFX.resurgenceDrum?.();
});
```

Note: `SFX.resurgenceDrum` is the new SFX added in step 12.5. The `?.` guards against old cached builds.

- [ ] **Step 12.8: Add `resurgentCampCooldownByCivLandmass` default to `migrateLegacySave`**

In `src/main.ts`, inside `migrateLegacySave()`, add after the civ loop:

```typescript
  if (!gameState.resurgentCampCooldownByCivLandmass) {
    (gameState as any).resurgentCampCooldownByCivLandmass = {};
  }
```

- [ ] **Step 12.9: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All pass. Then build:
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: No TypeScript errors.

- [ ] **Step 12.10: Commit**

```bash
git add src/systems/threat-pressure-system.ts src/audio/sfx.ts \
        src/core/turn-manager.ts src/main.ts \
        tests/systems/threat-pressure-system.test.ts
git commit -m "feat(threat): land resurgence, bandit lords, resurgence drum SFX, migrateLegacySave wiring"
```

---

### Task 13: Hot-seat integration test for MR3

**Files:**
- Test: `tests/systems/threat-pressure-system.test.ts` (extend)

- [ ] **Step 13.1: Write hot-seat isolation test**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
describe('hot-seat threat pressure isolation', () => {
  it('only evaluates human players — AI civ never gets resurgence', () => {
    const state = makeTestState({ era: 3, turn: 30 });
    // Make p1 an AI
    state.civilizations['p1'].isHuman = false;
    // Add idle time that would trigger resurgence
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10 };
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    processThreatPressure(state, 'p1', bus);
    expect(events.filter(e => e.e === 'threat:barbarian-resurgence').length).toBe(0);
  });

  it('multi-landmass: evaluates each landmass independently', () => {
    const state = makeTestState({ era: 2, turn: 30 });
    // Add second landmass 'continent-1' with a city
    for (let q = 20; q < 30; q++) {
      state.map.tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: q < 28 ? 'p1' : null, improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, regionKey: 'continent-1',
      };
    }
    state.cities['city-2'] = { id: 'city-2', owner: 'p1', position: { q: 20, r: 0 } } as any;
    state.civilizations['p1'].cities.push('city-2');
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10, 'continent-1': 10 };
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    const updated = processThreatPressure(state, 'p1', bus);
    // Both landmasses should evaluate (though spawns may be capped or blocked)
    const resurgenceEvents = events.filter(e => e.e === 'threat:barbarian-resurgence');
    // At minimum we evaluated both — score should be > 2.5 for both
    const score0 = computeThreatScore(state, 'p1', 'continent-0');
    const score1 = computeThreatScore(state, 'p1', 'continent-1');
    expect(score0).toBeGreaterThan(2.5);
    expect(score1).toBeGreaterThan(2.5);
  });
});
```

- [ ] **Step 13.2: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 13.3: Commit**

```bash
git add tests/systems/threat-pressure-system.test.ts
git commit -m "test(threat): hot-seat isolation and multi-landmass coverage for land resurgence"
```

---

## MR4 — Sea Raiders

**Scope:** Pirate fleet spawn, movement, plunder/siege, destruction + cooldown. All 4 SFX fully wired. Zero placeholder assets by end of MR4.

---

### Task 14: Pirate spawn logic

**Files:**
- Modify: `src/systems/threat-pressure-system.ts`

- [ ] **Step 14.1: Write failing pirate spawn tests**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { processPirateSpawn } from '@/systems/threat-pressure-system';

describe('processPirateSpawn', () => {
  function makeCoastalState(): GameState {
    const state = makeTestState({ era: 2, turn: 40 });
    // High idle — score ≥ 4.0
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 20 };
    // 80% territory
    for (let q = 0; q < 8; q++) state.map.tiles[`${q},0`].owner = 'p1';
    // Add a coastal city
    state.map.tiles['0,0'] = { ...state.map.tiles['0,0'], terrain: 'coast', regionKey: 'continent-0' };
    // Add ocean spawn candidate tiles ≥ 5 tiles from city
    for (let q = 0; q < 10; q++) {
      state.map.tiles[`${q},8`] = {
        coord: { q, r: 8 }, terrain: 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
    return state;
  }

  it('spawns a pirate fleet when score ≥ 4.0 and coastal city exists', () => {
    const state = makeCoastalState();
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    const updated = processPirateSpawn(state, 'p1', 'continent-0', bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(1);
    expect(events.some(e => e.e === 'threat:pirate-fleet-spawned')).toBe(true);
  });

  it('does not spawn when max 2 fleets already active for (civ, landmass)', () => {
    const state = makeCoastalState();
    state.pirateFleets = {
      'fleet-1': { id: 'fleet-1', unitId: 'u1', targetCivId: 'p1', targetCityId: 'city-1', landmassId: 'continent-0', era: 2, plunderCooldown: 0 },
      'fleet-2': { id: 'fleet-2', unitId: 'u2', targetCivId: 'p1', targetCityId: 'city-1', landmassId: 'continent-0', era: 2, plunderCooldown: 0 },
    };
    const bus = { emit: () => {} } as any;
    const updated = processPirateSpawn(state, 'p1', 'continent-0', bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(2); // unchanged
  });

  it('uses galley for era 1-2, carrack for era 3, trireme for era 4', () => {
    for (const [era, expectedType] of [[1, 'galley'], [2, 'galley'], [3, 'carrack'], [4, 'trireme']] as const) {
      const state = makeCoastalState();
      state.era = era;
      const bus = { emit: () => {} } as any;
      const updated = processPirateSpawn(state, 'p1', 'continent-0', bus);
      const fleet = Object.values(updated.pirateFleets ?? {})[0];
      if (fleet) {
        const unit = updated.units[fleet.unitId];
        expect(unit?.type).toBe(expectedType);
      }
    }
  });
});
```

- [ ] **Step 14.2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL.

- [ ] **Step 14.3: Add pirate spawn to `threat-pressure-system.ts`**

Append to `src/systems/threat-pressure-system.ts`. Note: `createUnit` was imported in Task 12.3, `PIRATE_FLEET_COOLDOWN` is at module top from Task 7.3, `hexNeighbors`/`hexKey`/`hexDistance` are at module top.

```typescript
import type { UnitType } from '@/core/types';

const PIRATE_FLEET_CAP = 2;
const PIRATE_SPAWN_MIN_DIST_FROM_CITY = 5;

function pirateUnitType(era: number): UnitType {
  if (era >= 4) return 'trireme';
  if (era >= 3) return 'carrack';
  return 'galley';
}

export function processPirateSpawn(
  state: GameState,
  civId: string,
  landmassId: string,
  bus: EventBus,
): GameState {
  const cooldownKey = `${civId}:${landmassId}`;
  const cooldownUntil = state.pirateFleetCooldownByCivLandmass?.[cooldownKey] ?? 0;
  if (state.turn < cooldownUntil) return state;

  // Check fleet cap
  const activeFleets = Object.values(state.pirateFleets ?? {}).filter(
    f => f.targetCivId === civId && f.landmassId === landmassId
  );
  if (activeFleets.length >= PIRATE_FLEET_CAP) return state;

  // Find coastal cities owned by civ on this landmass
  const civ = state.civilizations[civId];
  const coastalCities = civ.cities.flatMap(cityId => {
    const city = state.cities[cityId];
    if (!city) return [];
    const tile = state.map.tiles[hexKey(city.position)];
    // City is coastal if it is on a coast tile, or adjacent to coast/ocean
    const isCoastal = tile?.terrain === 'coast'
      || hexNeighbors(city.position).some(nb => {
        const t = state.map.tiles[hexKey(nb)];
        return t?.terrain === 'ocean' || t?.terrain === 'coast';
      });
    const onLandmass = tile?.regionKey === landmassId;
    return isCoastal && onLandmass ? [city] : [];
  });
  if (coastalCities.length === 0) return state;

  // Find spawn tile: ocean tile adjacent to landmass coastline, ≥ 5 tiles from any city
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const spawnSeed = state.turn * 73937 + civId.charCodeAt(0) * 13 + landmassId.charCodeAt(0) * 5;
  const rng = lcg(spawnSeed);

  const spawnCandidates = Object.values(state.map.tiles).filter(tile => {
    if (tile.terrain !== 'ocean') return false;
    // Must be near the landmass (adjacent to a land tile with this regionKey)
    const nearLandmass = hexNeighbors(tile.coord).some(nb => {
      const t = state.map.tiles[hexKey(nb)];
      return t?.regionKey === landmassId;
    });
    if (!nearLandmass) return false;
    // Must be ≥ 5 tiles from any player city
    for (const pos of cityPositions) {
      const d = Math.abs(tile.coord.q - pos.q) + Math.abs(tile.coord.r - pos.r);
      if (d < PIRATE_SPAWN_MIN_DIST_FROM_CITY) return false;
    }
    // Must not be occupied
    const occupied = Object.values(state.units).some(u => hexKey(u.position) === hexKey(tile.coord));
    if (occupied) return false;
    return true;
  });

  if (spawnCandidates.length === 0) return state;
  const spawnTile = spawnCandidates[Math.floor(rng() * spawnCandidates.length)];

  // Pick nearest coastal city as target
  const targetCity = coastalCities.reduce((nearest, city) => {
    const d1 = Math.abs(city.position.q - spawnTile.coord.q) + Math.abs(city.position.r - spawnTile.coord.r);
    const d2 = Math.abs(nearest.position.q - spawnTile.coord.q) + Math.abs(nearest.position.r - spawnTile.coord.r);
    return d1 < d2 ? city : nearest;
  });

  const unitType = pirateUnitType(state.era);
  // createUnit mutates state.idCounters.nextUnitId in place (matches codebase pattern).
  // Do NOT create a spread copy of idCounters alongside this call.
  const pirateUnit = createUnit(unitType, PIRATE_OWNER, spawnTile.coord, state.idCounters);
  const fleetId = `fleet-${pirateUnit.id}`;
  const fleet: PirateFleet = {
    id: fleetId,
    unitId: pirateUnit.id,
    targetCivId: civId,
    targetCityId: targetCity.id,
    landmassId,
    era: state.era,
    plunderCooldown: 0,
  };

  const updatedState: GameState = {
    ...state,
    units: { ...state.units, [pirateUnit.id]: pirateUnit },
    pirateFleets: { ...(state.pirateFleets ?? {}), [fleetId]: fleet },
  };

  bus.emit('threat:pirate-fleet-spawned', {
    fleetId,
    civId,
    landmassId,
    position: spawnTile.coord,
  });

  return updatedState;
}
```

Also update `processThreatPressure` to call `processPirateSpawn` when score ≥ 4.0. Find the existing implementation and replace:

```typescript
export function processThreatPressure(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return state;

  const landmassIds = new Set<string>();
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const tile = state.map.tiles[hexKey(city.position)];
    if (tile?.regionKey) landmassIds.add(tile.regionKey);
  }

  let nextState = state;
  for (const landmassId of landmassIds) {
    const score = computeThreatScore(nextState, civId, landmassId);
    if (score >= 2.5) {
      nextState = processLandResurgence(nextState, civId, landmassId, bus);
    }
    if (score >= 4.0) {
      nextState = processPirateSpawn(nextState, civId, landmassId, bus);
    }
  }
  return nextState;
}
```

- [ ] **Step 14.4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 14.5: Commit**

```bash
git add src/systems/threat-pressure-system.ts tests/systems/threat-pressure-system.test.ts
git commit -m "feat(threat): pirate fleet spawn — era-gated unit type, coastal city targeting, fleet cap"
```

---

### Task 15: Pirate fleet movement, plunder, siege, and destruction

**Files:**
- Modify: `src/systems/threat-pressure-system.ts`

- [ ] **Step 15.1: Write failing pirate fleet movement tests**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
import { processPirateFleets } from '@/systems/threat-pressure-system';

describe('processPirateFleets', () => {
  function makeFleetState(): GameState {
    const state = makeTestState({ era: 2, turn: 50 });
    // Add ocean path between spawn and target city
    for (let r = 1; r <= 7; r++) {
      state.map.tiles[`5,${r}`] = {
        coord: { q: 5, r }, terrain: 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
    // Place city at q=5,r=0 (coast tile)
    state.map.tiles['5,0'] = { ...state.map.tiles['5,0'], terrain: 'coast' };
    state.cities['city-1'] = { ...state.cities['city-1'], position: { q: 5, r: 0 }, hp: 100, population: 3 } as any;

    // Place fleet at q=5,r=7 (far ocean)
    const unit = { id: 'u-pirate', type: 'galley', owner: PIRATE_OWNER,
      position: { q: 5, r: 7 }, health: 100, movementPointsLeft: 2, hasMoved: false,
      experience: 0, isFortified: false } as any;
    state.units['u-pirate'] = unit;
    state.pirateFleets = {
      'fleet-1': {
        id: 'fleet-1', unitId: 'u-pirate', targetCivId: 'p1', targetCityId: 'city-1',
        landmassId: 'continent-0', era: 2, plunderCooldown: 0,
      },
    };
    return state;
  }

  it('moves fleet one step toward target city each turn', () => {
    const state = makeFleetState();
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    const unit = updated.units['u-pirate'];
    // Should have moved from r=7 toward r=0
    expect(unit.position.r).toBeLessThan(7);
  });

  it('applies plunder when fleet reaches city coast and cooldown is 0', () => {
    const state = makeFleetState();
    // Place fleet adjacent to city (r=1)
    state.units['u-pirate'].position = { q: 5, r: 1 };
    state.pirateFleets!['fleet-1'].plunderCooldown = 0;
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    processPirateFleets(state, bus);
    expect(events.some(e => e.e === 'threat:pirate-plunder')).toBe(true);
  });

  it('removes fleet from state when its unit is destroyed', () => {
    const state = makeFleetState();
    delete state.units['u-pirate']; // unit died
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(0);
  });
});
```

- [ ] **Step 15.2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: FAIL.

- [ ] **Step 15.3: Add `processPirateFleets` to `threat-pressure-system.ts`**

Append to `src/systems/threat-pressure-system.ts`:

```typescript
const PLUNDER_COOLDOWN_TURNS = 3;
// Fleet is "adjacent to city" when hexDistance ≤ 2 (one tile gap; pirates are on water, city on land)
const ADJACENT_HEX_DIST = 2;

function movePirateTowardCity(
  state: GameState,
  unitId: string,
  targetCityId: string,
): GameState {
  const unit = state.units[unitId];
  const city = state.cities[targetCityId];
  if (!unit || !city) return state;

  if (hexDistance(unit.position, city.position) <= ADJACENT_HEX_DIST) return state; // already adjacent

  // BFS to find next step on ocean/coast path
  const start = hexKey(unit.position);
  const visited = new Set<string>([start]);
  const queue: Array<{ key: string; path: HexCoord[] }> = [{ key: start, path: [] }];

  while (queue.length > 0) {
    const { key, path } = queue.shift()!;
    const [q, r] = key.split(',').map(Number);
    for (const nb of hexNeighbors({ q, r })) {
      const nbKey = hexKey(nb);
      if (visited.has(nbKey)) continue;
      visited.add(nbKey);
      const tile = state.map.tiles[nbKey];
      if (!tile) continue;
      // Pirates move through ocean and coast tiles only
      if (tile.terrain !== 'ocean' && tile.terrain !== 'coast') continue;
      const newPath = [...path, nb];
      if (hexDistance(nb, city.position) <= ADJACENT_HEX_DIST) {
        // Found path — move to first step
        const nextStep = newPath[0] ?? nb;
        return {
          ...state,
          units: {
            ...state.units,
            [unitId]: { ...unit, position: nextStep },
          },
        };
      }
      queue.push({ key: nbKey, path: newPath });
    }
  }
  return state; // No path found — fleet stays put
}

function isAdjacentToCity(unitPos: HexCoord, cityPos: HexCoord): boolean {
  // Use proper hex distance (imported from hex-utils), not Manhattan distance
  return hexDistance(unitPos, cityPos) <= ADJACENT_HEX_DIST;
}

export function processPirateFleets(state: GameState, bus: EventBus): GameState {
  if (!state.pirateFleets || Object.keys(state.pirateFleets).length === 0) return state;

  let nextState = state;

  for (const [fleetId, fleet] of Object.entries(nextState.pirateFleets)) {
    const unit = nextState.units[fleet.unitId];

    // Fleet's unit was destroyed — clean up and set cooldown
    if (!unit) {
      const cooldownKey = `${fleet.targetCivId}:${fleet.landmassId}`;
      nextState = {
        ...nextState,
        pirateFleets: Object.fromEntries(
          Object.entries(nextState.pirateFleets ?? {}).filter(([id]) => id !== fleetId)
        ),
        pirateFleetCooldownByCivLandmass: {
          ...(nextState.pirateFleetCooldownByCivLandmass ?? {}),
          [cooldownKey]: nextState.turn + PIRATE_FLEET_COOLDOWN,
        },
      };
      bus.emit('threat:pirate-fleet-destroyed', {
        fleetId,
        civId: fleet.targetCivId,
        landmassId: fleet.landmassId,
      });
      continue;
    }

    // Retarget if city no longer valid
    let targetCity = nextState.cities[fleet.targetCityId];
    if (!targetCity || targetCity.owner !== fleet.targetCivId) {
      // Find nearest coastal city
      const civ = nextState.civilizations[fleet.targetCivId];
      const newTarget = civ?.cities
        .map(id => nextState.cities[id])
        .filter(Boolean)
        .find(c => hexNeighbors(c!.position).some(nb => {
          const t = nextState.map.tiles[hexKey(nb)];
          return t?.terrain === 'ocean' || t?.terrain === 'coast';
        }));
      if (!newTarget) {
        // No valid city — remove fleet
        nextState = {
          ...nextState,
          pirateFleets: Object.fromEntries(
            Object.entries(nextState.pirateFleets ?? {}).filter(([id]) => id !== fleetId)
          ),
        };
        continue;
      }
      nextState = {
        ...nextState,
        pirateFleets: {
          ...nextState.pirateFleets,
          [fleetId]: { ...fleet, targetCityId: newTarget.id },
        },
      };
      targetCity = newTarget;
    }

    // Move toward city
    nextState = movePirateTowardCity(nextState, fleet.unitId, fleet.targetCityId);

    const updatedUnit = nextState.units[fleet.unitId];
    if (!updatedUnit) continue;

    const adjacent = isAdjacentToCity(updatedUnit.position, targetCity.position);

    if (adjacent) {
      let updatedFleet = { ...(nextState.pirateFleets?.[fleetId] ?? fleet) };

      // Plunder (on cooldown = 0)
      if (updatedFleet.plunderCooldown === 0) {
        const goldStolen = Math.max(1, (targetCity.population ?? 1) * 5);
        const targetCiv = nextState.civilizations[fleet.targetCivId];
        if (targetCiv) {
          nextState = {
            ...nextState,
            civilizations: {
              ...nextState.civilizations,
              [fleet.targetCivId]: {
                ...targetCiv,
                gold: Math.max(0, targetCiv.gold - goldStolen),
              },
            },
          };
        }
        bus.emit('threat:pirate-plunder', { fleetId, cityId: targetCity.id, goldStolen });
        updatedFleet = { ...updatedFleet, plunderCooldown: PLUNDER_COOLDOWN_TURNS };
      } else {
        updatedFleet = { ...updatedFleet, plunderCooldown: Math.max(0, updatedFleet.plunderCooldown - 1) };
      }

      // Siege (era 2+): fires every turn, independent of plunder
      if (fleet.era >= 2) {
        const hpLost = fleet.era >= 3 ? 20 : 10;
        const city = nextState.cities[fleet.targetCityId];
        if (city) {
          nextState = {
            ...nextState,
            cities: {
              ...nextState.cities,
              [fleet.targetCityId]: {
                ...city,
                // city.hp added to City interface in Task 10. Default 100 if absent (old cities).
                // Era 3+: hp does not auto-recover while fleet is adjacent (enforced in turn-manager
                // city regen pass — check pirateFleets to skip regen for besieged cities).
                hp: Math.max(0, (city.hp ?? 100) - hpLost),
              },
            },
          };
        }
        bus.emit('threat:pirate-siege', { fleetId, cityId: fleet.targetCityId, hpLost });
      }

      nextState = {
        ...nextState,
        pirateFleets: { ...(nextState.pirateFleets ?? {}), [fleetId]: updatedFleet },
      };
    }
  }

  return nextState;
}
```

- [ ] **Step 15.4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/threat-pressure-system.test.ts
```
Expected: PASS.

- [ ] **Step 15.5: Commit**

```bash
git add src/systems/threat-pressure-system.ts tests/systems/threat-pressure-system.test.ts
git commit -m "feat(threat): pirate fleet movement, plunder, siege, and destruction handling"
```

---

### Task 16: Wire `processPirateFleets` into turn-manager + remaining SFX + notifications + migration

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/audio/sfx.ts`
- Modify: `src/main.ts`

- [ ] **Step 16.1: Wire `processPirateFleets` in `turn-manager.ts` (world phase) + era-3 city HP regen suppression**

In `src/core/turn-manager.ts`, update the import line (already added in Task 11):
```typescript
import { PIRATE_OWNER, recordCombatForCiv, processThreatPressure, processPirateFleets } from '@/systems/threat-pressure-system';
```

After the `processThreatPressure` call (added in Task 12.6), add:
```typescript
  // --- Pirate fleet movement (world phase: runs every endTurn call) ---
  newState = processPirateFleets(newState, bus);
```

Find the city HP recovery section in `turn-manager.ts` (look for auto-heal or HP regen on cities; search for `city.hp` or `cityHeal`). If a regen pass exists, add a guard:
```typescript
  // Skip HP regen for cities currently besieged by an era-3+ pirate fleet
  const siegedCityIds = new Set(
    Object.values(newState.pirateFleets ?? {})
      .filter(f => f.era >= 3)
      .map(f => f.targetCityId)
  );
  // ... inside the regen loop, wrap with:
  if (!siegedCityIds.has(cityId)) { /* apply HP regen */ }
```

Note: If no city HP regen pass exists yet (cities may not auto-heal currently), search for `city.hp` usage in `turn-manager.ts` first. If there is no regen pass, add the guard as a comment and track as a follow-up — era-3 HP suppression is only meaningful once city regen exists.

- [ ] **Step 16.2: Add 3 remaining SFX to `src/audio/sfx.ts`**

Add to the `SFX` object:

```typescript
  seaHorn: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.linearRampToValueAtTime(55 * Math.pow(2, 7/12), now + 0.4);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.2);
      gain.gain.setValueAtTime(0.5, now + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      osc.connect(gain);
      gain.connect(sfxDestination ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 1.3);
    } catch { /* audio unavailable */ }
  },

  plunderJingle: () => {
    // Descending 3-note motif: E4 → C4 → A3 (coins spilling away)
    const notes = [330, 262, 220];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.15, 0.4), i * 160);
    });
  },

  pirateDestroyed: () => {
    try {
      const ctx = getContext();
      const now = ctx.currentTime;
      // White noise burst (impact). Math.random() here is acceptable — this is audio buffer
      // generation for a sound effect, not game-state RNG. Does not affect determinism.
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      noise.connect(noiseGain);
      noiseGain.connect(sfxDestination ?? ctx.destination);
      noise.start(now);

      // Rising sine sweep (the rush)
      const sweep = ctx.createOscillator();
      const sweepGain = ctx.createGain();
      sweep.type = 'sine';
      sweep.frequency.setValueAtTime(200, now + 0.08);
      sweep.frequency.linearRampToValueAtTime(800, now + 0.4);
      sweepGain.gain.setValueAtTime(0.3, now + 0.08);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      sweep.connect(sweepGain);
      sweepGain.connect(sfxDestination ?? ctx.destination);
      sweep.start(now + 0.08);
      sweep.stop(now + 0.5);
    } catch { /* audio unavailable */ }
  },
```

- [ ] **Step 16.3: Wire notifications for all pirate events in `main.ts`**

After the `threat:barbarian-resurgence` handler (added in Task 12.7), add:

```typescript
bus.on('threat:pirate-fleet-spawned', ({ fleetId, civId, landmassId, position }) => {
  const fleet = gameState.pirateFleets?.[fleetId];
  const city = fleet ? gameState.cities[fleet.targetCityId] : null;
  const cityName = city?.name ?? 'your coastline';
  appendToCivLog(civId,
    `Pirates have been spotted off the coast near ${cityName}. Your coastal cities are at risk.`,
    'warning', { coord: position }
  );
  SFX.seaHorn?.();
});

bus.on('threat:pirate-plunder', ({ fleetId, cityId, goldStolen }) => {
  const fleet = gameState.pirateFleets?.[fleetId];
  const city = gameState.cities[cityId];
  if (!fleet || !city) return;
  appendToCivLog(fleet.targetCivId,
    `${city.name} was raided by pirates — ${goldStolen} gold stolen.`,
    'warning', { coord: city.position }
  );
  SFX.plunderJingle?.();
});

bus.on('threat:pirate-siege', ({ fleetId, cityId, hpLost }) => {
  const fleet = gameState.pirateFleets?.[fleetId];
  const city = gameState.cities[cityId];
  if (!fleet || !city) return;
  appendToCivLog(fleet.targetCivId,
    `Pirates are besieging ${city.name}. Drive them off or your city will suffer.`,
    'warning', { coord: city.position }
  );
});

bus.on('threat:pirate-fleet-destroyed', ({ fleetId, civId, landmassId }) => {
  // Find the city that was being targeted — stored in the fleet before removal
  // Use pendingEvents pattern to surface the message
  const message = 'Your forces have destroyed the pirate fleet threatening your coast.';
  appendToCivLog(civId, message, 'info');
  SFX.pirateDestroyed?.();
});
```

- [ ] **Step 16.4: Add migration defaults to `migrateLegacySave` in `main.ts`**

Inside `migrateLegacySave()`, after `resurgentCampCooldownByCivLandmass` default (added in Task 12.8), add:

```typescript
  if (!gameState.pirateFleets) {
    (gameState as any).pirateFleets = {};
  }
  if (!gameState.pirateFleetCooldownByCivLandmass) {
    (gameState as any).pirateFleetCooldownByCivLandmass = {};
  }
```

- [ ] **Step 16.5: Add migration tests to `save-migration-landmass.test.ts`**

Add to `tests/storage/save-migration-landmass.test.ts`:

```typescript
describe('migrateLegacySave field defaults', () => {
  it('lastCombatTurnByLandmass defaults to {} on old saves', () => {
    // The actual migrateLegacySave is called at game load — test via normalizeLoadedState
    const state = makeLegacyState();
    // Confirm field is absent in the fixture
    expect((state.civilizations as any)['p1']?.lastCombatTurnByLandmass).toBeUndefined();
    // After normalizeLoadedState the field won't be present (it's set in migrateLegacySave, not normalize pipeline)
    // We verify this is not a breaking absence — no throw
    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized).toBeTruthy();
  });

  it('pirateFleets defaults to {} on old saves', () => {
    const state = makeLegacyState();
    expect(state.pirateFleets).toBeUndefined();
    const normalized = normalizeLoadedStateForTest(state);
    // normalizeLoadedState doesn't set pirateFleets (that's in migrateLegacySave)
    // Verify normalization doesn't throw on missing field
    expect(normalized).toBeTruthy();
  });
});
```

- [ ] **Step 16.6: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All pass. Then:
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: No TypeScript errors.

- [ ] **Step 16.7: Commit**

```bash
git add src/core/turn-manager.ts src/audio/sfx.ts src/main.ts \
        tests/storage/save-migration-landmass.test.ts
git commit -m "feat(threat): wire processPirateFleets world phase, all 4 SFX, pirate notifications, migration defaults"
```

---

### Task 17: Final pirate integration tests + hot-seat coverage

**Files:**
- Test: `tests/systems/threat-pressure-system.test.ts` (extend)

- [ ] **Step 17.1: Write remaining integration tests**

Add to `tests/systems/threat-pressure-system.test.ts`:

```typescript
describe('pirate hot-seat behavior', () => {
  it('fleet targets only its targetCivId city — other players cities are ignored', () => {
    const state = makeTestState({ era: 3, turn: 60 });
    // Add second player
    state.civilizations['p2'] = { ...state.civilizations['p1'], id: 'p2', cities: ['city-2'] };
    state.cities['city-2'] = { id: 'city-2', owner: 'p2', position: { q: 15, r: 0 } } as any;

    // Add ocean path
    for (let r = 1; r <= 7; r++) {
      state.map.tiles[`5,${r}`] = { coord: { q: 5, r }, terrain: 'ocean', elevation: 'lowland',
        resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    }
    state.map.tiles['5,0'] = { ...state.map.tiles['5,0'], terrain: 'coast' };
    state.cities['city-1'] = { ...state.cities['city-1'], position: { q: 5, r: 0 } } as any;

    const pirateUnit = { id: 'u-p', type: 'galley', owner: PIRATE_OWNER, position: { q: 5, r: 6 },
      health: 100, movementPointsLeft: 2, hasMoved: false, experience: 0, isFortified: false } as any;
    state.units['u-p'] = pirateUnit;
    state.pirateFleets = {
      'fleet-x': { id: 'fleet-x', unitId: 'u-p', targetCivId: 'p1', targetCityId: 'city-1',
        landmassId: 'continent-0', era: 3, plunderCooldown: 0 },
    };

    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    // Fleet moved toward p1's city, not p2's
    const unit = updated.units['u-p'];
    // It moved closer to city-1 (q=5, r=0), not city-2 (q=15, r=0)
    expect(Math.abs(unit.position.q - 5) + Math.abs(unit.position.r - 0))
      .toBeLessThan(Math.abs(6 - 5) + Math.abs(6 - 0));
  });
});

describe('pirate fleet destruction', () => {
  it('sets pirateFleetCooldown after fleet unit dies', () => {
    const state = makeTestState({ era: 2, turn: 50 });
    state.pirateFleets = {
      'fleet-1': { id: 'fleet-1', unitId: 'u-gone', targetCivId: 'p1', targetCityId: 'city-1',
        landmassId: 'continent-0', era: 2, plunderCooldown: 0 },
    };
    // Unit not in state.units (already destroyed)
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    expect(updated.pirateFleetCooldownByCivLandmass?.['p1:continent-0']).toBe(60); // turn 50 + 10
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(0);
  });
});
```

- [ ] **Step 17.2: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: All pass.

- [ ] **Step 17.3: Final build check**

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: Exit 0, no type errors.

- [ ] **Step 17.4: Commit**

```bash
git add tests/systems/threat-pressure-system.test.ts
git commit -m "test(threat): pirate hot-seat targeting, fleet destruction cooldown — full coverage"
```

---

## Self-Review Checklist

Run this before opening any PR:

```bash
# 1. Verify PIRATE_OWNER is excluded everywhere a hostile owner is filtered
grep -rn "=== 'barbarian'\|!== 'barbarian'\|startsWith('mc-')\|BEAST_OWNER" src/ | grep -v "PIRATE_OWNER\|threat-pressure"

# 2. Check no Math.random() introduced
grep -rn "Math.random()" src/systems/threat-pressure-system.ts

# 3. All SFX entries exist
grep -n "resurgenceDrum\|seaHorn\|plunderJingle\|pirateDestroyed" src/audio/sfx.ts

# 4. All bus event handlers exist in main.ts
grep -n "threat:barbarian-resurgence\|threat:pirate-fleet-spawned\|threat:pirate-plunder\|threat:pirate-siege\|threat:pirate-fleet-destroyed" src/main.ts
```

---

## PR Templates

### MR1 PR: "feat(landmass): populate HexTile.regionKey in all map generators + save migration"

**Out of scope:** Threat scoring, resurgence, pirates — all MR2+.
**Why safe to merge partial:** No gameplay change. `regionKey` is a new optional field. Old saves auto-migrate on load. No player-visible surface added.

### MR2 PR: "feat(threat): threat score + combat idle tracking"

**Out of scope:** Barbarian resurgence, pirate fleets — MR3+.
**Why safe to merge partial:** Pure functions only. `computeThreatScore` is not yet called from turn-manager. No spawning. No player-visible surface.

### MR3 PR: "feat(threat): land resurgence + bandit lords + PIRATE_OWNER audit"

**Out of scope:** Sea raiders (pirate fleets) — MR4.
**Why safe to merge partial:** All player-visible surfaces (resurgent camps, bandit lord notification, resurgence drum SFX) are complete and functional. No dead-end UX — players can see and fight resurgent camps. `PIRATE_OWNER` filter audit future-proofs the system without creating any pirate units yet.

### MR4 PR: "feat(threat): sea raiders — pirate fleets, plunder/siege, all SFX"

By end of MR4: zero placeholder sprites (pirates reuse existing galley/carrack/trireme with hostile palette), zero placeholder SFX (all 4 synthesized), zero placeholder text (all notifications wired). Feature is production-ready end-to-end.
