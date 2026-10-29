// src/systems/trade-route-runner.ts
// #1502 MR05: what a committed trader does in one round, and what happens when it finishes a leg.
//
// Travel *timing* lives in `trade-route-travel.ts` (shared with the quote, so ETA and execution
// cannot drift). This module owns the round decision (walk, detour, hold, or complete the leg) and
// the leg transitions: arrival at the destination turns the trader around, and arrival home either
// ends a route that is returning — releasing its slot — or refreshes the terms for the next
// departure.
//
// MR05b adds the two recovery paths: a lost endpoint (the destination is razed, or captured by
// somebody other than the agreed partner) sends the trader home to end its route, and a lost origin
// sends it to the nearest *known* home city of its own civilization — physically, never teleported.
// An obstruction on the committed path may be routed around, but only within a bounded extra-delay
// allowance; otherwise the trader waits with a visible reason.
//
// It deliberately does not execute movement: the public entry (`advanceRouteRunners` in
// `unit-movement-system.ts`) runs the canonical `executeUnitMove`, so a route step obeys the same
// occupancy, hostility, territorial and zone-of-control rules as any other move.
import type { GameState, HexCoord, TradeRoute, Unit } from '@/core/types';
import type { TradeGoodDefinition } from '@/systems/trade-good-definitions';
import type { EventBus } from '@/core/event-bus';
import type { TradeRouteNonOperatingReason } from './trade-route-economy';
import { getTradeRouteQuote } from './trade-route-economy';
import { removeRouteById } from './trade-route-lifecycle';
import { deliverRouteManifest, loadRouteManifest } from './resource-shipment-system';
import {
  MAX_ROUTE_DETOUR_ROUNDS,
  getForeignOccupiedHexKeys,
  getRouteLegPath,
  getRouteLegRounds,
} from './trade-route-travel';
import { hexKey } from './hex-utils';

/** The trader committed to this route, if it still exists. */
export function getRouteRunner(state: GameState, routeId: string): Unit | null {
  return Object.values(state.units).find(unit => unit.committedToRouteId === routeId) ?? null;
}

/** A city of the trader's own civilization that may serve as its home. */
function isOwnHome(state: GameState, caravan: Unit, cityId: string): boolean {
  const city = state.cities[cityId];
  return Boolean(city) && city.owner === caravan.owner;
}

/** The destination is still the city this route agreed to serve, under the agreed owner. */
function isLegitimateDestination(state: GameState, route: TradeRoute, caravan: Unit): boolean {
  const city = state.cities[route.toCityId];
  if (!city) return false;
  return route.foreignCivId ? city.owner === route.foreignCivId : city.owner === caravan.owner;
}

/**
 * The nearest *reachable* home city of the trader's own civilization other than its lost origin —
 * the alternative a stranded trader may recover to. Deterministic: fewest rounds, then city id.
 */
export function chooseAlternativeHome(state: GameState, route: TradeRoute, caravan: Unit): string | null {
  const owned = state.civilizations[caravan.owner]?.cities ?? [];
  let best: { cityId: string; rounds: number } | null = null;
  for (const cityId of owned) {
    if (cityId === route.fromCityId) continue;
    if (!isOwnHome(state, caravan, cityId)) continue;
    const rounds = getRouteLegRounds(state, caravan, cityId);
    if (rounds === null) continue;
    if (!best || rounds < best.rounds || (rounds === best.rounds && cityId < best.cityId)) {
      best = { cityId, rounds };
    }
  }
  return best?.cityId ?? null;
}

export interface RouteRunnerPlan {
  /** The route with every fact this round discovered applied (endpoint loss, detour accounting). */
  route: TradeRoute;
  action: 'hold' | 'advance';
  reason?: TradeRouteNonOperatingReason;
  /** The city this leg walks to; null when no legitimate target remains. */
  legTargetCityId: string | null;
  /** Where the trader can get to this round. */
  target?: HexCoord;
  /** True when that step completes the leg. */
  completesLeg?: boolean;
  /** True when this step had to route around an obstruction (charged once per round by the entry). */
  detoured?: boolean;
}

function plan(
  route: TradeRoute,
  action: 'hold' | 'advance',
  legTargetCityId: string | null,
  extra: Partial<RouteRunnerPlan> = {},
): RouteRunnerPlan {
  return { route, action, legTargetCityId, ...extra };
}

/**
 * What this route's trader can do this round: walk to `target` (spending its real allowance along
 * the canonical path, detouring around an obstruction within the leg's allowance), or hold —
 * because the route is paused, the trader is gone, or no permitted path remains.
 */
export function planRouteRunnerRound(state: GameState, route: TradeRoute): RouteRunnerPlan {
  const caravan = getRouteRunner(state, route.id);
  if (!caravan) return plan(route, 'hold', null, { reason: 'no-trader' });
  if (route.paused) return plan(route, 'hold', null, { reason: 'paused' });

  const direction = caravan.routeDirection ?? 'outbound';
  const endpointLost = Boolean(route.endpointLost)
    || (direction === 'outbound' && !route.cancelPending && !isLegitimateDestination(state, route, caravan));

  // Resolve the leg's target: commerce heads for the destination, every return heads home.
  const originIsHome = isOwnHome(state, caravan, route.fromCityId);
  const homeCityId = route.returnHomeCityId ?? (originIsHome ? route.fromCityId : chooseAlternativeHome(state, route, caravan));
  const returning = Boolean(route.cancelPending || endpointLost) && direction !== 'positioning';
  const legTargetCityId = returning || direction !== 'outbound' ? homeCityId : route.toCityId;

  const discovered: TradeRoute = {
    ...route,
    ...(endpointLost && !route.endpointLost ? { endpointLost: true } : {}),
    ...(homeCityId && homeCityId !== route.fromCityId && homeCityId !== route.returnHomeCityId
      ? { returnHomeCityId: homeCityId }
      : {}),
    legStartedTurn: route.legStartedTurn ?? state.turn,
  };

  if (!legTargetCityId) return plan(discovered, 'hold', null, { reason: 'blocked' });
  const target = state.cities[legTargetCityId];
  if (!target) return plan(discovered, 'hold', legTargetCityId, { reason: 'blocked' });

  const path = getRouteLegPath(state, caravan, legTargetCityId);
  if (!path || path.length === 0) return plan(discovered, 'hold', legTargetCityId, { reason: 'blocked' });
  // Already standing on the leg target: endpoint service, no walk needed.
  if (path.length === 1) {
    return plan(discovered, 'advance', legTargetCityId, { target: { ...caravan.position }, completesLeg: true });
  }

  // A foreign unit on the committed next step may be routed around — within the leg's allowance.
  const foreign = getForeignOccupiedHexKeys(state, caravan);
  let walkPath = path;
  let detoured = false;
  if (foreign.has(hexKey(path[1]!))) {
    const detourRoundsUsed = route.detourRoundsUsed ?? 0;
    const detourAllowance = Math.min(
      MAX_ROUTE_DETOUR_ROUNDS,
      Math.max(0, Math.floor(route.procurement?.detourRounds ?? MAX_ROUTE_DETOUR_ROUNDS)),
    );
    const avoided = detourRoundsUsed < detourAllowance
      ? getRouteLegPath(state, caravan, legTargetCityId, { blockedHexKeys: foreign })
      : null;
    if (!avoided || avoided.length === 0) return plan(discovered, 'hold', legTargetCityId, { reason: 'blocked' });
    walkPath = avoided;
    detoured = true;
  }

  const allowance = caravan.movementPointsLeft;
  if (allowance < 1) return plan(discovered, 'hold', legTargetCityId, { reason: 'blocked' });

  // One validated step at a time: the entry hands the executor exactly the tile this runner chose,
  // so the executor's own (unit-blind) pathfinding cannot pick a cheaper route straight through
  // the obstruction the detour exists to avoid.
  return plan(discovered, 'advance', legTargetCityId, {
    target: { ...walkPath[1]! },
    completesLeg: walkPath.length === 2,
    detoured,
  });
}

function withUnit(state: GameState, unitId: string, patch: Partial<Unit>): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;
  return { ...state, units: { ...state.units, [unitId]: { ...unit, ...patch } } };
}

/**
 * The trader has reached the end of its current leg.
 *
 * Outbound arrival turns it around. Arrival home either ends a returning route — a cancellation, a
 * lost endpoint, or a stranded trader that recovered to an alternative home, which is where the
 * slot is finally released — or refreshes the route's terms for the next departure, resetting the
 * leg's detour accounting.
 */
export function completeRouteLeg(
  state: GameState,
  routeId: string,
  caravanId: string,
  bus?: EventBus,
  definitions?: readonly TradeGoodDefinition[],
): GameState {
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
  const caravan = state.units[caravanId];
  if (!route || !caravan) return state;

  if ((caravan.routeDirection ?? 'outbound') === 'outbound') {
    // One atomic load at the supplier. Goods become owned incoming claims, never usable stock yet.
    const loaded = loadRouteManifest(state, routeId, definitions);
    bus?.emit('trade:route-delivered', { unitId: caravanId, routeId, toCityId: route.toCityId });
    return withUnit(loaded, caravanId, { routeDirection: 'inbound' });
  }

  // The only place a manifest becomes usable stock: arrival at the home endpoint. Cancellation and
  // endpoint loss still deliver owned cargo before the route ends.
  const delivered = deliverRouteManifest(state, routeId);
  const stateAfterDelivery = delivered.state;

  if (route.cancelPending || route.endpointLost || route.returnHomeCityId) {
    // The return is complete: the route ends and its slot is released by the canonical removal.
    return removeRouteById(stateAfterDelivery, routeId, bus, route.endpointLost ? 'endpoint-lost' : 'cancelled');
  }

  if (caravan.routeDirection === 'positioning') {
    // Reached its origin without having served yet: commerce starts on the next leg.
    return withUnit(stateAfterDelivery, caravanId, { routeDirection: 'outbound' });
  }

  const currentRoute = stateAfterDelivery.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId)
    ?? route;
  const quote = getTradeRouteQuote(stateAfterDelivery, {
    caravanUnitId: caravanId,
    originCityId: currentRoute.fromCityId,
    toCityId: currentRoute.toCityId,
  });
  const refreshed: TradeRoute = quote
    ? {
        ...currentRoute,
        goldPerTrip: quote.goldPerTrip,
        turnsPerTrip: quote.turnsPerTrip,
        serviceRoundsRemaining: quote.roundTripRounds,
        legStartedTurn: stateAfterDelivery.turn,
        detourRoundsUsed: 0,
      }
    : { ...currentRoute, legStartedTurn: stateAfterDelivery.turn, detourRoundsUsed: 0 };
  const nextState = {
    ...stateAfterDelivery,
    marketplace: {
      ...stateAfterDelivery.marketplace!,
      tradeRoutes: stateAfterDelivery.marketplace!.tradeRoutes.map(candidate => candidate.id === routeId ? refreshed : candidate),
    },
  };
  return withUnit(nextState, caravanId, { routeDirection: 'outbound' });
}
