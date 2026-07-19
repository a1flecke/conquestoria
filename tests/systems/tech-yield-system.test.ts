import { describe, expect, it, beforeAll } from 'vitest';
import type { City, GameMap, HexCoord, TerrainType } from '@/core/types';
import {
  getCityTechYields,
  getEmpireTechPercents,
  applyEmpireTechPercents,
  getTradeRouteTechGold,
  getCivLuxuryTechGold,
  getEmpireFlatTechYields,
  getTradeRouteTechGoldPercent,
  getCivWonderTechGold,
  getCivRoutePartnerTechGold,
  getTerrainTechYieldBonus,
  getMaintenanceDiscountMultiplier,
  getLowestCityScienceBonus,
  getRoadTileTechGold,
  getConnectedCityTechGold,
} from '@/systems/tech-yield-system';
import { TECH_YIELD_MODIFIERS, TECH_COST_DISCOUNTS, getFoundingBonusFood } from '@/systems/tech-yield-definitions';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS, foundCity } from '@/systems/city-system';
import { calculateCityYields } from '@/systems/resource-system';
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
        for (const id of effect.requiresAllBuildings ?? []) expect(BUILDINGS[id]).toBeDefined();
      }
      if (effect.kind === 'perCityRoute') {
        expect(BUILDINGS[effect.requiresBuilding]).toBeDefined();
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

  it('Quantum Computing adds science only to cities with a Data Center', () => {
    const dataCenterCity = makeCity({ buildings: ['data_center'] });
    const otherCity = makeCity({ buildings: ['library'] });

    expect(getCityTechYields(dataCenterCity, map, ['quantum-computing']).total.science).toBe(2);
    expect(getCityTechYields(otherCity, map, ['quantum-computing']).total.science).toBe(0);
  });

  it('Universal Basic Services adds food to every city without requiring a Network plan', () => {
    const city = makeCity({ buildings: [] });

    expect(getCityTechYields(city, map, ['universal-basic-services']).total.food).toBe(1);
  });

  it('Era 13 building-follow-up technologies apply only to their named building', () => {
    const verticalFarm = makeCity({ buildings: ['vertical_farm'] });
    const fabricator = makeCity({ buildings: ['circular_fabricator'] });
    const artsLab = makeCity({ buildings: ['immersive_arts_lab'] });
    const unrelated = makeCity({ buildings: ['library'] });

    expect(getCityTechYields(verticalFarm, map, ['closed-loop-food-systems']).total.food).toBe(1);
    expect(getCityTechYields(fabricator, map, ['molecular-fabrication']).total.production).toBe(1);
    expect(getCityTechYields(artsLab, map, ['digital-legacy']).total.science).toBe(1);
    expect(getCityTechYields(artsLab, map, ['immersive-worlds']).total.science).toBe(1);
    expect(getCityTechYields(unrelated, map, [
      'closed-loop-food-systems', 'molecular-fabrication', 'digital-legacy',
    ]).total).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });

  it('Seabed Stewardship benefits coastal cities but not inland cities', () => {
    const coastal = makeCity({ position: { q: 0, r: 0 } });
    const inland = makeCity();
    map.tiles[hexKey(coastal.position)] = {
      ...map.tiles[hexKey(coastal.position)]!,
      terrain: 'coast',
    };

    expect(getCityTechYields(coastal, map, ['seabed-stewardship']).total).toEqual({ food: 0, production: 1, gold: 0, science: 1 });
    expect(getCityTechYields(inland, map, ['seabed-stewardship']).total).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
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

  it('cityFlatConditional (requiresWonder): applies for a city hosting a completed legendary wonder', () => {
    const city = makeCity();
    expect(getCityTechYields(city, map, ['renaissance-architecture'], { hostsCompletedLegendaryWonder: true }).total.production).toBe(2);
  });

  it('cityFlatConditional (requiresWonder): applies for a city with a natural wonder tile', () => {
    const centerCoord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', centerCoord, map, mkC()), population: 1 };
    const wonderTile = city.ownedTiles.find(c => hexKey(c) !== hexKey(city.position))!;
    forceTile(map, wonderTile, 'mountain', { wonder: 'test-natural-wonder' });
    expect(getCityTechYields(city, map, ['renaissance-architecture']).total.production).toBe(2);

    forceTile(map, wonderTile, 'mountain', { wonder: null });
    expect(getCityTechYields(city, map, ['renaissance-architecture']).total.production).toBe(0);
  });

  it('cityFlatConditional (requiresWonder): does not apply for a city with neither wonder kind', () => {
    const city = makeCity();
    expect(getCityTechYields(city, map, ['renaissance-architecture']).total.production).toBe(0);
    expect(getCityTechYields(city, map, ['renaissance-architecture'], { hostsCompletedLegendaryWonder: false }).total.production).toBe(0);
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

  it('cooperative-platforms rewards domestic routes but not foreign routes', () => {
    expect(getTradeRouteTechGold(domesticRoute, ['cooperative-platforms'])).toBe(1);
    expect(getTradeRouteTechGold(foreignRoute, ['cooperative-platforms'])).toBe(0);
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

describe('MR6: requiresAllBuildings (smart-cities)', () => {
  let map: GameMap;
  beforeAll(() => {
    map = generateMap(20, 20, 'tech-yield-mr6-test');
  });
  function makeCity(overrides: Partial<City> = {}): City {
    const coord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = foundCity('player', coord, map, mkC());
    return { ...city, population: 4, ...overrides };
  }

  it('applies only when ALL required buildings are present', () => {
    const both = makeCity({ buildings: ['factory', 'semiconductor_fab'] });
    expect(getCityTechYields(both, map, ['smart-cities']).total).toEqual({ food: 0, production: 2, gold: 0, science: 1 });
  });

  it('does not apply with only one of the required buildings', () => {
    const onlyFactory = makeCity({ buildings: ['factory'] });
    const onlyFab = makeCity({ buildings: ['semiconductor_fab'] });
    expect(getCityTechYields(onlyFactory, map, ['smart-cities']).total).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
    expect(getCityTechYields(onlyFab, map, ['smart-cities']).total).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });
});

describe('MR6: empirePercent resource "all" (pragmatism)', () => {
  it('applies the percent to every resource key', () => {
    const percents = getEmpireTechPercents(['pragmatism']);
    expect(percents).toEqual({ food: 5, production: 5, gold: 5, science: 5 });
  });
});

describe('MR6: tradeRoutePercent (finance-capitalism)', () => {
  it('sums percent bonuses that apply to trade-route gold only', () => {
    expect(getTradeRouteTechGoldPercent(['finance-capitalism'])).toBe(25);
    expect(getTradeRouteTechGoldPercent([])).toBe(0);
  });
});

describe('MR6: empireFlat (e.g. decolonization)', () => {
  it('returns the flat civ-total yields once, not per city', () => {
    expect(getEmpireFlatTechYields(['decolonization']).gold).toBe(2);
    expect(getEmpireFlatTechYields([]).gold).toBe(0);
  });

  it('sums multiple empireFlat techs', () => {
    const yields = getEmpireFlatTechYields(['decolonization', 'international-institutions']);
    expect(yields.gold).toBe(3);
    expect(yields.science).toBe(1);
  });
});

describe('MR6: perCompletedLegendaryWonder (digital-art)', () => {
  it('multiplies flat gold by completed wonder count', () => {
    expect(getCivWonderTechGold(['digital-art'], 3)).toBe(3);
    expect(getCivWonderTechGold(['digital-art'], 0)).toBe(0);
    expect(getCivWonderTechGold([], 3)).toBe(0);
  });
});

describe('MR6: perRoutePartnerCiv (globalization)', () => {
  it('multiplies flat gold by distinct partner civ count', () => {
    expect(getCivRoutePartnerTechGold(['globalization'], 4)).toBe(4);
    expect(getCivRoutePartnerTechGold([], 4)).toBe(0);
  });
});

describe('MR6: perCityRoute (digital-economy)', () => {
  let map: GameMap;
  beforeAll(() => {
    map = generateMap(20, 20, 'tech-yield-percityroute-test');
  });
  function makeCity(overrides: Partial<City> = {}): City {
    const coord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = foundCity('player', coord, map, mkC());
    return { ...city, population: 1, ...overrides };
  }

  it('applies gold per active route only in cities with the fintech hub', () => {
    const withHub = makeCity({ buildings: ['fintech_hub'] });
    expect(getCityTechYields(withHub, map, ['digital-economy'], { activeRouteCount: 3 }).total.gold).toBe(3);
  });

  it('does not apply without the fintech hub', () => {
    const withoutHub = makeCity({ buildings: [] });
    expect(getCityTechYields(withoutHub, map, ['digital-economy'], { activeRouteCount: 3 }).total.gold).toBe(0);
  });

  it('is zero with no active routes even with the hub', () => {
    const withHub = makeCity({ buildings: ['fintech_hub'] });
    expect(getCityTechYields(withHub, map, ['digital-economy'], {}).total.gold).toBe(0);
  });
});

describe('MR6: terrainYield (polar-operations)', () => {
  it('applies the bonus only to matching terrains', () => {
    expect(getTerrainTechYieldBonus('tundra', ['polar-operations'])).toEqual({ food: 1, production: 1, gold: 0, science: 0 });
    expect(getTerrainTechYieldBonus('snow', ['polar-operations'])).toEqual({ food: 1, production: 1, gold: 0, science: 0 });
    expect(getTerrainTechYieldBonus('grassland', ['polar-operations'])).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });

  it('is a no-op without the tech', () => {
    expect(getTerrainTechYieldBonus('tundra', [])).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });
});

describe('MR6: maintenanceDiscount (green-architecture)', () => {
  it('applies the multiplier at or above minBuildings', () => {
    expect(getMaintenanceDiscountMultiplier(['green-architecture'], 6)).toBe(0.9);
    expect(getMaintenanceDiscountMultiplier(['green-architecture'], 10)).toBe(0.9);
  });

  it('does not apply below minBuildings or without the tech', () => {
    expect(getMaintenanceDiscountMultiplier(['green-architecture'], 5)).toBe(1);
    expect(getMaintenanceDiscountMultiplier([], 6)).toBe(1);
  });
});

describe('MR6: lowestCityScience (network-governance)', () => {
  it('exposes the flat science bonus value for the caller to apply to the lowest-science city', () => {
    expect(getLowestCityScienceBonus(['network-governance'])).toBe(2);
    expect(getLowestCityScienceBonus([])).toBe(0);
  });
});

describe('MR6: foodFromScience (genomics)', () => {
  let map: GameMap;
  beforeAll(() => {
    map = generateMap(20, 20, 'tech-yield-genomics-test');
  });

  it('adds +1 food per 3 science this city generates that turn', () => {
    const coord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', coord, map, mkC()), buildings: ['library'], population: 1 };
    const withoutGenomics = calculateCityYields(city, map, undefined, ['scientific-method']);
    const withGenomics = calculateCityYields(city, map, undefined, ['scientific-method', 'genomics']);
    expect(withGenomics.food).toBe(withoutGenomics.food + Math.floor(withoutGenomics.science / 3));
  });

  it('is a no-op without the tech', () => {
    const coord = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', coord, map, mkC()), population: 1 };
    const withoutGenomics = calculateCityYields(city, map, undefined, []);
    const withoutGenomicsAgain = calculateCityYields(city, map, undefined, []);
    expect(withoutGenomics.food).toBe(withoutGenomicsAgain.food);
  });
});

describe('MR7: getRoadTileTechGold (postal-service)', () => {
  it('is a no-op without the tech', () => {
    expect(getRoadTileTechGold([], 7)).toBe(0);
  });

  it('grants +1 gold per owned road tile', () => {
    expect(getRoadTileTechGold(['postal-service'], 4)).toBe(4);
  });

  it('caps at +10 regardless of road tile count', () => {
    expect(getRoadTileTechGold(['postal-service'], 25)).toBe(10);
  });
});

describe('MR7: getConnectedCityTechGold (courier-network / colonial-railways / transcontinental-rail)', () => {
  it('is a no-op without any of the techs', () => {
    expect(getConnectedCityTechGold([], 3)).toBe(0);
  });

  it('is a no-op for an unconnected city count of zero', () => {
    expect(getConnectedCityTechGold(['courier-network', 'colonial-railways'], 0)).toBe(0);
  });

  it('courier-network alone grants +1 gold per connected city', () => {
    expect(getConnectedCityTechGold(['courier-network'], 3)).toBe(3);
  });

  it('colonial-railways stacks with courier-network for +3 gold per connected city', () => {
    expect(getConnectedCityTechGold(['courier-network', 'colonial-railways'], 2)).toBe(6);
  });

  it('transcontinental-rail requires railway-expansion too before it stacks in', () => {
    expect(getConnectedCityTechGold(['courier-network', 'colonial-railways', 'transcontinental-rail'], 1)).toBe(3);
    expect(getConnectedCityTechGold(
      ['courier-network', 'colonial-railways', 'transcontinental-rail', 'railway-expansion'],
      1,
    )).toBe(5);
  });

  it('electric-telegraph grants +1 gold per connected city, capped at +8', () => {
    expect(getConnectedCityTechGold(['electric-telegraph'], 5)).toBe(5);
    expect(getConnectedCityTechGold(['electric-telegraph'], 12)).toBe(8);
  });

  it('electric-telegraph stacks additively with courier-network, still capped only on its own term', () => {
    expect(getConnectedCityTechGold(['electric-telegraph', 'courier-network'], 12)).toBe(1 * 12 + 8);
  });

  it('electric-telegraph contributes nothing without the tech', () => {
    expect(getConnectedCityTechGold(['courier-network'], 12)).toBe(12);
  });
});
