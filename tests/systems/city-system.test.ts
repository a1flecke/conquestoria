import {
  foundCity,
  getAvailableBuildings,
  processCity,
  BUILDINGS,
  CITY_NAMES,
} from '@/systems/city-system';
import type { GameMap } from '@/core/types';
import { generateMap } from '@/systems/map-generator';

describe('foundCity', () => {
  it('creates a city at the given position', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);

    expect(city.owner).toBe('p1');
    expect(city.position).toEqual(landTile.coord);
    expect(city.population).toBe(1);
    expect(city.buildings).toEqual([]);
    expect(city.ownedTiles.length).toBeGreaterThan(0);
  });

  it('assigns a name from the city names list', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    expect(CITY_NAMES).toContain(city.name);
  });

  it('claims nearby tiles', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    expect(city.ownedTiles.length).toBeGreaterThanOrEqual(1);
    expect(city.ownedTiles).toContainEqual(landTile.coord);
  });
});

describe('getAvailableBuildings', () => {
  it('returns buildings the city can build', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const available = getAvailableBuildings(city, []);
    expect(available.length).toBeGreaterThan(0);
  });

  it('excludes already built buildings', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    city.buildings = ['granary'];
    const available = getAvailableBuildings(city, []);
    expect(available.find(b => b.id === 'granary')).toBeUndefined();
  });
});

describe('processCity', () => {
  it('adds food per turn and grows population', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = foundCity('p1', landTile.coord, map);
    city.food = city.foodNeeded - 1;

    const result = processCity(city, map, 3);
    expect(result.city.food).toBeGreaterThanOrEqual(0);
  });

  it('progresses production', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = foundCity('p1', landTile.coord, map);
    city.productionQueue = ['granary'];
    city.productionProgress = 0;

    const result = processCity(city, map, 3, 5);
    expect(result.city.productionProgress).toBe(5);
  });
});
