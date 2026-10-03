import type { GameState } from '@/core/types';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import { emitCivilizationLivenessTransitions, reconcileCivilizationLiveness } from '@/systems/civilization-elimination-system';
import { initializeLegendaryWonderProjectsForAllCities } from '@/systems/legendary-wonder-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Starts the round on a working clone of the INPUT state (the only whole-state `structuredClone` of a round):
 * seeds legendary-wonder projects, reconciles civilization liveness, normalises the AI container, and announces
 * `turn:end` for the turn being closed. Every later phase mutates and returns this clone.
 */
function runPrelude(state: GameState, context: RoundPhaseContext): GameState {
  const { bus } = context;
  let newState = initializeLegendaryWonderProjectsForAllCities(structuredClone(state));
  const liveness = reconcileCivilizationLiveness(newState, newState);
  emitCivilizationLivenessTransitions(liveness, bus);
  newState = liveness.state;
  newState = normalizeOpponentAIState(newState);

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });
  return newState;
}

export const preludePhase: RoundPhase = { id: 'prelude', run: runPrelude };
