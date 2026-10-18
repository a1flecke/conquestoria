// src/systems/trade-route-runner.ts
// #1502 MR05: what a committed trader does in one round, and what happens when it finishes a leg.
//
// Travel *timing* lives in `trade-route-travel.ts` (shared with the quote, so ETA and execution
// cannot drift). This module owns the round decision (walk, hold, or complete the leg) and the leg
// transitions: arrival at the destination turns the trader around, and arrival home either ends a
// cancelled route — releasing its slot — or refreshes the terms for the next departure.
//
// It deliberately does not execute movement: the public entry (`advanceRouteRunners` in
// `unit-movement-system.ts`) runs the canonical `executeUnitMove`, so a route step obeys the same
// occupancy, hostility, territorial and zone-of-control rules as any other move.
import type { GameState, HexCoord, TradeRoute, Unit } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import type { TradeRouteNonOperatingReason } from './trade-route-economy';
import { getTradeRouteQuote } from './trade-route-economy';
import { removeRouteById } from './trade-route-lifecycle';
import { getRouteLegPath, getRouteStepCosts } from './trade-route-travel';

/** The city the trader's current leg walks to. */
export function getRouteLegTargetCityId(route: TradeRoute, caravan: Unit): string {
  // Positioning and the inbound (or cancelled) return both head for home; only outbound commerce
  // heads for the destination.
  return (caravan.routeDirection ?? 'outbound') === 'outbound' ? route.toCityId : route.fromCityId;
}

export type RouteRunnerRound =
  | { kind: 'hold'; reason: TradeRouteNonOperatingReason; legTargetCityId: string | null }
  | { kind: 'advance'; target: HexCoord; legTargetCityId: string; completesLeg: boolean };

/** The trader committed to this route, if it still exists. */
export function getRouteRunner(state: GameState, routeId: string): Unit | null {
  return Object.values(state.units).find(unit => unit.committedToRouteId === routeId) ?? null;
}

/**
 * What this route's trader can do this round: walk to `target` (spending its real allowance along
 * the canonical path), or hold — because the route is paused, the trader is gone, or no legal path
 * remains. Holding is never "income with no movement": the settlement reads the same hold reasons.
 */
export function planRouteRunnerRound(state: GameState, route: TradeRoute): RouteRunnerRound {
  const caravan = getRouteRunner(state, route.id);
  if (!caravan) return { kind: 'hold', reason: 'no-trader', legTargetCityId: null };
  if (route.paused) return { kind: 'hold', reason: 'paused', legTargetCityId: null };

  const legTargetCityId = getRouteLegTargetCityId(route, caravan);
  const targetCity = state.cities[legTargetCityId];
  if (!targetCity) return { kind: 'hold', reason: 'blocked', legTargetCityId };

  const path = getRouteLegPath(state, caravan, legTargetCityId);
  if (!path || path.length === 0) return { kind: 'hold', reason: 'blocked', legTargetCityId };
  // Already standing on the leg target: endpoint service, no walk needed.
  if (path.length === 1) {
    return { kind: 'advance', target: { ...caravan.position }, legTargetCityId, completesLeg: true };
  }

  const allowance = caravan.movementPointsLeft;
  if (allowance < 1) return { kind: 'hold', reason: 'blocked', legTargetCityId };

  const costs = getRouteStepCosts(state, caravan, path);
  let spent = 0;
  let lastReachable = 0;
  for (let i = 0; i < costs.length; i++) {
    if (spent + costs[i]! > allowance) break;
    spent += costs[i]!;
    lastReachable = i + 1;
  }
  // The canonical forced march: one adjacent step may be completed with any movement left.
  if (lastReachable === 0 && costs.length === 1) lastReachable = 1;
  if (lastReachable === 0) return { kind: 'hold', reason: 'blocked', legTargetCityId };

  return {
    kind: 'advance',
    target: { ...path[lastReachable]! },
    legTargetCityId,
    completesLeg: lastReachable === path.length - 1,
  };
}

function withUnit(state: GameState, unitId: string, patch: Partial<Unit>): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;
  return { ...state, units: { ...state.units, [unitId]: { ...unit, ...patch } } };
}

/**
 * The trader has reached the end of its current leg.
 *
 * Outbound arrival turns it around. Arrival home either ends a cancelled route — which is where a
 * cancellation's slot is finally released, never before — or refreshes the route's terms for the
 * next departure so a returning trader departs on today's prices, path and modifiers.
 */
export function completeRouteLeg(state: GameState, routeId: string, caravanId: string, bus?: EventBus): GameState {
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
  const caravan = state.units[caravanId];
  if (!route || !caravan) return state;

  if ((caravan.routeDirection ?? 'outbound') === 'outbound') {
    bus?.emit('trade:route-delivered', { unitId: caravanId, routeId, toCityId: route.toCityId });
    return withUnit(state, caravanId, { routeDirection: 'inbound' });
  }

  if (route.cancelPending) {
    // The return is complete: the route ends and its slot is released by the canonical removal.
    return removeRouteById(state, routeId, bus, 'cancelled');
  }

  if (caravan.routeDirection === 'positioning') {
    // Reached its origin without having served yet: commerce starts on the next leg.
    return withUnit(state, caravanId, { routeDirection: 'outbound' });
  }

  const quote = getTradeRouteQuote(state, {
    caravanUnitId: caravanId,
    originCityId: route.fromCityId,
    toCityId: route.toCityId,
  });
  const refreshed: TradeRoute = quote
    ? { ...route, goldPerTrip: quote.goldPerTrip, turnsPerTrip: quote.turnsPerTrip, serviceRoundsRemaining: quote.roundTripRounds }
    : route;
  const nextState = { ...state, marketplace: { ...state.marketplace!, tradeRoutes: state.marketplace!.tradeRoutes.map(candidate => candidate.id === routeId ? refreshed : candidate) } };
  return withUnit(nextState, caravanId, { routeDirection: 'outbound' });
}
