import type { City, GameState, HexCoord, HexTile } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createMarketplaceState } from '@/systems/trade-system';
import { hexKey } from '@/systems/hex-utils';

const LANDMASS = 'landmass-1';

function makeTile(coord: HexCoord, owner: string | null, terrain: HexTile['terrain'] = 'grassland'): HexTile {
  return {
    coord, terrain, elevation: 'lowland', resource: null, improvement: 'none', owner,
    improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: LANDMASS,
  };
}

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id, name: id, owner, position, population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [position], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

export function makeReligionFixture({
  turn = 40,
  era = 4,
}: { turn?: number; era?: number } = {}): {
  state: GameState;
  civId: string;
  capitalId: string;
  templeCity: string;
  otherCivId: string;
  otherCity: string;
} {
  const civId = 'p1';
  const otherCivId = 'p2';
  const capitalId = 'capital';
  const templeCity = 'temple-city';
  const otherCity = 'other-city';

  const capitalPos: HexCoord = { q: 0, r: 0 };
  const templePos: HexCoord = { q: 5, r: 0 };
  const otherPos: HexCoord = { q: 10, r: 10 };

  const cities: Record<string, City> = {
    [capitalId]: makeCity(capitalId, civId, capitalPos),
    [templeCity]: makeCity(templeCity, civId, templePos, { buildings: ['temple'] }),
    [otherCity]: makeCity(otherCity, otherCivId, otherPos),
  };

  const tiles: Record<string, HexTile> = {
    [hexKey(capitalPos)]: makeTile(capitalPos, civId),
    [hexKey(templePos)]: makeTile(templePos, civId),
    [hexKey(otherPos)]: makeTile(otherPos, otherCivId),
  };

  const ids = [civId, otherCivId];

  const state: GameState = {
    turn,
    era,
    currentPlayer: civId,
    gameOver: false,
    winner: null,
    map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities,
    civilizations: {
      [civId]: {
        id: civId, name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: [capitalId, templeCity], units: [],
        techState: { completed: ['philosophy'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(ids, civId),
      },
      [otherCivId]: {
        id: otherCivId, name: 'Other', color: '#c2410c', isHuman: false, civType: 'rome',
        cities: [otherCity], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(ids, otherCivId),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
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

  return { state, civId, capitalId, templeCity, otherCivId, otherCity };
}
