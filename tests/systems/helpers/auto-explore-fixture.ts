import type { Civilization, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createTechState } from '@/systems/tech-system';

interface AutoExploreFixtureOptions {
  visibleHostileNearEast?: boolean;
  safeFogNorth?: boolean;
  trappedByVisibleHostiles?: boolean;
  onWrappedEdge?: boolean;
  villageNorth?: boolean;
  wonderNorth?: string;
  foreignBorderNorth?: boolean;
  neutralScoutNorth?: boolean;
  majorWarNorth?: boolean;
  minorCivNorth?: boolean;
  minorCivAtWar?: boolean;
}

function makeTile(coord: HexCoord, terrain: string = 'plains', owner: string | null = null) {
  return {
    coord,
    terrain: terrain as 'plains',
    elevation: 'lowland' as const,
    resource: null,
    improvement: 'none' as const,
    owner,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function makeVisibilityTiles(coords: HexCoord[], defaultState: 'fog' | 'visible' = 'fog'): Record<string, 'fog' | 'visible'> {
  return Object.fromEntries(coords.map(coord => [`${coord.q},${coord.r}`, defaultState]));
}

function makeCivilization(id: string, isHuman: boolean, unitIds: string[]): Civilization {
  return {
    id,
    name: id,
    color: isHuman ? '#4a90d9' : '#c2410c',
    isHuman,
    civType: 'generic',
    cities: [],
    units: unitIds,
    techState: createTechState(),
    gold: 0,
    visibility: { tiles: {} },
    knownCivilizations: isHuman ? ['raiders'] : ['player'],
    score: 0,
    diplomacy: createDiplomacyState(['player', 'raiders'], id),
  };
}

function makeScout(position: HexCoord): Unit & { automation?: { mode: 'auto-explore'; lastTargets: string[]; startedTurn: number } } {
  return {
    id: 'unit-scout',
    type: 'scout',
    owner: 'player',
    position,
    movementPointsLeft: 1,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    automation: {
      mode: 'auto-explore',
      lastTargets: [],
      startedTurn: 1,
    },
  };
}

function makeWarrior(id: string, owner: string, position: HexCoord): Unit {
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

export function makeAutoExploreFixture(options: AutoExploreFixtureOptions = {}): {
  state: GameState;
  unitId: string;
  villageId?: string;
  hiddenCivId?: string;
} {
  const start = options.onWrappedEdge ? { q: 0, r: 1 } : { q: 1, r: 1 };
  const north = { q: start.q, r: start.r - 1 };
  const east = { q: start.q + 1, r: start.r };
  const west = options.onWrappedEdge ? { q: 3, r: 1 } : { q: start.q - 1, r: start.r };
  const northEast = { q: start.q + 1, r: start.r - 1 };
  const southWest = { q: start.q - 1, r: start.r + 1 };
  const south = { q: start.q, r: start.r + 1 };

  const map: GameMap = {
    width: 4,
    height: 4,
    wrapsHorizontally: !!options.onWrappedEdge,
    rivers: [],
    tiles: {},
  };

  for (let q = 0; q < map.width; q++) {
    for (let r = 0; r < map.height; r++) {
      map.tiles[`${q},${r}`] = makeTile({ q, r });
    }
  }

  if (options.trappedByVisibleHostiles) {
    map.tiles[`${northEast.q},${northEast.r}`] = makeTile(northEast, 'mountain');
    map.tiles[`${southWest.q},${southWest.r}`] = makeTile(southWest, 'mountain');
    map.tiles[`${south.q},${south.r}`] = makeTile(south, 'mountain');
  }

  const scout = makeScout(start);
  if (options.onWrappedEdge) {
    scout.automation!.lastTargets = ['3,1'];
  }

  const units: Record<string, Unit> = {
    [scout.id]: scout,
  };

  const player = makeCivilization('player', true, [scout.id]);
  const raiders = makeCivilization('raiders', false, []);
  const traders = makeCivilization('traders', false, []);

  player.visibility.tiles = makeVisibilityTiles(
    Object.values(map.tiles).map(tile => tile.coord),
    'fog',
  );

  player.visibility.tiles[`${north.q},${north.r}`] = options.safeFogNorth ? 'unexplored' : 'fog';
  player.visibility.tiles[`${east.q},${east.r}`] = 'unexplored';
  if (options.onWrappedEdge) {
    player.visibility.tiles[`${west.q},${west.r}`] = 'unexplored';
  }

  if (options.visibleHostileNearEast || options.trappedByVisibleHostiles) {
    player.diplomacy.atWarWith = ['raiders'];
    raiders.diplomacy.atWarWith = ['player'];
    const hostile = makeWarrior('raider-east', 'raiders', { q: east.q + 1, r: east.r });
    units[hostile.id] = hostile;
    raiders.units.push(hostile.id);
    player.visibility.tiles[`${hostile.position.q},${hostile.position.r}`] = 'visible';
  }

  if (options.trappedByVisibleHostiles) {
    const hostileNorth = makeWarrior('raider-north', 'raiders', { q: north.q, r: north.r - 1 });
    const hostileWest = makeWarrior('raider-west', 'raiders', options.onWrappedEdge ? { q: 2, r: 1 } : { q: west.q - 1, r: west.r });
    units[hostileNorth.id] = hostileNorth;
    units[hostileWest.id] = hostileWest;
    raiders.units.push(hostileNorth.id, hostileWest.id);
    player.visibility.tiles[`${hostileNorth.position.q},${hostileNorth.position.r}`] = 'visible';
    player.visibility.tiles[`${hostileWest.position.q},${hostileWest.position.r}`] = 'visible';
  }

  if (options.neutralScoutNorth) {
    const neutral = makeWarrior('trader-east', 'traders', { q: east.q + 1, r: east.r });
    units[neutral.id] = neutral;
    traders.units.push(neutral.id);
    player.visibility.tiles[`${neutral.position.q},${neutral.position.r}`] = 'visible';
  }

  if (options.majorWarNorth) {
    player.diplomacy.atWarWith = ['raiders'];
    raiders.diplomacy.atWarWith = ['player'];
    const hostile = makeWarrior('raider-war', 'raiders', { q: east.q + 1, r: east.r });
    units[hostile.id] = hostile;
    raiders.units.push(hostile.id);
    player.visibility.tiles[`${hostile.position.q},${hostile.position.r}`] = 'visible';
  }

  if (options.foreignBorderNorth) {
    map.tiles[`${north.q},${north.r}`].owner = 'traders';
  }

  if (options.wonderNorth) {
    map.tiles[`${north.q},${north.r}`].wonder = options.wonderNorth;
  }

  let villageId: string | undefined;
  const tribalVillages: GameState['tribalVillages'] = {};
  if (options.villageNorth) {
    villageId = 'village-north';
    tribalVillages[villageId] = {
      id: villageId,
      position: north,
    };
  }

  const minorCivs: GameState['minorCivs'] = {};
  if (options.minorCivNorth) {
    const minorId = 'mc-geneva';
    minorCivs[minorId] = {
      id: minorId,
      definitionId: 'geneva',
      cityId: 'city-geneva',
      units: ['mc-warrior'],
      diplomacy: createDiplomacyState(['player'], minorId),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 0,
    };
    if (options.minorCivAtWar) {
      minorCivs[minorId].diplomacy.atWarWith = ['player'];
    }
    units['mc-warrior'] = makeWarrior('mc-warrior', minorId, { q: east.q + 1, r: east.r });
    player.visibility.tiles[`${east.q + 1},${east.r}`] = 'visible';
  }

  const state: GameState = {
    turn: 1,
    era: 1,
    gameId: 'game-auto-explore',
    gameTitle: 'Auto Explore Fixture',
    civilizations: {
      player,
      raiders,
      traders,
    },
    map,
    units,
    cities: {},
    barbarianCamps: {},
    minorCivs,
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {
        builder: true,
        explorer: true,
        chancellor: true,
        warchief: true,
        treasurer: true,
        scholar: true,
        spymaster: true,
        artisan: true,
      },
      councilTalkLevel: 'normal',
    },
    tribalVillages,
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  };

  return { state, unitId: scout.id, villageId, hiddenCivId: options.foreignBorderNorth ? 'traders' : undefined };
}
