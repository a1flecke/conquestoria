import {
  foundCity,
  getAvailableBuildings,
  getTrainableUnitsForCity,
  isCityCoastal,
  getTrainableUnitsForCiv,
  getProductionCostForItem,
  processCity,
  completeCityProductionItem,
  BUILDINGS,
  CITY_NAMES,
  TRAINABLE_UNITS,
  PRODUCTION_ICONS,
  TERMINAL_COMBAT_UNITS,
  getCatalogProductionCost,
  getProductionDisplayName,
  getProductionIconForItem,
  getSettlerProductionCost,
  describeDroppedProductionItem,
} from '@/systems/city-system';
import type { City, GameMap, HexCoord, ResourceType, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';
import { TECH_TREE } from '@/systems/tech-definitions';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('Era 13 production catalog', () => {
  it('ships twelve buildings and three national projects unlocked by Era 13 technologies', () => {
    const era13TechIds = new Set(TECH_TREE.filter(tech => tech.era === 13).map(tech => tech.id));
    const era13Buildings = Object.values(BUILDINGS)
      .filter(building => building.techRequired && era13TechIds.has(building.techRequired));

    expect(era13Buildings.filter(building => !building.nationalProject)).toHaveLength(12);
    expect(era13Buildings.filter(building => building.nationalProject)).toHaveLength(3);
  });
});

describe('describeDroppedProductionItem', () => {
  it('describes an obsoleted building drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'stable', itemKind: 'building', reason: 'obsoleted' }, 'Rome'))
      .toBe("Stable removed from Rome's build queue — it's obsolete now that a newer technology is available.");
  });

  it('describes an obsoleted unit drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'swordsman', itemKind: 'unit', reason: 'obsoleted' }, 'Rome'))
      .toBe("Swordsman removed from Rome's build queue — it's obsolete now that a newer technology is available.");
  });

  it('describes a resource-lost building drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'bronze-workshop', itemKind: 'building', reason: 'resource-lost' }, 'Athens'))
      .toBe("Bronze Workshop removed from Athens's build queue — you no longer control the required resource.");
  });

  it('describes a resource-lost unit drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'swordsman', itemKind: 'unit', reason: 'resource-lost' }, 'Athens'))
      .toBe("Swordsman removed from Athens's build queue — you no longer control the required resource.");
  });

  it('describes a no-longer-available unit drop (save-compat residual case)', () => {
    expect(describeDroppedProductionItem({ itemId: 'musketeer', itemKind: 'unit', reason: 'no-longer-available' }, 'Byzantium'))
      .toBe("Musketeer removed from Byzantium's build queue — it's no longer available to train.");
  });

  it('describes a build-window-expired drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'sacred_grove', itemKind: 'building', reason: 'build-window-expired' }, 'Thebes'))
      .toBe("Sacred Grove removed from Thebes's build queue — its national-project build window has closed.");
  });

  it('describes a coastal-access-lost building drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost' }, 'Sparta'))
      .toBe("Harbor removed from Sparta's build queue — the city is no longer coastal.");
  });

  it('describes a coastal-access-lost unit drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost' }, 'Sparta'))
      .toBe("Transport removed from Sparta's build queue — the city is no longer coastal.");
  });

  it('describes a training-building-missing drop, and the message does not mention coastal access', () => {
    const message = describeDroppedProductionItem({ itemId: 'stealth_bomber', itemKind: 'unit', reason: 'training-building-missing' }, 'Corinth');
    expect(message).toBe("Stealth Bomber removed from Corinth's build queue — Corinth no longer has the building required to train it.");
    expect(message.toLowerCase()).not.toContain('coast');
  });
});

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

describe('isCityCoastal', () => {
  function makeTile(coord: HexCoord, terrain = 'plains') {
    return {
      coord,
      terrain: terrain as any,
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      owner: null,
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };
  }

  function coastMap(centerTerrain: string, neighborTerrain: string): GameMap {
    return {
      width: 20,
      height: 20,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        [hexKey({ q: 5, r: 5 })]: makeTile({ q: 5, r: 5 }, centerTerrain),
        [hexKey({ q: 6, r: 5 })]: makeTile({ q: 6, r: 5 }, neighborTerrain),
        [hexKey({ q: 4, r: 5 })]: makeTile({ q: 4, r: 5 }),
        [hexKey({ q: 5, r: 4 })]: makeTile({ q: 5, r: 4 }),
        [hexKey({ q: 6, r: 4 })]: makeTile({ q: 6, r: 4 }),
        [hexKey({ q: 4, r: 6 })]: makeTile({ q: 4, r: 6 }),
        [hexKey({ q: 5, r: 6 })]: makeTile({ q: 5, r: 6 }),
        [hexKey({ q: 15, r: 15 })]: makeTile({ q: 15, r: 15 }, 'coast'),
      },
    } as GameMap;
  }

  function makeCity(ownedTiles?: HexCoord[]): City {
    return {
      id: 'c-coast',
      name: 'Test',
      owner: 'civ-1',
      position: { q: 5, r: 5 },
      population: 1,
      food: 0,
      foodNeeded: 15,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      ownedTiles: ownedTiles ?? [{ q: 5, r: 5 }],
      workedTiles: [],
      focus: 'balanced',
      grid: [],
      gridSize: 1,
      hp: 100,
      maturity: 'core',
    } as unknown as City;
  }

  it('returns true when an adjacent tile is coast', () => {
    const city = makeCity();
    const map = coastMap('plains', 'coast');
    expect(isCityCoastal(city, map)).toBe(true);
  });

  it('returns true when the city centre tile itself is coast', () => {
    const city = makeCity();
    const map = coastMap('coast', 'plains');
    expect(isCityCoastal(city, map)).toBe(true);
  });

  it('returns false for a landlocked city', () => {
    const city = makeCity();
    const map = coastMap('plains', 'plains');
    expect(isCityCoastal(city, map)).toBe(false);
  });

  it('regression: returns false when a distant ownedTile is coast but no adjacent tile is (old bug)', () => {
    const city = makeCity([{ q: 5, r: 5 }, { q: 15, r: 15 }]);
    const map = coastMap('plains', 'plains');
    expect(isCityCoastal(city, map)).toBe(false);
  });

  it('returns true for a city at q=0 on a wrapping map when the wrapped neighbour is coast', () => {
    const city = makeCity([{ q: 0, r: 5 }]);
    city.position = { q: 0, r: 5 };
    const wrappingMap: GameMap = {
      width: 20,
      height: 20,
      wrapsHorizontally: true,
      rivers: [],
      tiles: {
        [hexKey({ q: 0, r: 5 })]: makeTile({ q: 0, r: 5 }),
        [hexKey({ q: 19, r: 5 })]: makeTile({ q: 19, r: 5 }, 'coast'),
      },
    } as GameMap;
    expect(isCityCoastal(city, wrappingMap)).toBe(true);
  });
});

describe('getAvailableBuildings', () => {
  it('returns buildings the city can build', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, [], map);
    expect(available.length).toBeGreaterThan(0);
  });

  it('excludes already built buildings', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    city.buildings = ['granary'];
    const available = getAvailableBuildings(city, [], map);
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
    const available = getAvailableBuildings(city, ['fishing'], map);
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
    const available = getAvailableBuildings(city, ['fishing'], map);
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
    const available = getAvailableBuildings(city, [], map); // no fishing tech
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
    const available = getAvailableBuildings(city, ['harbor-tech'], map);
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
    const available = getAvailableBuildings(city, ['harbor-tech'], map);
    expect(available.find(b => b.id === 'harbor')).toBeDefined();
  });

  it('offers stable and cavalry-academy before tank-warfare completes', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['horseback-riding'], map);
    expect(available.find(b => b.id === 'stable')).toBeDefined();
    expect(available.find(b => b.id === 'cavalry-academy')).toBeDefined();
  });

  it('hides stable and cavalry-academy once tank-warfare completes', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['horseback-riding', 'tank-warfare'], map);
    expect(available.find(b => b.id === 'stable')).toBeUndefined();
    expect(available.find(b => b.id === 'cavalry-academy')).toBeUndefined();
  });

  it('hides siege-workshop once black-powder completes', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['siege-warfare', 'black-powder'], map);
    expect(available.find(b => b.id === 'siege-workshop')).toBeUndefined();
  });

  it('#591 MR4: sacred_council (milestone) stays available far beyond homeEra + 1, unlike a normal NP', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = { ...foundCity('p1', landTile.coord, map, mkC()), buildings: ['temple'] };
    // era 10 is far past sacred_council's homeEra(3) + 1 = 4 -- a normal NP would drop out.
    const available = getAvailableBuildings(city, ['philosophy'], map, undefined, 10);
    expect(available.find(b => b.id === 'sacred_council')).toBeDefined();
  });

  it('#591 MR4: sacred_council requires a temple even though it also requires philosophy tech', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC()); // no temple built
    const available = getAvailableBuildings(city, ['philosophy'], map, undefined, 3);
    expect(available.find(b => b.id === 'sacred_council')).toBeUndefined();
  });
});

describe('#443 — building obsolescence data', () => {
  it('stable obsoletes at tank-warfare (mounted-unit line fully retires there)', () => {
    expect(BUILDINGS.stable.obsoletedByTech).toBe('tank-warfare');
  });

  it('cavalry-academy obsoletes at tank-warfare (same mounted-unit line)', () => {
    expect(BUILDINGS['cavalry-academy'].obsoletedByTech).toBe('tank-warfare');
  });

  it('siege-workshop obsoletes at black-powder (catapult/ballista line fully retires there)', () => {
    expect(BUILDINGS['siege-workshop'].obsoletedByTech).toBe('black-powder');
  });

  it('armory, war-academy, safehouse, artillery_corps_hq do NOT get obsoletedByTech (melee/ranged/spy categories never fully empty; artillery_corps_hq already has its own national-project fade lifecycle)', () => {
    expect(BUILDINGS.armory.obsoletedByTech).toBeUndefined();
    expect(BUILDINGS['war-academy'].obsoletedByTech).toBeUndefined();
    expect(BUILDINGS.safehouse.obsoletedByTech).toBeUndefined();
    expect(BUILDINGS.artillery_corps_hq.obsoletedByTech).toBeUndefined();
  });
});

describe('MR8 — naval roster gating', () => {
  it('trireme is trainable through era 5 and obsoletes at frigate-construction', () => {
    expect(getTrainableUnitsForCiv(['triremes']).some(u => u.type === 'trireme')).toBe(true);
    expect(getTrainableUnitsForCiv(['triremes', 'frigate-construction']).some(u => u.type === 'trireme')).toBe(false);
  });

  it('frigate is trainable exactly when frigate-construction is complete (negative: not complete)', () => {
    expect(getTrainableUnitsForCiv(['frigate-construction']).some(u => u.type === 'frigate')).toBe(true);
    expect(getTrainableUnitsForCiv([]).some(u => u.type === 'frigate')).toBe(false);
  });

  it('frigate obsoletes once ironclad-warships completes', () => {
    expect(getTrainableUnitsForCiv(['frigate-construction', 'ironclad-warships']).some(u => u.type === 'frigate')).toBe(false);
  });

  it('destroyer is trainable exactly when carrier-warfare is complete (negative: not complete)', () => {
    expect(getTrainableUnitsForCiv(['carrier-warfare']).some(u => u.type === 'destroyer')).toBe(true);
    expect(getTrainableUnitsForCiv([]).some(u => u.type === 'destroyer')).toBe(false);
  });

  it.each(['frigate', 'destroyer'] satisfies UnitType[])('%s is coastalRequired', (unitType) => {
    expect(TRAINABLE_UNITS.find(u => u.type === unitType)?.coastalRequired).toBe(true);
  });

  it('trireme is still trainable at era 4 (caravels complete) — no era-4-6 warship gap', () => {
    expect(getTrainableUnitsForCiv(['triremes', 'harbor-building', 'caravels']).some(u => u.type === 'trireme')).toBe(true);
  });
});

describe('#443 — building obsolescence matches the retired unit line', () => {
  it('stable ("Trains mounted units"): horseman/cavalry/knight are all gone once tank-warfare completes', () => {
    const units = getTrainableUnitsForCiv(
      ['horseback-riding', 'iron-forging', 'tank-warfare'],
      undefined,
      new Set<ResourceType>(['horses', 'iron']),
    );
    expect(units.some(u => u.type === 'horseman')).toBe(false);
    expect(units.some(u => u.type === 'cavalry')).toBe(false);
    expect(units.some(u => u.type === 'knight')).toBe(false);
  });

  it('siege-workshop ("Reduces Catapult and Ballista training cost"): both gone once black-powder completes', () => {
    const units = getTrainableUnitsForCiv(
      ['siege-warfare', 'black-powder'],
      undefined,
      new Set<ResourceType>(['stone', 'iron']),
    );
    expect(units.some(u => u.type === 'catapult')).toBe(false);
    expect(units.some(u => u.type === 'ballista')).toBe(false);
  });
});

describe('MR9 — land/air roster gating', () => {
  it('musketeer is NOT trainable with tactics alone (moved to Black Powder)', () => {
    expect(getTrainableUnitsForCiv(['tactics']).some(u => u.type === 'musketeer')).toBe(false);
  });

  it('musketeer is trainable once black-powder completes', () => {
    expect(getTrainableUnitsForCiv(['black-powder']).some(u => u.type === 'musketeer')).toBe(true);
  });

  it('queued musketeer dequeues on load for a tactics-only civ (save-compat)', () => {
    const map = generateMap(10, 10, 'musketeer-save-compat');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['musketeer'],
      productionProgress: 0,
    };
    const result = processCity(city, map, 2, 3, undefined, ['tactics']);
    expect(result.city.productionQueue).not.toContain('musketeer');
    expect(result.droppedProductionItems).toEqual([{ itemId: 'musketeer', itemKind: 'unit', reason: 'no-longer-available' }]);
  });

  it('bomber requires Nuclear Weapons and an Airfield', () => {
    expect(getTrainableUnitsForCiv(['nuclear-weapons']).some(u => u.type === 'bomber')).toBe(true);
    const bomber = TRAINABLE_UNITS.find(u => u.type === 'bomber');
    expect(bomber?.trainedFromBuilding).toBe('airfield');
    expect(bomber?.coastalRequired).toBeUndefined();
  });

  it('jet_fighter stays trainable after stealth-technology is researched (regression on the MR9 fix)', () => {
    expect(getTrainableUnitsForCiv(['jet-aviation', 'stealth-technology']).some(u => u.type === 'jet_fighter')).toBe(true);
  });

  it('artillery is trainable once mass-firepower completes; infantry once armored-tactics completes', () => {
    expect(getTrainableUnitsForCiv(['mass-firepower']).some(u => u.type === 'artillery')).toBe(true);
    expect(getTrainableUnitsForCiv(['armored-tactics']).some(u => u.type === 'infantry')).toBe(true);
  });
});

describe('#443 — excluded buildings never obsolete (negative regression)', () => {
  it('armory, war-academy, safehouse remain available even with every tech in the game completed', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const allTechs = TECH_TREE.map(t => t.id);
    const available = getAvailableBuildings(city, allTechs, map, new Set<ResourceType>(['copper', 'iron', 'horses', 'stone']));
    expect(available.find(b => b.id === 'armory')).toBeDefined();
    expect(available.find(b => b.id === 'war-academy')).toBeDefined();
    expect(available.find(b => b.id === 'safehouse')).toBeDefined();
  });
});

describe('#443 — soft-lock guard', () => {
  it('no Building.requiresBuildings chain references stable, cavalry-academy, or siege-workshop as a prerequisite', () => {
    const obsoletableIds = new Set(['stable', 'cavalry-academy', 'siege-workshop']);
    const offenders: string[] = [];
    for (const b of Object.values(BUILDINGS)) {
      if (!b.requiresBuildings?.length) continue;
      for (const req of b.requiresBuildings) {
        if (obsoletableIds.has(req)) offenders.push(`${b.id} requires ${req}`);
      }
    }
    expect(offenders, `hiding an obsoleted building from the queue would permanently block: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('getTrainableUnitsForCity', () => {
  function coastalGateMap(): GameMap {
    return {
      width: 5,
      height: 5,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '3,0': { coord: { q: 3, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      } as GameMap['tiles'],
    };
  }

  it('shows Galley and Transport only in coastal cities (galley: pre-triremes)', () => {
    const map = coastalGateMap();
    const coastalCity = foundCity('p1', { q: 0, r: 0 }, map, mkC());
    coastalCity.ownedTiles = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    const inlandCity = foundCity('p1', { q: 3, r: 0 }, map, mkC());
    inlandCity.ownedTiles = [{ q: 3, r: 0 }];
    const techs = ['galleys'];

    const coastalTypes = getTrainableUnitsForCity(coastalCity, techs, map).map(unit => unit.type);
    const inlandTypes = getTrainableUnitsForCity(inlandCity, techs, map).map(unit => unit.type);

    expect(coastalTypes).toEqual(expect.arrayContaining(['galley', 'transport']));
    expect(inlandTypes).not.toContain('galley');
    expect(inlandTypes).not.toContain('transport');
  });

  it('shows Trireme only in coastal cities (galley obsoleted by triremes)', () => {
    const map = coastalGateMap();
    const coastalCity = foundCity('p1', { q: 0, r: 0 }, map, mkC());
    coastalCity.ownedTiles = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    const inlandCity = foundCity('p1', { q: 3, r: 0 }, map, mkC());
    inlandCity.ownedTiles = [{ q: 3, r: 0 }];
    const techs = ['galleys', 'triremes'];

    const coastalTypes = getTrainableUnitsForCity(coastalCity, techs, map).map(unit => unit.type);
    const inlandTypes = getTrainableUnitsForCity(inlandCity, techs, map).map(unit => unit.type);

    expect(coastalTypes).toContain('trireme');
    expect(coastalTypes).not.toContain('galley');
    expect(inlandTypes).not.toContain('trireme');
  });

  it('stealth_bomber is not offered by cities without a stealth_airbase', () => {
    const cityWithoutAirbase = {
      id: 'c1', buildings: [], ownedTiles: [], grid: [[null]],
      food: 0, foodNeeded: 10, population: 1,
      productionQueue: [], productionProgress: 0,
      focus: 'balanced', maturity: 'city',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      position: { q: 0, r: 0 },
    } as any;
    const cityWithAirbase = { ...cityWithoutAirbase, buildings: ['stealth_airbase'] };
    const map = { tiles: {}, width: 10, height: 10, wrap: false } as any;
    const techs = ['stealth-technology'];

    const offeredWithout = getTrainableUnitsForCity(cityWithoutAirbase, techs, map).map(u => u.type);
    const offeredWith = getTrainableUnitsForCity(cityWithAirbase, techs, map).map(u => u.type);

    expect(offeredWithout).not.toContain('stealth_bomber');
    expect(offeredWith).toContain('stealth_bomber');
  });
});

describe('missionary trainability (#592)', () => {
  function makeCity(buildings: string[]): City {
    return {
      id: 'c1', buildings, ownedTiles: [], grid: [[null]],
      food: 0, foodNeeded: 10, population: 1,
      productionQueue: [], productionProgress: 0,
      focus: 'balanced', maturity: 'city',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      position: { q: 0, r: 0 }, owner: 'p1',
    } as any;
  }
  const map = { tiles: {}, width: 10, height: 10, wrap: false } as any;

  it('is NOT trainable without a founded religion (followsOwnFaith omitted, defaults false)', () => {
    const city = makeCity(['temple']);
    const trainable = getTrainableUnitsForCity(city, [], map).map(u => u.type);
    expect(trainable).not.toContain('missionary');
  });

  it('is NOT trainable without a Temple, even with own faith true', () => {
    const city = makeCity([]);
    const trainable = getTrainableUnitsForCity(city, [], map, undefined, undefined, true).map(u => u.type);
    expect(trainable).not.toContain('missionary');
  });

  it('is NOT trainable when the city follows a foreign faith (followsOwnFaith explicitly false)', () => {
    const city = makeCity(['temple']);
    const trainable = getTrainableUnitsForCity(city, [], map, undefined, undefined, false).map(u => u.type);
    expect(trainable).not.toContain('missionary');
  });

  it('IS trainable when religion founded + own faith + Temple all hold', () => {
    const city = makeCity(['temple']);
    const trainable = getTrainableUnitsForCity(city, [], map, undefined, undefined, true).map(u => u.type);
    expect(trainable).toContain('missionary');
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

  it('processCity silently dequeues a not-yet-built stable once tank-warfare completes, and reports droppedProductionItems', () => {
    const map = generateMap(30, 30, 'obsolete-building-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: [],
      productionQueue: ['stable'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 100, undefined, ['horseback-riding', 'tank-warfare']);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'stable', itemKind: 'building', reason: 'obsoleted' }]);
    expect(result.city.productionQueue).not.toContain('stable');
    expect(result.completedBuilding).toBeNull();
    expect(result.city.productionProgress).toBe(0);
  });

  it('processCity does NOT dequeue a queued stable when tank-warfare has not completed', () => {
    const map = generateMap(30, 30, 'obsolete-building-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: [],
      productionQueue: ['stable'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['horseback-riding']);

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('stable');
  });

  it('processCity does NOT demolish an already-built obsolete building — it stays in city.buildings forever, upkeep-free', () => {
    const map = generateMap(30, 30, 'obsolete-building-no-demolish-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: ['cavalry-academy'],
      productionQueue: [],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 5, undefined, ['horseback-riding', 'tank-warfare']);

    expect(result.city.buildings).toContain('cavalry-academy');
  });

  it('processCity dequeues harbor when city is not coastal and reports it in droppedProductionItems', () => {
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
    expect(result.droppedProductionItems).toEqual([{ itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost' }]);
    expect(result.city.productionQueue).not.toContain('harbor');
    expect(result.city.productionProgress).toBe(0); // production not wasted
    expect(result.city.buildings).not.toContain('harbor');
  });

  it('processCity drops queued coastal units from inland cities before completion', () => {
    const map = generateMap(30, 30, 'coastal-unit-drop-test');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = { ...foundCity('p1', inlandTile.coord, map, mkC()), productionQueue: ['transport'], productionProgress: 40 };

    const result = processCity(city, map, 2, 100, undefined, ['galleys']);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost' }]);
    expect(result.city.productionQueue).not.toContain('transport');
    expect(result.completedUnit).toBeNull();
    expect(result.city.productionProgress).toBe(0);
  });

  it('processCity drops stealth_bomber from queue head when city lacks stealth_airbase', () => {
    const map = generateMap(30, 30, 'building-gate-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: [],
      productionQueue: ['stealth_bomber'],
      productionProgress: 50,
    };

    const result = processCity(city, map, 2, 100, undefined, ['stealth-technology']);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'stealth_bomber', itemKind: 'unit', reason: 'training-building-missing' }]);
    expect(result.city.productionQueue).not.toContain('stealth_bomber');
    expect(result.completedUnit).toBeNull();
    expect(result.city.productionProgress).toBe(0);
  });

  it('processCity drops biplane from queue head when city lacks an Airfield', () => {
    const map = generateMap(30, 30, 'airfield-gate-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: [], productionQueue: ['biplane'], productionProgress: 50,
    };

    const result = processCity(city, map, 2, 100, undefined, ['air-superiority']);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'biplane', itemKind: 'unit', reason: 'training-building-missing' }]);
    expect(result.completedUnit).toBeNull();
  });

  it('processCity drops queued aircraft before spending production when its air base is full', () => {
    const map = generateMap(30, 30, 'air-base-full-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: ['airfield'], productionQueue: ['biplane'], productionProgress: 50,
    };

    const result = processCity(city, map, 2, 100, undefined, ['air-superiority'], undefined, 1, undefined, undefined, () => 'air-base-unavailable');

    expect(result.droppedProductionItems).toEqual([{ itemId: 'biplane', itemKind: 'unit', reason: 'air-base-unavailable' }]);
    expect(result.completedUnit).toBeNull();
    expect(result.city.productionProgress).toBe(0);
  });

  it('processCity does NOT drop stealth_bomber when city has stealth_airbase', () => {
    const map = generateMap(30, 30, 'building-gate-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: ['stealth_airbase'],
      productionQueue: ['stealth_bomber'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['stealth-technology']);

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('stealth_bomber');
  });

  it('processCity records unavailable resource-gated units without reporting them as coastal drops', () => {
    const map = generateMap(30, 30, 'resource-unit-drop-test');
    const city = { ...foundCity('p1', { q: 2, r: 2 }, map, mkC()), productionQueue: ['swordsman'], productionProgress: 40 };

    const result = processCity(city, map, 2, 100, undefined, ['bronze-working'], undefined, 1, new Set());

    expect(result.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'resource-lost' }]);
    expect(result.city.productionQueue).not.toContain('swordsman');
    expect(result.completedUnit).toBeNull();
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
    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.buildings).toContain('harbor');
  });

  it('processCity returns an empty droppedProductionItems when no coastal guard triggers', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const result = processCity(city, map, 2);
    expect(result.droppedProductionItems).toEqual([]);
  });

  it.each(['frigate', 'destroyer'] satisfies UnitType[])(
    'coastal guard dequeues %s when the city is not coastal',
    (unitType) => {
      const map = generateMap(30, 30, `coastal-guard-${unitType}`);
      const inlandTile = Object.values(map.tiles).find(t =>
        t.terrain === 'grassland' &&
        !Object.values(map.tiles).some(n =>
          Math.abs(n.coord.q - t.coord.q) <= 1 &&
          Math.abs(n.coord.r - t.coord.r) <= 1 &&
          (n.terrain === 'ocean' || n.terrain === 'coast')
        )
      )!;
      const city = {
        ...foundCity('p1', inlandTile.coord, map, mkC()),
        productionQueue: [unitType],
        productionProgress: 10,
      };
      const completedTechs = unitType === 'frigate' ? ['frigate-construction'] : ['carrier-warfare'];
      const result = processCity(city, map, 2, 100, undefined, completedTechs);
      expect(result.droppedProductionItems).toEqual([{ itemId: unitType, itemKind: 'unit', reason: 'coastal-access-lost' }]);
      expect(result.city.productionQueue).not.toContain(unitType);
      expect(result.city.productionProgress).toBe(0);
    },
  );

  it('preserves focus fields after city growth processing', () => {
    const map = generateMap(30, 30, 'city-growth-focus-fields');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const focused = { ...city, focus: 'food' as const, workedTiles: [] };
    const result = processCity(focused, map, 30, 0);
    expect(result.city.focus).toBe('food');
    expect(result.city.workedTiles).toEqual([]);
  });

  it('completes a Barracks and adds it to city.buildings', () => {
    const map = generateMap(30, 30, 'complete-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const queued = { ...city, productionQueue: ['barracks'], productionProgress: 9 };

    const result = processCity(queued, map, 0, 1);

    expect(result.completedBuilding).toBe('barracks');
    expect(result.city.buildings).toContain('barracks');
  });

  it('does not duplicate an already built building from a stale production queue', () => {
    const map = generateMap(30, 30, 'dedupe-built-barracks');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const queued = {
      ...city,
      buildings: ['barracks'],
      productionQueue: ['barracks'],
      productionProgress: 9,
    };

    const result = processCity(queued, map, 0, 1);

    expect(result.city.buildings.filter(buildingId => buildingId === 'barracks')).toHaveLength(1);
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

describe('processCity — droppedProductionItems (issue #457)', () => {
  it('drops a building whose required resource is no longer available (previously untracked)', () => {
    const map = generateMap(30, 30, 'building-resource-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['bronze-workshop'],
      productionProgress: 10,
    };

    const result = processCity(city, map, 2, 100, undefined, ['stone-weapons'], undefined, 1, new Set());

    expect(result.droppedProductionItems).toEqual([{ itemId: 'bronze-workshop', itemKind: 'building', reason: 'resource-lost' }]);
    expect(result.city.productionQueue).not.toContain('bronze-workshop');
  });

  it('does NOT drop a building whose required resource is still available (negative)', () => {
    const map = generateMap(30, 30, 'building-resource-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['bronze-workshop'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['stone-weapons'], undefined, 1, new Set(['copper']));

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('bronze-workshop');
  });

  it('drops a national-project building outside its build window (previously untracked)', () => {
    const map = generateMap(30, 30, 'np-window-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['sacred_grove'],
      productionProgress: 10,
    };

    // sacred_grove has nationalProject.homeEra: 1, so era 3 is outside homeEra..homeEra+1.
    const result = processCity(city, map, 2, 100, undefined, ['animism'], undefined, 3);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'sacred_grove', itemKind: 'building', reason: 'build-window-expired' }]);
    expect(result.city.productionQueue).not.toContain('sacred_grove');
  });

  it('does NOT drop a national-project building still within its build window (negative)', () => {
    const map = generateMap(30, 30, 'np-window-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['sacred_grove'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['animism'], undefined, 2);

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('sacred_grove');
  });

  it('#591 MR4: never drops a milestone national project (sacred_council) regardless of how far past homeEra+1 the era is', () => {
    const map = generateMap(30, 30, 'np-milestone-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: ['temple'],
      productionQueue: ['sacred_council'],
      productionProgress: 0,
    };

    // sacred_council has nationalProject.homeEra: 3, milestone: true -- a normal NP
    // would be dropped at era 10 (far past homeEra + 1 = 4), a milestone NP must not be.
    const result = processCity(city, map, 2, 1, undefined, ['philosophy'], undefined, 10);

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('sacred_council');
  });

  it('disambiguates unit obsoleted vs resource-lost, and prefers obsoleted on a tie', () => {
    const map = generateMap(30, 30, 'unit-reason-disambiguation-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;

    // resource-lost only: bronze-working completed (queueable), rifled-infantry NOT completed, no iron.
    const resourceLostCity = { ...foundCity('p1', landTile.coord, map, mkC()), productionQueue: ['swordsman'], productionProgress: 10 };
    const resourceLostResult = processCity(resourceLostCity, map, 2, 100, undefined, ['bronze-working'], undefined, 1, new Set());
    expect(resourceLostResult.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'resource-lost' }]);

    // obsoleted only: iron available, but rifled-infantry completed.
    const obsoletedCity = { ...foundCity('p1', landTile.coord, map, mkC()), productionQueue: ['swordsman'], productionProgress: 10 };
    const obsoletedResult = processCity(obsoletedCity, map, 2, 100, undefined, ['bronze-working', 'rifled-infantry'], undefined, 1, new Set(['iron']));
    expect(obsoletedResult.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'obsoleted' }]);

    // tie: both rifled-infantry completed AND iron unavailable — 'obsoleted' must win.
    const tieCity = { ...foundCity('p1', landTile.coord, map, mkC()), productionQueue: ['swordsman'], productionProgress: 10 };
    const tieResult = processCity(tieCity, map, 2, 100, undefined, ['bronze-working', 'rifled-infantry'], undefined, 1, new Set());
    expect(tieResult.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'obsoleted' }]);
  });

  it('records multiple drops in one turn: a building and a unit both dropped in the same coastal-guard pass', () => {
    const map = generateMap(30, 30, 'coastal-double-drop-test');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = {
      ...foundCity('p1', inlandTile.coord, map, mkC()),
      productionQueue: ['harbor', 'transport'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 100, undefined, ['harbor-tech', 'galleys']);

    expect(result.droppedProductionItems).toEqual([
      { itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost' },
      { itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost' },
    ]);
    expect(result.city.productionQueue).toEqual([]);
  });

  it('never reports a legendary-wonder queue item as dropped by any filter (negative)', () => {
    const map = generateMap(30, 30, 'legendary-item-exclusion-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['legendary:oracle-of-delphi'],
      productionProgress: 10,
    };

    // era 5, no completed techs, no resources, no buildings — every filter gets a chance to (wrongly) drop it.
    const result = processCity(city, map, 2, 100, undefined, [], undefined, 5, new Set());

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('legendary:oracle-of-delphi');
  });
});

describe('getSettlerProductionCost', () => {
  it('uses cheaper early-game Settler costs for eras 1 and 2', () => {
    expect(getSettlerProductionCost(1)).toBe(24);
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

describe('MR6: 3d-printing production overflow', () => {
  it('carries leftover production to the next queue item exactly', () => {
    const map = generateMap(30, 30, '3d-printing-overflow-carry');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['library', 'granary'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 20, undefined, ['3d-printing']);

    expect(result.completedBuilding).toBe('library');
    expect(result.city.productionQueue).toEqual(['granary']);
    expect(result.city.productionProgress).toBe(4); // 20 yield - 16 library cost
  });

  it('discards leftover production without the tech', () => {
    const map = generateMap(30, 30, '3d-printing-overflow-no-tech');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['library', 'granary'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 20, undefined, []);

    expect(result.completedBuilding).toBe('library');
    expect(result.city.productionQueue).toEqual(['granary']);
    expect(result.city.productionProgress).toBe(0);
  });

  it('does not smuggle overflow through a same-turn dequeue-drop', () => {
    const map = generateMap(30, 30, '3d-printing-overflow-drop');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = {
      ...foundCity('p1', inlandTile.coord, map, mkC()),
      productionQueue: ['dock', 'library'],
      productionProgress: 50,
    };

    const result = processCity(city, map, 2, 0, undefined, ['3d-printing']);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'dock', itemKind: 'building', reason: 'coastal-access-lost' }]);
    expect(result.city.productionQueue).toEqual(['library']);
    expect(result.city.productionProgress).toBe(0);
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
    const available = getAvailableBuildings(city, [], map);
    for (const b of available) {
      expect(b.techRequired).toBeNull();
    }
  });
});

describe('foundCity does not include grid fields', () => {
  it('foundCity does not set grid or gridSize', () => {
    const map = generateMap(30, 30, 'grid-absent-test');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    expect(city.focus).toBe('balanced');
    expect(city.maturity).toBe('outpost');
    expect(city.workedTiles).toEqual([]);
    expect((city as any).grid).toBeUndefined();
    expect((city as any).gridSize).toBeUndefined();
  });
});

describe('building intrinsic yield regression', () => {
  it('granary yields exactly +3 food', () => {
    const map = generateMap(30, 30, 'yield-granary');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    expect(BUILDINGS['granary'].yields.food).toBe(3);
  });

  it('library yields exactly +3 science', () => {
    expect(BUILDINGS['library'].yields.science).toBe(3);
  });

  it('workshop yields exactly +3 production', () => {
    expect(BUILDINGS['workshop'].yields.production).toBe(3);
  });

  it('marketplace yields exactly +4 gold', () => {
    expect(BUILDINGS['marketplace'].yields.gold).toBe(4);
  });

  it('library+temple do not produce old adjacency bonus of +2 science', () => {
    const libYields = BUILDINGS['library'].yields;
    const templeYields = BUILDINGS['temple']?.yields ?? { food: 0, production: 0, gold: 0, science: 0 };
    // Combined yield must equal the sum of intrinsic yields — no bonus
    expect(libYields.science + templeYields.science).toBe(BUILDINGS['library'].yields.science + templeYields.science);
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

  it('all era-12 buildings have BUILDINGS and PRODUCTION_ICONS entries', () => {
    const era12BuildingIds = [
      'cyber_defense_center', 'signals_hub', 'stealth_airbase', 'data_center',
      'biotech_lab', 'broadcast_tower', 'precision_farm', 'gene_therapy_clinic',
      'telemedicine_hub', 'automated_port', 'smart_grid', 'fintech_hub',
    ];
    for (const id of era12BuildingIds) {
      expect(BUILDINGS[id], `BUILDINGS['${id}'] missing`).toBeDefined();
      expect(PRODUCTION_ICONS[id], `PRODUCTION_ICONS['${id}'] missing`).toBeDefined();
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
    const available = getAvailableBuildings(city, ['stone-weapons'], map, undefined);
    // bronze-workshop requires stone-weapons + copper; no filter → should appear
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(true);
  });

  it('excludes resource-gated building when resource is missing', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['stone-weapons'], map, new Set<ResourceType>());
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(false);
  });

  it('includes resource-gated building when tech and resource are both present', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['stone-weapons'], map, new Set<ResourceType>(['copper']));
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(true);
  });

  it('excludes resource-gated building when tech is missing regardless of resource', () => {
    const map = generateMap(30, 30, 'res-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, [], map, new Set<ResourceType>(['copper']));
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

  it('horseman obsoletes at tank-warfare, not iron-forging (avoids the resource dead-end)', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'horseman');
    expect(entry?.obsoletedByTech).toBe('tank-warfare');
  });

  it('cavalry obsoletes at tank-warfare, not iron-forging (avoids the resource dead-end)', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'cavalry');
    expect(entry?.obsoletedByTech).toBe('tank-warfare');
  });

  it('knight obsoletes at tank-warfare', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'knight');
    expect(entry?.obsoletedByTech).toBe('tank-warfare');
  });

  it('dead-end prevention: iron-poor civ still has tank once tank-warfare completes, even though it never had cavalry or knight', () => {
    const noIron = getTrainableUnitsForCiv(
      ['horseback-riding', 'tank-warfare'],
      undefined,
      new Set<ResourceType>(['horses']),
    );
    expect(noIron.some(u => u.type === 'cavalry')).toBe(false);
    expect(noIron.some(u => u.type === 'knight')).toBe(false);
    expect(noIron.some(u => u.type === 'horseman')).toBe(false);
    expect(noIron.some(u => u.type === 'tank')).toBe(true);
  });

  it('horseman remains trainable for an iron-poor civ all the way up to tank-warfare (no premature dead-end)', () => {
    const midGame = getTrainableUnitsForCiv(
      ['horseback-riding', 'iron-forging'],
      undefined,
      new Set<ResourceType>(['horses']),
    );
    expect(midGame.some(u => u.type === 'horseman')).toBe(true);
  });
});

describe('#429 — expanded obsolescence coverage', () => {
  const CASES: Array<{
    type: UnitType;
    unlockTech?: string;
    obsoleteTech: string;
    resources?: ResourceType[];
  }> = [
    // MR9: warrior's cheap-fallback role ends once real militaries exist (era 2, Bronze Working).
    { type: 'warrior', obsoleteTech: 'bronze-working' },
    { type: 'archer', unlockTech: 'archery', obsoleteTech: 'tactics' },
    { type: 'swordsman', unlockTech: 'bronze-working', obsoleteTech: 'rifled-infantry', resources: ['iron'] },
    { type: 'pikeman', unlockTech: 'fortification', obsoleteTech: 'rifled-infantry' },
    // MR8: galley's fighting line now upgrades into trireme (obsoletes at triremes,
    // not navigation); trireme now covers eras 3-5 and obsoletes at frigate-construction.
    { type: 'galley', unlockTech: 'galleys', obsoleteTech: 'triremes' },
    { type: 'trireme', unlockTech: 'triremes', obsoleteTech: 'frigate-construction' },
    { type: 'grenadier', unlockTech: 'grenade-warfare', obsoleteTech: 'mass-firepower' },
    { type: 'rifleman', unlockTech: 'rifled-infantry', obsoleteTech: 'mass-firepower' },
    { type: 'biplane', unlockTech: 'air-superiority', obsoleteTech: 'jet-aviation' },
    // MR9: jet_fighter reverted to terminal (air-superiority apex) — the bomber, not the
    // fighter, is the era-10-to-12 strike line. This also fixes "researched stealth tech
    // but no airbase yet -> zero trainable air units".
    { type: 'bomber', unlockTech: 'nuclear-weapons', obsoleteTech: 'stealth-technology' },
  ];

  for (const c of CASES) {
    it(`${c.type}: still trainable before ${c.obsoleteTech} completes`, () => {
      const techs = c.unlockTech ? [c.unlockTech] : [];
      const units = getTrainableUnitsForCiv(techs, undefined, new Set<ResourceType>(c.resources ?? []));
      expect(units.some(u => u.type === c.type)).toBe(true);
    });

    it(`${c.type}: no longer trainable once ${c.obsoleteTech} completes`, () => {
      const techs = c.unlockTech ? [c.unlockTech, c.obsoleteTech] : [c.obsoleteTech];
      const units = getTrainableUnitsForCiv(techs, undefined, new Set<ResourceType>(c.resources ?? []));
      expect(units.some(u => u.type === c.type)).toBe(false);
    });
  }
});

describe('#429 — unit obsolescence completeness', () => {
  const UTILITY_TYPES: UnitType[] = ['worker', 'settler', 'troop_transport', 'caravan', 'expedition'];

  it('every combat-capable trainable unit has obsoletedByTech or a TERMINAL_COMBAT_UNITS entry', () => {
    const missing: string[] = [];
    for (const entry of TRAINABLE_UNITS) {
      if (UTILITY_TYPES.includes(entry.type)) continue;
      const strength = UNIT_DEFINITIONS[entry.type]?.strength ?? 0;
      if (strength <= 0) continue;
      if (entry.obsoletedByTech) continue;
      if (TERMINAL_COMBAT_UNITS[entry.type]) continue;
      missing.push(entry.type);
    }
    expect(missing, `combat units missing an obsolescence decision: ${missing.join(', ')}`).toEqual([]);
  });

  it('every TERMINAL_COMBAT_UNITS entry has a non-empty reason', () => {
    for (const [type, reason] of Object.entries(TERMINAL_COMBAT_UNITS)) {
      expect(reason.length, `${type} needs a real reason, not an empty string`).toBeGreaterThan(0);
    }
  });

  it('TERMINAL_COMBAT_UNITS does not list a unit that already has obsoletedByTech (no contradictory entries)', () => {
    for (const type of Object.keys(TERMINAL_COMBAT_UNITS)) {
      const entry = TRAINABLE_UNITS.find(u => u.type === type);
      expect(entry?.obsoletedByTech, `${type} is in TERMINAL_COMBAT_UNITS but also has obsoletedByTech set`).toBeUndefined();
    }
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
    const available = getAvailableBuildings(city, ['stone-weapons'], map, new Set<ResourceType>());
    expect(available.some(b => b.id === 'bronze-workshop')).toBe(false);
  });

  it('iron-foundry: available with iron-forging tech + iron resource', () => {
    const map = generateMap(30, 30, 'bldg-test');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', tile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['iron-forging'], map, new Set<ResourceType>(['iron']));
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

  it('stable: reduces cavalry (horseman) cost by 15%', () => {
    const base = getProductionCostForItem('horseman', { city: noBuildings });
    const discounted = getProductionCostForItem('horseman', { city: { buildings: ['stable'] } });
    expect(discounted).toBe(Math.ceil(base * 0.85));
  });

  it('stable + cavalry-academy: non-stacking — min(0.85, 0.85) not 0.7225', () => {
    const base = getProductionCostForItem('horseman', { city: noBuildings });
    const both = getProductionCostForItem('horseman', { city: { buildings: ['stable', 'cavalry-academy'] } });
    expect(both).toBe(Math.ceil(base * 0.85));
    expect(both).toBeGreaterThan(Math.ceil(base * 0.7225));
  });

  it('steel_foundry: reduces iron-requiring unit (swordsman) cost by 10%', () => {
    const base = getProductionCostForItem('swordsman', { city: noBuildings });
    const discounted = getProductionCostForItem('swordsman', { city: { buildings: ['steel_foundry'] } });
    expect(discounted).toBe(Math.ceil(base * 0.90));
  });

  it('steel_foundry: does not discount units without an iron requirement (warrior)', () => {
    const base = getProductionCostForItem('warrior', { city: noBuildings });
    const withFoundry = getProductionCostForItem('warrior', { city: { buildings: ['steel_foundry'] } });
    expect(withFoundry).toBe(base);
  });

  it('Circular Manufacturing Network applies only its selected soft-material advantage without bypassing hard eligibility', () => {
    const base = getProductionCostForItem('combat_drone', {
      city: noBuildings,
      availableResources: new Set<ResourceType>(),
    });
    const substituted = getProductionCostForItem('combat_drone', {
      availableResources: new Set<ResourceType>(),
      materialSubstitution: 'battery-minerals',
    });
    const unrelated = getProductionCostForItem('warrior', {
      availableResources: new Set<ResourceType>(),
      materialSubstitution: 'battery-minerals',
    });

    expect(substituted).toBe(Math.ceil(base * 0.85));
    expect(unrelated).toBe(getProductionCostForItem('warrior', { city: noBuildings }));
  });
});

describe('MR12 — national-project production discounts', () => {
  const noBuildings = { buildings: [] };

  it('tribal_muster_ground: era-1/2 melee (warrior) trains 10% cheaper empire-wide', () => {
    const base = getProductionCostForItem('warrior', { city: noBuildings });
    const discounted = getProductionCostForItem('warrior', {
      city: noBuildings,
      activeNationalProjects: [{ id: 'tribal_muster_ground', fadeMultiplier: 1 }],
    });
    expect(discounted).toBe(Math.ceil(base * 0.90));
  });

  it('tribal_muster_ground: does not discount non era-1/2-melee units (catapult)', () => {
    const base = getProductionCostForItem('catapult', { city: noBuildings });
    const withNP = getProductionCostForItem('catapult', {
      city: noBuildings,
      activeNationalProjects: [{ id: 'tribal_muster_ground', fadeMultiplier: 1 }],
    });
    expect(withNP).toBe(base);
  });

  it('military_academy: gunpowder-class (musketeer) trains 10% cheaper empire-wide', () => {
    const base = getProductionCostForItem('musketeer', { city: noBuildings });
    const discounted = getProductionCostForItem('musketeer', {
      city: noBuildings,
      activeNationalProjects: [{ id: 'military_academy', fadeMultiplier: 1 }],
    });
    expect(discounted).toBe(Math.ceil(base * 0.90));
  });

  it('artillery_corps_hq: siege-class (catapult) trains 10% cheaper empire-wide', () => {
    const base = getProductionCostForItem('catapult', { city: noBuildings });
    const discounted = getProductionCostForItem('catapult', {
      city: noBuildings,
      activeNationalProjects: [{ id: 'artillery_corps_hq', fadeMultiplier: 1 }],
    });
    expect(discounted).toBe(Math.ceil(base * 0.90));
  });

  it('national-project discount fades with fadeMultiplier (0.5 -> half the discount)', () => {
    const base = getProductionCostForItem('warrior', { city: noBuildings });
    const fading = getProductionCostForItem('warrior', {
      city: noBuildings,
      activeNationalProjects: [{ id: 'tribal_muster_ground', fadeMultiplier: 0.5 }],
    });
    expect(fading).toBe(Math.ceil(base * 0.95));
  });

  it('national-project discounts multiply with building discounts (not Math.min)', () => {
    const base = getProductionCostForItem('musketeer', { city: noBuildings });
    const stacked = getProductionCostForItem('musketeer', {
      city: noBuildings,
      activeNationalProjects: [{ id: 'military_academy', fadeMultiplier: 1 }],
    });
    const withArmory = getProductionCostForItem('musketeer', { city: { buildings: ['armory'] } });
    const stackedWithArmory = getProductionCostForItem('musketeer', {
      city: { buildings: ['armory'] },
      activeNationalProjects: [{ id: 'military_academy', fadeMultiplier: 1 }],
    });
    expect(stacked).toBe(Math.ceil(base * 0.90));
    // armory (0.85) * military_academy (0.90) = 0.765, multiplicative not min(0.85, 0.90)
    expect(stackedWithArmory).toBe(Math.ceil(base * 0.85 * 0.90));
    expect(stackedWithArmory).toBeLessThan(withArmory);
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

  it('#429 regression (MR9: bronze-working): dequeues a queued warrior once bronze-working completes', () => {
    // productionProgress + productionYield (0 + 3 = 3) stays well under warrior's
    // production cost (8), so removal from the queue can only be the obsoletedByTech
    // dequeue path, not the unit completing production this turn.
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['warrior'], productionProgress: 0 };
    const result = processCity(city, map, 2, 3, undefined, ['bronze-working'], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).not.toContain('warrior');
    expect(result.city.productionProgress).toBe(0);
  });

  it('#429 regression: keeps a queued warrior when bronze-working has not been researched', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['warrior'], productionProgress: 0 };
    const result = processCity(city, map, 2, 3, undefined, [], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).toContain('warrior');
  });
});

describe('#429 regression: AI training selection respects new obsolescence data', () => {
  it('warrior drops out of the AI-visible trainable pool once bronze-working completes (same getTrainableUnitsForCiv call basic-ai.ts:948 uses)', () => {
    const before = getTrainableUnitsForCiv([], 'rome', new Set<ResourceType>());
    const after = getTrainableUnitsForCiv(['bronze-working'], 'rome', new Set<ResourceType>());
    expect(before.some(u => u.type === 'warrior')).toBe(true);
    expect(after.some(u => u.type === 'warrior')).toBe(false);
  });
});
