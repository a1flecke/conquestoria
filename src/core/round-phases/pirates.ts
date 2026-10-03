import type { GameState } from '@/core/types';
import { processPiratesForCompletedRound } from '@/systems/pirate-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * The pirate round for the completed round. It produces the economy modifiers pirates impose (plunder taken from each
 * civ, and which cities are blockaded); they are applied when the economy settles, so they are handed over through
 * `context.pirateEconomyModifiers`.
 *
 * Writes `context.pirateEconomyModifiers`.
 */
function runPirates(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  const pirateRound = processPiratesForCompletedRound(newState, bus);
  newState = pirateRound.state;
  context.pirateEconomyModifiers = pirateRound.economyModifiers;
  return newState;
}

export const piratesPhase: RoundPhase = { id: 'pirates', run: runPirates };
