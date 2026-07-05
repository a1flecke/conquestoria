import type { GameState } from '@/core/types';
import {
  getActiveHumanPlayers,
  getNextActiveHumanPlayerId,
} from '@/core/turn-cycling';

export interface HotSeatPostSimulationResult {
  state: GameState;
  nextHumanId: string | null;
}

export function resolveHotSeatPostSimulation(
  state: GameState,
  previousHumanId: string,
): HotSeatPostSimulationResult {
  if (state.gameOver) {
    return {
      state: state.gameOverReason || !state.winner
        ? state
        : { ...state, gameOverReason: 'domination' },
      nextHumanId: null,
    };
  }
  if (getActiveHumanPlayers(state).length === 0) {
    return {
      state: {
        ...state,
        gameOver: true,
        winner: null,
        gameOverReason: 'all-humans-eliminated',
      },
      nextHumanId: null,
    };
  }
  const nextHumanId = getNextActiveHumanPlayerId(state, previousHumanId);
  return {
    state: nextHumanId ? { ...state, currentPlayer: nextHumanId } : state,
    nextHumanId,
  };
}
