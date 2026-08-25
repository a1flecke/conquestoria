import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { hasManhattanProject } from '@/systems/strategic-arsenal-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 10,
    currentPlayer: 'p1',
    civilizations: {},
    cities: {},
    units: {},
    map: { width: 1, height: 1, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {},
    techDiscoveries: {},
    completedLegendaryWonders: {},
    legendaryWonderProjects: {},
    legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} },
    pirateState: null,
    tradeRoutes: {},
    espionage: {},
    embargoes: [],
    defensiveLeagues: [],
    gameOver: false,
    winner: null,
    settings: {} as any,
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

describe('hasManhattanProject', () => {
  it('is false when nothing has been built', () => {
    expect(hasManhattanProject(makeState(), 'p1')).toBe(false);
  });

  it('is true once p1:manhattan_project is in builtNationalProjects', () => {
    const state = makeState({
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(true);
  });

  it('is civ-scoped -- p2 having it does not make it true for p1', () => {
    const state = makeState({
      builtNationalProjects: {
        'p2:manhattan_project': { civId: 'p2', cityId: 'c2', eraBuilt: 10 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(false);
  });

  it('is false for an unrelated built national project', () => {
    const state = makeState({
      builtNationalProjects: {
        'p1:sacred_council': { civId: 'p1', cityId: 'c1', eraBuilt: 3 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(false);
  });
});
