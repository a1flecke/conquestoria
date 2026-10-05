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
import { foundCity, BUILDINGS } from '@/systems/city-system';
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
  it('no Era 5-8 tech keeps an unconditional yield', () => {
    // The last four percentage techs were replaced in #1340 (production pair) and #1341 (science pair).
    const flatKinds = new Set(['cityFlat', 'empireFlat', 'empirePercent']);
    const offenders = TECH_YIELD_MODIFIERS
      .filter(m => flatKinds.has(m.effect.kind))
      .filter(m => {
        const era = TECH_TREE.find(t => t.id === m.techId)?.era ?? 99;
        return era >= 5 && era <= 8;
      })
      .map(m => m.techId)
      .sort();
    expect(offenders).toEqual([]);
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
      ['mass-production', ['factory'], 'production', 4],
      ['parliamentary-reform', ['courthouse'], 'production', 2],
      ['parliamentary-reform', ['forum'], 'production', 2],
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

  it('no shipped tech pays an empire-wide percentage any more (#1340, #1341)', () => {
    expect(TECH_YIELD_MODIFIERS.filter(m => m.effect.kind === 'empirePercent').map(m => m.techId)).toEqual([]);
    expect(getEmpireTechPercents(['rationalism', 'pragmatism', 'mass-production', 'parliamentary-reform'])).toEqual({});
  });

  it('rationalism pays +1 science per science building and nothing for other buildings (#1341)', () => {
    expect(yieldsFor(city({ buildings: ['library', 'university', 'observatory'] }), 'rationalism').science).toBe(3);
    expect(yieldsFor(city({ buildings: ['library'] }), 'rationalism').science).toBe(1);
    expect(yieldsFor(city({ buildings: ['granary', 'marketplace', 'forge'] }), 'rationalism').science).toBe(0);
    expect(yieldsFor(city({ buildings: ['library', 'university'] })).science).toBe(0);
  });

  it('pragmatism pays only in cities with 12 or more buildings (#1341)', () => {
    const ids = Object.keys(BUILDINGS).slice(0, 12);
    expect(yieldsFor(city({ buildings: ids }), 'pragmatism')).toEqual({ food: 3, production: 4, gold: 3, science: 5 });
    expect(yieldsFor(city({ buildings: ids.slice(0, 11) }), 'pragmatism')).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
    expect(yieldsFor(city({ buildings: ids }))).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });

  it('mass-production pays per Factory city, not for other production buildings (#1340)', () => {
    expect(yieldsFor(city({ buildings: ['factory', 'workshop'] }), 'mass-production').production).toBe(4);
    expect(yieldsFor(city({ buildings: ['workshop', 'forge', 'steel_mill'] }), 'mass-production').production).toBe(0);
  });

  it('parliamentary-reform pays per forum and per courthouse and nothing else (#1340)', () => {
    expect(yieldsFor(city({ buildings: ['forum', 'courthouse'] }), 'parliamentary-reform').production).toBe(4);
    expect(yieldsFor(city({ buildings: ['library', 'marketplace', 'temple'] }), 'parliamentary-reform').production).toBe(0);
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
