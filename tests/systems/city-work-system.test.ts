import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  assignCityFocus,
  calculateWorkedTileYield,
  calculateProjectedCityYields,
  getWorkableTilesForCity,
  normalizeCityWorkAfterTerritoryChange,
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

  it('does not treat ocean as workable before later ocean-work eligibility exists', () => {
    const state = createNewGame(undefined, 'city-work-ocean');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const ocean = Object.values(state.map.tiles).find(tile => tile.terrain === 'ocean')!;
    state.map.tiles[hexKey(ocean.coord)].owner = 'player';
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, ocean.coord] };
    const workable = getWorkableTilesForCity(state, city.id);
    expect(workable.map(entry => entry.coord)).not.toContainEqual(ocean.coord);
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
  it('projects focused yields for an empty non-custom worked tile list without mutating state', () => {
    const state = createNewGame(undefined, 'city-work-projected-yields');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const hills = { q: 16, r: 15 };
    state.map.tiles[hexKey(hills)] = {
      ...state.map.tiles[hexKey(hills)],
      coord: hills,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'production',
      workedTiles: [],
      ownedTiles: [city.position, hills],
    };

    const yields = calculateProjectedCityYields(state, city.id);

    expect(yields.production).toBe(3);
    expect(state.cities[city.id].workedTiles).toEqual([]);
  });

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

  it('uses natural wonder yields when scoring focused tiles', () => {
    const state = createNewGame(undefined, 'city-work-wonder-focus');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const plains = { q: 16, r: 15 };
    const wonder = { q: 15, r: 16 };
    state.map.tiles[hexKey(plains)] = {
      ...state.map.tiles[hexKey(plains)],
      coord: plains,
      terrain: 'plains',
      elevation: 'lowland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(wonder)] = {
      ...state.map.tiles[hexKey(wonder)],
      coord: wonder,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: 'crystal_caverns',
      resource: null,
    };
    state.cities[city.id] = {
      ...city,
      population: 1,
      ownedTiles: [city.position, plains, wonder],
    };

    const result = assignCityFocus(state, city.id, 'gold');

    expect(result.state.cities[city.id].workedTiles).toEqual([wonder]);
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
  it('lets a focused city claim a tile that only has a stale foreign work claim', () => {
    const state = createNewGame(undefined, 'city-work-stale-foreign-claim');
    const foreign = addCity(state, 'ai-1', { q: 10, r: 10 });
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const target = { q: 16, r: 15 };
    state.map.tiles[hexKey(target)] = {
      ...state.map.tiles[hexKey(target)],
      coord: target,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities[foreign.id] = { ...foreign, workedTiles: [target] };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'production',
      workedTiles: [],
      ownedTiles: [city.position, target],
    };

    const result = assignCityFocus(state, city.id, 'production');

    expect(result.state.cities[city.id].workedTiles).toEqual([target]);
    expect(result.state.cities[foreign.id].workedTiles).toEqual([]);
  });

  it('removes city center and foreign-owned tiles', () => {
    const state = createNewGame(undefined, 'city-work-normalize');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;
    state.map.tiles[hexKey(tile)].owner = 'ai-1';
    state.cities[city.id] = { ...city, workedTiles: [city.position, tile] };

    const result = normalizeWorkedTilesForCity(state, city.id);
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
  });

  it('reassigns a focused city when a worked tile changes ownership', () => {
    const state = createNewGame(undefined, 'city-work-territory-change');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const lostTile = { q: 16, r: 15 };
    const replacement = { q: 15, r: 16 };
    state.map.tiles[hexKey(lostTile)] = {
      ...state.map.tiles[hexKey(lostTile)],
      coord: lostTile,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: 'ai-1',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(replacement)] = {
      ...state.map.tiles[hexKey(replacement)],
      coord: replacement,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'food',
      workedTiles: [lostTile],
      ownedTiles: [city.position, lostTile, replacement],
    };

    const result = normalizeCityWorkAfterTerritoryChange(state, city.id);
    const updated = result.state.cities[city.id];
    expect(updated.focus).toBe('food');
    expect(updated.workedTiles).toContainEqual(replacement);
    expect(updated.workedTiles).not.toContainEqual(lostTile);
  });

  it('removes invalid custom worked tiles without auto-refilling them', () => {
    const state = createNewGame(undefined, 'city-work-custom-territory-change');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const lostTile = { q: 16, r: 15 };
    const replacement = { q: 15, r: 16 };
    state.map.tiles[hexKey(lostTile)] = { ...state.map.tiles[hexKey(lostTile)], coord: lostTile, terrain: 'grassland', owner: 'ai-1' };
    state.map.tiles[hexKey(replacement)] = { ...state.map.tiles[hexKey(replacement)], coord: replacement, terrain: 'grassland', owner: 'player' };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'custom',
      workedTiles: [lostTile],
      ownedTiles: [city.position, lostTile, replacement],
    };

    const result = normalizeCityWorkAfterTerritoryChange(state, city.id);
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
    expect(result.unassignedCitizens).toBe(1);
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

  it('calculates natural and adjacent wonder yields for a worked tile', () => {
    const state = createNewGame(undefined, 'city-work-wonder-yield');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = { q: 16, r: 15 };
    const adjacentWonder = { q: 17, r: 15 };
    state.map.tiles[hexKey(tile)] = {
      ...state.map.tiles[hexKey(tile)],
      coord: tile,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: 'crystal_caverns',
      resource: null,
    };
    state.map.tiles[hexKey(adjacentWonder)] = {
      ...state.map.tiles[hexKey(adjacentWonder)],
      coord: adjacentWonder,
      terrain: 'mountain',
      elevation: 'highland',
      owner: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: 'sacred_mountain',
      resource: null,
    };
    state.cities[city.id] = { ...city, ownedTiles: [city.position, tile] };

    const yieldValue = calculateWorkedTileYield(state, tile);

    expect(yieldValue.gold).toBeGreaterThanOrEqual(3);
    expect(yieldValue.science).toBeGreaterThanOrEqual(1);
  });
});
