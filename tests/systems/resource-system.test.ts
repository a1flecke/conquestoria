import { calculateCityYields, TERRAIN_YIELDS } from '@/systems/resource-system';
import type { GameMap } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { foundCity } from '@/systems/city-system';

describe('calculateCityYields', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'resource-test');
  });

  it('calculates positive food yield', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const yields = calculateCityYields(city, map);
    expect(yields.food).toBeGreaterThan(0);
  });

  it('calculates yields from owned tiles', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const yields = calculateCityYields(city, map);
    expect(yields.food + yields.production + yields.gold + yields.science).toBeGreaterThan(0);
  });

  it('includes building yields', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const cityWithBuildings = { ...city, buildings: ['granary'] };
    const withoutBuilding = calculateCityYields(city, map);
    const withBuilding = calculateCityYields(cityWithBuildings, map);
    expect(withBuilding.food).toBeGreaterThan(withoutBuilding.food);
  });
});

describe('adjacency yields in city calculation', () => {
  it('includes adjacency bonuses in city yields', () => {
    const map = generateMap(30, 30, 'adj-yield');
    const city = foundCity('player', { q: 15, r: 15 }, map);
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
    const city = foundCity('p1', inlandTile.coord, map);
    // Remove all owned tiles so only city center contributes
    const isolatedCity = { ...city, ownedTiles: [], population: 0 };
    const yields = calculateCityYields(isolatedCity, map);
    expect(yields.gold).toBeGreaterThanOrEqual(1);
  });

  it('produces at least 1 science from city center alone', () => {
    const inlandTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' && !t.hasRiver,
    )!;
    const city = foundCity('p1', inlandTile.coord, map);
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
});
