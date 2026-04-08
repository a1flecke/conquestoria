import type { City, GameState, HexCoord } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';

function makeTile(coord: HexCoord, owner: string | null, overrides: Partial<GameState['map']['tiles'][string]> = {}) {
  return {
    coord,
    terrain: 'plains' as const,
    elevation: 'lowland' as const,
    resource: null,
    improvement: 'none' as const,
    owner,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    ...overrides,
  };
}

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id,
    name: id,
    owner,
    position,
    population: 5,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [position],
    grid: [[null]],
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    ...overrides,
  };
}

export function makeLegendaryWonderFixture({
  completedTechs = ['philosophy', 'pilgrimages'],
  resources = [] as string[],
  oracleStepsCompleted = 0,
  hasRiver = true,
}: {
  completedTechs?: string[];
  resources?: string[];
  oracleStepsCompleted?: number;
  hasRiver?: boolean;
} = {}): GameState {
  const playerId = 'player';
  const cityId = 'city-river';
  const rivalCityId = 'city-rival';
  const city = makeCity(cityId, playerId, { q: 2, r: 2 }, {
    ownedTiles: [
      { q: 2, r: 2 },
      { q: 2, r: 3 },
    ],
  });
  const rivalCity = makeCity(rivalCityId, 'rival', { q: 5, r: 5 }, {
    ownedTiles: [
      { q: 5, r: 5 },
      { q: 5, r: 6 },
    ],
  });

  const projectSteps = [
    { id: 'discover-natural-wonder', description: 'Discover a natural wonder', completed: oracleStepsCompleted >= 1 },
    { id: 'complete-pilgrimage-route', description: 'Complete a pilgrimage route', completed: oracleStepsCompleted >= 2 },
  ];

  return {
    turn: 40,
    era: 4,
    currentPlayer: playerId,
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '2,2': makeTile({ q: 2, r: 2 }, playerId, { hasRiver }),
        '2,3': makeTile({ q: 2, r: 3 }, playerId, { resource: resources[0] ?? null, hasRiver }),
        '5,5': makeTile({ q: 5, r: 5 }, 'rival', { hasRiver: true }),
        '5,6': makeTile({ q: 5, r: 6 }, 'rival', { resource: 'stone', hasRiver: true }),
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {},
    cities: {
      [cityId]: city,
      [rivalCityId]: rivalCity,
    },
    civilizations: {
      [playerId]: {
        id: playerId,
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: [cityId],
        units: [],
        techState: {
          completed: completedTechs,
          currentResearch: null,
          researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 200,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState([playerId], playerId),
      },
      rival: {
        id: 'rival',
        name: 'Rival',
        color: '#9333ea',
        isHuman: false,
        civType: 'rome',
        cities: [rivalCityId],
        units: [],
        techState: {
          completed: ['city-planning', 'printing', 'philosophy', 'pilgrimages'],
          currentResearch: null,
          researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 200,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState([playerId, 'rival'], 'rival'),
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
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    legendaryWonderProjects: {
      'oracle-of-delphi': {
        wonderId: 'oracle-of-delphi',
        ownerId: playerId,
        cityId,
        phase: 'questing',
        investedProduction: 0,
        transferableProduction: 50,
        questSteps: projectSteps,
      },
      'grand-canal': {
        wonderId: 'grand-canal',
        ownerId: playerId,
        cityId,
        phase: 'locked',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'connect-two-cities', description: 'Connect two cities', completed: false },
          { id: 'grow-river-city', description: 'Grow a river city', completed: false },
        ],
      },
      'grand-canal-rival': {
        wonderId: 'grand-canal',
        ownerId: 'rival',
        cityId: rivalCityId,
        phase: 'building',
        investedProduction: 90,
        transferableProduction: 0,
        questSteps: [
          { id: 'connect-two-cities', description: 'Connect two cities', completed: true },
          { id: 'grow-river-city', description: 'Grow a river city', completed: true },
        ],
      },
    },
  } as GameState;
}
