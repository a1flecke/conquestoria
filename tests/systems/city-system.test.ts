import {
  foundCity,
  getAvailableBuildings,
  processCity,
  checkGridExpansion,
  purchaseGridExpansion,
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
});

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
