import type { City, GameState, HexCoord, HexTile } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createMarketplaceState } from '@/systems/trade-system';
import { hexKey } from '@/systems/hex-utils';

function makeTile(coord: HexCoord, owner: string | null): HexTile {
  return {
    coord, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: 'landmass-1',
  };
}

function makeCity(id: string, owner: string, position: HexCoord, ownedTiles: HexCoord[], overrides: Partial<City> = {}): City {
  return {
    id, name: id, owner, position, population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles, workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

// p1 (faith owner, human) at q0, p2 (AI, non-human) at q3 -- their single-tile
// territories are adjacent (q2/q3 share an edge). mc-border is a minor civ at q6,
// adjacent to p2's territory (NOT p1's), used for minor-civ absorption tests. All
// religion setups are added by individual tests via state.religions/cityFaith overrides.
export function makeLoyaltyFixture(): {
  state: GameState; p1: string; p1City: string; p2: string; p2City: string; mcId: string; mcCity: string;
} {
  const p1 = 'p1';
  const p2 = 'p2';
  const mcId = 'mc-border';
  const p1City = 'p1-city';
  const p2City = 'p2-city';
  const mcCity = 'mc-city';

  const p1Pos: HexCoord = { q: 0, r: 0 };
  const p1Edge: HexCoord = { q: 2, r: 0 };
  const p2Pos: HexCoord = { q: 3, r: 0 };
  const p2Edge: HexCoord = { q: 5, r: 0 };
  const mcPos: HexCoord = { q: 6, r: 0 };

  const cities: Record<string, City> = {
    [p1City]: makeCity(p1City, p1, p1Pos, [p1Pos, p1Edge]),
    [p2City]: makeCity(p2City, p2, p2Pos, [p2Pos, p2Edge]),
    [mcCity]: makeCity(mcCity, mcId, mcPos, [mcPos]),
  };

  const tiles: Record<string, HexTile> = {
    [hexKey(p1Pos)]: makeTile(p1Pos, p1),
    [hexKey(p1Edge)]: makeTile(p1Edge, p1),
    [hexKey(p2Pos)]: makeTile(p2Pos, p2),
    [hexKey(p2Edge)]: makeTile(p2Edge, p2),
    [hexKey(mcPos)]: makeTile(mcPos, mcId),
  };

  const ids = [p1, p2];

  const state: GameState = {
    turn: 40,
    era: 4,
    currentPlayer: p1,
    gameOver: false,
    winner: null,
    opponentChallenge: 'standard',
    map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities,
    civilizations: {
      [p1]: {
        id: p1, name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: [p1City], units: [],
        techState: { completed: ['philosophy'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(ids, p1),
      },
      [p2]: {
        id: p2, name: 'Rival', color: '#c2410c', isHuman: false, civType: 'rome',
        cities: [p2City], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(ids, p2),
      },
    },
    barbarianCamps: {},
    minorCivs: {
      [mcId]: {
        id: mcId, definitionId: 'mercantile-1', cityId: mcCity, units: [],
        diplomacy: createDiplomacyState(ids, mcId, 0),
        activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        regionalGrievanceByCiv: {}, isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      },
    },
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0,
      tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    marketplace: { ...createMarketplaceState(), tradeRoutes: [] },
    religions: {},
    cityFaith: {},
  } as GameState;

  return { state, p1, p1City, p2, p2City, mcId, mcCity };
}
