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
  if (!nextHumanId) return { state, nextHumanId };
  let nextState: GameState = { ...state, currentPlayer: nextHumanId };
  const civ = nextState.civilizations[nextHumanId];
  if (civ?.pendingChallenge !== undefined) {
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [nextHumanId]: { ...civ, challenge: civ.pendingChallenge, pendingChallenge: undefined },
      },
    };
  }
  return { state: nextState, nextHumanId };
}
