import { describe, expect, it } from 'vitest';
import type { City, GameMap } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { TECH_YIELD_MODIFIERS, getFoundingBonusFood } from '@/systems/tech-yield-definitions';
import { isPositionCoastal } from '@/systems/city-lifecycle';
import {
  getCityTechYields,
  getEmpireTechPercents,
  getCivRoutePartnerTechGold,
} from '@/systems/tech-yield-system';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

// #1304 (#420 child 3): the Era 5-8 flat and percentage yields now depend on what the player built, owns or traded.

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
const map: GameMap = generateMap(20, 20, 'eras-5-8');
const inland = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;

function city(overrides: Partial<City> = {}): City {
  return { ...foundCity('player', inland, map, counters()), population: 6, ...overrides };
}

const yieldsFor = (c: City, ...techs: string[]) => getCityTechYields(c, map, techs).total;

describe('Eras 5-8 strategic-choice pass (#1304)', () => {
  it('only the four documented percentage techs keep an unconditional yield in Eras 5-8', () => {
    // rationalism (+5% science), parliamentary-reform (+5% production), mass-production (+10% production) and
    // pragmatism (+5% all) feed the pinned science/production reference economy that RESEARCH_OUTPUT_BY_ERA and
    // every persisted tech cost are derived from (tests/systems/pacing-reference-economy.test.ts). Replacing them
    // needs an explicit pacing decision and a cost migration, so they are a tracked follow-up rather than silently
    // rewritten here.
    const flatKinds = new Set(['cityFlat', 'empireFlat', 'empirePercent']);
    const offenders = TECH_YIELD_MODIFIERS
      .filter(m => flatKinds.has(m.effect.kind))
      .filter(m => {
        const era = TECH_TREE.find(t => t.id === m.techId)?.era ?? 99;
        return era >= 5 && era <= 8;
      })
      .map(m => m.techId)
      .sort();
    expect(offenders).toEqual(['mass-production', 'parliamentary-reform', 'pragmatism', 'rationalism']);
  });

  it('building-conditioned techs pay only with the building (and not without the tech)', () => {
    const cases: Array<[string, string[], keyof ReturnType<typeof yieldsFor>, number]> = [
      ['civic-humanism', ['forum', 'courthouse'], 'gold', 2],
      ['empiricism', ['observatory'], 'science', 1],
      ['blast-furnace-tech', ['forge'], 'production', 1],
      ['industrialization', ['factory'], 'science', 2],
      ['engineering-exhibition', ['workshop'], 'science', 1],
      ['public-records', ['archive'], 'science', 1],
      ['grand-opera', ['opera_house'], 'gold', 3],
      ['baroque-music', ['concert_hall'], 'gold', 2],
    ];
    for (const [techId, buildings, key, amount] of cases) {
      const built = city({ buildings });
      expect(yieldsFor(built, techId)[key], techId).toBe(amount);
      expect(yieldsFor(built)[key], `${techId} without tech`).toBe(0);
      expect(yieldsFor(city({ buildings: [] }), techId)[key], `${techId} without building`).toBe(0);
    }
  });

  it('archive-and-university techs need both', () => {
    expect(yieldsFor(city({ buildings: ['archive', 'university'] }), 'positivism').science).toBe(3);
    expect(yieldsFor(city({ buildings: ['university'] }), 'positivism').science).toBe(1);
    expect(yieldsFor(city({ buildings: ['archive'] }), 'positivism').science).toBe(0);
  });

  it('shorthand-press pays per scribes hall in both yields', () => {
    const one = yieldsFor(city({ buildings: ['archive', 'scribes_hall'] }), 'shorthand-press');
    expect(one.science).toBe(1);
    expect(one.gold).toBe(1);
    expect(yieldsFor(city({ buildings: ['archive'] }), 'shorthand-press').science).toBe(0);
  });

  it('refrigeration follows population', () => {
    expect(yieldsFor(city({ population: 6 }), 'refrigeration').food).toBe(2);
    expect(yieldsFor(city({ population: 3 }), 'refrigeration').food).toBe(1);
    expect(yieldsFor(city({ population: 2 }), 'refrigeration').food).toBe(0);
  });

  it('newspaper-press needs a developed city', () => {
    const developed = city({ buildings: ['library', 'granary', 'marketplace', 'forge'] });
    expect(yieldsFor(developed, 'newspaper-press').science).toBe(2);
    expect(yieldsFor(city({ buildings: ['library'] }), 'newspaper-press').science).toBe(0);
  });

  it('sanitation-networks helps coastal cities only', () => {
    const land = Object.values(map.tiles).filter(t => t.terrain === 'grassland' || t.terrain === 'plains');
    const shore = land.find(t => isPositionCoastal(t.coord, map));
    const dry = land.find(t => !isPositionCoastal(t.coord, map));
    expect(shore).toBeDefined();
    expect(dry).toBeDefined();
    const at = (coord: typeof inland) => ({ ...foundCity('player', coord, map, counters()), population: 4 });
    expect(yieldsFor(at(shore!.coord), 'sanitation-networks').food).toBe(2);
    expect(yieldsFor(at(dry!.coord), 'sanitation-networks').food).toBe(0);
  });

  it('land-survey pays at founding, not per turn', () => {
    expect(getFoundingBonusFood(['land-survey'])).toBe(3);
    expect(yieldsFor(city(), 'land-survey').food).toBe(0);
  });

  it('percentage techs that stay still stack as before', () => {
    expect(getEmpireTechPercents(['rationalism']).science).toBe(5);
    expect(getEmpireTechPercents(['mass-production']).production).toBe(10);
    expect(getEmpireTechPercents(['parliamentary-reform']).production).toBe(5);
  });

  it('mercantilism pays per distinct peacetime partner civilization', () => {
    expect(getCivRoutePartnerTechGold(['mercantilism'], 3)).toBe(3);
    expect(getCivRoutePartnerTechGold(['mercantilism'], 0)).toBe(0);
  });

  it('rewritten unlock text names the real effect and none of the removed flat claims', () => {
    const text = (id: string) => TECH_TREE.find(t => t.id === id)!.unlocks.join(' ');
    for (const id of ['civic-humanism', 'mercantilism']) {
      expect(text(id), id).not.toMatch(/\d%\s+(gold|science|production|all)/);
    }
    for (const id of ['empiricism', 'blast-furnace-tech', 'industrialization', 'newspaper-press', 'refrigeration', 'sanitation-networks', 'public-records', 'engineering-exhibition']) {
      expect(text(id), id).not.toMatch(/all cities|empire-wide/);
    }
    expect(text('public-health-service')).toBe('');
    expect(text('telephony')).toBe('');
    expect(text('circumnavigation')).not.toMatch(/faster/);
  });

  it('does not change unlock chains for the techs touched here', () => {
    expect(TECH_TREE.find(t => t.id === 'civic-humanism')!.prerequisites).toEqual(['political-philosophy', 'drama-poetry']);
    expect(TECH_TREE.find(t => t.id === 'rationalism')!.prerequisites.length).toBeGreaterThan(0);
  });
});
