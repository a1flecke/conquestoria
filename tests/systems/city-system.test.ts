import {
  foundCity,
  getAvailableBuildings,
  getTrainableUnitsForCiv,
  getProductionCostForItem,
  processCity,
  completeCityProductionItem,
  checkGridExpansion,
  purchaseGridExpansion,
  getUnplacedBuildings,
  placeBuilding,
  createEmptyCityGrid,
  BUILDINGS,
  CITY_NAMES,
  TRAINABLE_UNITS,
  PRODUCTION_ICONS,
  getCatalogProductionCost,
  getProductionDisplayName,
  getProductionIconForItem,
  getSettlerProductionCost,
} from '@/systems/city-system';
import type { City, GameMap, ResourceType, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('foundCity', () => {
  it('creates a city at the given position', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());

    expect(city.owner).toBe('p1');
    expect(city.position).toEqual(landTile.coord);
    expect(city.population).toBe(1);
    expect(city.buildings).toEqual([]);
    expect(city.ownedTiles.length).toBeGreaterThan(0);
  });

  it('assigns a name from the city names list', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    expect(CITY_NAMES).toContain(city.name);
  });

  it('claims nearby tiles', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    expect(city.ownedTiles.length).toBeGreaterThanOrEqual(1);
    expect(city.ownedTiles).toContainEqual(landTile.coord);
  });

  it('canonicalizes claimed tiles when founded near a wrapped map edge', () => {
    const map = generateMap(5, 5, 'city-wrap-test');
    map.wrapsHorizontally = true;
    map.tiles['0,2'] = { ...map.tiles['0,2'], terrain: 'grassland' };
    map.tiles['4,2'] = { ...map.tiles['4,2'], terrain: 'grassland' };

    const city = foundCity('p1', { q: 0, r: 2 }, map, mkC());

    expect(city.ownedTiles).toContainEqual({ q: 4, r: 2 });
    expect(city.ownedTiles).not.toContainEqual({ q: -1, r: 2 });
  });

  it('foundCity uses the naming system instead of the old shared CITY_NAMES pool', () => {
    const map = generateMap(30, 30, 'city-test');
    const city = foundCity('player', { q: 2, r: 2 }, map, mkC(), {
      civType: 'rome',
      namingPool: ['Rome', 'Ostia', 'Ravenna'],
      usedNames: new Set(['Rome']),
    });

    expect(city.name).toBe('Ostia');
  });

  it('does not use the legacy cityNameIndex counter for name selection', () => {
    const map = generateMap(30, 30, 'city-test');
    const used1 = new Set<string>();
    const city1 = foundCity('player', { q: 0, r: 0 }, map, mkC(), {
      civType: 'rome',
      namingPool: ['Rome', 'Ostia', 'Ravenna', 'Antium', 'Capua', 'Neapolis'],
      usedNames: used1,
    });
    used1.add(city1.name);

    const city2 = foundCity('player', { q: 2, r: 2 }, map, mkC(), {
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
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, [], map.tiles);
    expect(available.length).toBeGreaterThan(0);
  });

  it('excludes already built buildings', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    city.buildings = ['granary'];
    const available = getAvailableBuildings(city, [], map.tiles);
    expect(available.find(b => b.id === 'granary')).toBeUndefined();
  });

  it('excludes coastalRequired buildings from inland cities', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = foundCity('p1', inlandTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['fishing'], map.tiles);
    expect(available.find(b => b.id === 'dock')).toBeUndefined();
  });

  it('includes dock for coastal cities with fishing tech', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const waterTile = Object.values(map.tiles).find(t => t.terrain === 'ocean' || t.terrain === 'coast')!;
    const nearTile = Object.values(map.tiles).find(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Math.abs(t.coord.q - waterTile.coord.q) <= 1 &&
      Math.abs(t.coord.r - waterTile.coord.r) <= 1
    );
    if (!nearTile) return; // skip if map seed has no coastal grassland
    const city = {
      ...foundCity('p1', nearTile.coord, map, mkC()),
      ownedTiles: [nearTile.coord, waterTile.coord],
    };
    const available = getAvailableBuildings(city, ['fishing'], map.tiles);
    expect(available.find(b => b.id === 'dock')).toBeDefined();
  });

  it('excludes dock from coastal city without fishing tech', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const waterTile = Object.values(map.tiles).find(t => t.terrain === 'ocean' || t.terrain === 'coast')!;
    const nearTile = Object.values(map.tiles).find(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Math.abs(t.coord.q - waterTile.coord.q) <= 1 &&
      Math.abs(t.coord.r - waterTile.coord.r) <= 1
    );
    if (!nearTile) return; // skip if map seed has no coastal tile
    const city = {
      ...foundCity('p1', nearTile.coord, map, mkC()),
      ownedTiles: [nearTile.coord, waterTile.coord],
    };
    const available = getAvailableBuildings(city, [], map.tiles); // no fishing tech
    expect(available.find(b => b.id === 'dock')).toBeUndefined();
  });

  it('excludes harbor from non-coastal cities even with harbor-tech', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = foundCity('p1', inlandTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['harbor-tech'], map.tiles);
    expect(available.find(b => b.id === 'harbor')).toBeUndefined();
  });

  it('includes harbor for coastal cities with harbor-tech', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const waterTile = Object.values(map.tiles).find(t => t.terrain === 'ocean' || t.terrain === 'coast')!;
    const nearTile = Object.values(map.tiles).find(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Math.abs(t.coord.q - waterTile.coord.q) <= 1 &&
      Math.abs(t.coord.r - waterTile.coord.r) <= 1
    );
    if (!nearTile) return; // skip if seed has no coastal grassland
    const city = {
      ...foundCity('p1', nearTile.coord, map, mkC()),
      ownedTiles: [nearTile.coord, waterTile.coord],
    };
    const available = getAvailableBuildings(city, ['harbor-tech'], map.tiles);
    expect(available.find(b => b.id === 'harbor')).toBeDefined();
  });
});

describe('processCity', () => {
  it('adds food per turn and grows population', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = foundCity('p1', landTile.coord, map, mkC());
    city.food = city.foodNeeded - 1;

    const result = processCity(city, map, 3);
    expect(result.city.food).toBeGreaterThanOrEqual(0);
  });

  it('progresses production', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = foundCity('p1', landTile.coord, map, mkC());
    city.productionQueue = ['granary'];
    city.productionProgress = 0;

    const result = processCity(city, map, 3, 5);
    expect(result.city.productionProgress).toBe(5);
  });

  it('processCity dequeues harbor when city is not coastal and returns droppedBuilding', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    let city = foundCity('p1', inlandTile.coord, map, mkC());
    city = { ...city, productionQueue: ['harbor'], productionProgress: 0 };
    const result = processCity(city, map, 2, 5, undefined, ['harbor-tech']);
    expect(result.droppedBuilding).toBe('harbor');
    expect(result.city.productionQueue).not.toContain('harbor');
    expect(result.city.productionProgress).toBe(0); // production not wasted
    expect(result.city.buildings).not.toContain('harbor');
  });

  it('processCity completes harbor normally for coastal city', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const waterTile = Object.values(map.tiles).find(t => t.terrain === 'ocean' || t.terrain === 'coast')!;
    const nearTile = Object.values(map.tiles).find(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Math.abs(t.coord.q - waterTile.coord.q) <= 1 &&
      Math.abs(t.coord.r - waterTile.coord.r) <= 1
    );
    if (!nearTile) return; // skip if seed has no coastal grassland
    let city = {
      ...foundCity('p1', nearTile.coord, map, mkC()),
      ownedTiles: [nearTile.coord, waterTile.coord],
      productionQueue: ['harbor'],
      productionProgress: 999, // high enough to complete
    };
    const result = processCity(city, map, 2, 0, undefined, ['harbor-tech']);
    expect(result.completedBuilding).toBe('harbor');
    expect(result.droppedBuilding).toBeNull();
    expect(result.city.buildings).toContain('harbor');
  });

  it('processCity returns droppedBuilding: null when no coastal guard triggers', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const result = processCity(city, map, 2);
    expect(result.droppedBuilding).toBeNull();
  });

  it('preserves focus fields after city growth processing', () => {
    const map = generateMap(30, 30, 'city-growth-focus-fields');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const focused = { ...city, focus: 'food' as const, workedTiles: [] };
    const result = processCity(focused, map, 30, 0);
    expect(result.city.focus).toBe('food');
    expect(result.city.workedTiles).toEqual([]);
  });

  it('auto-places a newly completed Barracks into an unlocked building grid slot', () => {
    const map = generateMap(30, 30, 'auto-place-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const queued = { ...city, productionQueue: ['barracks'], productionProgress: 9 };

    const result = processCity(queued, map, 0, 1);

    expect(result.completedBuilding).toBe('barracks');
    expect(result.city.buildings).toEqual(['barracks']);
    expect(result.city.grid.flat()).toContain('barracks');
    expect(getUnplacedBuildings(result.city)).not.toContain('barracks');
  });

  it('keeps completed buildings unplaced when every unlocked slot is full', () => {
    const map = generateMap(30, 30, 'unplaced-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
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
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
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
    const city = foundCity('p1', landTile.coord, map, mkC());
    const idle = { ...city, idleProduction: 'gold' as const, productionQueue: [] };

    const result = processCity(idle, map, 0, 8);

    expect(result.idleGoldBonus).toBe(8);
    expect(result.idleScienceBonus).toBe(0);
    expect(result.city.productionProgress).toBe(0);
  });

  it('converts production to science when queue is empty at turn start and idleProduction is science', () => {
    const map = generateMap(30, 30, 'idle-science');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const idle = { ...city, idleProduction: 'science' as const, productionQueue: [] };

    const result = processCity(idle, map, 0, 5);

    expect(result.idleScienceBonus).toBe(5);
    expect(result.idleGoldBonus).toBe(0);
    expect(result.city.productionProgress).toBe(0);
  });

  it('does not produce idle bonus when queue is non-empty even if idleProduction is set', () => {
    const map = generateMap(30, 30, 'idle-ignored');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
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
    const city = foundCity('p1', landTile.coord, map, mkC());
    const completing = { ...city, idleProduction: 'gold' as const, productionQueue: ['workshop'], productionProgress: 7 };

    const result = processCity(completing, map, 0, 5);

    expect(result.completedBuilding).toBe('workshop');
    expect(result.idleGoldBonus).toBe(0);
    expect(result.idleScienceBonus).toBe(0);
  });

  it('completes Herbalist at the retuned opening cost', () => {
    const map = generateMap(30, 30, 'herbalist-opening-cost');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const queued = { ...city, productionQueue: ['herbalist'], productionProgress: 12 };

    const result = processCity(queued, map, 0, 4, undefined, [], undefined, 1);

    expect(result.completedBuilding).toBe('herbalist');
    expect(result.city.buildings).toContain('herbalist');
    expect(result.city.productionQueue).toEqual([]);
  });

  it('uses the current era cost when completing a Settler', () => {
    const map = generateMap(30, 30, 'settler-era-cost');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
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

describe('getSettlerProductionCost', () => {
  it('uses cheaper early-game Settler costs for eras 1 and 2', () => {
    expect(getSettlerProductionCost(1)).toBe(16);
    expect(getSettlerProductionCost(2)).toBe(24);
    expect(getSettlerProductionCost(3)).toBe(40);
  });
});

describe('completeCityProductionItem', () => {
  it('uses the same completion path for direct building completion as turn production', () => {
    const map = generateMap(30, 30, 'direct-building-completion');
    const city = {
      ...foundCity('p1', { q: 10, r: 10 }, map, mkC()),
      productionQueue: ['workshop', 'warrior'],
      productionProgress: 4,
    };

    const result = completeCityProductionItem(city, 'workshop');

    expect(result.completedBuilding).toBe('workshop');
    expect(result.completedUnit).toBeNull();
    expect(result.city.productionQueue).toEqual(['warrior']);
    expect(result.city.productionProgress).toBe(0);
    expect(result.city.buildings).toContain('workshop');
    expect(result.city.grid.flat()).toContain('workshop');
  });

  it('uses the same completion path for direct unit completion as turn production', () => {
    const map = generateMap(30, 30, 'direct-unit-completion');
    const city = {
      ...foundCity('p1', { q: 10, r: 10 }, map, mkC()),
      productionQueue: ['warrior', 'workshop'],
      productionProgress: 4,
    };

    const result = completeCityProductionItem(city, 'warrior');

    expect(result.completedBuilding).toBeNull();
    expect(result.completedUnit).toBe('warrior');
    expect(result.city.productionQueue).toEqual(['workshop']);
    expect(result.city.productionProgress).toBe(0);
    expect(result.city.buildings).toEqual([]);
  });

  it('does not complete an item that is not the active production item', () => {
    const map = generateMap(30, 30, 'direct-completion-active-only');
    const city = {
      ...foundCity('p1', { q: 10, r: 10 }, map, mkC()),
      productionQueue: ['warrior', 'workshop'],
      productionProgress: 4,
    };

    const result = completeCityProductionItem(city, 'workshop');

    expect(result.completedBuilding).toBeNull();
    expect(result.completedUnit).toBeNull();
    expect(result.city.productionQueue).toEqual(['warrior', 'workshop']);
    expect(result.city.buildings).toEqual([]);
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
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const available = getAvailableBuildings(city, [], map.tiles);
    for (const b of available) {
      expect(b.techRequired).toBeNull();
    }
  });
});

describe('city grid', () => {
  it('foundCity initializes city-sim fields and a 7x7-compatible grid', () => {
    const map = generateMap(30, 30, 'grid-test');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
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
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    expect(city.grid[3][3]).toBe('city-center');
  });
});

describe('grid expansion', () => {
  it('does not expand grid size from population alone', () => {
    const map = generateMap(30, 30, 'expand-test');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    city.population = 12;
    expect(checkGridExpansion(city)).toBe(false);
    expect(city.gridSize).toBe(3);
  });

  it('keeps mature grid size unchanged when checked', () => {
    const map = generateMap(30, 30, 'expand-test-2');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    city.gridSize = 5;
    expect(checkGridExpansion(city)).toBe(false);
    expect(city.gridSize).toBe(5);
  });

  it('purchase grid expansion cannot bypass city maturity', () => {
    const map = generateMap(30, 30, 'buy-test');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const cost = purchaseGridExpansion(city, 60);
    expect(cost).toBe(0);
    expect(city.gridSize).toBe(3);
  });

  it('purchase fails with insufficient gold', () => {
    const map = generateMap(30, 30, 'buy-test-2');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const cost = purchaseGridExpansion(city, 30);
    expect(cost).toBe(0);
    expect(city.gridSize).toBe(3);
  });
});

describe('placeBuilding', () => {
  const mkCity = (): City => ({
    id: 'test',
    name: 'Test',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 10,
    productionProgress: 0,
    productionQueue: [],
    buildings: ['granary'],
    workedTiles: [],
    ownedTiles: [],
    grid: createEmptyCityGrid(),
    gridSize: 3,
    focus: 'balanced' as const,
    maturity: 'outpost' as const,
    idleProduction: null,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  });

  it('places a building in the specified slot', () => {
    const city = mkCity();
    const result = placeBuilding(city, 'granary', 3, 4);
    expect(result.grid[3][4]).toBe('granary');
  });

  it('returns city unchanged when slot is occupied', () => {
    const city = mkCity();
    city.grid[3][4] = 'workshop';
    const result = placeBuilding(city, 'granary', 3, 4);
    expect(result.grid[3][4]).toBe('workshop');
  });

  it('returns city unchanged when building is not in the unplaced list', () => {
    const city = mkCity();
    city.grid[3][4] = 'granary';
    const result = placeBuilding(city, 'granary', 3, 5);
    expect(result.grid[3][5]).toBeNull();
  });

  it('returns city unchanged when slot is out of unlocked range', () => {
    const city = mkCity(); // gridSize: 3 — outer rows/cols are locked
    const result = placeBuilding(city, 'granary', 0, 0); // top-left corner, locked
    expect(result.grid[0][0]).toBeNull();
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

describe('legendary wonder production metadata', () => {
  it('uses legendary wonder definitions for queued production cost and display', () => {
    expect(getCatalogProductionCost('legendary:oracle-of-delphi')).toBe(120);
    expect(getProductionDisplayName('legendary:oracle-of-delphi')).toBe('Oracle of Delphi');
    expect(getProductionIconForItem('legendary:oracle-of-delphi')).toBe('*');
  });

  it('uses a safe fallback for unknown legendary queue ids', () => {
    expect(getCatalogProductionCost('legendary:missing-wonder')).toBe(0);
    expect(getProductionDisplayName('legendary:missing-wonder')).toBe('Unknown Legendary Wonder');
    expect(getProductionIconForItem('legendary:missing-wonder')).toBe('*');
  });
});

describe('getTrainableUnitsForCiv — resource gate', () => {
  it('returns all tech-met units when availableResources is undefined (backward-compat)', () => {
    const units = getTrainableUnitsForCiv(['stone-weapons'], undefined, undefined);
    // axeman requires stone-weapons + copper; with no resource filter it should appear
    expect(units.some(u => u.type === 'axeman')).toBe(true);
  });

  it('excludes resource-gated unit when resource is missing', () => {
    const units = getTrainableUnitsForCiv(['stone-weapons'], undefined, new Set<ResourceType>());
    expect(units.some(u => u.type === 'axeman')).toBe(false);
  });

  it('includes resource-gated unit when resource is present', () => {
    const units = getTrainableUnitsForCiv(['stone-weapons'], undefined, new Set<ResourceType>(['copper']));
    expect(units.some(u => u.type === 'axeman')).toBe(true);
  });

  it('excludes cavalry when horses present but iron missing (conjunctive check)', () => {
    const units = getTrainableUnitsForCiv(
      ['horseback-riding'],
      undefined,
      new Set<ResourceType>(['horses']),
    );
    expect(units.some(u => u.type === 'cavalry')).toBe(false);
  });

  it('excludes cavalry when iron present but horses missing', () => {
    const units = getTrainableUnitsForCiv(
      ['horseback-riding'],
      undefined,
      new Set<ResourceType>(['iron']),
    );
    expect(units.some(u => u.type === 'cavalry')).toBe(false);
  });

  it('includes cavalry when both horses and iron are present', () => {
    const units = getTrainableUnitsForCiv(
      ['horseback-riding'],
      undefined,
      new Set<ResourceType>(['horses', 'iron']),
    );
    expect(units.some(u => u.type === 'cavalry')).toBe(true);
  });

  it('includes ungated unit (spearman) even with empty resource set', () => {
    const units = getTrainableUnitsForCiv(['bronze-working'], undefined, new Set<ResourceType>());
    expect(units.some(u => u.type === 'spearman')).toBe(true);
  });

  it('includes warrior (always ungated) with empty resource set', () => {
    const units = getTrainableUnitsForCiv([], undefined, new Set<ResourceType>());
    expect(units.some(u => u.type === 'warrior')).toBe(true);
  });
});

describe('getAvailableBuildings — resource gate', () => {
  it('returns all tech-met buildings when availableResources is undefined (backward-compat)', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['stone-weapons'], map.tiles, undefined);
    // bronze-workshop requires stone-weapons + copper; no filter → should appear
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(true);
  });

  it('excludes resource-gated building when resource is missing', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['stone-weapons'], map.tiles, new Set<ResourceType>());
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(false);
  });

  it('includes resource-gated building when tech and resource are both present', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['stone-weapons'], map.tiles, new Set<ResourceType>(['copper']));
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(true);
  });

  it('excludes resource-gated building when tech is missing regardless of resource', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, [], map.tiles, new Set<ResourceType>(['copper']));
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(false);
  });
});

describe('S4b — new unit entries', () => {
  it('guard: warrior always available with no tech and no resources', () => {
    const units = getTrainableUnitsForCiv([], undefined, new Set<ResourceType>());
    expect(units.some(u => u.type === 'warrior')).toBe(true);
  });

  it('guard: spearman available with bronze-working and no resources (ungated era-2 melee)', () => {
    const units = getTrainableUnitsForCiv(['bronze-working'], undefined, new Set<ResourceType>());
    expect(units.some(u => u.type === 'spearman')).toBe(true);
  });

  it('axeman: trainable with stone-weapons + copper', () => {
    const units = getTrainableUnitsForCiv(['stone-weapons'], undefined, new Set<ResourceType>(['copper']));
    expect(units.some(u => u.type === 'axeman')).toBe(true);
  });

  it('axeman: blocked without copper', () => {
    const units = getTrainableUnitsForCiv(['stone-weapons'], undefined, new Set<ResourceType>());
    expect(units.some(u => u.type === 'axeman')).toBe(false);
  });

  it('horseman: trainable with horseback-riding + horses', () => {
    const units = getTrainableUnitsForCiv(['horseback-riding'], undefined, new Set<ResourceType>(['horses']));
    expect(units.some(u => u.type === 'horseman')).toBe(true);
  });

  it('knight: trainable with iron-forging + horses + iron', () => {
    const units = getTrainableUnitsForCiv(['iron-forging'], undefined, new Set<ResourceType>(['horses', 'iron']));
    expect(units.some(u => u.type === 'knight')).toBe(true);
  });

  it('knight: blocked when iron is missing', () => {
    const units = getTrainableUnitsForCiv(['iron-forging'], undefined, new Set<ResourceType>(['horses']));
    expect(units.some(u => u.type === 'knight')).toBe(false);
  });

  it('crossbowman: trainable with tactics + copper', () => {
    const units = getTrainableUnitsForCiv(['tactics'], undefined, new Set<ResourceType>(['copper']));
    expect(units.some(u => u.type === 'crossbowman')).toBe(true);
  });

  it('catapult: trainable with siege-warfare + stone', () => {
    const units = getTrainableUnitsForCiv(['siege-warfare'], undefined, new Set<ResourceType>(['stone']));
    expect(units.some(u => u.type === 'catapult')).toBe(true);
  });

  it('ballista: trainable with siege-warfare + iron', () => {
    const units = getTrainableUnitsForCiv(['siege-warfare'], undefined, new Set<ResourceType>(['iron']));
    expect(units.some(u => u.type === 'ballista')).toBe(true);
  });

  it('swordsman: requires iron in addition to bronze-working', () => {
    const withIron = getTrainableUnitsForCiv(['bronze-working'], undefined, new Set<ResourceType>(['iron']));
    const withoutIron = getTrainableUnitsForCiv(['bronze-working'], undefined, new Set<ResourceType>());
    expect(withIron.some(u => u.type === 'swordsman')).toBe(true);
    expect(withoutIron.some(u => u.type === 'swordsman')).toBe(false);
  });

  it('horseman has no obsoletedByTech (cavalry dead-end guard)', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'horseman');
    expect(entry?.obsoletedByTech).toBeUndefined();
  });

  it('cavalry has no obsoletedByTech (cavalry dead-end guard)', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'cavalry');
    expect(entry?.obsoletedByTech).toBeUndefined();
  });
});

describe('S4b — unit definitions completeness', () => {
  const NEW_UNITS: UnitType[] = ['axeman', 'spearman', 'horseman', 'cavalry', 'knight', 'crossbowman', 'catapult', 'ballista'];

  for (const type of NEW_UNITS) {
    it(`UNIT_DEFINITIONS has entry for ${type}`, () => {
      expect(UNIT_DEFINITIONS[type]).toBeDefined();
      expect(UNIT_DEFINITIONS[type].strength).toBeGreaterThan(0);
      expect(UNIT_DEFINITIONS[type].movementPoints).toBeGreaterThan(0);
    });

    it(`UNIT_DESCRIPTIONS has entry for ${type}`, () => {
      expect(UNIT_DESCRIPTIONS[type]).toBeDefined();
      expect(UNIT_DESCRIPTIONS[type].length).toBeGreaterThan(0);
    });
  }
});

describe('S4b — new buildings', () => {
  const NEW_BUILDING_IDS = [
    'bronze-workshop', 'armory', 'ranch', 'cavalry-academy',
    'iron-foundry', 'war-academy', 'masonry-works', 'siege-workshop',
  ];

  for (const id of NEW_BUILDING_IDS) {
    it(`BUILDINGS['${id}'] exists and has required fields`, () => {
      expect(BUILDINGS[id]).toBeDefined();
      expect(BUILDINGS[id].id).toBe(id);
      expect(BUILDINGS[id].name.length).toBeGreaterThan(0);
      expect(BUILDINGS[id].productionCost).toBeGreaterThan(0);
      expect(BUILDINGS[id].resourceRequired?.length).toBeGreaterThan(0);
    });

    it(`PRODUCTION_ICONS has entry for building '${id}'`, () => {
      expect(PRODUCTION_ICONS[id]).toBeDefined();
    });
  }

  const NEW_UNIT_TYPES = ['axeman', 'spearman', 'horseman', 'cavalry', 'knight', 'crossbowman', 'catapult', 'ballista'];
  for (const type of NEW_UNIT_TYPES) {
    it(`PRODUCTION_ICONS has entry for unit '${type}'`, () => {
      expect(PRODUCTION_ICONS[type]).toBeDefined();
    });
  }

  it('bronze-workshop: blocked without copper even with stone-weapons tech', () => {
    const map = generateMap(30, 30, 'bldg-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['stone-weapons'], map.tiles, new Set<ResourceType>());
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(false);
  });

  it('iron-foundry: available with iron-forging tech + iron resource', () => {
    const map = generateMap(30, 30, 'bldg-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['iron-forging'], map.tiles, new Set<ResourceType>(['iron']));
    expect(available.some(b => b.id === 'iron-foundry')).toBe(true);
  });
});

describe('S4b — building production discounts', () => {
  const noBuildings = { buildings: [] };

  it('armory: reduces axeman cost by 15%', () => {
    const base = getProductionCostForItem('axeman', { city: noBuildings });
    const discounted = getProductionCostForItem('axeman', { city: { buildings: ['armory'] } });
    expect(discounted).toBe(Math.ceil(base * 0.85));
  });

  it('war-academy: reduces swordsman cost by 15%', () => {
    const base = getProductionCostForItem('swordsman', { city: noBuildings });
    const discounted = getProductionCostForItem('swordsman', { city: { buildings: ['war-academy'] } });
    expect(discounted).toBe(Math.ceil(base * 0.85));
  });

  it('cavalry-academy: reduces horseman cost by 15%', () => {
    const base = getProductionCostForItem('horseman', { city: noBuildings });
    const discounted = getProductionCostForItem('horseman', { city: { buildings: ['cavalry-academy'] } });
    expect(discounted).toBe(Math.ceil(base * 0.85));
  });

  it('siege-workshop: reduces catapult cost by 20%', () => {
    const base = getProductionCostForItem('catapult', { city: noBuildings });
    const discounted = getProductionCostForItem('catapult', { city: { buildings: ['siege-workshop'] } });
    expect(discounted).toBe(Math.ceil(base * 0.80));
  });

  it('armory + war-academy: non-stacking — applies 15% not 30% to warrior', () => {
    const base = getProductionCostForItem('warrior', { city: noBuildings });
    const bothBuildings = getProductionCostForItem('warrior', { city: { buildings: ['armory', 'war-academy'] } });
    const singleDiscount = Math.ceil(base * 0.85);
    expect(bothBuildings).toBe(singleDiscount);
    expect(bothBuildings).toBeGreaterThan(Math.ceil(base * 0.70));
  });

  it('cavalry-academy: does not discount siege units (catapult)', () => {
    const base = getProductionCostForItem('catapult', { city: noBuildings });
    const withCavalry = getProductionCostForItem('catapult', { city: { buildings: ['cavalry-academy'] } });
    expect(withCavalry).toBe(base);
  });

  it('masonry-works: walls building costs 20% less', () => {
    const base = getProductionCostForItem('walls', { city: noBuildings });
    const withMasonry = getProductionCostForItem('walls', { city: { buildings: ['masonry-works'] } });
    expect(withMasonry).toBe(Math.ceil(base * 0.80));
    expect(withMasonry).toBeLessThan(base);
  });

  it('masonry-works: does not discount non-walls items (warrior unchanged)', () => {
    const base = getProductionCostForItem('warrior', { city: noBuildings });
    const withMasonry = getProductionCostForItem('warrior', { city: { buildings: ['masonry-works'] } });
    expect(withMasonry).toBe(base);
  });

  it('no discount when city has no military buildings', () => {
    const base = getProductionCostForItem('warrior', { city: noBuildings });
    const withGranary = getProductionCostForItem('warrior', { city: { buildings: ['granary'] } });
    expect(withGranary).toBe(base);
  });
});

describe('processCity — resource dequeue', () => {
  const mkMap2 = () => generateMap(10, 10, 'dequeue-test');
  const mkBaseCity2 = (map: ReturnType<typeof mkMap2>): City => {
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    return foundCity('p1', tile.coord, map, mkC());
  };

  it('dequeues resource-blocked unit when resource is removed', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['axeman'], productionProgress: 5 };
    const result = processCity(city, map, 2, 3, undefined, ['stone-weapons'], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).not.toContain('axeman');
    expect(result.city.productionProgress).toBe(0);
  });

  it('keeps unit in queue when resource is present', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['axeman'], productionProgress: 5 };
    const result = processCity(city, map, 2, 3, undefined, ['stone-weapons'], undefined, 1, new Set<ResourceType>(['copper']));
    expect(result.city.productionQueue).toContain('axeman');
  });

  it('dequeues resource-blocked building when resource is removed', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['bronze-workshop'], productionProgress: 5 };
    const result = processCity(city, map, 2, 3, undefined, ['stone-weapons'], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).not.toContain('bronze-workshop');
    expect(result.city.productionProgress).toBe(0);
  });

  it('keeps ungated building (granary) in queue even with empty resources', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['granary'], productionProgress: 5 };
    const result = processCity(city, map, 2, 3, undefined, [], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).toContain('granary');
  });

  it('tech-drop dequeue regression: still drops unit when tech is lost', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['swordsman'], productionProgress: 5 };
    const result = processCity(city, map, 2, 3, undefined, [], undefined, 1, new Set<ResourceType>(['iron']));
    expect(result.city.productionQueue).not.toContain('swordsman');
  });
});
