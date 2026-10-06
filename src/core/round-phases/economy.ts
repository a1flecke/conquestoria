import type { GameState } from '@/core/types';
import { applyEconomyTurn, emitEconomyStrainIfNeeded } from '@/systems/economy-system';
import type { PirateEconomyModifiers } from '@/systems/economy-system';
import { getMajorCivBlockadeCityIds } from '@/systems/blockade-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Settles every living civ's economy for the round, last among the world phases because the phases before it
 * credit gold to `context.grossGoldByCiv` (and the pirate round hands over its modifiers). Reads
 * `context.grossGoldByCiv`, `context.pirateEconomyModifiers` and `context.previousEconomyStatusByCiv`.
 *
 * #1333: unions the major-civ blockade fact into the pirate round's own
 * `blockadedCityIds` before settling. Unioning (rather than re-deriving the
 * pirate blockades here) keeps the pirate ids byte-identical even if a pirate
 * siege razed a blockaded city earlier this round. The economic consequence is
 * unchanged -- the same `blockadedCityIds` seam applies -25% city gold and drops
 * routes touching a blockaded city.
 */
function runEconomy(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus, grossGoldByCiv, previousEconomyStatusByCiv, pirateEconomyModifiers } = context;
  const base: PirateEconomyModifiers = pirateEconomyModifiers ?? { plunderByCiv: {}, blockadedCityIds: [] };
  const blockadedCityIds = new Set(base.blockadedCityIds);
  for (const cityId of getMajorCivBlockadeCityIds(newState)) blockadedCityIds.add(cityId);
  const modifiers: PirateEconomyModifiers = { ...base, blockadedCityIds: [...blockadedCityIds] };
  for (const civId of Object.keys(newState.civilizations)) {
    if (!getCivilizationLiveness(newState, civId).living) continue;
    newState = applyEconomyTurn(newState, civId, grossGoldByCiv[civId] ?? 0, modifiers);
    emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus, civId);
  }
  return newState;
}

export const economyPhase: RoundPhase = { id: 'economy', run: runEconomy };
