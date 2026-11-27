import type { GameState } from '@/core/types';
import {
  getHumanPlayers,
  getActiveHumanPlayers,
  getNextActiveHumanPlayerId,
} from '@/core/turn-cycling';
import { applyPendingChallengeForCiv } from '@/core/opponent-challenge';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';

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
  const configuredHumans = state.hotSeat ? getHumanPlayers(state.hotSeat) : [];
  if (configuredHumans.length > 0 && getActiveHumanPlayers(state).length === 0) {
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
  const nextState = applyPendingChallengeForCiv(
    { ...state, currentPlayer: nextHumanId },
    nextHumanId,
  );
  return { state: nextState, nextHumanId };
}

/**
 * #1693: a solo campaign ends in defeat when its only human civilization is eliminated, exactly as a hot-seat game
 * does when no human seat remains (`resolveHotSeatPostSimulation`). Before this the game went on with the defeated
 * player holding the turn, owning nothing, until some AI eventually won by Domination. Runs at the end of the round,
 * after Domination and Science, so a victory resolved in the same round still stands.
 */
export function finalizeSoloDefeat(state: GameState): GameState {
  if (state.gameOver || state.hotSeat) return state;
  const humanIds = Object.values(state.civilizations).filter(civ => civ.isHuman).map(civ => civ.id);
  if (humanIds.length === 0 || humanIds.some(id => getCivilizationLiveness(state, id).living)) return state;
  return { ...state, gameOver: true, winner: null, gameOverReason: 'all-humans-eliminated' };
}
