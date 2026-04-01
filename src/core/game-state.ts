import type { GameState, Civilization, Unit, HotSeatConfig } from './types';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createUnit } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
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

export function createNewGame(civType?: string, seed?: string, mapSize?: 'small' | 'medium' | 'large'): GameState {
  const gameSeed = seed ?? `game-${Date.now()}`;
  const dims = MAP_DIMENSIONS[mapSize ?? 'small'];
  const actualSize = mapSize ?? 'small';
  const map = generateMap(dims.width, dims.height, gameSeed);
  const startPositions = findStartPositions(map, 2);

  // Place wonders and villages
  placeWonders(map, startPositions, actualSize, gameSeed);
  const tribalVillages = placeVillages(map, startPositions, actualSize, gameSeed);

  const playerCivDef = getCivDefinition(civType ?? '');
  const aiCivDefs = CIV_DEFINITIONS.filter(c => c.id !== (civType ?? ''));
  const aiCivDef = aiCivDefs[Math.floor(Math.random() * aiCivDefs.length)] ?? CIV_DEFINITIONS[0];

  const allCivIds = ['player', 'ai-1'];

  const playerStartBonus = playerCivDef?.bonusEffect.type === 'diplomacy_start_bonus'
    ? (playerCivDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
    : 0;
  const aiStartBonus = aiCivDef.bonusEffect.type === 'diplomacy_start_bonus'
    ? (aiCivDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
    : 0;

  // Create player civilization
  const playerCiv: Civilization = {
    id: 'player',
    name: playerCivDef?.name ?? 'Player Civilization',
    color: playerCivDef?.color ?? '#4a90d9',
    isHuman: true,
    civType: civType ?? 'generic',
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
    diplomacy: createDiplomacyState(allCivIds, 'player', playerStartBonus),
  };

  // Create AI civilization
  const aiCiv: Civilization = {
    id: 'ai-1',
    name: aiCivDef.name,
    color: aiCivDef.color,
    isHuman: false,
    civType: aiCivDef.id,
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
    diplomacy: createDiplomacyState(allCivIds, 'ai-1', aiStartBonus),
  };

  // Create starting units
  const units: Record<string, Unit> = {};

  const playerSettler = createUnit('settler', 'player', startPositions[0]);
  const playerWarrior = createUnit('warrior', 'player', startPositions[0]);
  units[playerSettler.id] = playerSettler;
  units[playerWarrior.id] = playerWarrior;
  playerCiv.units = [playerSettler.id, playerWarrior.id];

  const aiSettler = createUnit('settler', 'ai-1', startPositions[1]);
  const aiWarrior = createUnit('warrior', 'ai-1', startPositions[1]);
  units[aiSettler.id] = aiSettler;
  units[aiWarrior.id] = aiWarrior;
  aiCiv.units = [aiSettler.id, aiWarrior.id];

  // Initial visibility
  updateVisibility(playerCiv.visibility, [playerSettler, playerWarrior], map);
  updateVisibility(aiCiv.visibility, [aiSettler, aiWarrior], map);

  // Spawn initial barbarian camps
  const barbarianCamps: Record<string, any> = {};
  const cityPositions = startPositions;
  for (let i = 0; i < 3; i++) {
    const camp = spawnBarbarianCamp(map, cityPositions, Object.values(barbarianCamps));
    if (camp) barbarianCamps[camp.id] = camp;
  }

  const state: GameState = {
    turn: 1,
    era: 1,
    civilizations: { player: playerCiv, 'ai-1': aiCiv },
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
    settings: {
      mapSize: actualSize,
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: true,
      advisorsEnabled: { builder: true, explorer: true, chancellor: true, warchief: true, treasurer: true, scholar: true, spymaster: true },
    },
  };

  // Place minor civilizations
  const mcResult = placeMinorCivs(state, actualSize, gameSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);

  // Initialize espionage state for all civs
  state.espionage = initializeEspionage(state);

  return state;
}

export function createHotSeatGame(config: HotSeatConfig, seed?: string): GameState {
  const gameSeed = seed ?? `hotseat-${Date.now()}`;
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
      score: 0,
      diplomacy: createDiplomacyState(allSlotIds, player.slotId, startBonus),
    };

    const settler = createUnit('settler', player.slotId, startPositions[i]);
    const warrior = createUnit('warrior', player.slotId, startPositions[i]);
    units[settler.id] = settler;
    units[warrior.id] = warrior;
    civ.units = [settler.id, warrior.id];
    updateVisibility(civ.visibility, [settler, warrior], map);
    civilizations[player.slotId] = civ;
  }

  const barbarianCamps: Record<string, any> = {};
  const campCount = config.mapSize === 'large' ? 8 : config.mapSize === 'medium' ? 5 : 3;
  for (let i = 0; i < campCount; i++) {
    const camp = spawnBarbarianCamp(map, startPositions, Object.values(barbarianCamps));
    if (camp) barbarianCamps[camp.id] = camp;
  }

  const state: GameState = {
    turn: 1,
    era: 1,
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
    settings: {
      mapSize: config.mapSize,
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: false,
      advisorsEnabled: { builder: true, explorer: true, chancellor: true, warchief: true, treasurer: true, scholar: true, spymaster: true },
    },
  };

  // Place minor civilizations
  const mcResult = placeMinorCivs(state, config.mapSize, gameSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);

  // Initialize espionage state for all civs
  state.espionage = initializeEspionage(state);

  return state;
}
