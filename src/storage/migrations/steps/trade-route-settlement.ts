import type { GameState } from '@/core/types';

/**
 * #1501 MR04 — trade routes gained their settlement fields.
 *
 * A route now carries the payable service-round budget for its current round trip
 * (`serviceRoundsRemaining`), the round its trader last made validated progress
 * (`lastProgressTurn`), and the round it was last settled in (`lastSettledTurn`). Settlement pays
 * only for a completed round with a progress record, so an existing route needs both a budget and a
 * starting round: this step derives the budget from the route's own committed journey
 * (`turnsPerTrip`) and dates its progress to the saved turn, after which the normal per-round rules
 * take over.
 *
 * A route whose trader no longer exists stops paying, which is the MR04 contract ("settlement ...
 * only for a live, eligible operating trader"); the trader's own removal already closes its route
 * going forward, so this only affects a route a removed trader failed to clean up.
 */
export function migrateTradeRouteSettlement(state: GameState): GameState {
  const routes = state.marketplace?.tradeRoutes;
  if (!routes || routes.length === 0) return state;

  let changed = false;
  const nextRoutes = routes.map(route => {
    if (route.serviceRoundsRemaining !== undefined && route.lastProgressTurn !== undefined) return route;
    changed = true;
    return {
      ...route,
      serviceRoundsRemaining: route.serviceRoundsRemaining ?? Math.max(1, route.turnsPerTrip * 2),
      lastProgressTurn: route.lastProgressTurn ?? state.turn,
    };
  });

  if (!changed) return state;
  return { ...state, marketplace: { ...state.marketplace!, tradeRoutes: nextRoutes } };
}
