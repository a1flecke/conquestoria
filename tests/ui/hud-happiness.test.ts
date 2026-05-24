import { describe, it, expect } from 'vitest';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import type { GameState } from '@/core/types';

// The HUD chip contract: getCivHappinessFromResources drives whether the chip shows.
// We test the helper directly since updateHUD() lives in main.ts and is not unit-testable.

const happinessSources = [
  { id: 'silk',    tech: 'irrigation', terrain: 'grassland', improvement: 'plantation' },
  { id: 'wine',    tech: 'pottery',    terrain: 'plains',    improvement: 'plantation' },
  { id: 'ivory',   tech: 'foraging',   terrain: 'forest',    improvement: 'camp'       },
  { id: 'furs',    tech: 'foraging',   terrain: 'forest',    improvement: 'camp'       },
  { id: 'incense', tech: 'currency',   terrain: 'desert',    improvement: 'plantation' },
] as const;

function makeStateWithHappiness(count: number): GameState {
  const cityPos = { q: 0, r: 0 };
  const tiles: Record<string, unknown> = {
    '0,0': { coord: cityPos, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' },
  };
  const ownedTiles: Array<{ q: number; r: number }> = [cityPos];
  const completed: string[] = [];

  for (let i = 0; i < count && i < happinessSources.length; i++) {
    const src = happinessSources[i];
    const coord = { q: i + 1, r: 0 };
    tiles[`${coord.q},0`] = { coord, terrain: src.terrain, elevation: 'lowland', resource: src.id, improvement: src.improvement, improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'player' };
    ownedTiles.push(coord);
    if (!completed.includes(src.tech)) completed.push(src.tech);
  }

  return {
    turn: 1, era: 1, currentPlayer: 'player',
    map: { width: 20, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'Rome', owner: 'player',
        position: cityPos, ownedTiles,
        population: 1, food: 0, foodNeeded: 20,
        production: 0, productionProgress: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [cityPos],
        focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        grid: [[null]], gridSize: 3, hp: 100, maxHp: 100,
        garrisonUnitId: null, specialistSlots: [],
      },
    },
    civilizations: {
      'player': {
        id: 'player', civType: 'rome', name: 'Rome',
        cities: ['city-1'], units: [], gold: 0,
        techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {}, marketplace: null,
  } as unknown as GameState;
}

describe('HUD happiness chip contract', () => {
  it('test 26: 2 happiness luxuries → getCivHappinessFromResources returns 2 (chip shown)', () => {
    const state = makeStateWithHappiness(2);
    expect(getCivHappinessFromResources(state, 'player')).toBe(2);
  });

  it('test 27: 0 happiness luxuries → getCivHappinessFromResources returns 0 (chip hidden)', () => {
    const state = makeStateWithHappiness(0);
    expect(getCivHappinessFromResources(state, 'player')).toBe(0);
  });

  it('all 5 happiness luxuries → returns 5 (max in S4a)', () => {
    const state = makeStateWithHappiness(5);
    expect(getCivHappinessFromResources(state, 'player')).toBe(5);
  });
});
