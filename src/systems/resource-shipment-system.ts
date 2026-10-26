// src/systems/resource-shipment-system.ts
// #1509 MR12: one load at the supplier, one delivery at home.
//
// A route's manifest is paid cargo owned by the buyer but still in transit. Loading uses the MR11
// posted-price engine in `incoming` settlement mode, which reserves receiving capacity without
// crediting usable stock. Home arrival is the only place a claim becomes imported stock.
import type { GameState, TradeRoute } from '@/core/types';
import type {
  ResourceManifest,
  ResourceManifestItem,
  TradeGoodId,
} from '@/core/types/commerce';
import {
  commitMarketLoad,
  getMarketOfferForBuyer,
  getMarketProcurementPolicy,
  quoteMarketLoad,
  refreshMarketOffers,
} from './resource-market-offers';
import { getCivMaterialLedger } from './resource-material-state';
import {
  deliverIncomingStock,
  destroyIncomingStock,
  getIncomingQuantity,
  getStoredQuantity,
} from './resource-reserve-system';
import { getProcurementRemaining, getRouteCargoCapacity } from './resource-procurement';
import { isRouteServiceSuspended } from './trade-danger-adapters';
import {
  RESOURCE_BACKED_GOODS,
  findTradeGood,
  type TradeGoodDefinition,
} from './trade-good-definitions';

function routeById(state: GameState, routeId: string): TradeRoute | undefined {
  return state.marketplace?.tradeRoutes.find(route => route.id === routeId);
}

function withRoute(state: GameState, route: TradeRoute): GameState {
  if (!state.marketplace) return state;
  return {
    ...state,
    marketplace: {
      ...state.marketplace,
      tradeRoutes: state.marketplace.tradeRoutes.map(candidate => candidate.id === route.id ? route : candidate),
    },
  };
}

function withLedger(state: GameState, civId: string, ledger: ReturnType<typeof getCivMaterialLedger>): GameState {
  return {
    ...state,
    materialReservesByCiv: { ...(state.materialReservesByCiv ?? {}), [civId]: ledger },
  };
}

/**
 * Load every affordable, permitted order once at the supplier. The buyer target counts stored and
 * incoming units, so two routes cannot buy the same target twice. A refusal skips that order; no
 * partial mutation survives a denied quote.
 */
export function loadRouteManifest(
  state: GameState,
  routeId: string,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): GameState {
  const route = routeById(state, routeId);
  if (!route || route.manifest || !route.procurement) return state;
  // A blockaded endpoint cannot load or serve; ordinary route income is suspended by the same fact.
  if (isRouteServiceSuspended(state, route)) return state;
  const destination = state.cities[route.toCityId];
  const origin = state.cities[route.fromCityId];
  if (!destination || !origin || destination.owner === origin.owner) return state;

  const caravan = Object.values(state.units).find(unit => unit.committedToRouteId === routeId);
  if (!caravan) return state;
  const capacity = getRouteCargoCapacity(caravan.type);
  if (capacity <= 0) return state;

  let next = refreshMarketOffers(state, definitions);
  const buyerCivId = origin.owner;
  const sellerCivId = destination.owner;
  let cargoUsed = 0;
  const items: ResourceManifestItem[] = [];

  for (const [index, order] of route.procurement.orders.entries()) {
    const definition = findTradeGood(order.goodId, definitions);
    if (!definition || definition.settlement !== 'stored-quantity') continue;
    const remainingTarget = getProcurementRemaining(next, buyerCivId, order);
    if (remainingTarget <= 0) continue;
    const offer = getMarketOfferForBuyer(next, buyerCivId, sellerCivId, order.goodId, definitions);
    if (!offer || offer.available <= 0) continue;
    const unitCost = offer.unitPrice + offer.tariffPerUnit;
    if (unitCost <= 0 || unitCost > order.maxUnitPrice) continue;

    const cargoSpacePerUnit = Math.max(1, definition.cargoSpacePerUnit);
    const byCargo = Math.floor((capacity - cargoUsed) / cargoSpacePerUnit);
    const policy = getMarketProcurementPolicy(next, buyerCivId);
    const budgetLeft = policy.roundBudget === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, policy.roundBudget - (policy.spentThisTurn ?? 0));
    const byBudget = Math.floor(budgetLeft / unitCost);
    const buyerGold = next.civilizations[buyerCivId]?.gold ?? 0;
    const byGold = Math.floor(Math.max(0, buyerGold - policy.treasuryFloor) / unitCost);
    const quantity = Math.min(remainingTarget, offer.available, byCargo, byBudget, byGold);
    if (quantity <= 0) continue;

    const quote = quoteMarketLoad(next, buyerCivId, sellerCivId, order.goodId, quantity, definitions);
    if (!quote.ok) continue;
    const claimId = `manifest:${route.id}:${next.turn}:${index}:${order.goodId}`;
    const committed = commitMarketLoad(
      next,
      quote.quote,
      { settlement: 'incoming', claimId },
      definitions,
    );
    if (!committed.ok) continue;
    next = committed.state;
    cargoUsed += quantity * cargoSpacePerUnit;
    items.push({
      claimId,
      goodId: order.goodId,
      quantity,
      unitPrice: quote.quote.unitPrice,
      paid: quote.quote.totalPrice,
      sellerCivId,
    });
  }

  if (items.length === 0) return next;
  const current = routeById(next, routeId);
  if (!current) return next;
  const manifest: ResourceManifest = {
    ownerCivId: buyerCivId,
    routeId,
    carrierUnitId: caravan.id,
    destinationCityId: route.fromCityId,
    purchaseTurn: next.turn,
    items,
  };
  return withRoute(next, { ...current, manifest });
}

/** Convert every manifest claim to imported stock exactly once, then clear the manifest. */
export function deliverRouteManifest(
  state: GameState,
  routeId: string,
): { state: GameState; delivered: readonly ResourceManifestItem[] } {
  const route = routeById(state, routeId);
  if (!route?.manifest) return { state, delivered: [] };
  let ledger = getCivMaterialLedger(state, route.manifest.ownerCivId);
  const delivered: ResourceManifestItem[] = [];
  for (const item of route.manifest.items) {
    if (!ledger.incoming.some(claim => claim.id === item.claimId)) continue;
    const result = deliverIncomingStock(ledger, item.claimId);
    if (!result.ok) continue;
    ledger = result.ledger;
    delivered.push(item);
  }
  const current = routeById(state, routeId);
  if (!current) return { state, delivered: [] };
  return {
    state: withRoute(withLedger(state, route.manifest.ownerCivId, ledger), { ...current, manifest: undefined }),
    delivered,
  };
}

/** Destroy a manifest's claims (carrier death, capture, or a terminal route cleanup). */
export function destroyManifestClaims(
  ledger: ReturnType<typeof getCivMaterialLedger>,
  manifest: ResourceManifest | undefined,
): ReturnType<typeof getCivMaterialLedger> {
  if (!manifest) return ledger;
  let next = ledger;
  for (const item of manifest.items) {
    const result = destroyIncomingStock(next, item.claimId);
    if (result.ok) next = result.ledger;
  }
  return next;
}

/** The visible incoming quantity for one good on a route (zero when no manifest). */
export function getRouteManifestQuantity(route: TradeRoute, goodId?: TradeGoodId): number {
  return (route.manifest?.items ?? [])
    .filter(item => goodId === undefined || item.goodId === goodId)
    .reduce((total, item) => total + item.quantity, 0);
}

/** Stored + incoming, used by the route row's target/progress copy. */
export function getBuyerGoodPosition(state: GameState, civId: string, goodId: TradeGoodId): {
  stored: number;
  incoming: number;
} {
  const ledger = getCivMaterialLedger(state, civId);
  return { stored: getStoredQuantity(ledger, goodId), incoming: getIncomingQuantity(ledger, goodId) };
}
