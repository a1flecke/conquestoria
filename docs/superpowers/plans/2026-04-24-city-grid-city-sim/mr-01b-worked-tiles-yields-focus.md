# MR 1b: Worked Tiles, Yields, And Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit worked tiles, water work, and focus assignment drive real city yields.

**Architecture:** Add `city-work-system.ts` as the single rules layer for workable tiles, tile yields, focus scoring, manual assignment, and worked-tile normalization. `resource-system.ts` reads `city.workedTiles`; old `ownedTiles.slice(0, population)` behavior is only a fallback for unnormalized legacy city data. Turn processing calls shared helpers when population or city territory changes. Target implementing model: GPT-5.4 Medium.

**Tech Stack:** TypeScript, Vitest, existing `GameState`, `ResourceYield`, `TERRAIN_YIELDS`, improvement helpers, city-territory claim index.

---

## Source Contract

Spec: `docs/superpowers/specs/2026-04-24-city-grid-city-sim-design.md`

Rules to read before editing source:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/strategy-game-mechanics.md`

MR dependency: complete MR 1a first.

## Files

- Create: `src/systems/city-work-system.ts`
- Modify: `src/systems/resource-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/core/turn-manager.ts`
- Test: `tests/systems/city-work-system.test.ts`
- Test: `tests/systems/resource-system.test.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/core/turn-manager.test.ts`

## Task 1: Add City Work System Tests

**Files:**
- Create: `tests/systems/city-work-system.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/city-work-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  assignCityFocus,
  calculateWorkedTileYield,
  getWorkableTilesForCity,
  normalizeWorkedTilesForCity,
  setCityWorkedTile,
} from '@/systems/city-work-system';
import { hexKey } from '@/systems/hex-utils';

function addCity(state: GameState, owner: string, position: HexCoord) {
  const city = foundCity(owner, position, state.map);
  state.cities[city.id] = city;
  state.civilizations[owner]?.cities.push(city.id);
  for (const coord of city.ownedTiles) {
    state.map.tiles[hexKey(coord)].owner = owner;
  }
  return city;
}

describe('city worked tile eligibility', () => {
  it('excludes the city center from workable citizen tiles', () => {
    const state = createNewGame(undefined, 'city-work-center');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const workable = getWorkableTilesForCity(state, city.id);
    expect(workable.map(entry => entry.coord)).not.toContainEqual(city.position);
  });

  it('includes controlled coast tiles as workable water', () => {
    const state = createNewGame(undefined, 'city-work-water');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const coast = Object.values(state.map.tiles).find(tile => tile.terrain === 'coast')!;
    state.map.tiles[hexKey(coast.coord)].owner = 'player';
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, coast.coord] };
    const workable = getWorkableTilesForCity(state, city.id);
    expect(workable).toContainEqual(expect.objectContaining({ coord: coast.coord, isWater: true }));
  });

  it('marks tiles claimed by another city as unavailable', () => {
    const state = createNewGame(undefined, 'city-work-claims');
    const first = addCity(state, 'player', { q: 10, r: 10 });
    const second = addCity(state, 'player', { q: 15, r: 10 });
    const shared = first.ownedTiles.find(coord => !(coord.q === first.position.q && coord.r === first.position.r))!;
    state.map.tiles[hexKey(shared)].owner = 'player';
    state.cities[first.id] = { ...first, workedTiles: [shared] };
    state.cities[second.id] = { ...second, ownedTiles: [...second.ownedTiles, shared] };

    const workable = getWorkableTilesForCity(state, second.id);
    expect(workable).toContainEqual(expect.objectContaining({
      coord: shared,
      claim: expect.objectContaining({ cityId: first.id }),
      available: false,
    }));
  });
});

describe('city focus assignment', () => {
  it('assigns food focus to the highest-food unclaimed tiles up to population', () => {
    const state = createNewGame(undefined, 'city-work-food-focus');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    state.cities[city.id] = { ...city, population: 2 };

    const result = assignCityFocus(state, city.id, 'food');
    const focused = result.state.cities[city.id];

    expect(focused.focus).toBe('food');
    expect(focused.workedTiles).toHaveLength(2);
    expect(focused.workedTiles).not.toContainEqual(city.position);
  });

  it('leaves surplus population unassigned when no valid unclaimed tiles exist', () => {
    const state = createNewGame(undefined, 'city-work-surplus');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    state.cities[city.id] = { ...city, population: 9, ownedTiles: [city.position] };

    const result = assignCityFocus(state, city.id, 'balanced');
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
    expect(result.unassignedCitizens).toBe(9);
  });
});

describe('manual worked tile assignment', () => {
  it('switches to custom when a tile is manually worked', () => {
    const state = createNewGame(undefined, 'city-work-manual');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const target = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;

    const result = setCityWorkedTile(state, city.id, target, true);
    expect(result.state.cities[city.id].focus).toBe('custom');
    expect(result.state.cities[city.id].workedTiles).toContainEqual(target);
  });

  it('refuses a tile claimed by another city', () => {
    const state = createNewGame(undefined, 'city-work-refuse-claim');
    const first = addCity(state, 'player', { q: 10, r: 10 });
    const second = addCity(state, 'player', { q: 15, r: 10 });
    const shared = first.ownedTiles.find(coord => !(coord.q === first.position.q && coord.r === first.position.r))!;
    state.map.tiles[hexKey(shared)].owner = 'player';
    state.cities[first.id] = { ...first, workedTiles: [shared] };
    state.cities[second.id] = { ...second, ownedTiles: [...second.ownedTiles, shared] };

    const result = setCityWorkedTile(state, second.id, shared, true);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('claimed');
    expect(result.state.cities[second.id].workedTiles).not.toContainEqual(shared);
  });
});

describe('worked tile normalization', () => {
  it('removes city center and foreign-owned tiles', () => {
    const state = createNewGame(undefined, 'city-work-normalize');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;
    state.map.tiles[hexKey(tile)].owner = 'ai-1';
    state.cities[city.id] = { ...city, workedTiles: [city.position, tile] };

    const result = normalizeWorkedTilesForCity(state, city.id);
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
  });

  it('calculates completed farm yield for a worked tile', () => {
    const state = createNewGame(undefined, 'city-work-farm-yield');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;
    state.map.tiles[hexKey(tile)] = {
      ...state.map.tiles[hexKey(tile)],
      terrain: 'grassland',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };
    const yieldValue = calculateWorkedTileYield(state, tile);
    expect(yieldValue.food).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-work-system.test.ts
```

Expected: FAIL because `city-work-system.ts` does not exist.

## Task 2: Implement City Work System

**Files:**
- Create: `src/systems/city-work-system.ts`

- [ ] **Step 1: Add work system types and tile yield helper**

Create `src/systems/city-work-system.ts` with:

```ts
import type { CityFocus, GameState, HexCoord, ResourceYield } from '@/core/types';
import { hexKey } from './hex-utils';
import { getImprovementYieldBonus } from './improvement-system';
import { TERRAIN_YIELDS } from './resource-system';
import {
  buildCityWorkClaimIndex,
  canonicalizeCityCoord,
  normalizeCityWorkClaims,
  type TileWorkClaim,
} from './city-territory-system';

export interface WorkableCityTile {
  coord: HexCoord;
  yield: ResourceYield;
  isWater: boolean;
  available: boolean;
  claim?: TileWorkClaim;
}

export interface CityWorkMutationResult {
  state: GameState;
  changed: boolean;
  reason?: 'missing-city' | 'not-workable' | 'claimed' | 'no-capacity';
  unassignedCitizens: number;
}

export function calculateWorkedTileYield(state: GameState, coord: HexCoord): ResourceYield {
  const canonical = canonicalizeCityCoord(coord, state.map);
  const tile = state.map.tiles[hexKey(canonical)];
  const total: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  if (!tile) return total;

  const terrain = TERRAIN_YIELDS[tile.terrain] ?? total;
  total.food += terrain.food;
  total.production += terrain.production;
  total.gold += terrain.gold;
  total.science += terrain.science;

  if (tile.hasRiver) {
    total.gold += 1;
    if (tile.improvement === 'farm' && tile.improvementTurnsLeft === 0) {
      total.food += 1;
    }
  }

  if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
    const improvement = getImprovementYieldBonus(tile.improvement);
    total.food += improvement.food;
    total.production += improvement.production;
    total.gold += improvement.gold;
    total.science += improvement.science;
  }

  return total;
}
```

- [ ] **Step 2: Add workable tile derivation**

Continue in `src/systems/city-work-system.ts`:

```ts
function sameCoord(left: HexCoord, right: HexCoord): boolean {
  return left.q === right.q && left.r === right.r;
}

function isWorkableTerrain(terrain: string): boolean {
  return terrain !== 'mountain';
}

function isWaterTerrain(terrain: string): boolean {
  return terrain === 'coast' || terrain === 'ocean';
}

export function getWorkableTilesForCity(state: GameState, cityId: string): WorkableCityTile[] {
  const city = state.cities[cityId];
  if (!city) return [];

  const claims = buildCityWorkClaimIndex(state);
  const seen = new Set<string>();
  const tiles: WorkableCityTile[] = [];

  for (const rawCoord of city.ownedTiles ?? []) {
    const coord = canonicalizeCityCoord(rawCoord, state.map);
    const key = hexKey(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    if (sameCoord(coord, city.position)) continue;

    const tile = state.map.tiles[key];
    if (!tile || tile.owner !== city.owner || !isWorkableTerrain(tile.terrain)) continue;

    const claim = claims[key];
    const claimedByOtherCity = Boolean(claim && claim.cityId !== city.id);
    tiles.push({
      coord,
      yield: calculateWorkedTileYield(state, coord),
      isWater: isWaterTerrain(tile.terrain),
      available: !claimedByOtherCity,
      claim: claimedByOtherCity ? claim : undefined,
    });
  }

  return tiles;
}
```

- [ ] **Step 3: Add focus scoring and assignment**

Continue in `src/systems/city-work-system.ts`:

```ts
function scoreYieldForFocus(yieldValue: ResourceYield, focus: CityFocus): number {
  switch (focus) {
    case 'food':
      return yieldValue.food * 100 + yieldValue.production * 10 + yieldValue.gold + yieldValue.science;
    case 'production':
      return yieldValue.production * 100 + yieldValue.food * 10 + yieldValue.gold + yieldValue.science;
    case 'gold':
      return yieldValue.gold * 100 + yieldValue.food * 10 + yieldValue.production + yieldValue.science;
    case 'science':
      return yieldValue.science * 100 + yieldValue.food * 10 + yieldValue.production + yieldValue.gold;
    case 'balanced':
    case 'custom':
      return yieldValue.food * 3 + yieldValue.production * 3 + yieldValue.gold * 2 + yieldValue.science * 2;
  }
}

function countUnassigned(cityPopulation: number, workedTiles: HexCoord[]): number {
  return Math.max(0, cityPopulation - workedTiles.length);
}

export function assignCityFocus(state: GameState, cityId: string, focus: Exclude<CityFocus, 'custom'>): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };

  const ranked = getWorkableTilesForCity(state, cityId)
    .filter(tile => tile.available)
    .sort((left, right) => {
      const scoreDelta = scoreYieldForFocus(right.yield, focus) - scoreYieldForFocus(left.yield, focus);
      return scoreDelta || hexKey(left.coord).localeCompare(hexKey(right.coord));
    });

  const workedTiles = ranked.slice(0, city.population).map(tile => tile.coord);
  const cities = {
    ...state.cities,
    [cityId]: { ...city, focus, workedTiles },
  };
  const normalized = normalizeCityWorkClaims({ ...state, cities });
  const normalizedCity = normalized.state.cities[cityId];
  return {
    state: normalized.state,
    changed: true,
    unassignedCitizens: countUnassigned(normalizedCity.population, normalizedCity.workedTiles),
  };
}
```

- [ ] **Step 4: Add manual set/unset and normalization**

Continue in `src/systems/city-work-system.ts`:

```ts
export function setCityWorkedTile(state: GameState, cityId: string, coord: HexCoord, worked: boolean): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };

  const canonical = canonicalizeCityCoord(coord, state.map);
  const key = hexKey(canonical);
  const workable = getWorkableTilesForCity(state, cityId).find(tile => hexKey(tile.coord) === key);
  if (!workable) {
    return { state, changed: false, reason: 'not-workable', unassignedCitizens: countUnassigned(city.population, city.workedTiles ?? []) };
  }
  if (worked && !workable.available) {
    return { state, changed: false, reason: 'claimed', unassignedCitizens: countUnassigned(city.population, city.workedTiles ?? []) };
  }

  const existing = (city.workedTiles ?? []).map(tile => canonicalizeCityCoord(tile, state.map));
  const withoutTarget = existing.filter(tile => hexKey(tile) !== key);
  const nextWorkedTiles = worked ? [...withoutTarget, canonical].slice(0, city.population) : withoutTarget;
  if (worked && nextWorkedTiles.length === existing.length && !existing.some(tile => hexKey(tile) === key)) {
    return { state, changed: false, reason: 'no-capacity', unassignedCitizens: 0 };
  }

  const cities = {
    ...state.cities,
    [cityId]: { ...city, focus: 'custom' as const, workedTiles: nextWorkedTiles },
  };
  const normalized = normalizeCityWorkClaims({ ...state, cities });
  const normalizedCity = normalized.state.cities[cityId];
  return {
    state: normalized.state,
    changed: true,
    unassignedCitizens: countUnassigned(normalizedCity.population, normalizedCity.workedTiles),
  };
}

export function normalizeWorkedTilesForCity(state: GameState, cityId: string): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };

  const validKeys = new Set(getWorkableTilesForCity(state, cityId).filter(tile => tile.available).map(tile => hexKey(tile.coord)));
  const workedTiles = (city.workedTiles ?? [])
    .map(coord => canonicalizeCityCoord(coord, state.map))
    .filter(coord => validKeys.has(hexKey(coord)))
    .slice(0, city.population);
  const cities = { ...state.cities, [cityId]: { ...city, workedTiles } };
  const normalized = normalizeCityWorkClaims({ ...state, cities });
  const normalizedCity = normalized.state.cities[cityId];
  return {
    state: normalized.state,
    changed: true,
    unassignedCitizens: countUnassigned(normalizedCity.population, normalizedCity.workedTiles),
  };
}
```

- [ ] **Step 5: Run city-work tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-work-system.test.ts
```

Expected: PASS.

## Task 3: Use Explicit Worked Tiles In Resource Yields

**Files:**
- Modify: `src/systems/resource-system.ts`
- Test: `tests/systems/resource-system.test.ts`

- [ ] **Step 1: Add failing resource tests**

In `tests/systems/resource-system.test.ts`, add:

```ts
it('uses explicit workedTiles instead of the first owned tiles', () => {
  const map = generateMap(30, 30, 'explicit-worked-yields');
  const city = foundCity('player', { q: 15, r: 15 }, map);
  const grass = city.ownedTiles.find(coord => map.tiles[`${coord.q},${coord.r}`]?.terrain === 'grassland')!;
  const hills = city.ownedTiles.find(coord => map.tiles[`${coord.q},${coord.r}`]?.terrain === 'hills')!;
  const cityWithProductionFocus = { ...city, population: 1, workedTiles: [hills], ownedTiles: [grass, hills] };

  const yields = calculateCityYields(cityWithProductionFocus, map);

  expect(yields.production).toBeGreaterThanOrEqual(3);
});

it('does not count city center as a worked citizen tile', () => {
  const map = generateMap(30, 30, 'city-center-not-worked');
  const city = foundCity('player', { q: 15, r: 15 }, map);
  const yields = calculateCityYields({ ...city, population: 1, workedTiles: [city.position] }, map);
  expect(yields.food).toBe(1);
  expect(yields.production).toBe(1);
  expect(yields.gold).toBe(1);
  expect(yields.science).toBe(1);
});

it('counts coast water yields when explicitly worked', () => {
  const map = generateMap(30, 30, 'worked-coast-yields');
  const city = foundCity('player', { q: 15, r: 15 }, map);
  const coast = Object.values(map.tiles).find(tile => tile.terrain === 'coast')!;
  map.tiles[`${coast.coord.q},${coast.coord.r}`].owner = 'player';
  const yields = calculateCityYields({ ...city, population: 1, ownedTiles: [coast.coord], workedTiles: [coast.coord] }, map);
  expect(yields.food).toBeGreaterThanOrEqual(3);
  expect(yields.gold).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run resource tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/resource-system.test.ts
```

Expected: FAIL because `calculateCityYields` still slices `ownedTiles`.

- [ ] **Step 3: Update resource-system worked tile selection**

In `src/systems/resource-system.ts`, import helpers:

```ts
import { canonicalizeCityCoord } from './city-territory-system';
```

Replace:

```ts
const workedTiles = city.ownedTiles.slice(0, city.population);
```

with:

```ts
const centerKey = hexKey(city.position);
const explicitWorkedTiles = (city.workedTiles ?? [])
  .map(coord => canonicalizeCityCoord(coord, map))
  .filter(coord => hexKey(coord) !== centerKey)
  .slice(0, city.population);
const workedTiles = explicitWorkedTiles.length > 0
  ? explicitWorkedTiles
  : city.ownedTiles
      .map(coord => canonicalizeCityCoord(coord, map))
      .filter(coord => hexKey(coord) !== centerKey)
      .slice(0, city.population);
```

Keep the existing terrain, river, improvement, wonder, and civ-bonus loops reading from `workedTiles`.

- [ ] **Step 4: Run resource tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/resource-system.test.ts
```

Expected: PASS.

## Task 4: Normalize Focus After Growth And Territory Changes

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/core/turn-manager.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Add failing growth normalization test**

In `tests/systems/city-system.test.ts`, add:

```ts
it('preserves focus fields after city growth processing', () => {
  const city = foundCity('player', { q: 15, r: 15 }, map);
  const focused = { ...city, focus: 'food' as const, workedTiles: [] };
  const result = processCity(focused, map, 30, 0);
  expect(result.city.focus).toBe('food');
  expect(result.city.workedTiles).toEqual([]);
});
```

In `tests/core/turn-manager.test.ts`, add a regression where a food-focused city grows and the turn result has `workedTiles.length <= population` and no city-center coordinate in `workedTiles`.

- [ ] **Step 2: Run tests to verify failure or missing behavior**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/core/turn-manager.test.ts
```

Expected: FAIL until turn processing normalizes focus after growth.

- [ ] **Step 3: Keep `processCity` field-preserving and update turn manager**

`processCity` already spreads `...city` in its return. Confirm it preserves `focus`, `workedTiles`, `maturity`, and `lastFocusReminderTurn`.

In `src/core/turn-manager.ts`, after a city grows or after city-owned tiles change, call:

```ts
const focusResult = processedCity.focus === 'custom'
  ? normalizeWorkedTilesForCity(nextState, processedCity.id)
  : assignCityFocus(nextState, processedCity.id, processedCity.focus);
nextState = focusResult.state;
```

Thread this through immutable `GameState` updates. Do not mutate `state.cities[id]` in place inside turn processing.

- [ ] **Step 4: Run turn and city tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts tests/systems/city-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

## Task 5: Verification And Commit

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/city-work-system.ts src/systems/resource-system.ts src/systems/city-system.ts src/core/turn-manager.ts
```

Expected: no rule violations.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts tests/systems/city-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Commit MR 1b**

Run:

```bash
git add src/systems/city-work-system.ts src/systems/resource-system.ts src/systems/city-system.ts src/core/turn-manager.ts tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts tests/systems/city-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(city): use worked tiles for yields"
```
