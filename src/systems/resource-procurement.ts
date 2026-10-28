// src/systems/resource-procurement.ts
// #1509 MR12: standing buyer targets and the shared arithmetic every route, preview and AI uses.
//
// A route's orders name a good, a desired stored+incoming quantity and an inclusive unit-price cap.
// Cargo already bought counts toward the target, so two routes cannot buy the same target twice.
import type { GameState, TradeRoute, UnitType } from '@/core/types';
import type {
  ResourceProcurementOrder,
  ResourceProcurementTerms,
  TradeGoodId,
} from '@/core/types/commerce';
import { getIncomingQuantity, getStoredQuantity } from './resource-reserve-system';
import { getCivMaterialLedger } from './resource-material-state';
import { getTradeCargoCapacity } from './trade-role-targeting';
import { LUXURY_SERVICE_GRACE_TURNS, isLuxuryCovered, isLuxuryServiceGood } from './luxury-service-system';
import {
  RESOURCE_BACKED_GOODS,
  findTradeGood,
  type TradeGoodDefinition,
} from './trade-good-definitions';

export function getRouteCargoCapacity(unitType: UnitType): number {
  return getTradeCargoCapacity(unitType);
}

/** Cargo space used by one manifest item under the good's definition. */
export function getGoodCargoSpace(
  goodId: TradeGoodId,
  quantity: number,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): number {
  const definition = findTradeGood(goodId, definitions);
  return Math.max(0, Math.floor(quantity)) * (definition?.cargoSpacePerUnit ?? 1);
}

/** Remaining target after stored and incoming (manifest) units are counted. */
export function getProcurementRemaining(
  state: GameState,
  civId: string,
  order: Pick<ResourceProcurementOrder, 'goodId' | 'targetQuantity'>,
): number {
  // Luxury service is coverage, not stock: buy one renewal only when the delivered window is close
  // enough to expire that a normal route round trip plus grace can still arrive in time.
  if (isLuxuryServiceGood(order.goodId)) {
    return isLuxuryCovered(state, civId, order.goodId, LUXURY_SERVICE_GRACE_TURNS)
      ? 0
      : Math.max(1, order.targetQuantity);
  }
  const ledger = getCivMaterialLedger(state, civId);
  return Math.max(0, order.targetQuantity - getStoredQuantity(ledger, order.goodId) - getIncomingQuantity(ledger, order.goodId));
}

/** Total incoming units owned by a civ for one good, including manifests on every route. */
export function getCivIncomingGoods(state: GameState, civId: string, goodId: TradeGoodId): number {
  return getIncomingQuantity(getCivMaterialLedger(state, civId), goodId);
}

export function getRouteManifestIncomingQuantity(route: TradeRoute): number {
  return (route.manifest?.items ?? []).reduce((total, item) => total + item.quantity, 0);
}

export function getRouteManifestPaid(route: TradeRoute): number {
  return (route.manifest?.items ?? []).reduce((total, item) => total + item.paid, 0);
}

/** Attach or replace a route's standing procurement targets without touching its cargo. */
export function setRouteProcurement(
  state: GameState,
  routeId: string,
  procurement: ResourceProcurementTerms | undefined,
): GameState {
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
  if (!route || !state.marketplace) return state;
  return {
    ...state,
    marketplace: {
      ...state.marketplace,
      tradeRoutes: state.marketplace.tradeRoutes.map(candidate => {
        if (candidate.id !== routeId) return candidate;
        if (procurement) return { ...candidate, procurement };
        const { procurement: _removed, ...rest } = candidate;
        return rest;
      }),
    },
  };
}

/** The next target still short of its stored+incoming quantity, in declared priority order. */
export function getNextProcurementOrder(
  state: GameState,
  civId: string,
  procurement: ResourceProcurementTerms | undefined,
): ResourceProcurementOrder | null {
  return (procurement?.orders ?? []).find(order => getProcurementRemaining(state, civId, order) > 0) ?? null;
}
