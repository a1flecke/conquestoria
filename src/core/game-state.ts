import type { GameState, Civilization, Unit, HotSeatConfig, GameSettings, SoloSetupConfig } from './types';
import { generateMap, findStartPositions, createRng } from '@/systems/map-generator';
import { createUnit, resetUnitId } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { spawnBarbarianCamp, resetCampId } from '@/systems/barbarian-system';
import { resetCityId } from '@/systems/city-system';
import { _resetSpyIdCounter } from '@/systems/espionage-system';

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h) || 1;
}
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createMarketplaceState } from '@/systems/trade-system';
import { placeWonders } from '@/systems/wonder-system';
import { placeVillages } from '@/systems/village-system';
import { placeMinorCivs } from '@/systems/minor-civ-system';
import { initializeEspionage } from '@/systems/espionage-system';

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
    tutorialEnabled: true,
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

function getDiplomacyStartBonus(civType: string | undefined): number {
  const civDef = getCivDefinition(civType ?? '');
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
  // Reset all ID counters before creating new game
  resetUnitId();
  resetCityId();
  resetCampId();
  _resetSpyIdCounter();

  const config = normalizeSoloSetupConfig(arg1, seed, mapSize, gameTitle);
  const actualSize = config.mapSize ?? 'small';
  const dims = MAP_DIMENSIONS[actualSize];
  const boundedOpponentCount = Math.max(1, Math.min(config.opponentCount, dims.maxPlayers - 1));
  const gameSeed = config.seed ?? `game-${Date.now()}`;
  const resolvedGameTitle = config.gameTitle.trim() || 'Solo Campaign';
  const map = generateMap(dims.width, dims.height, gameSeed);
  const startPositions = findStartPositions(map, 1 + boundedOpponentCount);

  // Place wonders and villages
  placeWonders(map, startPositions, actualSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, actualSize, gameSeed);

  const playerCivDef = getCivDefinition(config.civType ?? '');
  const aiCivPool = [...CIV_DEFINITIONS.filter(c => c.id !== (config.civType ?? ''))];
  const civSelectRng = createRng(gameSeed + '-civ-select');
  for (let i = aiCivPool.length - 1; i > 0; i--) {
    const j = Math.floor(civSelectRng() * (i + 1));
    [aiCivPool[i], aiCivPool[j]] = [aiCivPool[j], aiCivPool[i]];
  }
  const aiCivDefs = aiCivPool.slice(0, boundedOpponentCount);

  const allCivIds = ['player', ...aiCivDefs.map((_, index) => `ai-${index + 1}`)];

  const playerStartBonus = getDiplomacyStartBonus(config.civType);

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
      diplomacy: createDiplomacyState(allCivIds, civId, getDiplomacyStartBonus(aiCivDef.id)),
    };
  }

  // Create starting units
  const units: Record<string, Unit> = {};

  const playerSettler = createUnit('settler', 'player', startPositions[0], playerCivDef?.bonusEffect);
  const playerWarrior = createUnit('warrior', 'player', startPositions[0], playerCivDef?.bonusEffect);
  units[playerSettler.id] = playerSettler;
  units[playerWarrior.id] = playerWarrior;
  playerCiv.units = [playerSettler.id, playerWarrior.id];

  for (let index = 0; index < aiCivDefs.length; index++) {
    const civId = `ai-${index + 1}`;
    const aiCivDef = aiCivDefs[index];
    const aiSettler = createUnit('settler', civId, startPositions[index + 1], aiCivDef?.bonusEffect);
    const aiWarrior = createUnit('warrior', civId, startPositions[index + 1], aiCivDef?.bonusEffect);
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
    const camp = spawnBarbarianCamp(map, cityPositions, Object.values(barbarianCamps), barbSeedBase + i);
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
    marketplace: createMarketplaceState(),
    tutorial: { active: true, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    tribalVillages,
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    settings: createDefaultSettings(actualSize, config.settingsOverrides),
  };

  // Place minor civilizations
  const mcResult = placeMinorCivs(state, actualSize, gameSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);

  for (const civId of Object.keys(state.civilizations)) {
    syncCivilizationContactsFromVisibility(state, civId);
  }

  // Initialize espionage state for all civs
  state.espionage = initializeEspionage(state);

  return state;
}

export function createHotSeatGame(config: HotSeatConfig, seed?: string, gameTitle?: string): GameState {
  // Reset all ID counters before creating new game
  resetUnitId();
  resetCityId();
  resetCampId();
  _resetSpyIdCounter();

  const gameSeed = seed ?? `hotseat-${Date.now()}`;
  const resolvedGameTitle = gameTitle?.trim() || 'Hot Seat Campaign';
  const dims = MAP_DIMENSIONS[config.mapSize];
  const map = generateMap(dims.width, dims.height, gameSeed);
  const startPositions = findStartPositions(map, config.players.length);

  // Place wonders and villages
  placeWonders(map, startPositions, config.mapSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, config.mapSize, gameSeed);

  const allSlotIds = config.players.map(p => p.slotId);

  const civilizations: Record<string, Civilization> = {};
  const units: Record<string, Unit> = {};

  for (let i = 0; i < config.players.length; i++) {
    const player = config.players[i];
    const civDef = getCivDefinition(player.civType);
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

    const settler = createUnit('settler', player.slotId, startPositions[i], civDef?.bonusEffect);
    const warrior = createUnit('warrior', player.slotId, startPositions[i], civDef?.bonusEffect);
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
    const camp = spawnBarbarianCamp(map, startPositions, Object.values(barbarianCamps), hotSeatBarbSeed + i);
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
    marketplace: createMarketplaceState(),
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: config.players[0].slotId,
    gameOver: false,
    winner: null,
    hotSeat: config,
    pendingEvents: {},
    tribalVillages,
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    settings: createDefaultSettings(config.mapSize, {
      tutorialEnabled: false,
    }),
  };

  // Place minor civilizations
  const mcResult = placeMinorCivs(state, config.mapSize, gameSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);

  for (const civId of Object.keys(state.civilizations)) {
    syncCivilizationContactsFromVisibility(state, civId);
  }

  // Initialize espionage state for all civs
  state.espionage = initializeEspionage(state);

  return state;
}
