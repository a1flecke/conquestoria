import {
  foundCity,
  getAvailableBuildings,
  processCity,
  checkGridExpansion,
  purchaseGridExpansion,
  getUnplacedBuildings,
  BUILDINGS,
  CITY_NAMES,
  TRAINABLE_UNITS,
  PRODUCTION_ICONS,
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

  it('canonicalizes claimed tiles when founded near a wrapped map edge', () => {
    const map = generateMap(5, 5, 'city-wrap-test');
    map.wrapsHorizontally = true;
    map.tiles['0,2'] = { ...map.tiles['0,2'], terrain: 'grassland' };
    map.tiles['4,2'] = { ...map.tiles['4,2'], terrain: 'grassland' };

    const city = foundCity('p1', { q: 0, r: 2 }, map);

    expect(city.ownedTiles).toContainEqual({ q: 4, r: 2 });
    expect(city.ownedTiles).not.toContainEqual({ q: -1, r: 2 });
  });

  it('foundCity uses the naming system instead of the old shared CITY_NAMES pool', () => {
    const map = generateMap(30, 30, 'city-test');
    const city = foundCity('player', { q: 2, r: 2 }, map, {
      civType: 'rome',
      namingPool: ['Rome', 'Ostia', 'Ravenna'],
      usedNames: new Set(['Rome']),
    });

    expect(city.name).toBe('Ostia');
  });

  it('does not use the legacy cityNameIndex counter for name selection', () => {
    const map = generateMap(30, 30, 'city-test');
    const used1 = new Set<string>();
    const city1 = foundCity('player', { q: 0, r: 0 }, map, {
      civType: 'rome',
      namingPool: ['Rome', 'Ostia', 'Ravenna', 'Antium', 'Capua', 'Neapolis'],
      usedNames: used1,
    });
    used1.add(city1.name);

    const city2 = foundCity('player', { q: 2, r: 2 }, map, {
      civType: 'rome',
      namingPool: ['Rome', 'Ostia', 'Ravenna', 'Antium', 'Capua', 'Neapolis'],
      usedNames: used1,
    });

    expect(city1.name).not.toBe(city2.name);
    expect(['Rome', 'Ostia', 'Ravenna', 'Antium', 'Capua', 'Neapolis']).toContain(city1.name);
    expect(['Rome', 'Ostia', 'Ravenna', 'Antium', 'Capua', 'Neapolis']).toContain(city2.name);
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

  it('preserves focus fields after city growth processing', () => {
    const map = generateMap(30, 30, 'city-growth-focus-fields');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const focused = { ...city, focus: 'food' as const, workedTiles: [] };
    const result = processCity(focused, map, 30, 0);
    expect(result.city.focus).toBe('food');
    expect(result.city.workedTiles).toEqual([]);
  });

  it('auto-places a newly completed Barracks into an unlocked building grid slot', () => {
    const map = generateMap(30, 30, 'auto-place-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const queued = { ...city, productionQueue: ['barracks'], productionProgress: 9 };

    const result = processCity(queued, map, 0, 1);

    expect(result.completedBuilding).toBe('barracks');
    expect(result.city.buildings).toEqual(['barracks']);
    expect(result.city.grid.flat()).toContain('barracks');
    expect(getUnplacedBuildings(result.city)).not.toContain('barracks');
  });

  it('keeps completed buildings unplaced when every unlocked slot is full', () => {
    const map = generateMap(30, 30, 'unplaced-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const fullGrid = city.grid.map(row => row.slice());
    for (let row = 2; row <= 4; row++) {
      for (let col = 2; col <= 4; col++) {
        if (row !== 3 || col !== 3) fullGrid[row][col] = 'shrine';
      }
    }
    const queued = { ...city, grid: fullGrid, productionQueue: ['barracks'], productionProgress: 9 };

    const result = processCity(queued, map, 0, 1);

    expect(result.completedBuilding).toBe('barracks');
    expect(result.city.buildings).toContain('barracks');
    expect(result.city.grid.flat()).not.toContain('barracks');
    expect(getUnplacedBuildings(result.city)).toEqual(['barracks']);
  });

  it('does not duplicate an already built building from a stale production queue', () => {
    const map = generateMap(30, 30, 'dedupe-built-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const grid = city.grid.map(row => row.slice());
    grid[3][2] = 'barracks';
    const queued = {
      ...city,
      buildings: ['barracks'],
      grid,
      productionQueue: ['barracks'],
      productionProgress: 9,
    };

    const result = processCity(queued, map, 0, 1);

    expect(result.city.buildings.filter(buildingId => buildingId === 'barracks')).toHaveLength(1);
    expect(result.city.grid.flat().filter(buildingId => buildingId === 'barracks')).toHaveLength(1);
    expect(getUnplacedBuildings(result.city)).toEqual([]);
  });

  it('converts production to gold when queue is empty at turn start and idleProduction is gold', () => {
    const map = generateMap(30, 30, 'idle-gold');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const idle = { ...city, idleProduction: 'gold' as const, productionQueue: [] };

    const result = processCity(idle, map, 0, 8);

    expect(result.idleGoldBonus).toBe(8);
    expect(result.idleScienceBonus).toBe(0);
    expect(result.city.productionProgress).toBe(0);
  });

  it('converts production to science when queue is empty at turn start and idleProduction is science', () => {
    const map = generateMap(30, 30, 'idle-science');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const idle = { ...city, idleProduction: 'science' as const, productionQueue: [] };

    const result = processCity(idle, map, 0, 5);

    expect(result.idleScienceBonus).toBe(5);
    expect(result.idleGoldBonus).toBe(0);
    expect(result.city.productionProgress).toBe(0);
  });

  it('does not produce idle bonus when queue is non-empty even if idleProduction is set', () => {
    const map = generateMap(30, 30, 'idle-ignored');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const active = { ...city, idleProduction: 'gold' as const, productionQueue: ['workshop'], productionProgress: 0 };

    const result = processCity(active, map, 0, 5);

    expect(result.idleGoldBonus).toBe(0);
    expect(result.idleScienceBonus).toBe(0);
    expect(result.city.productionProgress).toBe(5);
  });

  it('does not produce idle bonus when the last queue item completes this turn', () => {
    // workshop costs 12; progress=7 + yield=5 = 12 → completes this turn
    const map = generateMap(30, 30, 'idle-completion-turn');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const completing = { ...city, idleProduction: 'gold' as const, productionQueue: ['workshop'], productionProgress: 7 };

    const result = processCity(completing, map, 0, 5);

    expect(result.completedBuilding).toBe('workshop');
    expect(result.idleGoldBonus).toBe(0);
    expect(result.idleScienceBonus).toBe(0);
  });

  it('completes Herbalist at the retuned opening cost', () => {
    const map = generateMap(30, 30, 'herbalist-opening-cost');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const queued = { ...city, productionQueue: ['herbalist'], productionProgress: 12 };

    const result = processCity(queued, map, 0, 4, undefined, [], undefined, 1);

    expect(result.completedBuilding).toBe('herbalist');
    expect(result.city.buildings).toContain('herbalist');
    expect(result.city.productionQueue).toEqual([]);
  });

  it('uses the current era cost when completing a Settler', () => {
    const map = generateMap(30, 30, 'settler-era-cost');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const queued = { ...city, productionQueue: ['settler'], productionProgress: 39 };

    const era3Result = processCity(queued, map, 0, 1, undefined, [], undefined, 3);
    const era4Result = processCity(queued, map, 0, 1, undefined, [], undefined, 4);

    expect(era3Result.completedUnit).toBe('settler');
    expect(era3Result.city.productionQueue).toEqual([]);
    expect(era4Result.completedUnit).toBeNull();
    expect(era4Result.city.productionQueue).toEqual(['settler']);
    expect(era4Result.city.productionProgress).toBe(40);
  });
});

describe('expanded buildings', () => {
  it('has at least 20 buildings defined', () => {
    expect(Object.keys(BUILDINGS).length).toBeGreaterThanOrEqual(20);
  });

  it('all buildings have a category', () => {
    for (const building of Object.values(BUILDINGS)) {
      expect(building.category).toBeDefined();
      expect(['production', 'food', 'science', 'economy', 'military', 'culture', 'espionage']).toContain(building.category);
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
  it('foundCity initializes city-sim fields and a 7x7-compatible grid', () => {
    const map = generateMap(30, 30, 'grid-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    expect(city.focus).toBe('balanced');
    expect(city.maturity).toBe('outpost');
    expect(city.workedTiles).toEqual([]);
    expect(city.gridSize).toBe(3);
    expect(city.grid).toHaveLength(7);
    expect(city.grid[0]).toHaveLength(7);
    expect(city.grid[3][3]).toBe('city-center');
  });

  it('city center is placed in the center of the grid', () => {
    const map = generateMap(30, 30, 'grid-center');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    expect(city.grid[3][3]).toBe('city-center');
  });
});

describe('grid expansion', () => {
  it('does not expand grid size from population alone', () => {
    const map = generateMap(30, 30, 'expand-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    city.population = 12;
    expect(checkGridExpansion(city)).toBe(false);
    expect(city.gridSize).toBe(3);
  });

  it('keeps mature grid size unchanged when checked', () => {
    const map = generateMap(30, 30, 'expand-test-2');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    city.gridSize = 5;
    expect(checkGridExpansion(city)).toBe(false);
    expect(city.gridSize).toBe(5);
  });

  it('purchase grid expansion cannot bypass city maturity', () => {
    const map = generateMap(30, 30, 'buy-test');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const cost = purchaseGridExpansion(city, 60);
    expect(cost).toBe(0);
    expect(city.gridSize).toBe(3);
  });

  it('purchase fails with insufficient gold', () => {
    const map = generateMap(30, 30, 'buy-test-2');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const cost = purchaseGridExpansion(city, 30);
    expect(cost).toBe(0);
    expect(city.gridSize).toBe(3);
  });
});

describe('PRODUCTION_ICONS coverage', () => {
  it('has an entry for every building in BUILDINGS', () => {
    for (const buildingId of Object.keys(BUILDINGS)) {
      expect(PRODUCTION_ICONS[buildingId], `missing icon for building "${buildingId}"`).toBeTruthy();
    }
  });

  it('has an entry for every unit in TRAINABLE_UNITS', () => {
    for (const unit of TRAINABLE_UNITS) {
      expect(PRODUCTION_ICONS[unit.type], `missing icon for unit "${unit.type}"`).toBeTruthy();
    }
  });

  it('every icon is a non-empty string', () => {
    for (const [id, icon] of Object.entries(PRODUCTION_ICONS)) {
      expect(typeof icon, `icon for "${id}" must be string`).toBe('string');
      expect(icon.length, `icon for "${id}" must be non-empty`).toBeGreaterThan(0);
    }
  });
});
