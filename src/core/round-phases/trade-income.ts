import type { GameState } from '@/core/types';
import { settleTradeRouteForCiv } from '@/systems/trade-route-economy';
import { applyTradeRouteDeliveries } from '@/systems/trade-route-delivery';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Each living civ is credited the income of the trade routes that originate in its cities, into
 * `context.grossGoldByCiv` for the economy phase to settle.
 *
 * #1501 MR04: the credit is a *settlement*, not a rate. A route pays once for a completed round in
 * which its trader made validated progress or completed endpoint service; blocked, paused,
 * positioning, exhausted and destroyed routes pay nothing. The payment is recorded on the route
 * (`lastSettledTurn`), so a reload or a repeat of this phase cannot pay twice.
 *
 * #1504 MR07: a route whose mode is not commerce owes a recipient-specific delivery instead of gold —
 * food or production to the destination city, or research to the owner. Those are applied here, once,
 * to the one named recipient; a city with no active build receives no production.
 */
function runTradeIncome(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { grossGoldByCiv, bus } = context;
  for (const civId of Object.keys(newState.civilizations)) {
    if (!getCivilizationLiveness(newState, civId).living) continue;
    const settlement = settleTradeRouteForCiv(newState, civId, bus);
    newState = settlement.state;
    if (settlement.deliveries.length > 0) {
      newState = applyTradeRouteDeliveries(newState, settlement.deliveries, bus);
    }
    if (settlement.paid > 0) {
      grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + settlement.paid;
    }
  }
  return newState;
}

export const tradeIncomePhase: RoundPhase = { id: 'trade-income', run: runTradeIncome };
