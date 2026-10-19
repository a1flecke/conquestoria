// src/systems/trade-danger-adapters.ts
// #1503 MR06: adapt authoritative world facts to typed trade consequences.
//
// A danger is *owned* by its world system: blockades by `blockade-system` (#1333), movement
// obstruction by the canonical movement/pathfinding rules, and a carrier's loss by the canonical
// unit removal (#1198). Trade never decides damage, hostility, occupancy or random loss — it reads
// those facts here and turns them into one of three ordered, typed consequences:
//
//   1. `carrier-lost`      — the trader is gone (terminal: nothing else about the route can be served).
//   2. `service-suspended` — an endpoint city is blockaded, so the route cannot be served. This is the
//                            blockade -> service link the parent plan asks for, and the fact that makes
//                            settlement agree with the economy's existing blockade projection.
//   3. `movement-blocked`  — a foreign unit holds the committed next step. The *judgement* stays with
//                            the runner (it owns movement planning); callers pass it in.
//
// Composition is a documented, stable first-match order: exactly one consequence is reported for a
// route, so overlapping reports of the same blockade or attack cannot double-charge a loss or emit
// repeated notices. There is no hidden chance-of-loss roll anywhere in this module.
//
// Knowledge: `getTradeDangerFacts` is omniscient simulation truth (used for live service state).
// Everything a *viewer* is shown goes through `getEntitledRouteDanger`, which only ever reports a
// blockade of the viewer's own cities — a fleet the viewer cannot see never changes what it is told.
import type { GameState, TradeRoute, Unit } from '@/core/types';
import { getBlockadedCityIds } from './blockade-system';

/** Why a route's service is interrupted. `combat-loss` is terminal. */
export type TradeDangerSource = 'obstruction' | 'blockade' | 'combat-loss';

/** The supported trade consequences of an authoritative danger fact. */
export type TradeDangerConsequenceKind = 'movement-blocked' | 'service-suspended' | 'carrier-lost';

export interface TradeDangerConsequence {
  kind: TradeDangerConsequenceKind;
  source: TradeDangerSource;
  /** The blockaded endpoint, when `kind` is `service-suspended`. */
  cityId?: string;
}

/**
 * The authoritative, once-per-pass danger facts a caller may compute and reuse. A caller that settles
 * or renders many routes MUST compute this once and pass it in, so adapting danger never becomes one
 * unbounded map scan per route.
 */
export interface TradeDangerFacts {
  blockadedCityIds: ReadonlySet<string>;
}

/** One authoritative read of every blockaded city, for reuse across a route pass. */
export function getTradeDangerFacts(state: GameState): TradeDangerFacts {
  return { blockadedCityIds: new Set(getBlockadedCityIds(state)) };
}

/** The trader committed to this route, if it still exists. */
function routeRunner(state: GameState, routeId: string): Unit | null {
  return Object.values(state.units).find(unit => unit.committedToRouteId === routeId) ?? null;
}

/**
 * A route whose trader is gone is only *terminally* lost when it was actually being run: a route that
 * has never been settled (#1501-aware) is the legacy display path, exactly as `getRouteOperatingStatus`
 * treats it, and must not be reported as a combat loss.
 */
function hasSettlementHistory(route: TradeRoute): boolean {
  return route.lastSettledTurn !== undefined
    || route.serviceRoundsRemaining !== undefined
    || route.lastProgressTurn !== undefined;
}

/** The first endpoint of the route (origin, then destination) that is blockaded. */
function blockadedEndpoint(route: TradeRoute, facts: TradeDangerFacts): string | null {
  if (facts.blockadedCityIds.has(route.fromCityId)) return route.fromCityId;
  if (facts.blockadedCityIds.has(route.toCityId)) return route.toCityId;
  return null;
}

/**
 * The typed consequences of the authoritative danger facts around one route, composed in the stable
 * order documented above (first match wins).
 *
 * `movementBlocked` is the caller's own canonical judgement that the committed next step is held — the
 * runner already computes exactly that, so passing it in keeps one movement implementation.
 */
export function getRouteDangerConsequences(
  state: GameState,
  route: TradeRoute,
  options: { movementBlocked?: boolean; runner?: Unit | null; facts?: TradeDangerFacts } = {},
): TradeDangerConsequence[] {
  const facts = options.facts ?? getTradeDangerFacts(state);
  const runner = options.runner !== undefined ? options.runner : routeRunner(state, route.id);

  // 1. Terminal: the trader is gone while the route was live.
  if (!runner && hasSettlementHistory(route)) {
    return [{ kind: 'carrier-lost', source: 'combat-loss' }];
  }

  // 2. Service suspended: an endpoint city is under blockade.
  const endpoint = blockadedEndpoint(route, facts);
  if (endpoint) {
    return [{ kind: 'service-suspended', source: 'blockade', cityId: endpoint }];
  }

  // 3. Movement blocked: the committed next step is held by a foreign unit.
  if (options.movementBlocked) {
    return [{ kind: 'movement-blocked', source: 'obstruction' }];
  }

  return [];
}

/** True when an endpoint of this route is blockaded — the blockade -> service link. */
export function isRouteServiceSuspended(
  state: GameState,
  route: TradeRoute,
  facts: TradeDangerFacts = getTradeDangerFacts(state),
): boolean {
  return blockadedEndpoint(route, facts) !== null;
}

export interface EntitledRouteDanger {
  kind: TradeDangerConsequenceKind;
  source: TradeDangerSource;
  cityId: string;
  /** Public copy for the entitled viewer; names no hidden actor. */
  label: string;
}

/**
 * What this viewer is entitled to be told about a route's danger.
 *
 * An owner legitimately knows when its *own* city is blockaded (#1333), so a blockade of the viewer's
 * own endpoint is reported. A blockade of a foreign endpoint is not: it may be a fleet the viewer has
 * never seen, and masking a name after it has already changed a label would still be a leak. Returns
 * null when the viewer owns no blockaded endpoint of this route.
 */
export function getEntitledRouteDanger(
  state: GameState,
  viewerCivId: string,
  route: TradeRoute,
  facts: TradeDangerFacts = getTradeDangerFacts(state),
): EntitledRouteDanger | null {
  if (state.cities[route.fromCityId]?.owner !== viewerCivId) return null;
  const ownBlockadedEndpoint = [route.fromCityId, route.toCityId].find(
    cityId => facts.blockadedCityIds.has(cityId) && state.cities[cityId]?.owner === viewerCivId,
  );
  if (!ownBlockadedEndpoint) return null;
  return {
    kind: 'service-suspended',
    source: 'blockade',
    cityId: ownBlockadedEndpoint,
    label: 'Blockaded — this route cannot be served until the blockade lifts.',
  };
}
