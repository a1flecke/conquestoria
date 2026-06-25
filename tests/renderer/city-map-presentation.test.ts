import { describe, expect, it } from 'vitest';
import type { City, GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { LegendaryWonderMapEntry } from '@/systems/legendary-wonder-map-presentation';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import {
  getCityBannerTextColor,
  getCityDioramaBounds,
} from '@/renderer/city-render-passes';
import {
  buildLiveCityMapPresentation,
  buildStaleCityMapPresentation,
  rankCitySpecializations,
  resolvePopulationTier,
  selectPrimaryCityWonder,
} from '@/renderer/city-map-presentation';

function makeCity(state: GameState): City {
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map, state.idCounters);
  city.id = 'presentation-city';
  state.cities[city.id] = city;
  state.civilizations.player.cities = [city.id];
  return city;
}

function wonder(
  wonderId: string,
  state: 'completed' | 'under-construction',
  turnCompleted: number,
  relationship: 'owned' | 'known-rival' = 'owned',
  progressRatio?: number,
): LegendaryWonderMapEntry {
  return {
    wonderId,
    cityId: 'presentation-city',
    coord: { q: 0, r: 0 },
    ownerId: relationship === 'owned' ? 'player' : 'ai-1',
    relationship,
    state,
    turnCompleted,
    label: wonderId,
    visual: {} as LegendaryWonderMapEntry['visual'],
    metadata: {} as LegendaryWonderMapEntry['metadata'],
    progressRatio,
  };
}

describe('city map presentation', () => {
  it.each([
    [1, 'outpost'],
    [2, 'outpost'],
    [3, 'village'],
    [4, 'village'],
    [5, 'town'],
    [7, 'town'],
    [8, 'city'],
    [11, 'city'],
    [12, 'metropolis'],
  ] as const)('derives population tier from population alone at %i', (population, expected) => {
    expect(resolvePopulationTier(population)).toBe(expected);
  });

  it('ranks at most two completed-building specializations deterministically', () => {
    const city = { buildings: ['barracks', 'walls', 'workshop', 'forge', 'library', 'unknown'] } as City;

    expect(rankCitySpecializations(city)).toEqual(['military', 'production']);
  });

  it('uses a sufficiently advanced owned construction ghost before completed wonders', () => {
    const entries = [
      wonder('old', 'completed', 10),
      wonder('newest', 'completed', 40),
      wonder('ghost', 'under-construction', Number.MAX_SAFE_INTEGER, 'owned', 0.6),
    ];

    expect(selectPrimaryCityWonder(entries)).toEqual({
      primary: entries[2],
      completedOverflowCount: 2,
    });
  });

  it('ignores early construction ghosts and chooses the newest completed wonder', () => {
    const entries = [
      wonder('old', 'completed', 10),
      wonder('newest', 'completed', 40),
      wonder('early-ghost', 'under-construction', Number.MAX_SAFE_INTEGER, 'owned', 0.59),
    ];

    expect(selectPrimaryCityWonder(entries)).toEqual({
      primary: entries[1],
      completedOverflowCount: 1,
    });
  });

  it('never presents rival construction ghosts', () => {
    const completed = wonder('known-completed', 'completed', 20, 'known-rival');
    const rivalGhost = wonder('secret-ghost', 'under-construction', Number.MAX_SAFE_INTEGER, 'known-rival', 0.9);

    expect(selectPrimaryCityWonder([completed, rivalGhost])).toEqual({
      primary: completed,
      completedOverflowCount: 0,
    });
  });

  it('builds live identity from canonical owner, capital, breakaway, and building data', () => {
    const state = createNewGame(undefined, 'city-map-presentation', 'small');
    const city = makeCity(state);
    city.population = 8;
    city.buildings = ['barracks', 'walls', 'library'];
    state.civilizations.player.civType = 'greece';
    state.civilizations.player.breakaway = {
      originOwnerId: 'ai-1',
      originCityId: city.id,
      startedTurn: 2,
      establishesOnTurn: 12,
      status: 'secession',
    };

    const presentation = buildLiveCityMapPresentation(state, city, []);

    expect(presentation.populationTier).toBe('city');
    expect(presentation.visualFamily).toBe('hellenes');
    expect(presentation.specializations).toEqual(['military', 'science']);
    expect(presentation.isCapital).toBe(true);
    expect(presentation.isBreakawayCapital).toBe(true);
    expect(presentation.visibilityMode).toBe('live');
  });

  it('derives architecture era independently from population tier', () => {
    const state = createNewGame(undefined, 'city-map-era', 'small');
    const city = makeCity(state);
    city.population = 12;
    const eraTwo = getEraAdvancementTechs(2);
    state.civilizations.player.techState.completed = eraTwo
      .slice(0, Math.ceil(eraTwo.length * 0.6))
      .map(tech => tech.id);

    const presentation = buildLiveCityMapPresentation(state, city, []);

    expect(presentation.populationTier).toBe('metropolis');
    expect(presentation.architectureEra).toBe(2);
  });

  it('keeps minor civilizations on a generic visual family without major specializations', () => {
    const state = createNewGame(undefined, 'city-map-minor', 'small');
    const city = Object.values(state.cities).find(candidate => candidate.owner.startsWith('mc-'))!;
    city.buildings = ['barracks', 'walls'];

    expect(buildLiveCityMapPresentation(state, city, [])).toMatchObject({
      visualFamily: 'generic',
      specializations: [],
    });
  });

  it('keeps stale city presentation generic and free of inferred live details', () => {
    expect(buildStaleCityMapPresentation(12)).toMatchObject({
      populationTier: 'metropolis',
      architectureEra: 1,
      visualFamily: 'generic',
      specializations: [],
      isCapital: false,
      isBreakawayCapital: false,
      primaryWonder: undefined,
      completedWonderOverflowCount: 0,
      visibilityMode: 'last-seen',
    });
  });

  it('keeps the complete diorama within 75 percent of one pointy-top hex width', () => {
    const size = 48;
    const bounds = getCityDioramaBounds(size);

    expect(bounds.width).toBeLessThanOrEqual(Math.sqrt(3) * size * 0.75);
  });

  it('chooses readable banner text for light and dark civilization colors', () => {
    expect(getCityBannerTextColor('#f4d35e')).toBe('#181818');
    expect(getCityBannerTextColor('#26415f')).toBe('#fff');
  });
});
