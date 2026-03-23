import type { GameState, Civilization, Unit } from './types';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createUnit } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';
import { createDiplomacyState } from '@/systems/diplomacy-system';

export function createNewGame(civType?: string, seed?: string): GameState {
  const gameSeed = seed ?? `game-${Date.now()}`;
  const map = generateMap(30, 30, gameSeed);
  const startPositions = findStartPositions(map, 2);

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

  return {
    turn: 1,
    era: 1,
    civilizations: { player: playerCiv, 'ai-1': aiCiv },
    map,
    units,
    cities: {},
    barbarianCamps,
    tutorial: { active: true, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    settings: {
      mapSize: 'small',
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: true,
    },
  };
}
