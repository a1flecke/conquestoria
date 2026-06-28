import { processAITurn } from '@/ai/basic-ai';
import type { EventBus } from '@/core/event-bus';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import type { GameState } from '@/core/types';

export function getLivingNonHumanMajorIds(state: GameState): string[] {
  return Object.values(state.civilizations)
    .filter(civ => {
      if (civ.isHuman || civ.isEliminated === true) return false;
      const hasLiveCity = civ.cities.some(id => state.cities[id]?.owner === civ.id);
      const hasLiveUnit = civ.units.some(id => state.units[id]?.owner === civ.id);
      return hasLiveCity || hasLiveUnit;
    })
    .map(civ => civ.id)
    .sort();
}

export function rotateIdsForRound(ids: readonly string[], turn: number): string[] {
  if (ids.length === 0) return [];
  const start = ((turn % ids.length) + ids.length) % ids.length;
  return [...ids.slice(start), ...ids.slice(0, start)];
}

export interface ProcessNonHumanRoundOptions {
  execute?: (state: GameState, civId: string, bus: EventBus) => GameState;
}

export interface ProcessNonHumanRoundResult {
  state: GameState;
}

export function processNonHumanMajorRound(
  state: GameState,
  bus: EventBus,
  options: ProcessNonHumanRoundOptions = {},
): ProcessNonHumanRoundResult {
  let working = normalizeOpponentAIState(state);
  if (working.opponentAI!.lastProcessedRound === working.turn) {
    return { state: working };
  }

  const actorIds = rotateIdsForRound(getLivingNonHumanMajorIds(working), working.turn);
  const execute = options.execute ?? processAITurn;
  for (const civId of actorIds) {
    const civ = working.civilizations[civId];
    if (!civ || civ.isHuman || civ.isEliminated) continue;
    const hasLiveAsset = civ.cities.some(id => working.cities[id]?.owner === civId)
      || civ.units.some(id => working.units[id]?.owner === civId);
    if (!hasLiveAsset) continue;
    working = execute(working, civId, bus);
  }

  working = normalizeOpponentAIState(working);
  return {
    state: {
      ...working,
      opponentAI: {
        ...working.opponentAI!,
        lastProcessedRound: working.turn,
      },
    },
  };
}
