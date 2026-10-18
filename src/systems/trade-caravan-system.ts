// src/systems/trade-caravan-system.ts
// #1249: turning a caravan into a route — which city it leaves from, whether the route is legal, and the
// establishment itself. Reads route value from trade-route-economy and route validity from the lifecycle
// module; creates the marketplace state an old save lacks.
import type { GameState, Unit, City } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import {
  TRADE_ROUTE_DENIAL_MESSAGES,
  establishTradeRoute,
  getTradeRouteEligibility,
  resolveTradeOrigin,
} from './trade-route-contract';

// --- S5: FROM city resolution ---

export function resolveFromCity(state: GameState, caravanUnit: Unit): City | null {
  return resolveTradeOrigin(state, caravanUnit);
}

// --- S5: route validation ---

/**
 * Legacy boolean view of the family's single legality contract (#1500). Prefer
 * `getTradeRouteEligibility` / `getEntitledTradeDestinations`, which return the typed reason.
 *
 * `automated` defaults to true so existing non-human callers (the AI, quest-aware trade) keep
 * working off the human turn; the chooser and the controller pass it explicitly.
 */
export function canEstablishRoute(
  state: GameState,
  caravanUnit: Unit,
  toCityId: string,
  options: { automated?: boolean } = {},
): { ok: boolean; reason?: string } {
  const decision = getTradeRouteEligibility(state, {
    caravanUnitId: caravanUnit.id,
    toCityId,
    actingCivId: caravanUnit.owner,
    automated: options.automated ?? true,
  });
  return decision.ok ? { ok: true } : { ok: false, reason: TRADE_ROUTE_DENIAL_MESSAGES[decision.reason] };
}

// --- S5: route establishment ---

/**
 * Legacy executor: delegates to the contract's typed executor and preserves this function's
 * historical contract of throwing when its precondition is not met.
 */
export function establishRoute(
  state: GameState,
  caravanUnitId: string,
  toCityId: string,
  bus?: EventBus,
  resourceDiversity: number = 0,
  options: { automated?: boolean; originCityId?: string } = {},
): GameState {
  const caravanUnit = state.units[caravanUnitId];
  if (!caravanUnit) throw new Error(`Unit ${caravanUnitId} not found`);

  const result = establishTradeRoute(state, {
    caravanUnitId,
    toCityId,
    actingCivId: caravanUnit.owner,
    automated: options.automated ?? true,
    originCityId: options.originCityId,
  }, bus, resourceDiversity);

  if (!result.ok) {
    throw new Error(`Cannot establish route: ${TRADE_ROUTE_DENIAL_MESSAGES[result.reason]}`);
  }
  return result.state;
}
