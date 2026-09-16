import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { calculateMaintenance, getRushBuyQuote, rushBuyActiveProduction } from '@/systems/economy-system';

/**
 * #1094: the AI never called `rushBuyActiveProduction` -- the same gold-for-
 * production-speed mechanic every human player has via the city panel
 * (`getRushBuyQuote`/`rushBuyActiveProduction` in `economy-system.ts`). With
 * production genuinely queued (the common case for a developed civ, not the
 * separate empty-queue `production-idle` finding), an AI's gold has *no*
 * legal use at all once treasury strain is 'none', so a healthy economy's
 * gold only ever climbs -- exactly the `gold-hoard` long-horizon finding,
 * confirmed to reproduce for the FULL length of a 300-round campaign,
 * independent of any idle window (see the #1094 design doc).
 *
 * `getRushBuyQuote` already refuses when treasury strain is 'high'/'critical'
 * and when gold is short of the rush cost -- this only adds the AI-specific
 * question "is spending here worth it *right now*", via the same
 * reserve-headroom shape `reserveAllows` already uses in `ai-production.ts`:
 * gold remaining after the purchase must still cover `RESERVE_ROUNDS` rounds
 * of the civ's own current total maintenance. A civ with zero maintenance
 * (very early game) has a reserve requirement of 0, matching
 * `reserveAllows`'s existing behavior for the same edge case.
 *
 * Deliberately NOT emergency-aware and NOT personality-weighted: the queue
 * item being rushed was already the AI's own best-scored production choice
 * (`applyAIProduction`), including its emergency-defense scoring -- rushing
 * it faster inherits that priority for free. Difficulty-invariant: every
 * challenge tier and personality gets the identical rule, matching
 * `getRushBuyQuote`'s own legality (no challenge-profile input).
 */
const RESERVE_ROUNDS = 2;

function hasSpendingReserve(state: GameState, civId: string, cost: number): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  const maintenance = calculateMaintenance(state, civId);
  const totalMaintenance = maintenance.buildingUpkeep + maintenance.unitUpkeep;
  return civ.gold - cost >= totalMaintenance * RESERVE_ROUNDS;
}

/**
 * Rush-buys active production in every one of `civId`'s cities where it is
 * legal (`getRushBuyQuote`) and leaves the civ's treasury with its ordinary
 * maintenance reserve intact afterward. Cities are processed in the civ's own
 * (already-deterministic) `cities` order; each purchase re-reads gold from
 * the threaded state, so an early purchase naturally reduces what a later
 * city in the same round can afford -- no separate per-round spending cap is
 * needed on top of that.
 */
export function applyAIGoldSpending(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  let nextState = state;
  for (const cityId of civ.cities) {
    const city = nextState.cities[cityId];
    if (!city || city.owner !== civId || city.productionQueue.length === 0) continue;
    const quote = getRushBuyQuote(nextState, civId, cityId);
    if (!quote.available) continue;
    if (!hasSpendingReserve(nextState, civId, quote.cost)) continue;
    const result = rushBuyActiveProduction(nextState, civId, cityId, bus);
    if (result.success) nextState = result.state;
  }
  return nextState;
}
