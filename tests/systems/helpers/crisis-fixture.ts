import type { ActiveCrisis, City, GameState, HexCoord, HexTile, OpponentChallenge } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexKey } from '@/systems/hex-utils';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';

const LANDMASS = 'landmass-1';

function makeTile(coord: HexCoord, owner: string | null, terrain: HexTile['terrain'] = 'grassland'): HexTile {
  return {
    coord,
    terrain,
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    regionKey: LANDMASS,
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
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    ...overrides,
  };
}

export function makeCrisisFixture({
  turn = 40,
  era = 3,
  challenge = 'standard' as OpponentChallenge,
  includeSecondHuman = false,
  lastCrisisOnsetTurn,
  existingCrisisCount = 0,
  unrestCityCount = 0,
  adjacentUnrestCities = false,
  activeExternalThreat = false,
}: {
  turn?: number;
  era?: number;
  challenge?: OpponentChallenge;
  includeSecondHuman?: boolean;
  lastCrisisOnsetTurn?: number;
  existingCrisisCount?: number;
  unrestCityCount?: number;
  adjacentUnrestCities?: boolean;
  activeExternalThreat?: boolean;
} = {}): { state: GameState; civId: string } {
  const civId = 'p1';

  const capitalPos: HexCoord = { q: 0, r: 0 };
  const secondPos: HexCoord = { q: 5, r: 0 };
  const swampA: HexCoord = { q: 1, r: 0 };
  const swampB: HexCoord = { q: 0, r: 1 };

  const capital = makeCity('c1', civId, capitalPos, { population: 5 });
  const second = makeCity('c2', civId, secondPos, {
    population: 3,
    unrestLevel: unrestCityCount >= 1 ? 1 : 0,
  });

  const cities: Record<string, City> = { c1: capital, c2: second };

  if (unrestCityCount >= 2) {
    const thirdPos: HexCoord = adjacentUnrestCities ? { q: 6, r: 0 } : { q: 20, r: 20 };
    cities.c3 = makeCity('c3', civId, thirdPos, { population: 2, unrestLevel: 1 });
  }

  const tiles: Record<string, HexTile> = {
    [hexKey(capitalPos)]: makeTile(capitalPos, civId),
    [hexKey(secondPos)]: makeTile(secondPos, civId),
    [hexKey(swampA)]: makeTile(swampA, civId, 'swamp'),
    [hexKey(swampB)]: makeTile(swampB, civId, 'swamp'),
  };
  if (cities.c3) {
    tiles[hexKey(cities.c3.position)] = makeTile(cities.c3.position, civId);
  }

  const activeCrises: Record<string, ActiveCrisis> = {};
  for (let i = 0; i < existingCrisisCount; i++) {
    const id = `existing-crisis-${i}`;
    activeCrises[id] = {
      id,
      flavorId: 'plague',
      archetype: 'outbreak',
      targetCivId: civId,
      cityIds: ['c1'],
      tileKeys: [],
      startedTurn: turn - 1,
      stage: 'active',
      turnsInStage: 1,
    };
  }

  const barbarianCamps: GameState['barbarianCamps'] = {};
  if (activeExternalThreat) {
    barbarianCamps['camp-x'] = {
      id: 'camp-x',
      position: { q: 2, r: 0 },
      strength: 1,
      spawnCooldown: 0,
    };
  }

  const state: GameState = {
    turn,
    era,
    currentPlayer: civId,
    gameOver: false,
    winner: null,
    map: {
      width: 20,
      height: 20,
      tiles,
      wrapsHorizontally: false,
      rivers: [],
    },
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
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState([civId], civId),
        challenge,
        lastCrisisOnsetTurn,
      },
      ...(includeSecondHuman ? {
        p2: {
          id: 'p2',
          name: 'Player 2',
          color: '#c2410c',
          isHuman: true,
          civType: 'rome',
          cities: [],
          units: [],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 500,
          visibility: { tiles: {} },
          score: 0,
          diplomacy: createDiplomacyState([civId, 'p2'], 'p2'),
          challenge,
        },
      } : {}),
    },
    barbarianCamps,
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
    activeCrises: Object.keys(activeCrises).length > 0 ? activeCrises : undefined,
    opponentAI: activeExternalThreat ? {
      ...createEmptyOpponentAIState(),
      pressureByHuman: {
        [civId]: {
          activeIndependentThreatIds: ['barbarian:camp-x'],
          recoveryUntilTurn: 0,
          lastResolvedThreatTurn: null,
          lastWarningTurnByKey: {},
          lastStrategicAudioTurn: null,
        },
      },
    } : undefined,
  } as GameState;

  return { state, civId };
}
