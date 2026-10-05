import { describe, expect, it } from 'vitest';
import type { City, GameMap, HexCoord, TerrainType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  getCityTechYields,
  getCivLuxuryTechGold,
  getMaintenanceDiscountMultiplier,
  getTerrainTechYieldBonus,
  getTradeRouteTechGold,
} from '@/systems/tech-yield-system';

// #1315: repeated tech niches now answer different questions. Each changed tech is tested as
// condition absent -> no effect, condition present -> exact effect.

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
const map: GameMap = generateMap(20, 20, 'niches-1315');
const start = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;

function city(overrides: Partial<City> = {}): City {
  return { ...foundCity('player', start, map, counters()), population: 6, ...overrides };
}
const yieldsFor = (c: City, techs: string[], context = {}) => getCityTechYields(c, map, techs, context).total;

function forceTile(coord: HexCoord, terrain: TerrainType, overrides: Partial<GameMap['tiles'][string]> = {}): void {
  map.tiles[hexKey(coord)] = {
    ...map.tiles[hexKey(coord)], coord, terrain, owner: 'player', improvement: 'none', improvementTurnsLeft: 0,
    hasRiver: false, wonder: null, resource: null, ...overrides,
  };
}
const text = (id: string) => TECH_TREE.find(t => t.id === id)!.unlocks.join(' ');

describe('building-keyed science niches stay on distinct buildings (#1315)', () => {
  const cases: Array<[string, string, number]> = [
    ['rocketry', 'rocket_program', 2],
    ['electronic-computing', 'signals_bureau', 3],
    ['integrated-circuits', 'semiconductor_fab', 3],
    ['religious-modernism', 'monastery', 1],
    ['interfaith-council', 'shrine', 1],
  ];
  for (const [techId, building, amount] of cases) {
    it(`${techId}: +${amount} science only in a city with a ${building}`, () => {
      expect(yieldsFor(city({ buildings: [building] }), [techId]).science).toBe(amount);
      expect(yieldsFor(city({ buildings: [] }), [techId]).science).toBe(0);
      expect(yieldsFor(city({ buildings: ['research_institute'] }), [techId]).science, 'research_institute no longer pays').toBe(0);
      expect(yieldsFor(city({ buildings: [building] }), []).science).toBe(0);
    });
  }

  it('nuclear-physics keeps the research-institute anchor', () => {
    expect(yieldsFor(city({ buildings: ['research_institute'] }), ['nuclear-physics']).science).toBe(3);
    expect(yieldsFor(city({ buildings: [] }), ['nuclear-physics']).science).toBe(0);
  });
});

describe('media gold splits by the broadcast building (#1315)', () => {
  it('propaganda-campaigns needs a radio station, television a television station, satellite-television a film studio', () => {
    expect(yieldsFor(city({ buildings: ['radio_station'] }), ['propaganda-campaigns']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['film_studio'] }), ['propaganda-campaigns']).gold).toBe(0);
    expect(yieldsFor(city({ buildings: ['television_station'] }), ['television']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['radio_station'] }), ['television']).gold).toBe(0);
    expect(yieldsFor(city({ buildings: ['film_studio'] }), ['satellite-television']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['television_station'] }), ['satellite-television']).gold).toBe(0);
  });
});

describe('trade and market niches use different decision surfaces (#1315)', () => {
  const route = { id: 'r', fromCityId: 'a', toCityId: 'b', goldPerTrip: 10, turnsPerTrip: 2 };

  it('convoy-system pays per route in cities with a harbor', () => {
    expect(yieldsFor(city({ buildings: ['harbor'] }), ['convoy-system'], { activeRouteCount: 2 }).gold).toBe(4);
    expect(yieldsFor(city({ buildings: [] }), ['convoy-system'], { activeRouteCount: 2 }).gold).toBe(0);
    expect(getTradeRouteTechGold(route, ['convoy-system'], { bothEndpointsCoastal: true })).toBe(0);
  });

  it('petrodollar-system pays per route in cities with a central bank', () => {
    expect(yieldsFor(city({ buildings: ['central_bank'] }), ['petrodollar-system'], { activeRouteCount: 3 }).gold).toBe(6);
    expect(yieldsFor(city({ buildings: [] }), ['petrodollar-system'], { activeRouteCount: 3 }).gold).toBe(0);
    expect(yieldsFor(city({ buildings: ['central_bank'] }), ['petrodollar-system'], { activeRouteCount: 0 }).gold).toBe(0);
    expect(getTradeRouteTechGold(route, ['petrodollar-system'])).toBe(0);
  });

  it('industrial-monopoly pays per owned luxury resource, not per market', () => {
    expect(getCivLuxuryTechGold(['industrial-monopoly'], 3)).toBe(3);
    expect(getCivLuxuryTechGold(['industrial-monopoly'], 0)).toBe(0);
    expect(yieldsFor(city({ buildings: ['marketplace'] }), ['industrial-monopoly']).gold).toBe(0);
  });

  it('consumer-boom follows city size', () => {
    expect(yieldsFor(city({ population: 12 }), ['consumer-boom']).gold).toBe(3);
    expect(yieldsFor(city({ population: 3 }), ['consumer-boom']).gold).toBe(0);
  });

  it('social-contract keeps the marketplace anchor', () => {
    expect(yieldsFor(city({ buildings: ['marketplace'] }), ['social-contract']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: [] }), ['social-contract']).gold).toBe(0);
  });
});

describe('culture-gold niche (#1315)', () => {
  it('separation-of-powers discounts upkeep in cities with 6 or more buildings instead of paying culture gold', () => {
    expect(getMaintenanceDiscountMultiplier(['separation-of-powers'], 6)).toBeCloseTo(0.9);
    expect(getMaintenanceDiscountMultiplier(['separation-of-powers'], 5)).toBe(1);
    expect(yieldsFor(city({ buildings: ['temple', 'monument'] }), ['separation-of-powers']).gold).toBe(0);
  });

  it('existentialism pays per philosophers circle and university, not per culture building', () => {
    expect(yieldsFor(city({ buildings: ['philosophers_circle', 'university'] }), ['existentialism']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['temple', 'monument'] }), ['existentialism']).gold).toBe(0);
  });

  it('postmodernism pays per exhibition hall', () => {
    expect(yieldsFor(city({ buildings: ['exhibition_hall'] }), ['postmodernism']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['temple'] }), ['postmodernism']).gold).toBe(0);
    expect(getCivLuxuryTechGold(['postmodernism'], 2)).toBe(0);
  });

  it('renaissance-painting and video-games stay the culture-building rungs', () => {
    expect(yieldsFor(city({ buildings: ['temple', 'monument'] }), ['renaissance-painting']).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['temple', 'monument'] }), ['video-games']).gold).toBe(4);
  });
});

describe('farm ladder (#1315)', () => {
  it('improved-agriculture rewards worked grassland, keeping granary food', () => {
    expect(getTerrainTechYieldBonus('grassland', ['improved-agriculture']).food).toBe(1);
    expect(getTerrainTechYieldBonus('plains', ['improved-agriculture']).food ?? 0).toBe(0);
    expect(yieldsFor(city({ buildings: ['granary'] }), ['improved-agriculture']).food).toBe(1);
  });

  it('mechanized-farming keeps farm production and pays +1 food per ranch city instead of per granary', () => {
    expect(yieldsFor(city({ buildings: ['ranch'] }), ['mechanized-farming']).food).toBe(1);
    expect(yieldsFor(city({ buildings: ['granary'] }), ['mechanized-farming']).food).toBe(0);
  });

  it('scientific-breeding pays per plantation (not per farm) and per granary', () => {
    const base = city({ population: 3 });
    const work = base.ownedTiles.find(c => hexKey(c) !== hexKey(base.position))!;
    forceTile(work, 'plains', { improvement: 'plantation' });
    const withPlantation = { ...base, workedTiles: [work], buildings: ['granary'] };
    expect(yieldsFor(withPlantation, ['scientific-breeding']).food).toBe(2);
    forceTile(work, 'plains', { improvement: 'farm' });
    expect(yieldsFor(withPlantation, ['scientific-breeding']).food).toBe(1);
  });

  it('chemical-fertilizers lifts poor-soil terrain only', () => {
    for (const terrain of ['tundra', 'jungle', 'swamp']) {
      expect(getTerrainTechYieldBonus(terrain, ['chemical-fertilizers']).food, terrain).toBe(1);
    }
    expect(getTerrainTechYieldBonus('grassland', ['chemical-fertilizers']).food ?? 0).toBe(0);
  });

  it('green-revolution-crops follows city population', () => {
    expect(yieldsFor(city({ population: 12 }), ['green-revolution-crops']).food).toBe(3);
    expect(yieldsFor(city({ population: 3 }), ['green-revolution-crops']).food).toBe(0);
  });

  it('plantation-farming, agricultural-machinery and pesticides stay per-farm rungs', () => {
    const base = city({ population: 3 });
    const work = base.ownedTiles.find(c => hexKey(c) !== hexKey(base.position))!;
    forceTile(work, 'plains', { improvement: 'farm' });
    const farmCity = { ...base, workedTiles: [work] };
    expect(yieldsFor(farmCity, ['plantation-farming']).food).toBe(1);
    expect(yieldsFor(farmCity, ['agricultural-machinery']).food).toBe(2);
    expect(yieldsFor(farmCity, ['pesticides']).food).toBe(1);
  });
});

describe('copy matches behaviour (#1315)', () => {
  it('rewritten text names the new condition and no longer the old one', () => {
    expect(text('rocketry')).toContain('rocket program');
    expect(text('electronic-computing')).toContain('signals bureau');
    expect(text('integrated-circuits')).toContain('semiconductor fabricator');
    expect(text('religious-modernism')).toContain('monastery');
    expect(text('interfaith-council')).toContain('shrine');
    expect(text('propaganda-campaigns')).toContain('radio station');
    expect(text('television')).toContain('television station');
    expect(text('satellite-television')).toContain('film studio');
    expect(text('convoy-system')).toContain('harbor');
    expect(text('petrodollar-system')).toContain('central bank');
    expect(text('industrial-monopoly')).toContain('luxury');
    expect(text('consumer-boom')).toContain('population');
    expect(text('separation-of-powers')).toContain('upkeep');
    expect(text('existentialism')).toContain('philosophers circle');
    expect(text('postmodernism')).toContain('exhibition hall');
    expect(text('improved-agriculture')).toContain('grassland');
    expect(text('mechanized-farming')).toContain('ranch');
    expect(text('scientific-breeding')).toContain('plantation');
    expect(text('chemical-fertilizers')).toContain('tundra');
    expect(text('green-revolution-crops')).toContain('population');
    expect(text('rocketry')).not.toContain('research institute');
    expect(text('electronic-computing')).not.toContain('research institute');
    expect(text('integrated-circuits')).not.toContain('research institute');
  });
});
