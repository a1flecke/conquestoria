import type { GameState } from '@/core/types';
import { createCommercePermissionsState, recordRouteOnlyAllowance } from '@/systems/commerce-permissions';

/**
 * #1499 MR02 — commerce permissions became explicit.
 *
 * A foreign trade assignment now requires commercial permission (a signed `trade_agreement` with a
 * major partner, or a city-state's own contact/relationship model). A save written before that rule
 * has foreign routes nobody ever granted permission for, so this step records a one-time **route-only
 * transition allowance** per existing foreign route, sized to the route's own committed journey
 * (`turnsPerTrip`) so the assignment can finish the round trip it was already on.
 *
 * The allowance is deliberately narrow: it is keyed to that single route id (so it can never
 * authorize a new assignment) and it authorizes no resource purchase (instant imports are contained
 * by #1498 MR01 regardless). Because it is recorded here — at migration time, with an absolute
 * `expiresOnTurn` — reloading the save never refreshes it.
 */
export function migrateCommercePermissions(state: GameState): GameState {
  let next: GameState = state.commercePermissions
    ? state
    : { ...state, commercePermissions: createCommercePermissionsState() };

  for (const route of next.marketplace?.tradeRoutes ?? []) {
    if (!route.foreignCivId) continue;
    const fromCity = next.cities[route.fromCityId];
    if (!fromCity) continue;
    next = recordRouteOnlyAllowance(next, route.id, fromCity.owner, route.turnsPerTrip);
  }

  return next;
}
