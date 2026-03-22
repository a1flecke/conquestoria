import type { GameState, Civilization, Unit } from './types';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createUnit } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { hexKey } from '@/systems/hex-utils';

export function createNewGame(seed?: string): GameState {
  const gameSeed = seed ?? `game-${Date.now()}`;
  const map = generateMap(30, 30, gameSeed);
  const startPositions = findStartPositions(map, 2);

  // Create player civilization
  const playerCiv: Civilization = {
    id: 'player',
    name: 'Player Civilization',
    color: '#4a90d9',
    isHuman: true,
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
  };

  // Create AI civilization
  const aiCiv: Civilization = {
    id: 'ai-1',
    name: 'Rival Nation',
    color: '#d94a4a',
    isHuman: false,
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
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
  const playerUnits = [playerSettler, playerWarrior];
  updateVisibility(playerCiv.visibility, playerUnits, map);

  const aiUnits = [aiSettler, aiWarrior];
  updateVisibility(aiCiv.visibility, aiUnits, map);

  // Spawn initial barbarian camps
  const barbarianCamps: Record<string, any> = {};
  const cityPositions = startPositions; // Treat start positions as cities for spacing
  for (let i = 0; i < 3; i++) {
    const camp = spawnBarbarianCamp(
      map,
      cityPositions,
      Object.values(barbarianCamps),
    );
    if (camp) {
      barbarianCamps[camp.id] = camp;
    }
  }

  return {
    turn: 1,
    era: 1,
    civilizations: {
      player: playerCiv,
      'ai-1': aiCiv,
    },
    map,
    units,
    cities: {},
    barbarianCamps,
    tutorial: {
      active: true,
      currentStep: 'welcome',
      completedSteps: [],
    },
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
