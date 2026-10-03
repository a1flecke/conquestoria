import type { GameState } from '@/core/types';
import { processTradeRouteIncome } from '@/systems/trade-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Each living civ is credited the income of the trade routes that originate in its cities, into
 * `context.grossGoldByCiv` for the economy phase to settle.
 */
function runTradeIncome(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { grossGoldByCiv } = context;
  if (newState.marketplace) {
    for (const civId of Object.keys(newState.civilizations)) {
      if (!getCivilizationLiveness(newState, civId).living) continue;
      const civRouteIncome = processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(route => {
          const city = newState.cities[route.fromCityId];
          return city?.owner === civId;
        }),
        newState,
      );
      grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + civRouteIncome;
    }
  }
  return newState;
}

export const tradeIncomePhase: RoundPhase = { id: 'trade-income', run: runTradeIncome };
