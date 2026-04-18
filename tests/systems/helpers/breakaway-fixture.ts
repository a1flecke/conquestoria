import type { City, GameState, HexCoord, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';

function makeTile(coord: HexCoord, owner: string | null) {
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

function makeUnit(id: string, owner: string, position: HexCoord): Unit {
  return {
    id,
    type: 'warrior',
    owner,
    position,
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}

export function makeBreakawayFixture({
  turn = 40,
  unrestLevel = 2,
  unrestTurns = 10,
  relationship = 60,
  gold = 250,
  breakawayStartedTurn,
  established = false,
  includeThirdCiv = false,
}: {
  turn?: number;
  unrestLevel?: 0 | 1 | 2;
  unrestTurns?: number;
  relationship?: number;
  gold?: number;
  breakawayStartedTurn?: number;
  established?: boolean;
  includeThirdCiv?: boolean;
} = {}): { state: GameState; breakawayId: string; cityId: string } {
  const playerId = 'player';
  const breakawayId = 'breakaway-city-border';
  const cityId = 'city-border';
  const capitalId = 'city-capital';
  const outsiderId = 'outsider';

  const capital = makeCity(capitalId, playerId, { q: 0, r: 0 });
  const city = makeCity(cityId, breakawayStartedTurn === undefined ? playerId : breakawayId, { q: 4, r: 0 }, {
    ownedTiles: [{ q: 4, r: 0 }, { q: 4, r: 1 }],
    unrestLevel,
    unrestTurns,
  });

  const playerUnit = makeUnit('unit-player', playerId, { q: 4, r: 1 });
  const playerCapitalUnit = makeUnit('unit-player-capital', playerId, { q: 3, r: 0 });
  const breakawayUnit = makeUnit('unit-breakaway', breakawayId, { q: 4, r: 1 });

  const state: GameState = {
    turn,
    era: 4,
    currentPlayer: playerId,
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': makeTile({ q: 0, r: 0 }, playerId),
        '4,0': makeTile({ q: 4, r: 0 }, city.owner),
        '3,0': makeTile({ q: 3, r: 0 }, playerId),
        '4,1': makeTile({ q: 4, r: 1 }, city.owner),
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {
      [playerUnit.id]: playerUnit,
      [playerCapitalUnit.id]: playerCapitalUnit,
      ...(breakawayStartedTurn !== undefined ? { [breakawayUnit.id]: breakawayUnit } : {}),
    },
    cities: {
      [capital.id]: capital,
      [city.id]: city,
    },
    civilizations: {
      [playerId]: {
        id: playerId,
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: [capitalId],
        units: [playerUnit.id, playerCapitalUnit.id],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState([playerId, breakawayId], playerId),
      },
      ...(breakawayStartedTurn !== undefined ? {
        [breakawayId]: {
          id: breakawayId,
          name: 'Free Border',
          color: '#c2410c',
          isHuman: false,
          civType: 'generic',
          cities: [cityId],
          units: [breakawayUnit.id],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0,
          visibility: { tiles: {} },
          score: 0,
          diplomacy: createDiplomacyState([playerId, breakawayId], breakawayId),
          breakaway: {
            originOwnerId: playerId,
            originCityId: cityId,
            startedTurn: breakawayStartedTurn,
            establishesOnTurn: breakawayStartedTurn + 50,
            status: established ? 'established' : 'secession',
          },
        },
      } : {}),
      ...(includeThirdCiv ? {
        [outsiderId]: {
          id: outsiderId,
          name: 'Outsider',
          color: '#22c55e',
          isHuman: false,
          civType: 'rome',
          cities: [],
          units: [],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 500,
          visibility: { tiles: {} },
          score: 0,
          diplomacy: createDiplomacyState([playerId, breakawayId, outsiderId], outsiderId),
        },
      } : {}),
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
  } as GameState;

  state.civilizations[playerId].diplomacy.relationships[breakawayId] = relationship;
  if (state.civilizations[breakawayId]) {
    state.civilizations[breakawayId].diplomacy.relationships[playerId] = relationship;
  }
  if (includeThirdCiv) {
    state.civilizations[outsiderId].diplomacy.relationships[breakawayId] = relationship;
    if (state.civilizations[breakawayId]) {
      state.civilizations[breakawayId].diplomacy.relationships[outsiderId] = relationship;
    }
  }

  return { state, breakawayId, cityId };
}
