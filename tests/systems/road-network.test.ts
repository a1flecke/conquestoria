import { describe, expect, it } from 'vitest';
import type { City, GameState, HexTile } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { getCitiesConnectedToCapital, getOwnedRoadTileCount, getRoadBuildTarget } from '@/systems/road-network';

function tile(overrides: Partial<HexTile>): HexTile {
  return {
    coord: { q: 0, r: 0 },
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: 'player',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    ...overrides,
  };
}

function city(overrides: Partial<City>): City {
  return {
    id: 'city-1',
    name: 'City',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    ...overrides,
  };
}

/** Builds a flat, fully-explored land map so BFS tests don't depend on generateMap RNG. */
function makeMap(width: number, wraps: boolean, roadKeys: Set<string>): GameState['map'] {
  const tiles: Record<string, HexTile> = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < 3; r++) {
      const key = `${q},${r}`;
      tiles[key] = tile({ coord: { q, r }, hasRoad: roadKeys.has(key) });
    }
  }
  return { width, height: 3, wrapsHorizontally: wraps, rivers: [], tiles };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 1,
    gameId: 'road-network-test',
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: makeMap(10, false, new Set()),
    units: {},
    cities: {},
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'generic',
        cities: [],
        units: [],
        techState: { completed: ['road-building'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        knownCivilizations: [],
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: true, musicEnabled: true, musicVolume: 0.5, sfxVolume: 0.7,
      tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    pendingDiplomacyRequests: [],
    ...overrides,
  } as GameState;
}

describe('getCitiesConnectedToCapital', () => {
  it('reports a city as connected when a continuous road links it to the capital', () => {
    const roadKeys = new Set(['1,0', '2,0', '3,0', '4,0']);
    const s = baseState({
      map: makeMap(10, false, roadKeys),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        outpost: city({ id: 'outpost', position: { q: 5, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'outpost'] },
      },
    });
    const connected = getCitiesConnectedToCapital(s, 'player');
    expect(connected.has('outpost')).toBe(true);
    expect(connected.has('capital')).toBe(false); // capital never counts itself
  });

  it('reports a city as NOT connected when the road link is broken (negative)', () => {
    const roadKeys = new Set(['1,0', '2,0', '4,0']); // gap at 3,0
    const s = baseState({
      map: makeMap(10, false, roadKeys),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        outpost: city({ id: 'outpost', position: { q: 5, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'outpost'] },
      },
    });
    expect(getCitiesConnectedToCapital(s, 'player').has('outpost')).toBe(false);
  });

  it('handles wrap-around maps', () => {
    // Capital at q=0, outpost at q=9 on a width-10 wrapping map — connect via the wrap edge (q=9 -> q=0).
    const roadKeys = new Set(['9,0']);
    const s = baseState({
      map: makeMap(10, true, roadKeys),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        outpost: city({ id: 'outpost', position: { q: 9, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'outpost'] },
      },
    });
    expect(getCitiesConnectedToCapital(s, 'player').has('outpost')).toBe(true);
  });

  it('a disconnected island city never connects (negative)', () => {
    const s = baseState({
      map: makeMap(10, false, new Set()),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        island: city({ id: 'island', position: { q: 8, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'island'] },
      },
    });
    expect(getCitiesConnectedToCapital(s, 'player').size).toBe(0);
  });
});

describe('getOwnedRoadTileCount', () => {
  it('counts only road tiles owned by the given civ', () => {
    const map = makeMap(3, false, new Set(['0,0', '1,0']));
    map.tiles['2,0'] = { ...map.tiles['2,0'], hasRoad: true, owner: 'rival' };
    const s = baseState({ map });
    expect(getOwnedRoadTileCount(s, 'player')).toBe(2);
  });
});

describe('getRoadBuildTarget', () => {
  it('returns null once fully connected', () => {
    const roadKeys = new Set(['1,0']);
    const s = baseState({
      map: makeMap(3, false, roadKeys),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        outpost: city({ id: 'outpost', position: { q: 2, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'outpost'] },
      },
    });
    expect(getRoadBuildTarget(s, 'player')).toBeNull();
  });

  it('returns the next unroaded tile toward a disconnected city', () => {
    const s = baseState({
      map: makeMap(3, false, new Set()),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        outpost: city({ id: 'outpost', position: { q: 2, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'outpost'] },
      },
    });
    const target = getRoadBuildTarget(s, 'player');
    expect(target).toEqual({ q: 1, r: 0 });
  });

  it('returns null without road-building tech (negative)', () => {
    const s = baseState({
      map: makeMap(3, false, new Set()),
      cities: {
        capital: city({ id: 'capital', position: { q: 0, r: 0 } }),
        outpost: city({ id: 'outpost', position: { q: 2, r: 0 } }),
      },
      civilizations: {
        player: { ...baseState().civilizations.player, cities: ['capital', 'outpost'], techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any } },
      },
    });
    expect(getRoadBuildTarget(s, 'player')).toBeNull();
  });
});
