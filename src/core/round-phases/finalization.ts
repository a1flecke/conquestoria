import type { GameState } from '@/core/types';
import { finalizeDominationVictory, finalizeScienceVictory } from '@/systems/victory-system';
import { applyPendingOpponentChallenge } from '@/core/opponent-challenge';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import { emitCivilizationLivenessTransitions, reconcileCivilizationLiveness } from '@/systems/civilization-elimination-system';
import type { RoundPhase, RoundPhaseContext } from './types';

export function finalizeOpponentRoundState(state: GameState): GameState {
  const normalized = normalizeOpponentAIState(state);
  if (normalized.opponentAI!.lastFinalizedRound === normalized.turn) return state;
  const withChallenge = applyPendingOpponentChallenge(normalized);
  return {
    ...withChallenge,
    opponentAI: {
      ...withChallenge.opponentAI!,
      migrationGraceRoundsRemaining: Math.max(
        0,
        withChallenge.opponentAI!.migrationGraceRoundsRemaining - 1,
      ),
      lastFinalizedRound: state.turn,
    },
  };
}

/**
 * Closes the round: reconcile civilization liveness once more (everything above can end a civ), settle the AI
 * container's round state, advance the turn counter, then resolve the victories that depend on the finished round.
 * `turn:start` is announced last, for the NEW turn.
 */
function runFinalization(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  const liveness = reconcileCivilizationLiveness(newState, newState);
  emitCivilizationLivenessTransitions(liveness, bus);
  newState = finalizeOpponentRoundState(liveness.state);

  // --- Advance turn ---
  newState.turn += 1;
  newState = finalizeDominationVictory(newState, bus);
  newState = finalizeScienceVictory(newState, bus);
  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });
  return newState;
}

export const finalizationPhase: RoundPhase = { id: 'finalization', run: runFinalization };
