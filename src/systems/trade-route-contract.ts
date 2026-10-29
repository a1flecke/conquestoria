/**
 * The trade-route family's single legality contract (#1500 MR03).
 *
 * One query (`getTradeRouteEligibility`) says whether an assignment is legal and why not, as a closed
 * typed union with copy; one executor (`establishTradeRoute`) re-runs that same query before its first
 * write. The marketplace chooser, the AI and the quest flow all consume this, so "offered ⇒ executable"
 * holds and no caller needs its own copy of the gates.
 *
 * Knowledge: legality is omniscient (it may read the whole state), but what a viewer is *shown* goes
 * through `commerce-projection.ts`. The corridor gate here is the assignment-time check — discovery,
 * explored corridor, domain capability and commercial rights — never a probe of hidden future blockers.
 *
 * Positioning (#1500 item 3): a trader departs for its chosen origin physically. The route is created
 * in `routeDirection: 'positioning'`, earns no commerce income until it reaches that origin, and
 * `advanceRouteRunners` walks it there.
 */
import type { City, GameState, TradeRoute, TradeRouteModeId, UnitType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { findPathToCity } from '@/systems/unit-pathfinding';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { hasDiscoveredCity, hasExploredCoord } from '@/systems/discovery-system';
import { isTradeUnitType } from '@/systems/trade-role-targeting';
import { getCommercialPassagePermission, type CommercePassageDenialReason } from '@/systems/commerce-permissions';
import { getTradeRouteModeEligibility } from '@/systems/trade-route-modes';
import {
  getRouteCapacity,
  getTradeRouteQuote,
} from '@/systems/trade-route-economy';

/** Why a trade assignment was refused. Copy names no civilization. */
export type TradeRouteDenialReason =
  | 'unit-missing'
  | 'not-a-trader'
  | 'not-your-unit'
  | 'not-your-turn'
  | 'unit-unavailable'
  | 'already-committed'
  | 'no-origin'
  | 'origin-unusable'
  | 'origin-is-destination'
  | 'destination-unknown'
  | 'corridor-not-explored'
  | 'unsupported-domain'
  | 'naval-trader-required'
  | 'relations-too-hostile'
  | 'domestic-destination-required'
  | 'foreign-destination-required'
  | 'requires-technology'
  | CommercePassageDenialReason;

export const TRADE_ROUTE_DENIAL_MESSAGES: Record<TradeRouteDenialReason, string> = {
  'unit-missing': 'That trade unit is no longer available.',
  'not-a-trader': 'That unit cannot run a trade route.',
  'not-your-unit': 'That trade unit is not yours.',
  'not-your-turn': 'You can only assign routes on your own turn.',
  'unit-unavailable': 'That trade unit has already acted this turn.',
  'already-committed': 'That trade unit is already committed to a route.',
  'no-origin': 'No city of yours has a free route slot.',
  'origin-unusable': 'That origin city has no free route slot.',
  'origin-is-destination': 'A route needs two different cities.',
  'destination-unknown': 'That destination has not been discovered.',
  'corridor-not-explored': 'There is no explored route to that destination.',
  'unsupported-domain': 'That destination cannot be reached by this trade unit.',
  'naval-trader-required': 'Requires a Naval Trader to cross water',
  'relations-too-hostile': 'Relations with that civilization are too hostile.',
  'domestic-destination-required': 'Requires one of your own cities as the destination.',
  'foreign-destination-required': 'Requires a foreign destination.',
  'requires-technology': 'Requires a technology you have not researched.',
  'no-commercial-agreement': 'Requires a trade agreement with that civilization.',
  'at-war': 'Cannot trade with a civilization you are at war with.',
  'embargoed': 'An embargo blocks trade with that civilization.',
  'partner-eliminated': 'That civilization no longer holds territory.',
  'minor-civ-unavailable': 'That city-state is not open to trade right now.',
};

/**
 * Does this unit type have the canonical trade role? #1503 MR06 moved the derivation into the shared
 * `trade-role-targeting` query, so the chooser, the AI, this contract and the hostile systems all
 * read one predicate — this name is kept as the contract's own alias for its existing callers.
 */
export function isTradeTraderType(type: UnitType): boolean {
  return isTradeUnitType(type);
}

export interface TradeRouteRequest {
  caravanUnitId: string;
  toCityId: string;
  /** The civilization making the assignment. */
  actingCivId: string;
  /** An automated caller (AI / standing orders) may act outside the human turn. */
  automated?: boolean;
  /** The origin the player picked; omitted means "any owned city with a free slot". */
  originCityId?: string;
  /** #1504 MR07: what the route is for. Omitted means ordinary commerce. */
  mode?: TradeRouteModeId;
  /** #1509 MR12: standing import targets loaded at the supplier. */
  procurement?: TradeRoute['procurement'];
}

export type TradeRouteEligibility =
  | { ok: true; originCityId: string; destinationCityId: string; domestic: boolean }
  | { ok: false; reason: TradeRouteDenialReason };

export type TradeRouteResult =
  | { ok: true; state: GameState; route: TradeRoute }
  | { ok: false; state: GameState; reason: TradeRouteDenialReason };

function tradeDomain(type: UnitType): 'land' | 'naval' | 'air' {
  return UNIT_DEFINITIONS[type]?.domain ?? 'land';
}

function routesFromCity(state: GameState, cityId: string): number {
  return (state.marketplace?.tradeRoutes ?? []).filter(route => route.fromCityId === cityId).length;
}

function cityHasFreeSlot(state: GameState, cityId: string): boolean {
  return getRouteCapacity(state, cityId) - routesFromCity(state, cityId) > 0;
}

/** Cities of `civId` that have a free slot and a domain path from the unit's position. */
function candidateOrigins(state: GameState, unit: { owner: string; type: UnitType; position: { q: number; r: number } }): City[] {
  const domain = tradeDomain(unit.type);
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  return Object.values(state.cities)
    .filter(city => city.owner === unit.owner && cityHasFreeSlot(state, city.id))
    .filter(city => findPathToCity(unit.position, city.position, state.map, domain, { unit: unit as never, completedTechs }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** The nearest owned city with a free slot, or null. Kept for the legacy `resolveFromCity` callers. */
export function resolveTradeOrigin(
  state: GameState,
  unit: { owner: string; type: UnitType; position: { q: number; r: number } },
): City | null {
  return candidateOrigins(state, unit)[0] ?? null;
}

/** Every origin this trader could legally depart from, as the chooser lists them. */
export function getEligibleTradeOrigins(state: GameState, caravanUnitId: string): City[] {
  const unit = state.units[caravanUnitId];
  if (!unit || !isTradeTraderType(unit.type)) return [];
  return candidateOrigins(state, unit);
}

export function getTradeRouteEligibility(state: GameState, request: TradeRouteRequest): TradeRouteEligibility {
  const refuse = (reason: TradeRouteDenialReason): TradeRouteEligibility => ({ ok: false, reason });

  const unit = state.units[request.caravanUnitId];
  if (!unit) return refuse('unit-missing');
  if (!isTradeTraderType(unit.type)) return refuse('not-a-trader');
  if (unit.owner !== request.actingCivId) return refuse('not-your-unit');
  if (!request.automated && state.currentPlayer !== unit.owner) return refuse('not-your-turn');
  if (unit.committedToRouteId) return refuse('already-committed');
  if (unit.hasActed) return refuse('unit-unavailable');

  const destination = state.cities[request.toCityId];
  if (!destination) return refuse('destination-unknown');
  if (!hasDiscoveredCity(state, unit.owner, destination.id)) return refuse('destination-unknown');

  // --- Origin: the player's choice when given, otherwise any owned city with a free slot.
  let origin: City | null = null;
  if (request.originCityId) {
    const chosen = state.cities[request.originCityId];
    if (
      !chosen
      || chosen.owner !== unit.owner
      || !cityHasFreeSlot(state, chosen.id)
      || !findPathToCity(unit.position, chosen.position, state.map, tradeDomain(unit.type), {
        unit, completedTechs: state.civilizations[unit.owner]?.techState.completed ?? [],
      })
    ) return refuse('origin-unusable');
    origin = chosen;
  } else {
    origin = resolveTradeOrigin(state, unit);
    if (!origin) return refuse('no-origin');
  }
  if (origin.id === destination.id) return refuse('origin-is-destination');

  // --- Corridor: from where the trader stands to the destination, in its own domain, over tiles the
  // owner has explored. (The positioning leg to the origin is validated by the origin check above.)
  const domain = tradeDomain(unit.type);
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const corridor = findPathToCity(unit.position, destination.position, state.map, domain, { unit, completedTechs });
  if (!corridor) {
    // Preserve the actionable hint the old free-string reason carried, inside the typed union:
    // a land trader that cannot reach a destination is told it may need the naval line.
    return refuse(domain === 'land' ? 'naval-trader-required' : 'unsupported-domain');
  }
  if (!corridor.every(coord => hasExploredCoord(state, unit.owner, coord))) return refuse('corridor-not-explored');

  // --- Commercial rights (MR02), then the existing relations gate for a foreign MAJOR destination.
  // A city-state keeps its own contact/relationship model, which the permission adapter already read.
  if (destination.owner !== unit.owner) {
    const passage = getCommercialPassagePermission(state, unit.owner, destination.owner);
    if (!passage.allowed) return refuse(passage.reason);
    const isMinor = Boolean(state.minorCivs?.[destination.owner]);
    const relationship = state.civilizations[unit.owner]?.diplomacy.relationships[destination.owner] ?? 0;
    if (!isMinor && relationship < 0) return refuse('relations-too-hostile');
  }

  // --- #1504 MR07: the requested purpose must be allowed for this (owner, destination) pair. The
  // catalog is the one authority; the chooser and the executor both read it.
  const mode = request.mode ?? 'commerce';
  const modeDecision = getTradeRouteModeEligibility(
    { state, ownerCivId: unit.owner, destinationCityId: destination.id },
    mode,
  );
  if (!modeDecision.ok) return refuse(modeDecision.reason);

  return { ok: true, originCityId: origin.id, destinationCityId: destination.id, domestic: destination.owner === unit.owner };
}

/** Hex distance from the unit to the chosen origin — the positioning leg's length in tiles. */
export function getPositioningTurnsToOrigin(state: GameState, caravanUnitId: string): number {
  const unit = state.units[caravanUnitId];
  if (!unit) return 0;
  const destinationCityId = (unit as { committedToRouteId?: string }).committedToRouteId
    ? state.marketplace?.tradeRoutes.find(route => route.id === unit.committedToRouteId)?.fromCityId
    : undefined;
  const target = destinationCityId ? state.cities[destinationCityId] : resolveTradeOrigin(state, unit);
  if (!target) return 0;
  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(unit.position, target.position, state.map.width)
    : hexDistance(unit.position, target.position);
  return Math.max(0, distance);
}

/**
 * Executor for a trade assignment. Re-runs `getTradeRouteEligibility` before its first write, so a
 * stale chooser callback, a direct call or the AI all face the same answer. Refusals return the
 * input state untouched with a typed reason.
 *
 * #1501 MR04: the created route is built from `getTradeRouteQuote`, so the terms the chooser showed
 * are exactly the terms the route carries — including the round-trip service budget. There is no
 * caller-supplied resource-diversity input any more.
 */
export function establishTradeRoute(
  state: GameState,
  request: TradeRouteRequest,
  bus?: EventBus,
): TradeRouteResult {
  const decision = getTradeRouteEligibility(state, request);
  if (!decision.ok) return { ok: false, state, reason: decision.reason };

  const unit = state.units[request.caravanUnitId]!;
  const origin = state.cities[decision.originCityId]!;
  const destination = state.cities[decision.destinationCityId]!;
  const quote = getTradeRouteQuote(state, {
    caravanUnitId: request.caravanUnitId,
    originCityId: decision.originCityId,
    toCityId: decision.destinationCityId,
  })!;

  const marketState = state.marketplace
    ? { ...state.marketplace, tradeRoutes: [...state.marketplace.tradeRoutes] }
    : { tradeRoutes: [] };

  const idCounters = { ...state.idCounters };
  if (!idCounters.nextRouteId) idCounters.nextRouteId = 1;

  const route: TradeRoute = {
    id: `route-${idCounters.nextRouteId}`,
    fromCityId: origin.id,
    toCityId: destination.id,
    goldPerTrip: quote.goldPerTrip,
    turnsPerTrip: quote.turnsPerTrip,
    // The leg's bounded payable service rounds: a detour cannot mint extra rewards.
    serviceRoundsRemaining: quote.roundTripRounds,
    ...(destination.owner !== unit.owner ? { foreignCivId: destination.owner } : {}),
    // #1504 MR07: commerce is the default and stays implicit, so a new commerce route has exactly the
    // shape it had before modes existed; any other purpose is recorded explicitly.
    ...(request.mode && request.mode !== 'commerce' ? { mode: request.mode } : {}),
    ...(request.procurement ? { procurement: request.procurement } : {}),
  };
  idCounters.nextRouteId++;

  // #1500: the trader first walks to its origin; commerce starts when it arrives.
  const atOrigin = unit.position.q === origin.position.q && unit.position.r === origin.position.r;

  const nextState: GameState = {
    ...state,
    idCounters,
    marketplace: { ...marketState, tradeRoutes: [...marketState.tradeRoutes, route] },
    units: {
      ...state.units,
      [request.caravanUnitId]: {
        ...unit,
        committedToRouteId: route.id,
        routeDirection: atOrigin ? 'outbound' : 'positioning',
        movementPointsLeft: 0,
        hasActed: true,
      },
    },
  };

  bus?.emit('trade:route-created', { route });
  return { ok: true, state: nextState, route };
}
