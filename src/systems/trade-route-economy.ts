// src/systems/trade-route-economy.ts
// #1249: what a trade route is worth and how many a city may hold — per-trip gold, tech/network
// bonuses, capacity and the trip bonus. Pure queries over state; no route is created or removed here.
import type { TradeRoute, GameState, UnitType } from '@/core/types';
import { isCityCoastal } from './city-system';
import { getTradeRouteTechGold } from './tech-yield-system';
import { getNetworkRouteGoldBonus } from './network-infrastructure-plans';
import { getCivAvailableResources } from './resource-acquisition-system';
import { getRouteRoundsBetween } from './trade-route-travel';
import { hexDistance, wrappedHexDistance } from './hex-utils';

export function calculateTradeRouteGold(
  distance: number,
  resourceDiversity: number,
): number {
  const base = 2;
  const distBonus = Math.min(distance, 10);
  const diversityBonus = Math.min(resourceDiversity, 5);
  return base + Math.floor(distBonus / 3) + diversityBonus;
}

// --- S5: per-route effective gold/turn ---

export function getEffectiveGoldPerTurn(route: TradeRoute, techGoldBonus: number = 0): number {
  return Math.max(1, Math.round(route.goldPerTrip / route.turnsPerTrip) + techGoldBonus);
}

/** Tech-driven per-route gold (guilds, colonial-trade, steam-navigation). */
export function getRouteTechGoldBonus(state: GameState, route: TradeRoute): number {
  const fromCity = state.cities[route.fromCityId];
  const toCity = state.cities[route.toCityId];
  if (!fromCity) return 0;
  const completedTechs = state.civilizations[fromCity.owner]?.techState.completed ?? [];
  const bothEndpointsCoastal = Boolean(toCity) && isCityCoastal(fromCity, state.map) && isCityCoastal(toCity!, state.map);
  return getTradeRouteTechGold(route, completedTechs, { bothEndpointsCoastal });
}

export function processTradeRouteIncome(routes: TradeRoute[], state?: GameState): number {
  if (!state) {
    // Legacy display path with no state: keep the historical per-turn estimate.
    return routes.reduce((total, route) => total + getEffectiveGoldPerTurn(route), 0);
  }
  // #1501 MR04: income is the *current actual* operating result, so a blocked, positioning or
  // exhausted route contributes zero here exactly as it does at settlement.
  return routes.reduce((total, route) => total + getRouteOperatingStatus(state, route.id).goldPerTurn, 0);
}

/** True while the route's trader is still travelling to the route's origin (#1500). */
export function isRoutePositioning(state: GameState, route: TradeRoute): boolean {
  const runner = Object.values(state.units).find(unit => unit.committedToRouteId === route.id);
  return runner?.routeDirection === 'positioning';
}

// --- #1501 MR04: one quote, and settlement that stops with service ---

export interface TradeRouteQuoteModifier {
  id: 'base' | 'throughput' | 'route-tech' | 'network';
  label: string;
  goldPerTurn: number;
}

/** The one quote the chooser previews and the executor creates a route from. */
export interface TradeRouteQuote {
  fromCityId: string;
  toCityId: string;
  /** The civilization paid by this route. */
  recipientCivId: string;
  domestic: boolean;
  /** Rounds the trader needs for one leg, from its own path (one hex per world round). */
  legRounds: number;
  /** The committed round trip's duration — also its payable service-round budget. */
  roundTripRounds: number;
  turnsPerTrip: number;
  goldPerTrip: number;
  /** The normal operating reward per completed round of service. */
  goldPerTurn: number;
  modifiers: TradeRouteQuoteModifier[];
}

export type TradeRouteNonOperatingReason = 'positioning' | 'no-trader' | 'blocked' | 'service-complete' | 'paused' | 'cancelled';

export interface TradeRouteOperatingStatus {
  routeId: string;
  /** What the route promises per round while it is operating. */
  promisedGoldPerTurn: number;
  /** What it is actually earning now: zero whenever it is not operating. */
  goldPerTurn: number;
  paying: boolean;
  reason: TradeRouteNonOperatingReason | null;
}

/**
 * Rounds the trader needs for one leg, from the shared travel model (#1502 MR05): the same
 * allowance and terrain/road costs the executor spends, measured origin → destination. Without a
 * live trader there is no allowance to walk with, so the geometric estimate is the fallback.
 */
function pathLegRounds(state: GameState, originCityId: string, toCityId: string, caravanUnitId: string): number | null {
  const origin = state.cities[originCityId];
  const destination = state.cities[toCityId];
  if (!origin || !destination) return null;
  const unit = state.units[caravanUnitId];
  if (unit) {
    const rounds = getRouteRoundsBetween(state, unit, origin.position, toCityId);
    if (rounds !== null) return rounds;
  }
  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(origin.position, destination.position, state.map.width)
    : hexDistance(origin.position, destination.position);
  return Math.max(1, Math.ceil(distance / 3));
}

/**
 * One quote for a route between two cities: path-based timing, the operating reward with its
 * named modifiers, the recipient, and the bounded service-round budget for the leg.
 *
 * Resource diversity is computed here from the owner's own resources — callers used to pass a
 * guess, which is how the chooser's preview and the executor's route disagreed.
 */
export function getTradeRouteQuote(
  state: GameState,
  request: { caravanUnitId: string; originCityId: string; toCityId: string },
): TradeRouteQuote | null {
  const origin = state.cities[request.originCityId];
  const destination = state.cities[request.toCityId];
  if (!origin || !destination) return null;
  const unit = state.units[request.caravanUnitId];
  const ownerCivId = unit?.owner ?? origin.owner;

  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(origin.position, destination.position, state.map.width)
    : hexDistance(origin.position, destination.position);
  const resourceDiversity = getCivAvailableResources(state, ownerCivId).size;
  const legRounds = pathLegRounds(state, request.originCityId, request.toCityId, request.caravanUnitId)
    ?? Math.max(1, Math.ceil(distance / 3));

  const base = calculateTradeRouteGold(distance, resourceDiversity);
  // #1502 MR05: infrastructure and hull quality are a *persistent* throughput bonus (gold per
  // trip) rather than a finite number of extra trips, so a route's reward no longer expires.
  const throughput = getRouteThroughputBonus(state, request.originCityId, request.toCityId, ownerCivId, unit?.type);
  const route: TradeRoute = {
    id: 'quote',
    fromCityId: request.originCityId,
    toCityId: request.toCityId,
    goldPerTrip: (base + throughput) * legRounds,
    turnsPerTrip: legRounds,
    ...(destination.owner !== ownerCivId ? { foreignCivId: destination.owner } : {}),
  };
  const routeTech = getRouteTechGoldBonus(state, route);
  const network = getNetworkRouteGoldBonus(state, route);

  return {
    fromCityId: request.originCityId,
    toCityId: request.toCityId,
    recipientCivId: ownerCivId,
    domestic: destination.owner === origin.owner,
    legRounds,
    roundTripRounds: legRounds * 2,
    turnsPerTrip: legRounds,
    goldPerTrip: (base + throughput) * legRounds,
    goldPerTurn: base + throughput + routeTech + network,
    modifiers: [
      { id: 'base', label: 'Base route value', goldPerTurn: base },
      ...(throughput !== 0 ? [{ id: 'throughput' as const, label: 'Trade infrastructure and hulls', goldPerTurn: throughput }] : []),
      ...(routeTech !== 0 ? [{ id: 'route-tech' as const, label: 'Route technology', goldPerTurn: routeTech }] : []),
      ...(network !== 0 ? [{ id: 'network' as const, label: 'Network infrastructure', goldPerTurn: network }] : []),
    ],
  };
}

/** The route's promised rate, recomputed from canonical state when no frozen value is recorded. */
function promisedGoldPerTurn(state: GameState, route: TradeRoute): number {
  return getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(state, route)) + getNetworkRouteGoldBonus(state, route);
}

/**
 * What this route is actually earning right now, and why not when it is zero.
 *
 * Settlement and every player-facing surface call this, so a promised rate and a current actual
 * rate can never disagree.
 */
export function getRouteOperatingStatus(state: GameState, routeId: string): TradeRouteOperatingStatus {
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
  const promised = route ? promisedGoldPerTurn(state, route) : 0;
  const notOperating = (reason: TradeRouteNonOperatingReason): TradeRouteOperatingStatus =>
    ({ routeId, promisedGoldPerTurn: promised, goldPerTurn: 0, paying: false, reason });

  if (!route) return notOperating('no-trader');
  // #1502 MR05: a paused route holds its trader and slot, and earns nothing until it resumes; a
  // cancelled route is returning home and has stopped serving, so it earns nothing either.
  if (route.paused) return notOperating('paused');
  if (route.cancelPending) return notOperating('cancelled');
  // A route that has never been settled (#1501-aware) behaves as it always did: the display path
  // keeps counting it, and only a route MR04 has actually settled must have a live trader.
  const settlementAware = route.lastSettledTurn !== undefined
    || route.serviceRoundsRemaining !== undefined
    || route.lastProgressTurn !== undefined;
  const runner = Object.values(state.units).find(unit => unit.committedToRouteId === routeId);
  if (!runner && settlementAware) return notOperating('no-trader');
  if (runner?.routeDirection === 'positioning') return notOperating('positioning');
  if (route.serviceRoundsRemaining !== undefined && route.serviceRoundsRemaining <= 0) return notOperating('service-complete');
  // A recorded progress turn that is not the current round means the trader did not serve this
  // round (blocked or waiting). A route with no record yet (fresh or from an older save) is treated
  // as operating until its first settlement round decides.
  if (route.lastProgressTurn !== undefined && route.lastProgressTurn !== state.turn) return notOperating('blocked');

  return { routeId, promisedGoldPerTurn: promised, goldPerTurn: promised, paying: true, reason: null };
}

/**
 * Settle every route this civilization owns, once, for the round that just completed.
 *
 * A route pays only when its trader made validated progress or completed endpoint service this
 * round; paused, blocked, positioning, exhausted and destroyed routes pay nothing. The payment is
 * recorded on the route (`lastSettledTurn`), so a reload or a repeated settlement in the same round
 * cannot pay twice. Reaching home refreshes the leg's payable-round budget for the next departure.
 */
export function settleTradeRouteForCiv(
  state: GameState,
  civId: string,
): { state: GameState; paid: number; reasons: TradeRouteNonOperatingReason[] } {
  const routes = state.marketplace?.tradeRoutes;
  if (!routes || routes.length === 0) return { state, paid: 0, reasons: [] };

  let paid = 0;
  const reasons: TradeRouteNonOperatingReason[] = [];
  let changed = false;

  const nextRoutes = routes.map(route => {
    const origin = state.cities[route.fromCityId];
    if (origin?.owner !== civId) return route;

    const runner = Object.values(state.units).find(unit => unit.committedToRouteId === route.id);
    const atHome = Boolean(runner && runner.position.q === origin.position.q && runner.position.r === origin.position.r);

    // Reaching home refreshes the terms for the next departure (and is legitimate endpoint service).
    const budget = atHome
      ? (route.turnsPerTrip * 2)
      : route.serviceRoundsRemaining;

    if (route.lastSettledTurn === state.turn) return route;

    const status = getRouteOperatingStatus(state, route.id);
    if (!status.paying) {
      if (reasons.length < 8) reasons.push(status.reason ?? 'blocked');
      if (!atHome) return route;
      changed = true;
      return { ...route, serviceRoundsRemaining: budget, lastSettledTurn: state.turn };
    }

    paid += status.goldPerTurn;
    changed = true;
    return {
      ...route,
      // Reaching home refreshes the budget for the next departure rather than consuming it.
      serviceRoundsRemaining: atHome ? budget : Math.max(0, (budget ?? (route.turnsPerTrip * 2)) - 1),
      lastSettledTurn: state.turn,
    };
  });

  if (!changed) return { state, paid: 0, reasons };
  return {
    state: { ...state, marketplace: { ...state.marketplace!, tradeRoutes: nextRoutes } },
    paid,
    reasons,
  };
}


// --- S5: route capacity ---

export function getRouteCapacity(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  if (!city) return 1;
  const b = city.buildings;
  const completedTechs = state.civilizations[city.owner]?.techState.completed ?? [];
  const total = 1
    + (b.includes('caravanserai')  ? 1 : 0)
    + (b.includes('marketplace')   ? 1 : 0)
    + (b.includes('bank')          ? 1 : 0)
    + (b.includes('stock_exchange') ? 1 : 0)
    + (completedTechs.includes('mercantilism') ? 1 : 0)
    + (completedTechs.includes('deep-ocean-research') && isCityCoastal(city, state.map) ? 1 : 0);
  return Math.min(total, 6);
}

// --- S5: persistent route throughput ---

// Trade Routes Overhaul (#553 MR1/4, translated in #1502 MR05): what trade infrastructure and a
// better hull are worth, as a *persistent* gold-per-trip bonus. These used to be finite extra trips
// ("+2 trips"), which meant a route's reward expired and the trader had to be replaced; MR05 made
// ordinary routes run indefinitely, so the same sources now pay throughput for as long as the route
// operates. Magnitudes are deliberately unchanged per source (see game-balance.md).
const TRADE_UNIT_THROUGHPUT_BONUS: Partial<Record<UnitType, number>> = {
  naval_trader: 0, steamship_trader: 1, cargo_freighter: 2, container_ship: 3,
  merchant_wagon: 1, freight_convoy: 2,
  jet_freighter: 1, global_air_cargo: 2,
};

/** Gold per trip added by the endpoints' trade infrastructure and the trader's own hull. */
export function getRouteThroughputBonus(
  state: GameState,
  fromCityId: string,
  toCityId: string,
  caravanOwner: string,
  caravanType?: UnitType,
): number {
  const fromCity = state.cities[fromCityId];
  const toCity   = state.cities[toCityId];
  // Silk Road wonder doesn't exist yet — always 0 until added
  const hasSilkRoad =
    state.completedLegendaryWonders?.['silk-road']?.ownerId === caravanOwner;
  const tierBonus = caravanType ? (TRADE_UNIT_THROUGHPUT_BONUS[caravanType] ?? 0) : 0;
  return (
    (fromCity?.buildings.includes('caravanserai') ? 2 : 0) +
    (toCity?.buildings.includes('caravanserai')   ? 2 : 0) +
    (hasSilkRoad ? 3 : 0) +
    Math.min(3, tierBonus)
  );
}
