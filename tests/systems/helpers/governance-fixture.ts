import type { City, Civilization, GameState, HexCoord } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-state';

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id,
    name: id,
    owner,
    position,
    population: 4,
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

/**
 * #987 — a minimal GameState with `cityCount` cities owned by 'player', each
 * placed `spacingQ` hexes apart along the q axis from the capital (city-1,
 * always at the origin), so tests can exercise governance capacity/load at a
 * chosen city count and distance profile. `civOverrides` patches the
 * civilization record directly (federalismEnabled, governancePolicies, etc.).
 */
export function makeGovernanceTestState({
  cityCount = 1,
  spacingQ = 0,
  completedTechs = [],
  civOverrides = {},
}: {
  cityCount?: number;
  spacingQ?: number;
  completedTechs?: string[];
  civOverrides?: Partial<Civilization>;
} = {}): GameState {
  const civId = 'player';
  const cities: Record<string, City> = {};
  for (let i = 1; i <= cityCount; i++) {
    const id = `city-${i}`;
    cities[id] = makeCity(id, civId, { q: (i - 1) * spacingQ, r: 0 });
  }

  return {
    turn: 10,
    era: 2,
    currentPlayer: civId,
    gameOver: false,
    winner: null,
    map: { width: 40, height: 40, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities,
    civilizations: {
      [civId]: {
        id: civId,
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: Object.keys(cities),
        units: [],
        techState: {
          completed: completedTechs,
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 1000,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState([civId], civId),
        ...civOverrides,
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}
