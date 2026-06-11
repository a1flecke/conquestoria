import { calculateCityYields, TERRAIN_YIELDS } from '@/systems/resource-system';
import type { GameMap, HexCoord, TerrainType } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { generateMap } from '@/systems/map-generator';
import { foundCity } from '@/systems/city-system';
import { recalculateTerritory } from '@/systems/city-territory-system';
import { hexKey } from '@/systems/hex-utils';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('calculateCityYields', () => {
  let map: GameMap;

  function forceTerrain(map: GameMap, coord: HexCoord, terrain: TerrainType): HexCoord {
    const key = hexKey(coord);
    map.tiles[key] = {
      ...map.tiles[key],
      coord,
      terrain,
      elevation: terrain === 'hills' ? 'highland' : 'lowland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    return coord;
  }

  beforeAll(() => {
    map = generateMap(30, 30, 'resource-test');
  });

  it('calculates positive food yield', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const yields = calculateCityYields(city, map);
    expect(yields.food).toBeGreaterThan(0);
  });

  it('calculates yields from owned tiles', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const yields = calculateCityYields(city, map);
    expect(yields.food + yields.production + yields.gold + yields.science).toBeGreaterThan(0);
  });

  it('includes building yields', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const cityWithBuildings = { ...city, buildings: ['granary'] };
    const withoutBuilding = calculateCityYields(city, map);
    const withBuilding = calculateCityYields(cityWithBuildings, map);
    expect(withBuilding.food).toBeGreaterThan(withoutBuilding.food);
  });

  it('uses explicit workedTiles instead of the first owned tiles', () => {
    const map = generateMap(30, 30, 'explicit-worked-yields');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const grass = forceTerrain(map, { q: 16, r: 15 }, 'grassland');
    const hills = forceTerrain(map, { q: 17, r: 15 }, 'hills');
    const cityWithProductionFocus = { ...city, population: 1, workedTiles: [hills], ownedTiles: [grass, hills] };

    const yields = calculateCityYields(cityWithProductionFocus, map);

    expect(yields.food).toBe(1);
    expect(yields.production).toBe(3);
  });

  it('treats an empty workedTiles array as no assigned citizens', () => {
    const map = generateMap(30, 30, 'empty-worked-yields');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const grass = forceTerrain(map, { q: 16, r: 15 }, 'grassland');
    const hills = forceTerrain(map, { q: 17, r: 15 }, 'hills');

    const yields = calculateCityYields({ ...city, population: 2, ownedTiles: [grass, hills], workedTiles: [] }, map);

    expect(yields).toEqual({ food: 1, production: 1, gold: 1, science: 1 });
  });

  it('does not count city center as a worked citizen tile', () => {
    const map = generateMap(30, 30, 'city-center-not-worked');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const yields = calculateCityYields({ ...city, population: 1, workedTiles: [city.position] }, map);
    expect(yields).toEqual({ food: 1, production: 1, gold: 1, science: 1 });
  });

  it('counts coast water yields when explicitly worked', () => {
    const map = generateMap(30, 30, 'worked-coast-yields');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const coast = forceTerrain(map, { q: 16, r: 15 }, 'coast');
    const yields = calculateCityYields({ ...city, population: 1, ownedTiles: [coast], workedTiles: [coast] }, map);
    expect(yields.food).toBe(3);
    expect(yields.gold).toBe(2);
  });

  it('includes completed lumber camp production in city yields', () => {
    const map = generateMap(10, 10, 'lumber-yield');
    const center = { q: 2, r: 2 };
    const worked = { q: 2, r: 3 };
    map.tiles['2,2'] = {
      coord: center, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    map.tiles['2,3'] = {
      coord: worked, terrain: 'forest', elevation: 'lowland', resource: null,
      improvement: 'lumber_camp', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    const city = foundCity('player', center, map, mkC());
    city.population = 1;
    city.workedTiles = [worked];

    const yields = calculateCityYields(city, map);

    expect(yields.production).toBeGreaterThanOrEqual(3);
  });

  it('includes completed watermill food and production in city yields', () => {
    const map = generateMap(10, 10, 'watermill-yield');
    const center = { q: 2, r: 2 };
    const worked = { q: 2, r: 3 };
    map.tiles['2,2'] = {
      coord: center, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    map.tiles['2,3'] = {
      coord: worked, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'watermill', owner: 'player', improvementTurnsLeft: 0, hasRiver: true, wonder: null,
    };
    const city = foundCity('player', center, map, mkC());
    city.population = 1;
    city.workedTiles = [worked];

    const yields = calculateCityYields(city, map);

    expect(yields.food).toBeGreaterThanOrEqual(3);
    expect(yields.production).toBeGreaterThanOrEqual(2);
  });

  it('preserves river gold and completed farm food in live city yields', () => {
    const map = generateMap(10, 10, 'river-farm-live-yield');
    const center = { q: 2, r: 2 };
    const worked = { q: 2, r: 3 };
    map.tiles['2,2'] = {
      coord: center, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    map.tiles['2,3'] = {
      coord: worked, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'farm', owner: 'player', improvementTurnsLeft: 0, hasRiver: true, wonder: null,
    };
    const city = foundCity('player', center, map, mkC());
    city.population = 1;
    city.workedTiles = [worked];

    const riverYield = calculateCityYields(city, map);
    map.tiles['2,3'].hasRiver = false;
    const inlandYield = calculateCityYields(city, map);

    expect(riverYield.gold).toBe(inlandYield.gold + 1);
    expect(riverYield.food).toBe(inlandYield.food + 1);
    expect(riverYield.production).toBe(inlandYield.production);
  });

  it('counts a transferred completed farm only for the new owner after reassignment', () => {
    const state = createNewGame(undefined, 'farm-transfer-yield', 'small');
    state.cities = {};
    state.civilizations.player.cities = [];
    state.civilizations['ai-1'].cities = [];
    const holder = { ...foundCity('player', { q: 10, r: 10 }, state.map, mkC()), id: 'holder' };
    const challenger = { ...foundCity('ai-1', { q: 13, r: 10 }, state.map, mkC()), id: 'challenger' };
    const overlap = { q: 12, r: 10 };
    state.map.tiles[hexKey(overlap)] = {
      ...state.map.tiles[hexKey(overlap)],
      coord: overlap,
      terrain: 'plains',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities.holder = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap], workedTiles: [overlap] };
    state.cities.challenger = { ...challenger, population: 6, maturity: 'town', buildings: ['shrine'], ownedTiles: [], workedTiles: [] };
    state.civilizations.player.cities = ['holder'];
    state.civilizations['ai-1'].cities = ['challenger'];

    const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });
    const oldOwnerYields = calculateCityYields(result.state.cities.holder, result.state.map);
    const newOwnerYields = calculateCityYields(
      { ...result.state.cities.challenger, population: 1, workedTiles: [overlap] },
      result.state.map,
    );

    expect(result.state.map.tiles[hexKey(overlap)].owner).toBe('ai-1');
    expect(result.state.cities.holder.workedTiles).not.toContainEqual(overlap);
    expect(newOwnerYields.food).toBeGreaterThan(oldOwnerYields.food);
  });
});

describe('adjacency yields in city calculation', () => {
  it('includes adjacency bonuses in city yields', () => {
    const map = generateMap(30, 30, 'adj-yield');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    city.grid[2][1] = 'library';
    city.buildings = ['library'];

    const yields = calculateCityYields(city, map);
    // Base science from library (2) + adjacency to city-center (+1) = at least 3
    expect(yields.science).toBeGreaterThanOrEqual(3);
  });
});

describe('city center base yields', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'base-yield-test');
  });

  it('produces at least 1 gold from city center alone', () => {
    // Found a city on a non-coastal, non-river tile to isolate base yield
    const inlandTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' && !t.hasRiver,
    )!;
    const city = foundCity('p1', inlandTile.coord, map, mkC());
    // Remove all owned tiles so only city center contributes
    const isolatedCity = { ...city, ownedTiles: [], population: 0 };
    const yields = calculateCityYields(isolatedCity, map);
    expect(yields.gold).toBeGreaterThanOrEqual(1);
  });

  it('produces at least 1 science from city center alone', () => {
    const inlandTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' && !t.hasRiver,
    )!;
    const city = foundCity('p1', inlandTile.coord, map, mkC());
    const isolatedCity = { ...city, ownedTiles: [], population: 0 };
    const yields = calculateCityYields(isolatedCity, map);
    expect(yields.science).toBeGreaterThanOrEqual(1);
  });
});

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

  it('mountain tile yields 1 production (issue #280)', () => {
    expect(TERRAIN_YIELDS.mountain).toEqual({ food: 0, production: 1, gold: 0, science: 0 });
  });
});
