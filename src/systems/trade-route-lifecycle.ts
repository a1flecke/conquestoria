// src/systems/trade-route-lifecycle.ts
// #1249: how a route ends and how it is kept valid — removal, the stale-foreign and embargo scrubs, and
// the route diplomacy read that both establishment and the scrub consult (one rule, one source). The
// scrubs and removals return a new GameState; they never mutate their input.
import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { isAtWar, getRelationship } from '@/systems/diplomacy-queries';
import { isMinorCivAtWar } from './minor-civ-diplomacy';

export function getRouteDiplomacy(state: GameState, ownerCivId: string, foreignCivId: string) {
  const minorCiv = state.minorCivs[foreignCivId];
  if (minorCiv) {
    return {
      atWar: isMinorCivAtWar(state, ownerCivId, foreignCivId),
      relationship: minorCiv.diplomacy.relationships[ownerCivId] ?? 0,
    };
  }
  const diplomacy = state.civilizations[ownerCivId]?.diplomacy;
  return {
    atWar: diplomacy ? isAtWar(diplomacy, foreignCivId) : false,
    relationship: diplomacy ? getRelationship(diplomacy, foreignCivId) : 0,
  };
}

// --- S5: route removal helper ---

// --- S6a: route lifecycle helpers ---

export function removeRouteById(
  state: GameState,
  routeId: string,
  bus: EventBus | undefined,
  reason: 'war-declared' | 'hostile-relations' | 'embargo' | 'espionage',
): GameState {
  const route = state.marketplace?.tradeRoutes.find(r => r.id === routeId);
  if (!route) return state;

  const newRoutes = state.marketplace!.tradeRoutes.filter(r => r.id !== routeId);
  const newMarketplace = { ...state.marketplace!, tradeRoutes: newRoutes };

  // Clear caravan commitment before emitting so listeners see freed unit state
  const updatedUnits = { ...state.units };
  for (const [unitId, unit] of Object.entries(state.units)) {
    if (unit.committedToRouteId === routeId) {
      updatedUnits[unitId] = { ...unit, committedToRouteId: undefined, tripsRemaining: undefined };
    }
  }

  bus?.emit('trade:route-ended', {
    routeId,
    fromCityId: route.fromCityId,
    toCityId: route.toCityId,
    reason,
  });

  return { ...state, marketplace: newMarketplace, units: updatedUnits };
}

export function scrubStaleForeignRoutes(state: GameState, bus: EventBus | undefined): GameState {
  if (!state.marketplace) return state;

  let newState = state;
  const routes = state.marketplace.tradeRoutes; // snapshot — original array never mutated

  for (const route of routes) {
    if (!route.foreignCivId) continue;

    // Read from newState so any same-turn city/civ changes are visible
    const fromCity = newState.cities[route.fromCityId];
    if (!fromCity) continue;
    const ownerCiv = newState.civilizations[fromCity.owner];
    if (!ownerCiv) continue;

    const routeDiplomacy = getRouteDiplomacy(newState, fromCity.owner, route.foreignCivId);
    if (routeDiplomacy.atWar) {
      newState = removeRouteById(newState, route.id, bus, 'war-declared');
      continue;
    }

    if (routeDiplomacy.relationship < -25) {
      newState = removeRouteById(newState, route.id, bus, 'hostile-relations');
    }
  }

  return newState;
}

export function scrubEmbargoedRoutes(state: GameState, bus: EventBus | undefined): GameState {
  if (!state.embargoes || state.embargoes.length === 0 || !state.marketplace) return state;

  let newState = state;
  const routes = state.marketplace.tradeRoutes;

  for (const route of routes) {
    if (!route.foreignCivId) continue;

    const fromCity = state.cities[route.fromCityId];
    if (!fromCity) continue;

    const fromOwner = fromCity.owner;
    const toOwner = route.foreignCivId; // stored at route creation — avoids missing-city lookup

    const embargoed = state.embargoes.some(embargo =>
      (embargo.targetCivId === toOwner && embargo.participants.includes(fromOwner)) ||
      (embargo.targetCivId === fromOwner && embargo.participants.includes(toOwner)),
    );

    if (embargoed) {
      newState = removeRouteById(newState, route.id, bus, 'embargo');
    }
  }

  return newState;
}

export function removeRouteForUnit(
  state: GameState,
  unitId: string,
  bus?: EventBus,
  reason: 'unit-died' | 'unit-disbanded' | 'trips-exhausted' | 'unit-captured' = 'unit-died',
  /** Pass explicit routeId when the unit may already be removed from state.units */
  explicitRouteId?: string,
): GameState {
  const unit = state.units[unitId];
  const routeId = explicitRouteId ?? unit?.committedToRouteId;
  if (!routeId) return state;
  const route = state.marketplace?.tradeRoutes.find(r => r.id === routeId);

  const newRoutes = (state.marketplace?.tradeRoutes ?? []).filter(r => r.id !== routeId);
  const newMarketplace = state.marketplace
    ? { ...state.marketplace, tradeRoutes: newRoutes }
    : undefined;

  if (route) {
    bus?.emit('trade:route-ended', {
      routeId,
      fromCityId: route.fromCityId,
      toCityId: route.toCityId,
      reason,
    });
  }

  // Only update the unit entry if it still exists in state (may already be removed on death)
  const updatedUnits = unit
    ? {
        ...state.units,
        [unitId]: { ...unit, committedToRouteId: undefined, tripsRemaining: undefined },
      }
    : state.units;

  return {
    ...state,
    marketplace: newMarketplace,
    units: updatedUnits,
  };
}
