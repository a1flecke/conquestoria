/**
 * Viewer-safe trade projection (#1500 MR03).
 *
 * Legality is omniscient (`trade-route-contract.ts`); what a *viewer* is shown goes through this
 * module. It emits one row per city the viewer has actually discovered, with the entitled verdict
 * and the reason it is denied — never an undiscovered city, by id, name, count or order. A near-miss
 * (known city, unexplored corridor) stays visible with its public denial rather than vanishing.
 */
import type { GameState, TradeRouteModeId } from '@/core/types';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import {
  getEligibleTradeOrigins,
  getTradeRouteEligibility,
  isTradeTraderType,
  resolveTradeOrigin,
  type TradeRouteDenialReason,
} from '@/systems/trade-route-contract';
import { getTradeRouteQuote } from '@/systems/trade-route-economy';
import { getRouteLegRounds } from '@/systems/trade-route-travel';

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
  /** #1502 MR05: rounds one committed round trip takes, from the same travel model the runner walks. */
  roundTripRounds: number;
  /** Rounds the trader must still travel to reach its origin; 0 when it is already there. */
  positioningTurns: number;
}

function ownerDisplayName(state: GameState, civId: string): string {
  return state.civilizations[civId]?.name
    ?? state.minorCivs?.[civId]?.definitionId
    ?? civId;
}

/** The route the executor would create for this pair, priced by the canonical economy functions. */
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
      positioningTurns: getRouteLegRounds(state, unit, city.id) ?? 0,
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
  options: { automated?: boolean; originCityId?: string; mode?: TradeRouteModeId } = {},
): EntitledTradeDestination[] {
  const unit = state.units[caravanUnitId];
  if (!unit || !isTradeTraderType(unit.type)) return [];

  const rows: EntitledTradeDestination[] = [];
  // A route needs two different cities, so exclude the chosen origin or the default if none was chosen.
  const selectedOriginId = options.originCityId ?? resolveTradeOrigin(state, unit)?.id;
  const positioningTurns = selectedOriginId && state.cities[selectedOriginId]?.owner === unit.owner
    ? getRouteLegRounds(state, unit, selectedOriginId) ?? 0
    : 0;
  for (const city of Object.values(state.cities)) {
    // Entitlement: an undiscovered destination does not exist for this viewer.
    if (!hasDiscoveredCity(state, viewerCivId, city.id)) continue;
    if (city.id === selectedOriginId) continue;

    const decision = getTradeRouteEligibility(state, {
      caravanUnitId,
      toCityId: city.id,
      actingCivId: unit.owner,
      automated: options.automated ?? false,
      originCityId: options.originCityId,
      // #1504 MR07: the chosen purpose is part of legality, so a row is eligible only for a mode it can run.
      ...(options.mode ? { mode: options.mode } : {}),
    });
    // #1501 MR04: the preview *is* the quote the executor builds the route from — same timing, same
    // modifiers, same service budget — so a promised rate can never differ from the realized one.
    const quote = selectedOriginId
      ? getTradeRouteQuote(state, { caravanUnitId, originCityId: selectedOriginId, toCityId: city.id })
      : null;

    rows.push({
      cityId: city.id,
      cityName: city.name,
      ownerCivId: city.owner,
      ownerName: ownerDisplayName(state, city.owner),
      domestic: city.owner === unit.owner,
      eligible: decision.ok,
      denialReason: decision.ok ? null : decision.reason,
      goldPerTurn: quote?.goldPerTurn ?? 0,
      roundTripRounds: quote?.roundTripRounds ?? 0,
      positioningTurns,
    });
  }

  return rows.sort((left, right) =>
    Number(right.domestic) - Number(left.domestic)
    || (left.cityId < right.cityId ? -1 : left.cityId > right.cityId ? 1 : 0));
}
