// src/systems/trade-route-recommendations.ts
// #1504 MR07: the one shared helper for "routes worth considering".
//
// Recommendations are a *view* over the entitled projection (`commerce-projection`), never a second
// eligibility filter: a row that is not entitled cannot be recommended, and recommending never removes
// a destination from the complete `All known destinations` list. Ranking uses only facts the viewer
// has earned — the quote the chooser already shows, the destination city's own public state, and
// `getEntitledRouteDanger`, which never names a blockade of a city the viewer does not own.
//
// The sets are deliberately short (a handful each). They reorder attention, not the catalog.
import type { GameState, TradeRouteModeId } from '@/core/types';
import { getEntitledTradeDestinations, type EntitledTradeDestination } from './commerce-projection';
import { getEntitledRouteDanger, getTradeDangerFacts, type TradeDangerFacts } from './trade-danger-adapters';
import { getTradeRouteMode } from './trade-route-modes';

export type TradeRouteRecommendationKind = 'profitable' | 'useful-development' | 'lower-known-danger';

export interface TradeRouteRecommendation {
  kind: TradeRouteRecommendationKind;
  /** The recommended destination row, exactly as the chooser renders it. */
  destination: EntitledTradeDestination;
  /** One short, honest reason to consider it. */
  reason: string;
}

export interface TradeRouteRecommendationOptions {
  originCityId?: string;
  mode?: TradeRouteModeId;
  /** How many rows each set may hold. */
  limit?: number;
}

const DEFAULT_LIMIT = 3;

function byCityId(left: EntitledTradeDestination, right: EntitledTradeDestination): number {
  return left.cityId < right.cityId ? -1 : left.cityId > right.cityId ? 1 : 0;
}

/** The yield the selected mode would deliver per completed round, in words. */
export function describeRouteModeYield(
  destination: EntitledTradeDestination,
  modeId: TradeRouteModeId,
): string {
  const mode = getTradeRouteMode(modeId);
  if (!mode) return '';
  if (mode.recipient === 'owner-treasury') return `+${destination.goldPerTurn} gold/turn`;
  const amount = mode.amountPerRound ?? 0;
  switch (mode.recipient) {
    case 'destination-city-food': return `+${amount} food/turn to ${destination.cityName}`;
    case 'destination-city-production': return `+${amount} production/turn to ${destination.cityName}`;
    case 'owner-research': return `+${amount} research/turn`;
    default: return '';
  }
}

/**
 * Three short sets over the entitled destinations. Each list is independent and may be empty; the
 * complete catalog is always reachable through the chooser's `All known destinations`.
 */
export function getTradeRouteRecommendations(
  state: GameState,
  viewerCivId: string,
  caravanUnitId: string,
  options: TradeRouteRecommendationOptions = {},
): Record<TradeRouteRecommendationKind, TradeRouteRecommendation[]> {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const mode: TradeRouteModeId = options.mode ?? 'commerce';
  const destinations = getEntitledTradeDestinations(state, viewerCivId, caravanUnitId, {
    originCityId: options.originCityId,
  }).filter(destination => destination.eligible);

  // `getEntitledRouteDanger` needs a viewer-owned origin to judge "is one of *my* endpoints blockaded".
  const originCityId = options.originCityId
    ?? Object.values(state.cities).find(city => city.owner === viewerCivId)?.id;
  const danger: TradeDangerFacts = getTradeDangerFacts(state);
  const dangerFor = (destination: EntitledTradeDestination) => getEntitledRouteDanger(state, viewerCivId, {
    id: `preview-${destination.cityId}`,
    fromCityId: originCityId ?? destination.cityId,
    toCityId: destination.cityId,
    goldPerTrip: 0,
    turnsPerTrip: destination.roundTripRounds || 1,
  }, danger);

  // Profitable: the strongest return the chosen purpose offers, nearest round trip breaking ties.
  const profitable = [...destinations]
    .sort((left, right) =>
      right.goldPerTurn - left.goldPerTurn
      || left.roundTripRounds - right.roundTripRounds
      || byCityId(left, right))
    .slice(0, limit)
    .map(destination => ({
      kind: 'profitable' as const,
      destination,
      reason: `${describeRouteModeYield(destination, mode)} · ${destination.roundTripRounds}-round round trip`,
    }));

  // Useful development: the viewer's own cities that actually have something to develop — an active
  // build gets provisioning priority, then the hungrier city, then a stable id tiebreak.
  const usefulDevelopment = destinations
    .filter(destination => destination.domestic)
    .sort((left, right) => {
      const leftCity = state.cities[left.cityId];
      const rightCity = state.cities[right.cityId];
      const leftBuilding = leftCity && leftCity.productionQueue.length > 0 ? 1 : 0;
      const rightBuilding = rightCity && rightCity.productionQueue.length > 0 ? 1 : 0;
      return rightBuilding - leftBuilding
        || (leftCity?.food ?? 0) - (rightCity?.food ?? 0)
        || byCityId(left, right);
    })
    .slice(0, limit)
    .map(destination => {
      const city = state.cities[destination.cityId];
      const building = Boolean(city && city.productionQueue.length > 0);
      return {
        kind: 'useful-development' as const,
        destination,
        reason: building
          ? `Provisioning feeds ${destination.cityName}'s current build`
          : `Provisioning supports ${destination.cityName}`,
      };
    });

  // Lower known danger: eligible routes with no entitled danger at either endpoint, shortest trip
  // first. A hidden fleet changes nothing here — `getEntitledRouteDanger` only names the viewer's own
  // blockaded cities.
  const lowerKnownDanger = destinations
    .filter(destination => dangerFor(destination) === null)
    .sort((left, right) =>
      left.roundTripRounds - right.roundTripRounds
      || byCityId(left, right))
    .slice(0, limit)
    .map(destination => ({
      kind: 'lower-known-danger' as const,
      destination,
      reason: `No known danger · ${destination.roundTripRounds}-round round trip`,
    }));

  return {
    profitable,
    'useful-development': usefulDevelopment,
    'lower-known-danger': lowerKnownDanger,
  };
}
