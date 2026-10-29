import type { GameState } from '@/core/types';
import { emitCivilizationLivenessTransitions, reconcileCivilizationLiveness } from '@/systems/civilization-elimination-system';
import { tickOccupiedCities } from '@/systems/city-occupation-system';
import { applyCrisisResponses } from '@/ai/ai-crisis-response';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import { reconcileLegendaryWonderAvailability } from '@/systems/legendary-wonder-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Between instability and the per-civ loop: revolts above can end a civ, so liveness is reconciled again; AI civs
 * run later via the AI round scheduler, so the crisis responses recorded here shape the same round's plans (#529);
 * occupation ticks; the economy status the round starts from is recorded for `economy` to compare against;
 * purchased-resource entries that have expired are dropped; wonder availability is reconciled before cities
 * produce.
 *
 * Writes `context.previousEconomyStatusByCiv`.
 */
function runPreCivReconciliation(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  const liveness = reconcileCivilizationLiveness(newState, newState);
  emitCivilizationLivenessTransitions(liveness, bus);
  newState = liveness.state;
  // AI civ turns run later via the AI round scheduler, so responses recorded
  // here (quarantine/fund-remedy) shape the same round's plans (#529 MR3 Task 3.2).
  if (resolveWorldPressureFlags(newState.settings).aiPressure === 'full') {
    newState = applyCrisisResponses(newState, bus);
  }
  newState = tickOccupiedCities(newState);
  context.previousEconomyStatusByCiv = newState.economyStatusByCiv ?? {};

  // #1516 MR19: legacy purchased-resource entries are consumed once by the ordered
  // `retired-market-access` migration, so no per-turn cleanup branch remains here.

  newState = reconcileLegendaryWonderAvailability(newState, bus);
  return newState;
}

export const preCivReconciliationPhase: RoundPhase = { id: 'pre-civ-reconciliation', run: runPreCivReconciliation };
