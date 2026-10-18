// src/systems/trade-route-lifecycle.ts
// #1249: how a route ends and how it is kept valid — removal, the stale-foreign and embargo scrubs, and
// the route diplomacy read that both establishment and the scrub consult (one rule, one source). The
// scrubs and removals return a new GameState; they never mutate their input.
import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { isAtWar, getRelationship } from '@/systems/diplomacy-queries';
import { isMinorCivAtWar } from './minor-civ-diplomacy';
import { getCommercialPassagePermission, hasRouteOnlyAllowance } from './commerce-permissions';

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
  reason: 'war-declared' | 'hostile-relations' | 'embargo' | 'espionage' | 'permission-expired' | 'cancelled',
): GameState {
  const route = state.marketplace?.tradeRoutes.find(r => r.id === routeId);
  if (!route) return state;

  const newRoutes = state.marketplace!.tradeRoutes.filter(r => r.id !== routeId);
  const newMarketplace = { ...state.marketplace!, tradeRoutes: newRoutes };

  // Clear caravan commitment before emitting so listeners see freed unit state
  const updatedUnits = { ...state.units };
  for (const [unitId, unit] of Object.entries(state.units)) {
    if (unit.committedToRouteId === routeId) {
      updatedUnits[unitId] = { ...unit, committedToRouteId: undefined, routeDirection: undefined };
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

/**
 * #1499 MR02: a foreign route needs commercial permission — a signed trade agreement with a major
 * partner, or a city-state's own contact/relationship model. Permission is derived (see
 * `commerce-permissions.ts`), so war, embargo, elimination and an explicit revocation of the
 * agreement all deny here without any mirrored record to keep in sync.
 *
 * A route that predates the permission model is covered by its recorded route-only transition
 * allowance until that allowance's boundary; after it, the route is terminated like any other route
 * whose permission is gone. Physical return/pause for a stranded trader is MR05's slice.
 */
export function scrubUnpermittedRoutes(state: GameState, bus: EventBus | undefined): GameState {
  if (!state.marketplace) return state;

  let newState = state;
  const routes = state.marketplace.tradeRoutes;

  for (const route of routes) {
    if (!route.foreignCivId) continue;

    const fromCity = newState.cities[route.fromCityId];
    if (!fromCity) continue;
    const ownerCivId = fromCity.owner;
    if (!newState.civilizations[ownerCivId]) continue;

    if (getCommercialPassagePermission(newState, ownerCivId, route.foreignCivId).allowed) continue;
    if (hasRouteOnlyAllowance(newState, route.id, ownerCivId)) continue;

    newState = removeRouteById(newState, route.id, bus, 'permission-expired');
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
        [unitId]: { ...unit, committedToRouteId: undefined, routeDirection: undefined },
      }
    : state.units;

  return {
    ...state,
    marketplace: newMarketplace,
    units: updatedUnits,
  };
}

// --- #1502 MR05: owner controls (query + executor) ---

/**
 * What the owner can do to a route right now. A query/executor pair like the assignment contract
 * (#1500): the panel renders exactly these options, and the executor re-derives them before its
 * first write, so a stale button can never mutate a route it no longer describes.
 */
export type RouteControlAction = 'pause' | 'resume' | 'cancel-and-return';

export type RouteControlDenialReason =
  | 'route-missing'
  | 'not-owner'
  | 'not-your-turn'
  | 'already-paused'
  | 'not-paused'
  | 'already-cancelling';

export interface RouteControlOption {
  action: RouteControlAction;
  label: string;
  enabled: boolean;
  reason: RouteControlDenialReason | null;
}

export const ROUTE_CONTROL_DENIAL_MESSAGES: Record<RouteControlDenialReason, string> = {
  'route-missing': 'That trade route no longer exists.',
  'not-owner': "That trade route belongs to another civilization's city.",
  'not-your-turn': 'Trade policy can only be changed on your own turn.',
  'already-paused': 'That route is already paused.',
  'not-paused': 'That route is not paused.',
  'already-cancelling': 'That route is already returning home.',
};

const ROUTE_CONTROL_LABELS: Record<RouteControlAction, string> = {
  pause: 'Pause',
  resume: 'Resume',
  'cancel-and-return': 'Cancel and return',
};

/** What the player is told when a control succeeds (the refusal copy is above). */
export const ROUTE_CONTROL_NOTIFICATIONS: Record<RouteControlAction, string> = {
  pause: 'Trade route paused — the trader holds and earns nothing until you resume it.',
  resume: 'Trade route resumed.',
  'cancel-and-return': 'Trade route cancelled — the trader is returning home before the route ends.',
};

function routeControlDenial(
  state: GameState,
  routeId: string,
  actingCivId: string,
): RouteControlDenialReason | null {
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
  if (!route) return 'route-missing';
  if (state.cities[route.fromCityId]?.owner !== actingCivId) return 'not-owner';
  if (state.currentPlayer !== actingCivId) return 'not-your-turn';
  return null;
}

/** Every control the owner may use on this route, with a typed reason when it is refused. */
export function getRouteControlOptions(
  state: GameState,
  routeId: string,
  actingCivId: string,
): RouteControlOption[] {
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
  const baseDenial = routeControlDenial(state, routeId, actingCivId);
  const options: RouteControlOption[] = [
    { action: 'pause', label: ROUTE_CONTROL_LABELS.pause, enabled: false, reason: baseDenial },
    { action: 'resume', label: ROUTE_CONTROL_LABELS.resume, enabled: false, reason: baseDenial },
    { action: 'cancel-and-return', label: ROUTE_CONTROL_LABELS['cancel-and-return'], enabled: false, reason: baseDenial },
  ];
  if (!route) return options;

  return options.map(option => {
    if (option.reason) return option;
    if (option.action === 'pause') {
      return route.paused ? { ...option, reason: 'already-paused' } : { ...option, enabled: true };
    }
    if (option.action === 'resume') {
      return route.paused ? { ...option, enabled: true } : { ...option, reason: 'not-paused' };
    }
    return route.cancelPending ? { ...option, reason: 'already-cancelling' } : { ...option, enabled: true };
  });
}

/**
 * Executor for an owner control. Re-derives the options first, so a direct call, a stale panel or
 * the AI all face the same answer.
 *
 * Cancelling does not end the route: it stops commerce immediately, turns the trader for home and
 * leaves the origin slot occupied until the return actually completes (MR05's "no cancel/reassign
 * duplication"). Pausing holds the trader and the slot, and pays nothing.
 */
export function applyRouteControl(
  state: GameState,
  routeId: string,
  action: RouteControlAction,
  actingCivId: string,
  bus?: EventBus,
): { ok: true; state: GameState } | { ok: false; state: GameState; reason: RouteControlDenialReason } {
  const option = getRouteControlOptions(state, routeId, actingCivId).find(candidate => candidate.action === action);
  if (!option || !option.enabled) {
    return { ok: false, state, reason: option?.reason ?? 'route-missing' };
  }

  const route = state.marketplace!.tradeRoutes.find(candidate => candidate.id === routeId)!;
  const updated = action === 'pause'
    ? { ...route, paused: true }
    : action === 'resume'
      ? { ...route, paused: undefined }
      : { ...route, paused: undefined, cancelPending: true };
  let nextState: GameState = {
    ...state,
    marketplace: {
      ...state.marketplace!,
      tradeRoutes: state.marketplace!.tradeRoutes.map(candidate => candidate.id === routeId ? updated : candidate),
    },
  };

  if (action === 'cancel-and-return') {
    // Stop commerce now: an outbound trader turns for home on this round's remaining movement.
    // A positioning trader is already walking to the origin, which is also its home.
    for (const [unitId, unit] of Object.entries(nextState.units)) {
      if (unit.committedToRouteId !== routeId) continue;
      if ((unit.routeDirection ?? 'outbound') === 'outbound') {
        nextState = { ...nextState, units: { ...nextState.units, [unitId]: { ...unit, routeDirection: 'inbound' } } };
      }
    }
    bus?.emit('trade:route-cancelled', { routeId, fromCityId: route.fromCityId, toCityId: route.toCityId });
  }

  return { ok: true, state: nextState };
}
