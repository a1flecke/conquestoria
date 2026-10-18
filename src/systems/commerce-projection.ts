/**
 * Viewer-safe trade projection (#1500 MR03).
 *
 * Legality is omniscient (`trade-route-contract.ts`); what a *viewer* is shown goes through this
 * module. It emits one row per city the viewer has actually discovered, with the entitled verdict
 * and the reason it is denied — never an undiscovered city, by id, name, count or order. A near-miss
 * (known city, unexplored corridor) stays visible with its public denial rather than vanishing.
 */
import type { GameState, TradeRoute, Unit } from '@/core/types';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import {
  getEligibleTradeOrigins,
  getTradeRouteEligibility,
  isTradeTraderType,
  resolveTradeOrigin,
  type TradeRouteDenialReason,
} from '@/systems/trade-route-contract';
import {
  calculateTradeRouteGold,
  getEffectiveGoldPerTurn,
  getRouteTechGoldBonus,
  getTradeUnitTripBonus,
} from '@/systems/trade-route-economy';

export interface EntitledTradeDestination {
  cityId: string;
  cityName: string;
  ownerCivId: string;
  ownerName: string;
  domestic: boolean;
  eligible: boolean;
  /** Why this destination is withheld; null when eligible. */
  denialReason: TradeRouteDenialReason | null;
  /** Preview of the route the executor would create, computed with the canonical economy functions. */
  goldPerTurn: number;
  trips: number;
  /** Rounds the trader must still travel to reach its origin; 0 when it is already there. */
  positioningTurns: number;
}

function hexDistanceFor(state: GameState, from: { q: number; r: number }, to: { q: number; r: number }): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

function ownerDisplayName(state: GameState, civId: string): string {
  return state.civilizations[civId]?.name
    ?? state.minorCivs?.[civId]?.definitionId
    ?? civId;
}

/** The route the executor would create for this pair, priced by the canonical economy functions. */
function previewRoute(state: GameState, unit: Unit, originCityId: string, toCityId: string, resourceDiversity: number): TradeRoute | null {
  const origin = state.cities[originCityId];
  const destination = state.cities[toCityId];
  if (!origin || !destination) return null;
  const distance = hexDistanceFor(state, origin.position, destination.position);
  const turnsPerTrip = Math.max(1, Math.ceil(distance / 3));
  return {
    id: 'preview',
    fromCityId: originCityId,
    toCityId,
    goldPerTrip: calculateTradeRouteGold(distance, resourceDiversity) * turnsPerTrip,
    turnsPerTrip,
    ...(destination.owner !== unit.owner ? { foreignCivId: destination.owner } : {}),
  };
}

export interface EntitledTradeOrigin {
  cityId: string;
  cityName: string;
  /** Rounds the trader must travel to reach this origin; 0 when it is already there. */
  positioningTurns: number;
}

/**
 * The viewer's own cities that could serve as the route origin for this trader: free slot and a
 * domain path from where the trader stands. Only the viewer's own cities are ever listed.
 */
export function getEntitledTradeOrigins(state: GameState, viewerCivId: string, caravanUnitId: string): EntitledTradeOrigin[] {
  const unit = state.units[caravanUnitId];
  if (!unit || unit.owner !== viewerCivId) return [];
  return getEligibleTradeOrigins(state, caravanUnitId)
    .map(city => ({
      cityId: city.id,
      cityName: city.name,
      positioningTurns: hexDistanceFor(state, unit.position, city.position),
    }))
    .sort((left, right) => left.positioningTurns - right.positioningTurns || (left.cityId < right.cityId ? -1 : 1));
}

/**
 * Every destination this viewer is entitled to see for this trader, each with its entitled verdict.
 * Rows are deterministic: domestic destinations first, then by city id.
 */
export function getEntitledTradeDestinations(
  state: GameState,
  viewerCivId: string,
  caravanUnitId: string,
  options: { automated?: boolean; originCityId?: string } = {},
): EntitledTradeDestination[] {
  const unit = state.units[caravanUnitId];
  if (!unit || !isTradeTraderType(unit.type)) return [];

  // The income preview uses the same diversity input the executor's callers pass.
  const resourceDiversity = getCivAvailableResources(state, unit.owner).size;

  const rows: EntitledTradeDestination[] = [];
  // The trader's current origin is context, not a destination: a route needs two different cities.
  const originCityId = resolveTradeOrigin(state, unit)?.id;
  for (const city of Object.values(state.cities)) {
    // Entitlement: an undiscovered destination does not exist for this viewer.
    if (!hasDiscoveredCity(state, viewerCivId, city.id)) continue;
    if (city.id === originCityId) continue;

    const decision = getTradeRouteEligibility(state, {
      caravanUnitId,
      toCityId: city.id,
      actingCivId: unit.owner,
      automated: options.automated ?? false,
      originCityId: options.originCityId,
    });
    const resolvedOriginId = decision.ok ? decision.originCityId : options.originCityId ?? originCityId;
    const route = resolvedOriginId ? previewRoute(state, unit, resolvedOriginId, city.id, resourceDiversity) : null;
    const positioningTurns = resolvedOriginId
      ? hexDistanceFor(state, unit.position, state.cities[resolvedOriginId]!.position)
      : 0;

    rows.push({
      cityId: city.id,
      cityName: city.name,
      ownerCivId: city.owner,
      ownerName: ownerDisplayName(state, city.owner),
      domestic: city.owner === unit.owner,
      eligible: decision.ok,
      denialReason: decision.ok ? null : decision.reason,
      goldPerTurn: route ? getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(state, route)) : 0,
      trips: route ? 8 + getTradeUnitTripBonus(state, route.fromCityId, city.id, unit.owner, unit.type) : 0,
      positioningTurns,
    });
  }

  return rows.sort((left, right) =>
    Number(right.domestic) - Number(left.domestic)
    || (left.cityId < right.cityId ? -1 : left.cityId > right.cityId ? 1 : 0));
}
