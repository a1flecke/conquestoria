# MR 1a: City Territory Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared data, migration, maturity, coordinate, city-spacing, and work-claim foundation that later city-grid MRs build on.

**Architecture:** Keep city founding and city work ownership in pure system helpers, then have player and AI callers consume those helpers. Save migration normalizes old city records into the new serializable shape and never trusts cached derived data. This MR does not change yield calculation or the city panel beyond compile-safe type updates.

**Tech Stack:** TypeScript, Vitest, Vite, existing plain-object `GameState`, axial hex coordinates, `hex-utils` wrapping helpers. Target implementing model: GPT-5.4 Medium.

---

## Source Contract

Spec: `docs/superpowers/specs/2026-04-24-city-grid-city-sim-design.md`

Rules to read before editing source:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/strategy-game-mechanics.md`

## Files

- Modify: `src/core/types.ts`
- Create: `src/systems/city-maturity-system.ts`
- Create: `src/systems/city-territory-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/systems/city-maturity-system.test.ts`
- Test: `tests/systems/city-territory-system.test.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/storage/save-persistence.test.ts`
- Test: `tests/ai/basic-ai.test.ts`

## Task 1: Add City Types And Maturity Definitions

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/city-maturity-system.ts`
- Test: `tests/systems/city-maturity-system.test.ts`

- [ ] **Step 1: Write failing maturity tests**

Add `tests/systems/city-maturity-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CITY_MATURITY_DEFINITIONS,
  countCityMaturityTechs,
  resolveCityMaturity,
} from '@/systems/city-maturity-system';

describe('city maturity definitions', () => {
  it('matches the five tech eras and uses odd grid sizes only', () => {
    expect(CITY_MATURITY_DEFINITIONS.map(def => def.id)).toEqual([
      'outpost',
      'village',
      'town',
      'city',
      'metropolis',
    ]);
    expect(CITY_MATURITY_DEFINITIONS.map(def => def.era)).toEqual([1, 2, 3, 4, 5]);
    expect(CITY_MATURITY_DEFINITIONS.map(def => def.gridSize)).toEqual([3, 3, 5, 5, 7]);
  });

  it('requires population and qualifying maturity techs', () => {
    expect(resolveCityMaturity(5, ['early-empire'])).toBe('village');
    expect(resolveCityMaturity(2, ['early-empire', 'engineering'])).toBe('outpost');
    expect(resolveCityMaturity(5, ['early-empire', 'engineering'])).toBe('town');
  });

  it('does not allow early-era tech volume to unlock late maturity', () => {
    const earlyTechs = ['early-empire', 'state-workforce', 'crop-rotation', 'granary-design'];
    expect(countCityMaturityTechs(earlyTechs)).toBeGreaterThanOrEqual(4);
    expect(resolveCityMaturity(12, earlyTechs)).toBe('village');
  });

  it('allows explicit era-five city maturity metadata to unlock metropolis', () => {
    expect(resolveCityMaturity(12, ['early-empire', 'engineering', 'medicine', 'global-logistics'])).toBe('metropolis');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-maturity-system.test.ts
```

Expected: FAIL because `city-maturity-system.ts` does not exist.

- [ ] **Step 3: Add shared types**

In `src/core/types.ts`, add these exported types near the city interfaces and update the existing `City` interface:

```ts
export type CityFocus = 'balanced' | 'food' | 'production' | 'gold' | 'science' | 'custom';
export type CityMaturity = 'outpost' | 'village' | 'town' | 'city' | 'metropolis';

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
  ownedTiles: HexCoord[];    // city territory/control, not active citizen assignment
  workedTiles: HexCoord[];
  focus: CityFocus;
  maturity: CityMaturity;
  lastFocusReminderTurn?: number;
  grid: (string | null)[][];
  gridSize: 3 | 5 | 7;
  unrestLevel: 0 | 1 | 2;
  unrestTurns: number;
  conquestTurn?: number;
  spyUnrestBonus: number;
  productionDisabledTurns?: number;
}
```

Also add optional tech metadata:

```ts
export interface Tech {
  id: string;
  name: string;
  track: TechTrack;
  cost: number;
  prerequisites: string[];
  unlocks: string[];
  era: number;
  countsForEraAdvancement?: boolean;
  countsForCityMaturity?: boolean;
  pacing?: PacingMetadata;
}
```

- [ ] **Step 4: Implement maturity definitions and resolver**

Create `src/systems/city-maturity-system.ts`:

```ts
import type { CityMaturity } from '@/core/types';
import { TECH_TREE } from './tech-system';

export interface CityMaturityDefinition {
  id: CityMaturity;
  era: number;
  populationRequired: number;
  maturityTechsRequired: number;
  requiresQualifyingTechAtEra: boolean;
  gridSize: 3 | 5 | 7;
  districtPages: string[];
}

export const CITY_MATURITY_DEFINITIONS: CityMaturityDefinition[] = [
  { id: 'outpost', era: 1, populationRequired: 1, maturityTechsRequired: 0, requiresQualifyingTechAtEra: false, gridSize: 3, districtPages: ['overview', 'buildings'] },
  { id: 'village', era: 2, populationRequired: 3, maturityTechsRequired: 1, requiresQualifyingTechAtEra: true, gridSize: 3, districtPages: ['overview', 'buildings', 'worked-land-water'] },
  { id: 'town', era: 3, populationRequired: 5, maturityTechsRequired: 2, requiresQualifyingTechAtEra: true, gridSize: 5, districtPages: ['overview', 'buildings', 'worked-land-water'] },
  { id: 'city', era: 4, populationRequired: 8, maturityTechsRequired: 3, requiresQualifyingTechAtEra: true, gridSize: 5, districtPages: ['overview', 'buildings', 'worked-land-water', 'advanced-districts'] },
  { id: 'metropolis', era: 5, populationRequired: 12, maturityTechsRequired: 4, requiresQualifyingTechAtEra: true, gridSize: 7, districtPages: ['overview', 'buildings', 'worked-land-water', 'advanced-districts'] },
];

export const INITIAL_CITY_MATURITY: CityMaturity = 'outpost';

export const INITIAL_CITY_FOCUS = 'balanced' as const;

export const INITIAL_CITY_MATURITY_TECH_IDS = new Set([
  'early-empire',
  'state-workforce',
  'civil-service',
  'foundations',
  'masonry',
  'aqueducts',
  'arches',
  'city-planning',
  'granary-design',
  'crop-rotation',
  'fertilization',
  'sanitation',
  'medicine',
  'surgery',
  'engineering',
  'currency',
  'global-logistics',
  'mass-media',
]);

export function isCityMaturityTech(techId: string): boolean {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  return Boolean(tech?.countsForCityMaturity || INITIAL_CITY_MATURITY_TECH_IDS.has(techId));
}

export function countCityMaturityTechs(completedTechs: string[]): number {
  return completedTechs.filter(isCityMaturityTech).length;
}

function hasMaturityTechAtEra(completedTechs: string[], era: number): boolean {
  return completedTechs.some(techId => {
    const tech = TECH_TREE.find(candidate => candidate.id === techId);
    return tech?.era === era && isCityMaturityTech(techId);
  });
}

export function getCityMaturityDefinition(id: CityMaturity): CityMaturityDefinition {
  return CITY_MATURITY_DEFINITIONS.find(def => def.id === id) ?? CITY_MATURITY_DEFINITIONS[0];
}

export function resolveCityMaturity(population: number, completedTechs: string[]): CityMaturity {
  const qualifyingCount = countCityMaturityTechs(completedTechs);
  let result: CityMaturity = 'outpost';
  for (const definition of CITY_MATURITY_DEFINITIONS) {
    const hasPopulation = population >= definition.populationRequired;
    const hasTechCount = qualifyingCount >= definition.maturityTechsRequired;
    const hasEraTech = !definition.requiresQualifyingTechAtEra || hasMaturityTechAtEra(completedTechs, definition.era);
    if (hasPopulation && hasTechCount && hasEraTech) {
      result = definition.id;
    }
  }
  return result;
}
```

Also update the existing `global-logistics` and `mass-media` object literals in `src/systems/tech-definitions.ts` so both include:

```ts
countsForEraAdvancement: false,
countsForCityMaturity: true,
```

- [ ] **Step 5: Run maturity tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-maturity-system.test.ts
```

Expected: PASS.

## Task 2: Add Territory, Founding, And Claim Helpers

**Files:**
- Create: `src/systems/city-territory-system.ts`
- Test: `tests/systems/city-territory-system.test.ts`

- [ ] **Step 1: Write failing territory tests**

Add `tests/systems/city-territory-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { City, GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  buildCityWorkClaimIndex,
  canonicalizeCityCoord,
  getCityFoundingBlockers,
  MIN_CITY_CENTER_DISTANCE,
  normalizeCityWorkClaims,
} from '@/systems/city-territory-system';

function addCity(state: GameState, owner: string, q: number, r: number): City {
  const city = foundCity(owner, { q, r }, state.map);
  state.cities[city.id] = city;
  state.civilizations[owner]?.cities.push(city.id);
  return city;
}

describe('city founding territory rules', () => {
  it('uses a four-hex minimum city-center distance', () => {
    expect(MIN_CITY_CENTER_DISTANCE).toBe(4);
  });

  it('blocks founding within three hexes of an owned city', () => {
    const state = createNewGame(undefined, 'city-spacing-owned');
    addCity(state, 'player', 10, 10);
    const blockers = getCityFoundingBlockers(state, { q: 13, r: 10 });
    expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', distance: 3 }));
  });

  it('blocks founding within three hexes of a foreign city', () => {
    const state = createNewGame(undefined, 'city-spacing-foreign');
    addCity(state, 'ai-1', 10, 10);
    const blockers = getCityFoundingBlockers(state, { q: 13, r: 10 });
    expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', distance: 3 }));
  });

  it('allows founding at distance four', () => {
    const state = createNewGame(undefined, 'city-spacing-four');
    addCity(state, 'player', 10, 10);
    const blockers = getCityFoundingBlockers(state, { q: 14, r: 10 });
    expect(blockers.find(blocker => blocker.reason === 'too-close')).toBeUndefined();
  });

  it('uses wrapped distance across the map edge', () => {
    const state = createNewGame(undefined, 'city-spacing-wrap');
    addCity(state, 'player', 0, 5);
    const blockers = getCityFoundingBlockers(state, { q: state.map.width - 2, r: 5 });
    expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', distance: 2 }));
  });
});

describe('work claim indexing', () => {
  it('stores wrapped coordinates canonically', () => {
    const state = createNewGame(undefined, 'city-canonical-coord');
    expect(canonicalizeCityCoord({ q: -1, r: 2 }, state.map)).toEqual({ q: state.map.width - 1, r: 2 });
  });

  it('indexes at most one active city claim per tile', () => {
    const state = createNewGame(undefined, 'city-claim-index');
    const first = addCity(state, 'player', 10, 10);
    const second = addCity(state, 'player', 15, 10);
    const shared = { q: 11, r: 10 };
    state.map.tiles['11,10'].owner = 'player';
    first.workedTiles = [shared];
    second.workedTiles = [shared];

    const normalized = normalizeCityWorkClaims(state);
    const index = buildCityWorkClaimIndex(normalized.state);
    expect(Object.values(index).filter(claim => claim.coord.q === 11 && claim.coord.r === 10)).toHaveLength(1);
    expect(normalized.changedCityIds.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts
```

Expected: FAIL because `city-territory-system.ts` does not exist.

- [ ] **Step 3: Implement territory helpers**

Create `src/systems/city-territory-system.ts`:

```ts
import type { City, GameMap, GameState, HexCoord } from '@/core/types';
import { hexDistance, hexKey, wrapHexCoord, wrappedHexDistance } from './hex-utils';

export const MIN_CITY_CENTER_DISTANCE = 4;

export interface CityFoundingBlocker {
  reason: 'too-close' | 'invalid-terrain' | 'occupied' | 'unreachable';
  cityId?: string;
  cityName?: string;
  distance?: number;
}

export interface TileWorkClaim {
  cityId: string;
  civId: string;
  coord: HexCoord;
}

export type CityWorkClaimIndex = Record<string, TileWorkClaim>;

export interface CityWorkClaimNormalizationResult {
  state: GameState;
  changedCityIds: string[];
}

export function canonicalizeCityCoord(coord: HexCoord, map: GameMap): HexCoord {
  return map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : { ...coord };
}

export function cityDistance(a: HexCoord, b: HexCoord, map: GameMap): number {
  return map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);
}

function isValidCityCenterTerrain(state: GameState, position: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(canonicalizeCityCoord(position, state.map))];
  return Boolean(tile && tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain');
}

export function getCityFoundingBlockers(state: GameState, position: HexCoord): CityFoundingBlocker[] {
  const canonical = canonicalizeCityCoord(position, state.map);
  const blockers: CityFoundingBlocker[] = [];

  if (!isValidCityCenterTerrain(state, canonical)) {
    blockers.push({ reason: 'invalid-terrain' });
  }

  const occupied = Object.values(state.units).some(unit =>
    unit.position.q === canonical.q && unit.position.r === canonical.r,
  );
  if (occupied) {
    blockers.push({ reason: 'occupied' });
  }

  for (const city of Object.values(state.cities)) {
    const distance = cityDistance(canonical, city.position, state.map);
    if (distance < MIN_CITY_CENTER_DISTANCE) {
      blockers.push({
        reason: 'too-close',
        cityId: city.id,
        cityName: city.name,
        distance,
      });
    }
  }

  return blockers;
}

export function canFoundCityAt(state: GameState, position: HexCoord): boolean {
  return getCityFoundingBlockers(state, position).length === 0;
}

export function buildCityWorkClaimIndex(state: GameState): CityWorkClaimIndex {
  const index: CityWorkClaimIndex = {};
  for (const city of Object.values(state.cities)) {
    for (const coord of city.workedTiles ?? []) {
      const canonical = canonicalizeCityCoord(coord, state.map);
      const key = hexKey(canonical);
      if (!index[key]) {
        index[key] = { cityId: city.id, civId: city.owner, coord: canonical };
      }
    }
  }
  return index;
}

function compareClaimCities(tileOwner: string | null, tileCoord: HexCoord, map: GameMap, left: City, right: City): number {
  const leftControlsTile = left.owner === tileOwner ? 0 : 1;
  const rightControlsTile = right.owner === tileOwner ? 0 : 1;
  if (leftControlsTile !== rightControlsTile) return leftControlsTile - rightControlsTile;

  const leftDistance = cityDistance(left.position, tileCoord, map);
  const rightDistance = cityDistance(right.position, tileCoord, map);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;

  return left.id.localeCompare(right.id);
}

export function normalizeCityWorkClaims(state: GameState): CityWorkClaimNormalizationResult {
  const claimsByTile = new Map<string, City[]>();
  const changedCityIds = new Set<string>();

  for (const city of Object.values(state.cities)) {
    for (const coord of city.workedTiles ?? []) {
      const canonical = canonicalizeCityCoord(coord, state.map);
      const key = hexKey(canonical);
      const current = claimsByTile.get(key) ?? [];
      current.push(city);
      claimsByTile.set(key, current);
    }
  }

  const allowedByCity = new Map<string, Set<string>>();
  for (const [key, claimCities] of claimsByTile.entries()) {
    const coord = claimCities[0].workedTiles.find(candidate => hexKey(canonicalizeCityCoord(candidate, state.map)) === key);
    const canonical = coord ? canonicalizeCityCoord(coord, state.map) : claimCities[0].position;
    const tileOwner = state.map.tiles[key]?.owner ?? null;
    const eligible = claimCities.filter(city => city.owner === tileOwner);
    const sorted = (eligible.length > 0 ? eligible : claimCities)
      .slice()
      .sort((left, right) => compareClaimCities(tileOwner, canonical, state.map, left, right));
    const winner = sorted[0];
    if (!winner) continue;
    const allowed = allowedByCity.get(winner.id) ?? new Set<string>();
    allowed.add(key);
    allowedByCity.set(winner.id, allowed);
    for (const loser of claimCities) {
      if (loser.id !== winner.id || !eligible.includes(loser)) {
        changedCityIds.add(loser.id);
      }
    }
  }

  const cities = { ...state.cities };
  for (const city of Object.values(state.cities)) {
    const allowed = allowedByCity.get(city.id) ?? new Set<string>();
    const normalized = (city.workedTiles ?? [])
      .map(coord => canonicalizeCityCoord(coord, state.map))
      .filter(coord => allowed.has(hexKey(coord)));
    if (JSON.stringify(normalized) !== JSON.stringify(city.workedTiles ?? [])) {
      cities[city.id] = { ...city, workedTiles: normalized };
      changedCityIds.add(city.id);
    }
  }

  return { state: { ...state, cities }, changedCityIds: Array.from(changedCityIds) };
}
```

- [ ] **Step 4: Run territory tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts
```

Expected: PASS.

## Task 3: Initialize And Migrate City Fields

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/storage/save-manager.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Write failing initialization and migration tests**

In `tests/systems/city-system.test.ts`, add:

```ts
it('foundCity initializes city-sim fields and a 7x7-compatible grid', () => {
  const city = foundCity('player', { q: 15, r: 15 }, map);
  expect(city.focus).toBe('balanced');
  expect(city.maturity).toBe('outpost');
  expect(city.workedTiles).toEqual([]);
  expect(city.gridSize).toBe(3);
  expect(city.grid).toHaveLength(7);
  expect(city.grid[3][3]).toBe('city-center');
});
```

In `tests/storage/save-persistence.test.ts`, add:

```ts
it('normalizes older city-grid saves into city-sim fields on load', async () => {
  const state = createNewGame('rome', 'legacy-city-grid-seed');
  const city = Object.values(state.cities)[0];
  const legacyCity = city as unknown as {
    workedTiles?: unknown;
    focus?: unknown;
    maturity?: unknown;
    grid: (string | null)[][];
    gridSize: number;
  };
  delete legacyCity.workedTiles;
  delete legacyCity.focus;
  delete legacyCity.maturity;
  legacyCity.grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null));
  legacyCity.grid[2][2] = 'city-center';
  legacyCity.gridSize = 5;

  await saveGame('slot-legacy-city-grid', 'Legacy City Grid', state);
  const loaded = await loadGame('slot-legacy-city-grid');

  const loadedCity = Object.values(loaded!.cities)[0];
  expect(loadedCity.workedTiles).toEqual([]);
  expect(loadedCity.focus).toBe('balanced');
  expect(loadedCity.maturity).toBe('outpost');
  expect(loadedCity.grid).toHaveLength(7);
  expect(loadedCity.grid[3][3]).toBe('city-center');
  expect([3, 5, 7]).toContain(loadedCity.gridSize);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: FAIL because new fields and 7x7 migration are absent.

- [ ] **Step 3: Update `foundCity` and grid creation**

In `src/systems/city-system.ts`, import maturity defaults:

```ts
import { INITIAL_CITY_FOCUS, INITIAL_CITY_MATURITY } from './city-maturity-system';
```

Add:

```ts
export function createEmptyCityGrid(): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => null),
  );
  grid[3][3] = 'city-center';
  return grid;
}
```

Update `foundCity` to set the new fields:

```ts
const grid = createEmptyCityGrid();

return {
  id: `city-${nextCityId++}`,
  name,
  owner,
  position: { ...position },
  population: 1,
  food: 0,
  foodNeeded: 15,
  buildings: [],
  productionQueue: [],
  productionProgress: 0,
  ownedTiles,
  workedTiles: [],
  focus: INITIAL_CITY_FOCUS,
  maturity: INITIAL_CITY_MATURITY,
  grid,
  gridSize: 3,
  unrestLevel: 0,
  unrestTurns: 0,
  spyUnrestBonus: 0,
};
```

- [ ] **Step 4: Add save migration**

In `src/storage/save-manager.ts`, import helpers:

```ts
import type { City, CityFocus, CityMaturity } from '@/core/types';
import { createEmptyCityGrid } from '@/systems/city-system';
import { INITIAL_CITY_FOCUS, INITIAL_CITY_MATURITY } from '@/systems/city-maturity-system';
import { canonicalizeCityCoord, normalizeCityWorkClaims } from '@/systems/city-territory-system';
```

Add a normalizer before `normalizeLoadedState`:

```ts
function normalizeCityGrid(grid: (string | null)[][] | undefined): (string | null)[][] {
  const normalized = createEmptyCityGrid();
  if (!grid) return normalized;
  const center = Math.floor(grid.length / 2);
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
      const targetRow = 3 + row - center;
      const targetCol = 3 + col - center;
      if (targetRow >= 0 && targetRow < 7 && targetCol >= 0 && targetCol < 7) {
        normalized[targetRow][targetCol] = grid[row][col];
      }
    }
  }
  normalized[3][3] = 'city-center';
  return normalized;
}

function normalizeLegacyCitySimState(state: GameState): GameState {
  const cities: Record<string, City> = {};
  for (const [cityId, city] of Object.entries(state.cities ?? {})) {
    const rawGridSize = Number(city.gridSize);
    const gridSize: 3 | 5 | 7 = rawGridSize >= 7 ? 7 : rawGridSize >= 5 ? 5 : 3;
    cities[cityId] = {
      ...city,
      ownedTiles: (city.ownedTiles ?? []).map(coord => canonicalizeCityCoord(coord, state.map)),
      workedTiles: (city.workedTiles ?? []).map(coord => canonicalizeCityCoord(coord, state.map)),
      focus: (city.focus ?? INITIAL_CITY_FOCUS) as CityFocus,
      maturity: (city.maturity ?? INITIAL_CITY_MATURITY) as CityMaturity,
      grid: normalizeCityGrid(city.grid),
      gridSize,
    };
  }
  return normalizeCityWorkClaims({ ...state, cities }).state;
}
```

Update `normalizeLoadedState`:

```ts
function normalizeLoadedState(state: GameState): GameState {
  return normalizeLegacyCitySimState(migrateLegacyPlanningState(migrateLegacyNamingState(ensureGameIdentity(state))));
}
```

- [ ] **Step 5: Run initialization and save tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

## Task 4: Wire Player And AI Founding Validation

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/basic-ai.test.ts`
- Test: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add player and AI regression tests**

In `tests/ai/basic-ai.test.ts`, add a test near settler behavior:

```ts
it('does not found an AI city inside the shared city spacing boundary', () => {
  const state = createNewGame(undefined, 'ai-city-spacing');
  const bus = new EventBus();
  const playerCity = foundCity('player', { q: 10, r: 10 }, state.map);
  state.cities[playerCity.id] = playerCity;
  state.civilizations.player.cities = [playerCity.id];
  state.civilizations['ai-1'].cities = [];

  const settlerId = 'unit-ai-settler-spacing';
  state.units = {
    [settlerId]: {
      id: settlerId,
      type: 'settler',
      owner: 'ai-1',
      position: { q: 12, r: 10 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    },
  };
  state.civilizations['ai-1'].units = [settlerId];
  state.map.tiles['12,10'] = {
    ...state.map.tiles['12,10'],
    terrain: 'grassland',
    owner: null,
  };

  const result = processAITurn(state, 'ai-1', bus);

  const foundedCities = Object.values(result.cities).filter(city => city.owner === 'ai-1');
  expect(foundedCities).toHaveLength(0);
  expect(result.units[settlerId]).toBeDefined();
});
```

Also add imports at the top of the file:

```ts
import { foundCity } from '@/systems/city-system';
```

The player-facing founding rejection is covered in MR 1c because current `foundCityAction` is inside `src/main.ts` and needs DOM notification assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts
```

Expected: FAIL because AI still calls `foundCity` directly after terrain checks.

- [ ] **Step 3: Update `src/main.ts` player founding**

Import the blocker helper:

```ts
import { getCityFoundingBlockers } from '@/systems/city-territory-system';
```

At the start of `foundCityAction`, after settler validation and before `foundCity`, add:

```ts
const blockers = getCityFoundingBlockers(gameState, unit.position);
if (blockers.length > 0) {
  const tooClose = blockers.find(blocker => blocker.reason === 'too-close');
  const message = tooClose?.cityName
    ? `Too close to ${tooClose.cityName}.`
    : 'This location cannot support a city.';
  showNotification(message, 'warning');
  return;
}
```

- [ ] **Step 4: Update `src/ai/basic-ai.ts` AI founding**

Import:

```ts
import { canFoundCityAt } from '@/systems/city-territory-system';
```

In the settler founding branch, replace the terrain-only condition with:

```ts
if (tile && canFoundCityAt(newState, settler.position)) {
  const city = foundCity(civId, settler.position, newState.map, {
    civType: civ.civType,
    namingPool: civDef?.cityNames,
    civName: civDef?.name ?? civ.name,
    usedNames: collectUsedCityNames(newState),
  });
  // existing city insertion and settler removal stay here
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/systems/city-system.test.ts tests/storage/save-persistence.test.ts tests/ai/basic-ai.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/city-maturity-system.ts src/systems/city-territory-system.ts src/systems/city-system.ts src/storage/save-manager.ts src/main.ts src/ai/basic-ai.ts
```

Expected: no rule violations.

- [ ] **Step 7: Commit MR 1a**

Run:

```bash
git add src/core/types.ts src/systems/city-maturity-system.ts src/systems/city-territory-system.ts src/systems/city-system.ts src/storage/save-manager.ts src/main.ts src/ai/basic-ai.ts tests/systems/city-maturity-system.test.ts tests/systems/city-territory-system.test.ts tests/systems/city-system.test.ts tests/storage/save-persistence.test.ts tests/ai/basic-ai.test.ts
git commit -m "feat(city): add territory foundation"
```

## Final Verification For MR 1a

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-maturity-system.test.ts tests/systems/city-territory-system.test.ts tests/systems/city-system.test.ts tests/storage/save-persistence.test.ts tests/ai/basic-ai.test.ts
./scripts/run-with-mise.sh yarn build
```

Expected: both commands pass.
