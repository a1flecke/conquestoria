import { describe, expect, it, beforeAll } from 'vitest';
import type { City, GameMap, HexCoord, TerrainType } from '@/core/types';
import {
  getCityTechYields,
  getEmpireTechPercents,
  applyEmpireTechPercents,
  getTradeRouteTechGold,
  getCivLuxuryTechGold,
} from '@/systems/tech-yield-system';
import { TECH_YIELD_MODIFIERS, TECH_COST_DISCOUNTS, getFoundingBonusFood } from '@/systems/tech-yield-definitions';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS, foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function forceTile(
  map: GameMap,
  coord: HexCoord,
  terrain: TerrainType,
  overrides: Partial<GameMap['tiles'][string]> = {},
): HexCoord {
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
    ...overrides,
  };
  return coord;
}

describe('TECH_YIELD_MODIFIERS / TECH_COST_DISCOUNTS integrity', () => {
  const techIds = new Set(TECH_TREE.map(t => t.id));

  it('every modifier techId exists in the tech tree', () => {
    for (const modifier of TECH_YIELD_MODIFIERS) {
      expect(techIds.has(modifier.techId)).toBe(true);
    }
  });

  it('every cost-discount techId exists in the tech tree', () => {
    for (const discount of TECH_COST_DISCOUNTS) {
      expect(techIds.has(discount.techId)).toBe(true);
    }
  });

  it('every perBuildingId / requiresAnyBuilding / requiresMissingBuilding entry references a real building', () => {
    for (const modifier of TECH_YIELD_MODIFIERS) {
      const effect = modifier.effect;
      if (effect.kind === 'perBuildingId') {
        for (const id of effect.buildingIds) expect(BUILDINGS[id]).toBeDefined();
      }
      if (effect.kind === 'cityFlatConditional') {
        for (const id of effect.requiresAnyBuilding ?? []) expect(BUILDINGS[id]).toBeDefined();
        for (const id of effect.requiresMissingBuilding ?? []) expect(BUILDINGS[id]).toBeDefined();
      }
    }
  });

  it('every perBuildingCategory / requiresBuildingCategory references a real BuildingCategory', () => {
    const realCategories = new Set(Object.values(BUILDINGS).map(b => b.category).filter(Boolean));
    for (const modifier of TECH_YIELD_MODIFIERS) {
      const effect = modifier.effect;
      if (effect.kind === 'perBuildingCategory') expect(realCategories.has(effect.category)).toBe(true);
      if (effect.kind === 'cityFlatConditional' && effect.requiresBuildingCategory) {
        expect(realCategories.has(effect.requiresBuildingCategory)).toBe(true);
      }
    }
  });
});

describe('getCityTechYields — per-kind coverage', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(20, 20, 'tech-yield-test');
  });

  function makeCity(overrides: Partial<City> = {}): City {
    const coord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = foundCity('player', coord, map, mkC());
    return { ...city, population: 4, ...overrides };
  }

  it('cityFlat applies to every city regardless of buildings', () => {
    const city = makeCity();
    const yields = getCityTechYields(city, map, ['empiricism']).total;
    expect(yields.science).toBe(1);
    const withoutTech = getCityTechYields(city, map, []).total;
    expect(withoutTech.science).toBe(0);
  });

  it('cityFlatConditional (requiresAnyBuilding): applies only with the building present', () => {
    const withTemple = makeCity({ buildings: ['temple'] });
    const withoutTemple = makeCity({ buildings: [] });
    expect(getCityTechYields(withTemple, map, ['monastic-orders']).total).toEqual({ food: 0, production: 0, gold: 1, science: 1 });
    expect(getCityTechYields(withoutTemple, map, ['monastic-orders']).total).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });

  it('cityFlatConditional (requiresRiver): applies only when the city sits on a river', () => {
    const riverCoord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    forceTile(map, riverCoord, 'grassland', { hasRiver: true });
    const riverCity = { ...foundCity('player', riverCoord, map, mkC()), population: 1 };
    expect(getCityTechYields(riverCity, map, ['hydraulics']).total.production).toBe(2);

    const inlandCoord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const inlandCity = { ...foundCity('player', inlandCoord, map, mkC()), population: 1 };
    expect(getCityTechYields(inlandCity, map, ['hydraulics']).total.production).toBe(0);
  });

  it('cityFlatConditional (requiresCoastal): applies only for coastal cities', () => {
    // Non-wrapping, hand-built map so the center + every neighbor's terrain
    // is under direct test control (no reliance on generateMap's RNG/wrap).
    const localMap: GameMap = { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] };
    const coastCoord = { q: 5, r: 5 };
    forceTile(localMap, coastCoord, 'grassland');
    for (const neighbor of hexNeighbors(coastCoord)) forceTile(localMap, neighbor, 'coast');
    const coastalCity = { ...foundCity('player', coastCoord, localMap, mkC()), population: 1 };
    expect(getCityTechYields(coastalCity, localMap, ['deep-sea-routes']).total.gold).toBe(1);

    const inlandCoord = { q: 12, r: 12 };
    forceTile(localMap, inlandCoord, 'grassland');
    for (const neighbor of hexNeighbors(inlandCoord)) forceTile(localMap, neighbor, 'grassland');
    const inlandCity = { ...foundCity('player', inlandCoord, localMap, mkC()), population: 1 };
    expect(getCityTechYields(inlandCity, localMap, ['deep-sea-routes']).total.gold).toBe(0);
  });

  it('cityFlatConditional (requiresMissingBuilding): applies only without the building', () => {
    const withoutTemple = makeCity({ buildings: [] });
    const withTemple = makeCity({ buildings: ['temple'] });
    expect(getCityTechYields(withoutTemple, map, ['secularism']).total.science).toBe(2);
    expect(getCityTechYields(withTemple, map, ['secularism']).total.science).toBe(0);
  });

  it('cityFlatConditional (minBuildings): applies only at or above the threshold', () => {
    const bigCity = makeCity({ buildings: ['temple', 'library', 'granary'] });
    const smallCity = makeCity({ buildings: ['temple'] });
    expect(getCityTechYields(bigCity, map, ['urban-planning']).total.production).toBe(2);
    expect(getCityTechYields(smallCity, map, ['urban-planning']).total.production).toBe(0);
  });

  it('perBuildingCategory: counts 2 culture buildings x2', () => {
    const city = makeCity({ buildings: ['temple', 'art_gallery'] });
    expect(getCityTechYields(city, map, ['renaissance-painting']).total.gold).toBe(2);
    const noCulture = makeCity({ buildings: ['granary'] });
    expect(getCityTechYields(noCulture, map, ['renaissance-painting']).total.gold).toBe(0);
  });

  it('perBuildingId: counts matching buildings only', () => {
    const city = makeCity({ buildings: ['library'] });
    expect(getCityTechYields(city, map, ['scientific-method']).total.science).toBe(1);
    const noLibrary = makeCity({ buildings: [] });
    expect(getCityTechYields(noLibrary, map, ['scientific-method']).total.science).toBe(0);
  });

  it('perImprovement: counts only worked, completed tiles', () => {
    const centerCoord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', centerCoord, map, mkC()), population: 2 };
    const workTile = city.ownedTiles.find(c => hexKey(c) !== hexKey(city.position))!;
    forceTile(map, workTile, 'plains', { improvement: 'farm', improvementTurnsLeft: 0 });
    const withFarm = { ...city, workedTiles: [workTile] };
    expect(getCityTechYields(withFarm, map, ['plantation-farming']).total.food).toBe(1);

    forceTile(map, workTile, 'plains', { improvement: 'farm', improvementTurnsLeft: 2 });
    expect(getCityTechYields(withFarm, map, ['plantation-farming']).total.food).toBe(0);
  });

  it('perPopulation: floors population/per', () => {
    const city4 = makeCity({ population: 4 });
    const city3 = makeCity({ population: 3 });
    expect(getCityTechYields(city4, map, ['enlightenment']).total.science).toBe(2);
    expect(getCityTechYields(city3, map, ['enlightenment']).total.science).toBe(1);
  });

  it('perOwnedNaturalWonder: counts owned tiles with a wonder', () => {
    const centerCoord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', centerCoord, map, mkC()), population: 1 };
    const wonderTile = city.ownedTiles.find(c => hexKey(c) !== hexKey(city.position))!;
    forceTile(map, wonderTile, 'mountain', { wonder: 'test-natural-wonder' });
    expect(getCityTechYields(city, map, ['natural-history']).total.science).toBe(2);

    forceTile(map, wonderTile, 'mountain', { wonder: null });
    expect(getCityTechYields(city, map, ['natural-history']).total.science).toBe(0);
  });
});

describe('getEmpireTechPercents / applyEmpireTechPercents', () => {
  it('sums two +5% gold entries to +10%', () => {
    const percents = getEmpireTechPercents(['civic-humanism', 'mercantilism']);
    expect(percents.gold).toBe(10);
  });

  it('is empty without the qualifying tech', () => {
    expect(getEmpireTechPercents([])).toEqual({});
  });

  it('applies percents multiplicatively per resource', () => {
    const result = applyEmpireTechPercents({ food: 10, production: 10, gold: 10, science: 10 }, { gold: 10 });
    expect(result.gold).toBe(11);
    expect(result.food).toBe(10);
  });
});

describe('getTradeRouteTechGold', () => {
  const domesticRoute = { id: 'r1', fromCityId: 'a', toCityId: 'b', goldPerTrip: 10, turnsPerTrip: 2 };
  const foreignRoute = { ...domesticRoute, foreignCivId: 'rival' };

  it('guilds applies to any route', () => {
    expect(getTradeRouteTechGold(domesticRoute, ['guilds'])).toBe(1);
  });

  it('colonial-trade (foreignOnly) skips domestic routes', () => {
    expect(getTradeRouteTechGold(domesticRoute, ['colonial-trade'])).toBe(0);
    expect(getTradeRouteTechGold(foreignRoute, ['colonial-trade'])).toBe(2);
  });

  it('steam-navigation (coastalOnly) requires both endpoints coastal', () => {
    expect(getTradeRouteTechGold(domesticRoute, ['steam-navigation'], { bothEndpointsCoastal: false })).toBe(0);
    expect(getTradeRouteTechGold(domesticRoute, ['steam-navigation'], { bothEndpointsCoastal: true })).toBe(2);
  });
});

describe('getCivLuxuryTechGold', () => {
  it('multiplies flat gold by distinct owned luxury count', () => {
    expect(getCivLuxuryTechGold(['distillation'], 3)).toBe(6);
    expect(getCivLuxuryTechGold([], 3)).toBe(0);
    expect(getCivLuxuryTechGold(['distillation'], 0)).toBe(0);
  });
});

describe('getFoundingBonusFood', () => {
  it('applies manifest-destiny founding food bonus', () => {
    expect(getFoundingBonusFood(['manifest-destiny'])).toBe(5);
    expect(getFoundingBonusFood([])).toBe(0);
  });
});

describe('hot-seat determinism', () => {
  it('two civs with different techs get different yields from identical cities', () => {
    const map = generateMap(20, 20, 'tech-yield-hotseat-test');
    const coordA = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const cityA = { ...foundCity('civ-a', coordA, map, mkC()), buildings: ['library'], population: 1 };
    const cityB = { ...cityA, id: 'city-b', owner: 'civ-b' };

    const yieldsA = getCityTechYields(cityA, map, ['scientific-method']).total;
    const yieldsB = getCityTechYields(cityB, map, []).total;

    expect(yieldsA.science).toBe(1);
    expect(yieldsB.science).toBe(0);
    expect(yieldsA).not.toEqual(yieldsB);
  });
});

describe('Era-5 scenario: guilds + scientific-method + 2 libraries + 3 routes', () => {
  it('produces exactly +2 science (city) and +3 gold (routes)', () => {
    const map = generateMap(20, 20, 'tech-yield-era5-scenario');
    const coord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', coord, map, mkC()), buildings: ['library'], population: 1 };

    const cityYields = getCityTechYields(city, map, ['guilds', 'scientific-method']).total;
    expect(cityYields.science).toBe(1); // one library on this fixture city

    // Two libraries empire-wide (simulated across cities) -> +1 each -> +2 total
    const secondCity = { ...city, id: 'city-2', buildings: ['library'] };
    const totalScience = getCityTechYields(city, map, ['scientific-method']).total.science
      + getCityTechYields(secondCity, map, ['scientific-method']).total.science;
    expect(totalScience).toBe(2);

    const route = { id: 'r1', fromCityId: 'a', toCityId: 'b', goldPerTrip: 10, turnsPerTrip: 2 };
    const threeRoutesGold = [route, route, route]
      .reduce((sum, r) => sum + getTradeRouteTechGold(r, ['guilds']), 0);
    expect(threeRoutesGold).toBe(3);
  });
});
