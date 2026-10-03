import type { GameState } from '@/core/types';
import { applyEconomyTurn, emitEconomyStrainIfNeeded } from '@/systems/economy-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Settles every living civ's economy for the round, last among the world phases because the phases before it
 * credit gold to `context.grossGoldByCiv` (and the pirate round hands over its modifiers). Reads
 * `context.grossGoldByCiv`, `context.pirateEconomyModifiers` and `context.previousEconomyStatusByCiv`.
 */
function runEconomy(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus, grossGoldByCiv, previousEconomyStatusByCiv, pirateEconomyModifiers } = context;
  for (const civId of Object.keys(newState.civilizations)) {
    if (!getCivilizationLiveness(newState, civId).living) continue;
    newState = applyEconomyTurn(newState, civId, grossGoldByCiv[civId] ?? 0, pirateEconomyModifiers);
    emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus, civId);
  }
  return newState;
}

export const economyPhase: RoundPhase = { id: 'economy', run: runEconomy };
