import type { GameState, Civilization, Unit, HotSeatConfig, GameSettings, SoloSetupConfig, MapScript, GameMap, HexCoord } from './types';
import { generateMap, findStartPositions, createRng, guaranteeStartResources } from '@/systems/map-generator';
import { loadGeoMap } from '@/systems/geo-map-loader';
import { EARTH_TILES, EARTH_START_POSITIONS, EARTH_RIVERS } from '@/systems/earth-map-data';
import { OLD_WORLD_TILES, OLD_WORLD_START_POSITIONS, OLD_WORLD_RIVERS } from '@/systems/old-world-map-data';
import { NEW_WORLD_TILES, NEW_WORLD_START_POSITIONS, NEW_WORLD_RIVERS } from '@/systems/new-world-map-data';
import { generateBalancedMap } from '@/systems/balanced-map-generator';
import { generateContinentMap } from '@/systems/continent-map-generator';
import { createUnit } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { emptyIdCounters } from '@/core/id-counters';
import { createEmptyPirateState } from '@/core/pirate-state';
import { createNotificationLog } from '@/core/notification-log';
import { getPlayableCivDefinitions, resolveCivDefinition } from '@/systems/civ-registry';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createMarketplaceState } from '@/systems/trade-system';
import { placeWonders } from '@/systems/wonder-system';
import { placeVillages } from '@/systems/village-system';
import { placeBeastLairs } from '@/systems/beast-system';
import { placeMinorCivs } from '@/systems/minor-civ-system';
import { initializeEspionage } from '@/systems/espionage-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h) || 1;
}

export const MAP_DIMENSIONS = {
  small: { width: 30, height: 30, maxPlayers: 3 },
  medium: { width: 50, height: 50, maxPlayers: 5 },
  large: { width: 80, height: 80, maxPlayers: 8 },
} as const;

export function createDefaultSettings(
  actualSize: 'small' | 'medium' | 'large',
  overrides: Partial<GameSettings> = {},
): GameSettings {
  return {
    mapSize: actualSize,
    soundEnabled: true,
    musicEnabled: true,
    musicVolume: 0.5,
    sfxVolume: 0.7,
    voiceVolume: 1.0,
    voiceEnabled: true,
    stingerVolume: 1.0,
    stingerEnabled: true,
    tutorialEnabled: true,
    beastsMode: 'wild',
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
    ...overrides,
  };
}

function createGameId(seed: string): string {
  return `game-${hashSeed(seed)}-${Date.now()}`;
}

function getDiplomacyStartBonus(settings: GameSettings, civType: string | undefined): number {
  const civDef = resolveCivDefinition({ settings }, civType ?? '');
  return civDef?.bonusEffect.type === 'diplomacy_start_bonus'
    ? (civDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
    : 0;
}

function normalizeSoloSetupConfig(
  arg1?: SoloSetupConfig | string,
  seed?: string,
  mapSize?: 'small' | 'medium' | 'large',
  gameTitle?: string,
): SoloSetupConfig {
  if (typeof arg1 === 'object' && arg1 !== null) {
    return {
      civType: arg1.civType,
      seed: arg1.seed,
      mapSize: arg1.mapSize,
      opponentCount: arg1.opponentCount,
      gameTitle: arg1.gameTitle,
      settingsOverrides: arg1.settingsOverrides,
      customCivilizations: arg1.customCivilizations,
      mapScript: arg1.mapScript,
    };
  }

  return {
    civType: arg1 ?? 'generic',
    seed,
    mapSize: mapSize ?? 'small',
    opponentCount: 1,
    gameTitle: gameTitle ?? 'Solo Campaign',
  };
}

export function createNewGame(config: SoloSetupConfig): GameState;
export function createNewGame(civType?: string, seed?: string, mapSize?: 'small' | 'medium' | 'large', gameTitle?: string): GameState;
export function createNewGame(
  arg1?: SoloSetupConfig | string,
  seed?: string,
  mapSize?: 'small' | 'medium' | 'large',
  gameTitle?: string,
): GameState {
  const idCounters = emptyIdCounters();

  const config = normalizeSoloSetupConfig(arg1, seed, mapSize, gameTitle);
  const actualSize = config.mapSize ?? 'small';
  const dims = MAP_DIMENSIONS[actualSize];
  const boundedOpponentCount = Math.max(1, Math.min(config.opponentCount, dims.maxPlayers - 1));
  const gameSeed = config.seed ?? `game-${Date.now()}`;
  const resolvedGameTitle = config.gameTitle.trim() || 'Solo Campaign';
  const mapScript: MapScript = config.mapScript ?? 'procedural';

  // Determine civ types before map generation so findStartPositions can use real civ IDs
  const settings = createDefaultSettings(actualSize, {
    ...config.settingsOverrides,
    customCivilizations: config.customCivilizations,
  });
  const playerCivDef = resolveCivDefinition({ settings }, config.civType ?? '');
  const aiCivPool = [...getPlayableCivDefinitions(settings).filter(c => c.id !== (config.civType ?? ''))];
  const civSelectRng = createRng(gameSeed + '-civ-select');
  for (let i = aiCivPool.length - 1; i > 0; i--) {
    const j = Math.floor(civSelectRng() * (i + 1));
    [aiCivPool[i], aiCivPool[j]] = [aiCivPool[j], aiCivPool[i]];
  }
  const aiCivDefs = aiCivPool.slice(0, boundedOpponentCount);
  const allCivIds = ['player', ...aiCivDefs.map((_, index) => `ai-${index + 1}`)];
  const playerStartBonus = getDiplomacyStartBonus(settings, config.civType);

  const civTypeIds = [config.civType ?? 'generic', ...aiCivDefs.map(d => d.id)];

  // Generate map and start positions based on map script
  let map: GameMap;
  let startPositions: HexCoord[];

  switch (mapScript) {
    case 'earth':
      map = loadGeoMap(EARTH_TILES[actualSize], EARTH_RIVERS[actualSize], dims, true);
      startPositions = findStartPositions(map, civTypeIds, 'earth', actualSize);
      break;
    case 'old-world':
      map = loadGeoMap(OLD_WORLD_TILES[actualSize], OLD_WORLD_RIVERS[actualSize], dims, false);
      startPositions = findStartPositions(map, civTypeIds, 'old-world', actualSize);
      break;
    case 'new-world':
      map = loadGeoMap(NEW_WORLD_TILES[actualSize], NEW_WORLD_RIVERS[actualSize], dims, false);
      startPositions = findStartPositions(map, civTypeIds, 'new-world', actualSize);
      break;
    case 'balanced': {
      const result = generateBalancedMap(dims.width, dims.height, gameSeed, civTypeIds.length);
      map = result.map;
      startPositions = result.startPositions;
      break;
    }
    case 'single-continent': {
      const result = generateContinentMap(dims.width, dims.height, gameSeed);
      map = result.map;
      startPositions = findStartPositions(map, civTypeIds, 'single-continent', actualSize, result.continentHexes);
      break;
    }
    default: // 'procedural' and old saves
      map = generateMap(dims.width, dims.height, gameSeed);
      startPositions = findStartPositions(map, civTypeIds, 'procedural', actualSize);
      break;
  }

  // Place wonders and villages
  guaranteeStartResources(map, startPositions, createRng(gameSeed + '-resource-guarantee'));
  placeWonders(map, startPositions, actualSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, actualSize, gameSeed);
  const beastsMode = settings.beastsMode ?? 'wild';
  const beastLairs = beastsMode === 'off'
    ? {}
    : placeBeastLairs(map, startPositions, actualSize, gameSeed);

  // Create player civilization
  const playerCiv: Civilization = {
    id: 'player',
    name: playerCivDef?.name ?? 'Player Civilization',
    color: playerCivDef?.color ?? '#4a90d9',
    isHuman: true,
    civType: config.civType ?? 'generic',
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    knownCivilizations: [],
    score: 0,
    diplomacy: createDiplomacyState(allCivIds, 'player', playerStartBonus),
  };

  const civilizations: Record<string, Civilization> = {
    player: playerCiv,
  };

  for (let index = 0; index < aiCivDefs.length; index++) {
    const civId = `ai-${index + 1}`;
    const aiCivDef = aiCivDefs[index];
    civilizations[civId] = {
      id: civId,
      name: aiCivDef.name,
      color: aiCivDef.color,
      isHuman: false,
      civType: aiCivDef.id,
      cities: [],
      units: [],
      techState: createTechState(),
      gold: 0,
      visibility: createVisibilityMap(),
      knownCivilizations: [],
      score: 0,
      diplomacy: createDiplomacyState(allCivIds, civId, getDiplomacyStartBonus(settings, aiCivDef.id)),
    };
  }

  // Create starting units
  const units: Record<string, Unit> = {};

  const playerSettler = createUnit('settler', 'player', startPositions[0], idCounters, playerCivDef?.bonusEffect);
  const playerWarrior = createUnit('warrior', 'player', startPositions[0], idCounters, playerCivDef?.bonusEffect);
  units[playerSettler.id] = playerSettler;
  units[playerWarrior.id] = playerWarrior;
  playerCiv.units = [playerSettler.id, playerWarrior.id];

  for (let index = 0; index < aiCivDefs.length; index++) {
    const civId = `ai-${index + 1}`;
    const aiCivDef = aiCivDefs[index];
    const aiSettler = createUnit('settler', civId, startPositions[index + 1], idCounters, aiCivDef?.bonusEffect);
    const aiWarrior = createUnit('warrior', civId, startPositions[index + 1], idCounters, aiCivDef?.bonusEffect);
    units[aiSettler.id] = aiSettler;
    units[aiWarrior.id] = aiWarrior;
    civilizations[civId].units = [aiSettler.id, aiWarrior.id];
  }

  // Initial visibility
  updateVisibility(playerCiv.visibility, [playerSettler, playerWarrior], map);
  for (let index = 0; index < aiCivDefs.length; index++) {
    const civId = `ai-${index + 1}`;
    const aiUnits = civilizations[civId].units.map(unitId => units[unitId]);
    updateVisibility(civilizations[civId].visibility, aiUnits, map);
  }

  // Spawn initial barbarian camps
  const barbarianCamps: Record<string, any> = {};
  const cityPositions = startPositions;
  const barbSeedBase = hashSeed(gameSeed);
  for (let i = 0; i < 3; i++) {
    const camp = spawnBarbarianCamp(map, cityPositions, Object.values(barbarianCamps), barbSeedBase + i, idCounters);
    if (camp) barbarianCamps[camp.id] = camp;
  }

  const state: GameState = {
    turn: 1,
    era: 1,
    gameId: createGameId(gameSeed),
    gameTitle: resolvedGameTitle,
    civilizations,
    map,
    units,
    cities: {},
    barbarianCamps,
    minorCivs: {},
    idCounters,
    marketplace: createMarketplaceState(),
    tutorial: { active: true, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    tribalVillages,
    beasts: { mode: beastsMode, lairs: beastLairs, sightingsByCiv: {} },
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    pirates: createEmptyPirateState(),
    notificationLog: createNotificationLog(),
    embargoes: [],
    defensiveLeagues: [],
    pendingDiplomacyRequests: [],
    settings,
    mapScript,
  };

  // Place minor civilizations
  const mcResult = placeMinorCivs(state, actualSize, gameSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);

  for (const civId of Object.keys(state.civilizations)) {
    refreshLastSeenPresentationsForCiv(state, civId);
    syncCivilizationContactsFromVisibility(state, civId);
  }

  // Initialize espionage state for all civs
  state.espionage = initializeEspionage(state);

  return state;
}

export function createHotSeatGame(config: HotSeatConfig, seed?: string, gameTitle?: string): GameState {
  const idCounters = emptyIdCounters();

  const gameSeed = seed ?? `hotseat-${Date.now()}`;
  const resolvedGameTitle = gameTitle?.trim() || 'Hot Seat Campaign';
  const dims = MAP_DIMENSIONS[config.mapSize];
  const mapScript: MapScript = config.mapScript ?? 'procedural';
  const civTypeIds = config.players.map(p => p.civType);

  let map: GameMap;
  let startPositions: HexCoord[];

  switch (mapScript) {
    case 'earth':
      map = loadGeoMap(EARTH_TILES[config.mapSize], EARTH_RIVERS[config.mapSize], dims, true);
      startPositions = findStartPositions(map, civTypeIds, 'earth', config.mapSize);
      break;
    case 'old-world':
      map = loadGeoMap(OLD_WORLD_TILES[config.mapSize], OLD_WORLD_RIVERS[config.mapSize], dims, false);
      startPositions = findStartPositions(map, civTypeIds, 'old-world', config.mapSize);
      break;
    case 'new-world':
      map = loadGeoMap(NEW_WORLD_TILES[config.mapSize], NEW_WORLD_RIVERS[config.mapSize], dims, false);
      startPositions = findStartPositions(map, civTypeIds, 'new-world', config.mapSize);
      break;
    case 'balanced': {
      const result = generateBalancedMap(dims.width, dims.height, gameSeed, civTypeIds.length);
      map = result.map;
      startPositions = result.startPositions;
      break;
    }
    case 'single-continent': {
      const result = generateContinentMap(dims.width, dims.height, gameSeed);
      map = result.map;
      startPositions = findStartPositions(map, civTypeIds, 'single-continent', config.mapSize, result.continentHexes);
      break;
    }
    default: // 'procedural' and old saves
      map = generateMap(dims.width, dims.height, gameSeed);
      startPositions = findStartPositions(map, civTypeIds, 'procedural', config.mapSize);
      break;
  }

  // Place wonders and villages
  guaranteeStartResources(map, startPositions, createRng(gameSeed + '-resource-guarantee'));
  placeWonders(map, startPositions, config.mapSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, config.mapSize, gameSeed);
  const hotSeatSettings = createDefaultSettings(config.mapSize);
  const beastsModeHotSeat = hotSeatSettings.beastsMode ?? 'wild';
  const beastLairsHotSeat = beastsModeHotSeat === 'off'
    ? {}
    : placeBeastLairs(map, startPositions, config.mapSize, gameSeed);

  const allSlotIds = config.players.map(p => p.slotId);
  const settings = createDefaultSettings(config.mapSize, {
    tutorialEnabled: false,
    customCivilizations: config.customCivilizations,
  });

  const civilizations: Record<string, Civilization> = {};
  const units: Record<string, Unit> = {};

  for (let i = 0; i < config.players.length; i++) {
    const player = config.players[i];
    const civDef = resolveCivDefinition({ settings }, player.civType);
    const startBonus = civDef?.bonusEffect.type === 'diplomacy_start_bonus'
      ? (civDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
      : 0;

    const civ: Civilization = {
      id: player.slotId,
      name: player.isHuman ? player.name : (civDef?.name ?? player.name),
      color: civDef?.color ?? '#888888',
      isHuman: player.isHuman,
      civType: player.civType,
      cities: [],
      units: [],
      techState: createTechState(),
      gold: 0,
      visibility: createVisibilityMap(),
      knownCivilizations: [],
      score: 0,
      diplomacy: createDiplomacyState(allSlotIds, player.slotId, startBonus),
    };

    const settler = createUnit('settler', player.slotId, startPositions[i], idCounters, civDef?.bonusEffect);
    const warrior = createUnit('warrior', player.slotId, startPositions[i], idCounters, civDef?.bonusEffect);
    units[settler.id] = settler;
    units[warrior.id] = warrior;
    civ.units = [settler.id, warrior.id];
    updateVisibility(civ.visibility, [settler, warrior], map);
    civilizations[player.slotId] = civ;
  }

  const barbarianCamps: Record<string, any> = {};
  const campCount = config.mapSize === 'large' ? 8 : config.mapSize === 'medium' ? 5 : 3;
  const hotSeatBarbSeed = hashSeed(gameSeed);
  for (let i = 0; i < campCount; i++) {
    const camp = spawnBarbarianCamp(map, startPositions, Object.values(barbarianCamps), hotSeatBarbSeed + i, idCounters);
    if (camp) barbarianCamps[camp.id] = camp;
  }

  const state: GameState = {
    turn: 1,
    era: 1,
    gameId: createGameId(gameSeed),
    gameTitle: resolvedGameTitle,
    civilizations,
    map,
    units,
    cities: {},
    barbarianCamps,
    minorCivs: {},
    idCounters,
    marketplace: createMarketplaceState(),
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: config.players[0].slotId,
    gameOver: false,
    winner: null,
    hotSeat: config,
    pendingEvents: {},
    tribalVillages,
    beasts: { mode: beastsModeHotSeat, lairs: beastLairsHotSeat, sightingsByCiv: {} },
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    pirates: createEmptyPirateState(),
    notificationLog: createNotificationLog(),
    embargoes: [],
    defensiveLeagues: [],
    pendingDiplomacyRequests: [],
    settings,
    mapScript,
  };

  // Place minor civilizations
  const mcResult = placeMinorCivs(state, config.mapSize, gameSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);

  for (const civId of Object.keys(state.civilizations)) {
    refreshLastSeenPresentationsForCiv(state, civId);
    syncCivilizationContactsFromVisibility(state, civId);
  }

  // Initialize espionage state for all civs
  state.espionage = initializeEspionage(state);

  return state;
}
