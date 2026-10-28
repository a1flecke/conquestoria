// src/systems/luxury-service-system.ts
// #1511 MR14: delivered luxury service coverage, separate from native access and worked-tile effects.
//
// A service bundle is bought at a permitted supplier and delivered home like any other manifest item.
// Only delivery grants coverage. Duplicate suppliers can extend coverage up to a displayed cap, but
// never stack the same luxury's happiness; a new distinct luxury adds its own access benefit.
import type { GameState, TradeRoute } from '@/core/types';
import type {
  CommerceResourcePolicy,
  LuxuryCoverage,
  LuxuryServiceState,
  TradeGoodId,
} from '@/core/types/commerce';
import { getActiveResourceSourceCount } from './resource-acquisition-system';
import { findTradeGood } from './trade-good-definitions';
import { RESOURCE_DEFINITIONS } from './resource-definitions';

export const LUXURY_SERVICE_GRACE_TURNS = 2;
export const LUXURY_SERVICE_CAP_MULTIPLIER = 2;

/** True only for a resource-backed luxury delivered as a service bundle, never a stock good. */
export function isLuxuryServiceGood(goodId: TradeGoodId): boolean {
  const good = findTradeGood(goodId);
  const nativeSource = good?.nativeSource;
  if (nativeSource?.kind !== 'resource') return false;
  return RESOURCE_DEFINITIONS.some(candidate =>
    candidate.id === nativeSource.resource && candidate.type === 'luxury');
}

function coverageMap(state: GameState, civId: string): Readonly<Record<TradeGoodId, LuxuryCoverage>> {
  return state.luxuryServiceByCiv?.[civId]?.coverageByGood ?? {};
}

export function getLuxuryCoverage(
  state: GameState,
  civId: string,
  goodId: TradeGoodId,
): LuxuryCoverage | undefined {
  return coverageMap(state, civId)[goodId];
}

export function isLuxuryCovered(
  state: GameState,
  civId: string,
  goodId: TradeGoodId,
  graceTurns = 0,
): boolean {
  const coverage = getLuxuryCoverage(state, civId, goodId);
  return Boolean(coverage && coverage.expiresOnTurn > state.turn + Math.max(0, graceTurns));
}

/** Turns one normal route round trip buys, plus the displayed grace period. */
export function getLuxuryServiceCoverageTurns(route: Pick<TradeRoute, 'turnsPerTrip'>): number {
  return Math.max(1, Math.ceil(route.turnsPerTrip * 2)) + LUXURY_SERVICE_GRACE_TURNS;
}

/** Hard cap on stacked deliveries; duplicate suppliers can never exceed this window. */
export function getLuxuryServiceCapTurns(route: Pick<TradeRoute, 'turnsPerTrip'>): number {
  return getLuxuryServiceCoverageTurns(route) * LUXURY_SERVICE_CAP_MULTIPLIER;
}

/**
 * Activate or extend one delivered luxury service. The same good never gains a second happiness
 * benefit; a second supplier only extends the existing expiry within the cap.
 */
export function grantLuxuryCoverage(
  state: GameState,
  civId: string,
  sellerCivId: string,
  goodId: TradeGoodId,
  coverageTurns: number,
  capTurns: number,
): GameState {
  const current = getLuxuryCoverage(state, civId, goodId);
  const cap = state.turn + Math.max(0, capTurns);
  const expiresOnTurn = Math.min(
    cap,
    Math.max(current?.expiresOnTurn ?? 0, state.turn + Math.max(0, coverageTurns)),
  );
  const suppliers = [...new Set([...(current?.supplierCivIds ?? []), sellerCivId])].sort();
  const existing: LuxuryServiceState = state.luxuryServiceByCiv?.[civId]
    ?? { coverageByGood: {} };
  return {
    ...state,
    luxuryServiceByCiv: {
      ...(state.luxuryServiceByCiv ?? {}),
      [civId]: {
        ...existing,
        coverageByGood: {
          ...existing.coverageByGood,
          [goodId]: { goodId, expiresOnTurn, supplierCivIds: suppliers },
        },
      },
    },
  };
}

/** Buyers currently served by this supplier for one luxury; each buyer consumes one slot. */
export function getSupplierServiceContracts(
  state: GameState,
  sellerCivId: string,
  goodId: TradeGoodId,
): string[] {
  const buyers: string[] = [];
  for (const [buyerCivId, service] of Object.entries(state.luxuryServiceByCiv ?? {})) {
    const coverage = service.coverageByGood[goodId];
    if (!coverage || coverage.expiresOnTurn <= state.turn) continue;
    if (coverage.supplierCivIds.includes(sellerCivId)) buyers.push(buyerCivId);
  }
  return buyers.sort();
}

/**
 * Completed native source capacity bounds what a supplier can promise abroad. One native source is
 * reserved for the supplier's own domestic access; only the remaining sources, capped by the policy's
 * explicit allotment, can serve foreign buyers.
 */
export function getLuxuryServiceCapacity(
  state: GameState,
  sellerCivId: string,
  goodId: TradeGoodId,
  policy?: CommerceResourcePolicy,
): number {
  const good = findTradeGood(goodId);
  const nativeSource = good?.nativeSource;
  if (nativeSource?.kind !== 'resource') return 0;
  const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === nativeSource.resource);
  if (!definition || definition.type !== 'luxury') return 0;
  const allotments = Math.max(0, Math.floor(policy?.serviceAllotments ?? 0));
  if (allotments === 0) return 0;
  const sources = getActiveResourceSourceCount(
    state,
    sellerCivId,
    definition.id,
    { scope: 'empire' },
  );
  return Math.min(allotments, Math.max(0, sources - 1));
}

/** The next route already ordered to renew this luxury, for the marketplace's next-shipment copy. */
export function getNextLuxuryShipment(
  state: GameState,
  civId: string,
  goodId: TradeGoodId,
): TradeRoute | null {
  return (state.marketplace?.tradeRoutes ?? []).find(route => {
    if (state.cities[route.fromCityId]?.owner !== civId) return false;
    if (!route.procurement?.orders.some(order => order.goodId === goodId)) return false;
    return true;
  }) ?? null;
}
