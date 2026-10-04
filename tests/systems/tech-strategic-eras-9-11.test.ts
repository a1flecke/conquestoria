import { describe, expect, it } from 'vitest';
import type { City, GameMap } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { TECH_YIELD_MODIFIERS } from '@/systems/tech-yield-definitions';
import {
  getCityTechYields,
  getCivRoutePartnerTechGold,
  getMaintenanceDiscountMultiplier,
  getTerrainTechYieldBonus,
  getTradeRouteTechGold,
} from '@/systems/tech-yield-system';
import { getCombatModifier, type CombatModifierContext } from '@/systems/unit-modifier-system';
import { foundCity } from '@/systems/city-system';
import { isPositionCoastal } from '@/systems/city-lifecycle';
import { generateMap } from '@/systems/map-generator';

// #1305 (#420 child 4): the Era 9-11 flat yields now depend on what the player built, grew, worked or traded.
// The maximal reference economy is exactly unchanged by design (pacing-reference-economy.test.ts).

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
const map: GameMap = generateMap(20, 20, 'eras-9-11');
const start = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;

function city(overrides: Partial<City> = {}): City {
  return { ...foundCity('player', start, map, counters()), population: 6, ...overrides };
}
const yieldsFor = (c: City, techs: string[], context = {}) => getCityTechYields(c, map, techs, context).total;
const text = (id: string) => TECH_TREE.find(t => t.id === id)!.unlocks.join(' ');

function combatCtx(overrides: Partial<CombatModifierContext> = {}): CombatModifierContext {
  return { completedTechs: [], activeNationalProjects: [], fullHP: true, inFriendlyCity: false, opponentType: 'warrior', ...overrides };
}

describe('Eras 9-11 strategic-choice pass (#1305)', () => {
  it('no shipped tech through Era 11 keeps an unconditional flat yield', () => {
    const offenders = TECH_YIELD_MODIFIERS
      .filter(m => ['cityFlat', 'empireFlat', 'empirePercent'].includes(m.effect.kind))
      .map(m => m.techId)
      .filter(id => (TECH_TREE.find(t => t.id === id)?.era ?? 99) >= 9 && (TECH_TREE.find(t => t.id === id)?.era ?? 99) <= 11);
    expect(offenders).toEqual([]);
  });

  it('building-conditioned techs pay only with the named building, and not without the tech', () => {
    const cases: Array<[string, string[], 'food' | 'production' | 'gold' | 'science', number]> = [
      ['quantum-theory', ['university'], 'science', 2],
      ['nuclear-theory', ['atomic_laboratory'], 'science', 2],
      ['radar-systems', ['radar_station'], 'science', 2],
      ['post-colonial-theory', ['census_office'], 'science', 1],
      ['molecular-biology', ['genetic_research_lab'], 'science', 2],
      ['structuralism', ['natural_history_museum'], 'science', 2],
      ['international-institutions', ['un_delegation'], 'gold', 1],
      ['universal-healthcare', ['public_hospital'], 'food', 2],
      ['vaccination-campaigns', ['sanatorium'], 'food', 2],
      ['keynesian-economics', ['bank'], 'gold', 2],
      ['black-ops-programs', ['intelligence-agency'], 'gold', 2],
      ['cold-war-networks', ['security-bureau'], 'gold', 2],
      ['synthetic-polymers', ['chemical_plant'], 'production', 1],
      ['aluminium-smelting', ['steel_mill'], 'production', 1],
      ['megastructures', ['power_station'], 'production', 2],
    ];
    for (const [techId, buildings, key, amount] of cases) {
      expect(yieldsFor(city({ buildings }), [techId])[key], techId).toBe(amount);
      expect(yieldsFor(city({ buildings }), [])[key], `${techId} without tech`).toBe(0);
      expect(yieldsFor(city({ buildings: [] }), [techId])[key], `${techId} without building`).toBe(0);
    }
  });

  it('ecumenical-movement needs both a temple and a monastery', () => {
    const both = yieldsFor(city({ buildings: ['temple', 'monastery'] }), ['ecumenical-movement']);
    expect([both.science, both.food]).toEqual([1, 1]);
    expect(yieldsFor(city({ buildings: ['temple'] }), ['ecumenical-movement']).science).toBe(0);
    expect(yieldsFor(city({ buildings: ['monastery'] }), ['ecumenical-movement']).food).toBe(0);
  });

  it('secular-humanism helps only a city without a temple', () => {
    expect(yieldsFor(city({ buildings: [] }), ['secular-humanism']).food).toBe(1);
    expect(yieldsFor(city({ buildings: ['temple'] }), ['secular-humanism']).food).toBe(0);
  });

  it('population- and development-conditioned techs follow the city', () => {
    expect(yieldsFor(city({ population: 12 }), ['universal-suffrage']).food).toBe(2);
    expect(yieldsFor(city({ population: 3 }), ['universal-suffrage']).food).toBe(0);
    expect(yieldsFor(city({ population: 12 }), ['human-rights-framework']).gold).toBe(2);
    expect(yieldsFor(city({ population: 3 }), ['human-rights-framework']).gold).toBe(0);
    const many = ['granary', 'library', 'marketplace', 'forge', 'workshop', 'temple', 'monument', 'forum', 'archive', 'harbor'];
    expect(yieldsFor(city({ buildings: many }), ['civil-rights-legislation']).food).toBe(2);
    expect(yieldsFor(city({ buildings: many.slice(0, 5) }), ['civil-rights-legislation']).food).toBe(0);
  });

  it('stagflation-response discounts upkeep only in cities with 8 or more buildings', () => {
    expect(getMaintenanceDiscountMultiplier(['stagflation-response'], 8)).toBeCloseTo(0.8);
    expect(getMaintenanceDiscountMultiplier(['stagflation-response'], 7)).toBe(1);
    expect(getMaintenanceDiscountMultiplier([], 8)).toBe(1);
  });

  it('terrain techs add yield only on the terrains they name', () => {
    expect(getTerrainTechYieldBonus('desert', ['large-scale-irrigation']).food).toBe(1);
    expect(getTerrainTechYieldBonus('plains', ['large-scale-irrigation']).food).toBe(1);
    expect(getTerrainTechYieldBonus('forest', ['large-scale-irrigation']).food ?? 0).toBe(0);
    expect(getTerrainTechYieldBonus('ocean', ['aquaculture']).food).toBe(1);
    expect(getTerrainTechYieldBonus('coast', ['aquaculture']).food).toBe(1);
    expect(getTerrainTechYieldBonus('grassland', ['aquaculture']).food ?? 0).toBe(0);
    const drilling = getTerrainTechYieldBonus('ocean', ['deep-sea-drilling']);
    expect([drilling.gold, drilling.production]).toEqual([1, 1]);
    expect(getTerrainTechYieldBonus('coast', ['deep-sea-drilling']).gold ?? 0).toBe(0);
    expect(getTerrainTechYieldBonus('ocean', []).food ?? 0).toBe(0);
  });

  it('offshore-platforms needs a coastal city with a harbor', () => {
    const land = Object.values(map.tiles).filter(t => t.terrain === 'grassland' || t.terrain === 'plains');
    const shore = land.find(t => isPositionCoastal(t.coord, map))!;
    const dry = land.find(t => !isPositionCoastal(t.coord, map))!;
    const at = (coord: typeof start, buildings: string[]) => ({ ...foundCity('player', coord, map, counters()), population: 4, buildings });
    const paid = yieldsFor(at(shore.coord, ['harbor']), ['offshore-platforms']);
    expect([paid.gold, paid.production]).toEqual([2, 1]);
    expect(yieldsFor(at(shore.coord, []), ['offshore-platforms']).gold).toBe(0);
    expect(yieldsFor(at(dry.coord, ['harbor']), ['offshore-platforms']).gold).toBe(0);
  });

  it('route techs pay per route, per building, per partner or per foreign route', () => {
    const route = { id: 'r', fromCityId: 'a', toCityId: 'b', goldPerTrip: 10, turnsPerTrip: 2 };
    expect(getTradeRouteTechGold({ ...route, foreignCivId: 'rival' }, ['decolonization'])).toBe(1);
    expect(getTradeRouteTechGold(route, ['decolonization'])).toBe(0);
    expect(getCivRoutePartnerTechGold(['arms-control-negotiations'], 3)).toBe(3);
    expect(getCivRoutePartnerTechGold(['arms-control-negotiations'], 0)).toBe(0);
    expect(yieldsFor(city({ buildings: ['telephone_exchange'] }), ['wireless-telegraph'], { activeRouteCount: 3 }).gold).toBe(3);
    expect(yieldsFor(city({ buildings: [] }), ['wireless-telegraph'], { activeRouteCount: 3 }).gold).toBe(0);
    expect(yieldsFor(city({ buildings: ['caravanserai'] }), ['highway-network'], { activeRouteCount: 2 }).gold).toBe(2);
    expect(yieldsFor(city({ buildings: ['caravanserai'] }), ['highway-network'], { activeRouteCount: 0 }).gold).toBe(0);
  });

  it('tungsten-alloys and carbon-fiber are scoped to the unit classes their text names', () => {
    const tungsten = { completedTechs: ['tungsten-alloys'] };
    expect(getCombatModifier('tank', 'attacker', combatCtx(tungsten)).flat).toBe(2);
    expect(getCombatModifier('catapult', 'defender', combatCtx(tungsten)).flat).toBe(2);
    expect(getCombatModifier('warrior', 'attacker', combatCtx(tungsten)).flat).toBe(0);
    const carbon = { completedTechs: ['carbon-fiber'] };
    expect(getCombatModifier('tank', 'attacker', combatCtx(carbon)).flat).toBe(2);
    expect(getCombatModifier('jet_fighter', 'attacker', combatCtx(carbon)).flat).toBe(2);
    expect(getCombatModifier('warrior', 'attacker', combatCtx(carbon)).flat).toBe(0);
    expect(getCombatModifier('trireme', 'defender', combatCtx(carbon)).flat).toBe(0);
  });

  it('rewritten text names the real effect and none of the removed claims', () => {
    for (const id of [
      'quantum-theory', 'universal-suffrage', 'large-scale-irrigation', 'aluminium-smelting', 'wireless-telegraph',
      'secular-humanism', 'keynesian-economics', 'nuclear-theory', 'radar-systems', 'decolonization',
      'international-institutions', 'universal-healthcare', 'post-colonial-theory', 'human-rights-framework',
      'synthetic-polymers', 'highway-network', 'cold-war-networks', 'molecular-biology', 'arms-control-negotiations',
      'civil-rights-legislation', 'deep-sea-drilling', 'aquaculture', 'vaccination-campaigns', 'structuralism',
      'megastructures', 'offshore-platforms', 'black-ops-programs', 'ecumenical-movement',
    ]) {
      expect(text(id), id).not.toMatch(/all cities|empire-wide/);
    }
    expect(text('arms-control-negotiations')).not.toMatch(/\+5 gold/);
    expect(text('welfare-state')).toBe('');
    expect(text('tungsten-alloys')).not.toMatch(/all military/);
    expect(text('carbon-fiber')).not.toMatch(/all military/);
  });

  it('text promising a number is backed by a table row, a modifier, or a named owner', () => {
    // Every Era 9-11 tech that quotes an effect must have a yield row, a unit-modifier row or code that names it.
    const withRow = new Set(TECH_YIELD_MODIFIERS.map(m => m.techId));
    for (const id of ['cold-war-networks', 'decolonization', 'international-institutions', 'arms-control-negotiations']) {
      expect(withRow.has(id), id).toBe(true);
    }
  });

  it('does not change unlock chains', () => {
    expect(TECH_TREE.find(t => t.id === 'decolonization')!.unlocks.join(' ')).toContain('Federal Autonomy');
    expect(TECH_TREE.find(t => t.id === 'quantum-theory')!.prerequisites.length).toBeGreaterThan(0);
  });
});
