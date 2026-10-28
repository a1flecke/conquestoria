// src/systems/resource-market-offers.ts
// #1508 MR11: the posted-price resource market.
//
// One engine owns seller policies, the once-per-round public offer snapshot and the atomic load
// transaction. MR11 deliberately wires no UI or AI caller: the engine is the only writer of stock
// and payment, and instant resource purchases stay disabled until MR12.
import type { GameState } from '@/core/types';
import type {
  CommerceMarketOffer,
  CommerceMarketState,
  CommerceResourcePolicy,
  MarketPriceBand,
  MarketProcurementPolicy,
} from '@/core/types/commerce';
import {
  getCommerceResourcePolicy,
  hasResourceExportGrant,
  setCommerceResourcePolicy,
} from './commerce-permissions';
import { settleGoldTransfers } from './economy-system';
import {
  claimIncomingStock,
  creditImportedStock,
  getExportableQuantity,
  getStorageHeadroom,
  spendNativeForExport,
} from './resource-reserve-system';
import { getCivMaterialLedger } from './resource-material-state';
import { getCommercialPassagePermission } from './commerce-permissions';
import {
  getLuxuryServiceCapacity,
  getSupplierServiceContracts,
  isLuxuryServiceGood,
} from './luxury-service-system';
import { isResourceRevealed } from './resource-source-eligibility';
import { RESOURCE_DEFINITIONS } from './resource-definitions';
import {
  DEFAULT_STORAGE_PER_GOOD,
  RESOURCE_BACKED_GOODS,
  findTradeGood,
  isStoredQuantityGood,
  type TradeGoodDefinition,
  type TradeGoodId,
} from './trade-good-definitions';

export { setCommerceResourcePolicy };
export type { CommerceResourcePolicy, CommerceMarketOffer, CommerceMarketState };

export const MARKET_PRICE_BANDS: Readonly<Record<MarketPriceBand, number>> = {
  abundant: 0.8,
  normal: 1,
  tight: 1.25,
  capped: 1.5,
};

const BAND_ORDER: readonly MarketPriceBand[] = ['abundant', 'normal', 'tight', 'capped'];

export type MarketLoadRefusalReason =
  | 'no-offer'
  | 'not-eligible'
  | 'invalid-quantity'
  | 'insufficient-quantity'
  | 'awaiting-turn'
  | 'stale-offer'
  | 'price-above-cap'
  | 'insufficient-gold'
  | 'treasury-floor'
  | 'insufficient-capacity'
  | 'no-tariff-recipient'
  | 'round-budget'
  | 'service-capacity';

export interface MarketLoadQuote {
  turn: number;
  offerId: string;
  supplierCivId: string;
  buyerCivId: string;
  goodId: TradeGoodId;
  quantity: number;
  /** Seller unit price before the itemized tariff. */
  unitPrice: number;
  tariffPerUnit: number;
  tariffRecipientCivId?: string;
  /** Buyer's total payment: (unitPrice + tariffPerUnit) * quantity. */
  totalPrice: number;
  /** Seller's share: unitPrice * quantity. */
  sellerProceeds: number;
  /** Tariff recipient's share: tariffPerUnit * quantity. */
  tariffProceeds: number;
}

export type MarketLoadQuoteResult =
  | { ok: true; quote: MarketLoadQuote }
  | { ok: false; reason: MarketLoadRefusalReason };

export type MarketLoadCommitResult =
  | { ok: true; state: GameState; result: MarketLoadQuote; claimId?: string }
  | { ok: false; reason: MarketLoadRefusalReason; state: GameState };

export interface MarketLoadCommitOptions {
  /**
   * `stock` (default) credits imported stock immediately. `incoming` creates a reserved claim instead,
   * so a shipment is owned but unusable until its route delivers it home.
   */
  settlement?: 'stock' | 'incoming' | 'service';
  claimId?: string;
}

function marketOf(state: GameState): CommerceMarketState | undefined {
  return state.commerceMarket;
}

function policyFor(
  state: GameState,
  supplierCivId: string,
  goodId: TradeGoodId,
): CommerceResourcePolicy | undefined {
  return getCommerceResourcePolicy(state, supplierCivId, goodId);
}

/** Native-only exportable surplus after the seller's protected reserve. */
export function getExportableSurplus(
  state: GameState,
  supplierCivId: string,
  goodId: TradeGoodId,
): number {
  const policy = policyFor(state, supplierCivId, goodId);
  return getExportableQuantity(
    getCivMaterialLedger(state, supplierCivId),
    goodId,
    policy?.protectedReserve ?? 0,
  );
}

function holdsTerritory(state: GameState, civId: string): boolean {
  return Object.values(state.cities).some(city => city.owner === civId);
}

function goodDefinition(
  goodId: TradeGoodId,
  definitions: readonly TradeGoodDefinition[],
): TradeGoodDefinition | null {
  return findTradeGood(goodId, definitions);
}

/** Knowledge is the good's reveal technology for a resource-backed good; producer goods are defined. */
function isGoodKnownToCiv(
  state: GameState,
  civId: string,
  definition: TradeGoodDefinition,
): boolean {
  const nativeSource = definition.nativeSource;
  if (nativeSource?.kind === 'producer') return true;
  if (nativeSource?.kind !== 'resource') return false;
  const resource = RESOURCE_DEFINITIONS.find(candidate => candidate.id === nativeSource.resource);
  return resource ? isResourceRevealed(state, civId, resource) : false;
}

function hasPartnerPermission(
  state: GameState,
  supplierCivId: string,
  buyerCivId: string,
  goodId: TradeGoodId,
  definition: TradeGoodDefinition,
): boolean {
  const policy = policyFor(state, supplierCivId, goodId);
  if (policy?.partnerCivIds.includes(buyerCivId)) return true;
  // MR02's directional grants remain meaningful for resource-backed goods until MR12 replaces the
  // final legacy caller. A producer-backed good has no ResourceType to map, so only policies apply.
  return definition.nativeSource?.kind === 'resource'
    && hasResourceExportGrant(state, supplierCivId, buyerCivId, definition.nativeSource.resource);
}

/** Eligible buyers for one seller/good: living, permitted, partnered and knowledgeable. */
export function getEligibleMarketBuyers(
  state: GameState,
  supplierCivId: string,
  goodId: TradeGoodId,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): string[] {
  const definition = goodDefinition(goodId, definitions);
  if (!definition) return [];
  return Object.keys(state.civilizations)
    .filter(buyerCivId => buyerCivId !== supplierCivId)
    .filter(buyerCivId => holdsTerritory(state, buyerCivId))
    .filter(buyerCivId => getCommercialPassagePermission(state, supplierCivId, buyerCivId).allowed)
    .filter(buyerCivId => hasPartnerPermission(state, supplierCivId, buyerCivId, goodId, definition))
    .filter(buyerCivId => isGoodKnownToCiv(state, buyerCivId, definition))
    .sort();
}

function targetBand(available: number, definition: TradeGoodDefinition): MarketPriceBand {
  const standard = definition.quantity?.standardRecipeQuantity ?? 1;
  if (available >= standard * 2) return 'abundant';
  if (available >= standard) return 'normal';
  if (available >= Math.max(1, Math.ceil(standard / 2))) return 'tight';
  return 'capped';
}

function nextBand(previous: MarketPriceBand | undefined, target: MarketPriceBand): MarketPriceBand {
  if (!previous) return target;
  const previousIndex = BAND_ORDER.indexOf(previous);
  const targetIndex = BAND_ORDER.indexOf(target);
  const step = Math.max(-1, Math.min(1, targetIndex - previousIndex));
  return BAND_ORDER[previousIndex + step] ?? target;
}

function offerId(supplierCivId: string, goodId: TradeGoodId): string {
  return `${supplierCivId}:${goodId}`;
}

function policiesForOffers(state: GameState): CommerceResourcePolicy[] {
  const policies = [...(state.commercePermissions?.resourcePolicies ?? [])];
  const known = new Set(policies.map(policy => offerId(policy.civId, policy.goodId)));
  for (const grant of state.commercePermissions?.resourceExportGrants ?? []) {
    const id = offerId(grant.grantorCivId, `resource:${grant.resource}`);
    if (known.has(id)) continue;
    known.add(id);
    policies.push({
      civId: grant.grantorCivId,
      goodId: `resource:${grant.resource}`,
      protectedReserve: 0,
      partnerCivIds: [grant.granteeCivId],
    });
  }
  return policies;
}

/**
 * Derive the one public offer snapshot for this turn. Repeated calls in the same turn are a no-op;
 * the retained cursor survives into the next snapshot while the served list resets.
 */
export function refreshMarketOffers(
  state: GameState,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): GameState {
  if (marketOf(state)?.turn === state.turn) return state;
  const previous = marketOf(state);
  const previousOffers = new Map((previous?.offers ?? []).map(offer => [offer.offerId, offer]));
  const offers: CommerceMarketOffer[] = [];
  const cursorByOffer: Record<string, number> = {};
  const seen = new Set<string>();

  for (const policy of policiesForOffers(state)) {
    if (!holdsTerritory(state, policy.civId)) continue;
    const definition = goodDefinition(policy.goodId, definitions);
    const service = isLuxuryServiceGood(policy.goodId);
    if (!definition || (!isStoredQuantityGood(definition) && !service)) continue;
    const id = offerId(policy.civId, policy.goodId);
    if (seen.has(id)) continue;
    seen.add(id);
    const eligibleBuyerCivIds = getEligibleMarketBuyers(state, policy.civId, policy.goodId, definitions);
    if (eligibleBuyerCivIds.length === 0) continue;
    const available = service
      ? getLuxuryServiceCapacity(state, policy.civId, policy.goodId, policy)
      : getExportableSurplus(state, policy.civId, policy.goodId);
    if (available <= 0) continue;
    const band = service
      ? 'normal' as const
      : nextBand(previousOffers.get(id)?.band, targetBand(available, definition));
    const tariffPerUnit = policy.tariffPerUnit ?? 0;
    const previousCursor = previous?.serviceCursorByOffer[id] ?? 0;
    cursorByOffer[id] = eligibleBuyerCivIds.length > 0
      ? previousCursor % eligibleBuyerCivIds.length
      : 0;
    offers.push({
      offerId: id,
      supplierCivId: policy.civId,
      goodId: policy.goodId,
      turn: state.turn,
      band,
      unitPrice: Math.max(1, Math.round(definition.basePrice * MARKET_PRICE_BANDS[band])),
      available,
      tariffPerUnit,
      ...(tariffPerUnit > 0 && policy.tariffRecipientCivId
        ? { tariffRecipientCivId: policy.tariffRecipientCivId }
        : {}),
      eligibleBuyerCivIds,
    });
  }

  offers.sort((a, b) => a.supplierCivId.localeCompare(b.supplierCivId)
    || a.goodId.localeCompare(b.goodId));
  return {
    ...state,
    commerceMarket: {
      turn: state.turn,
      offers,
      serviceCursorByOffer: cursorByOffer,
      servedByOffer: {},
      ...(previous?.procurementByCiv
        ? {
          procurementByCiv: Object.fromEntries(
            Object.entries(previous.procurementByCiv)
              .map(([civId, policy]) => [civId, { ...policy, spentThisTurn: 0 }]),
          ),
        }
        : {}),
    },
  };
}

/** Offers visible to one buyer in the current round, in stable supplier/good order. */
export function getMarketOffersForBuyer(
  state: GameState,
  buyerCivId: string,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): CommerceMarketOffer[] {
  const market = marketOf(state);
  if (!market || market.turn !== state.turn || !holdsTerritory(state, buyerCivId)) return [];
  return market.offers
    .filter(offer => offer.eligibleBuyerCivIds.includes(buyerCivId))
    .filter(offer => {
      const definition = goodDefinition(offer.goodId, definitions);
      return definition
        && isGoodKnownToCiv(state, buyerCivId, definition)
        && getCommercialPassagePermission(state, offer.supplierCivId, buyerCivId).allowed
        && hasPartnerPermission(state, offer.supplierCivId, buyerCivId, offer.goodId, definition);
    })
    .sort((a, b) => a.supplierCivId.localeCompare(b.supplierCivId)
      || a.goodId.localeCompare(b.goodId));
}

function findOffer(
  state: GameState,
  buyerCivId: string,
  supplierCivId: string,
  goodId: TradeGoodId,
  definitions: readonly TradeGoodDefinition[],
): CommerceMarketOffer | undefined {
  return getMarketOffersForBuyer(state, buyerCivId, definitions)
    .find(offer => offer.supplierCivId === supplierCivId && offer.goodId === goodId);
}

/** The one visible offer for a buyer/supplier/good, or undefined when it is hidden/stale. */
export function getMarketOfferForBuyer(
  state: GameState,
  buyerCivId: string,
  supplierCivId: string,
  goodId: TradeGoodId,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): CommerceMarketOffer | undefined {
  return findOffer(state, buyerCivId, supplierCivId, goodId, definitions);
}

function cursorBuyer(offer: CommerceMarketOffer, state: GameState): string | undefined {
  if (offer.eligibleBuyerCivIds.length === 0) return undefined;
  const cursor = (marketOf(state)?.serviceCursorByOffer[offer.offerId] ?? 0)
    % offer.eligibleBuyerCivIds.length;
  return offer.eligibleBuyerCivIds[cursor];
}

export function getMarketProcurementPolicy(
  state: GameState,
  civId: string,
): MarketProcurementPolicy {
  return marketOf(state)?.procurementByCiv?.[civId]
    ?? { maxUnitPrice: Number.MAX_SAFE_INTEGER, treasuryFloor: 0 };
}

/** MR12 owns the policy UI; this writer is the one place the persisted cap/floor changes. */
export function setMarketProcurementPolicy(
  state: GameState,
  civId: string,
  policy: MarketProcurementPolicy,
): GameState {
  if (!Number.isSafeInteger(policy.maxUnitPrice) || policy.maxUnitPrice < 0) {
    throw new Error('A procurement cap must be a nonnegative safe integer.');
  }
  if (!Number.isSafeInteger(policy.treasuryFloor) || policy.treasuryFloor < 0) {
    throw new Error('A treasury floor must be a nonnegative safe integer.');
  }
  const market = marketOf(state) ?? {
    // Force the next refresh to build offers for the newly configured policy.
    turn: state.turn - 1,
    offers: [],
    serviceCursorByOffer: {},
  };
  return {
    ...state,
    commerceMarket: {
      ...market,
      procurementByCiv: { ...(market.procurementByCiv ?? {}), [civId]: policy },
    },
  };
}

/**
 * Quote one loading attempt. Every refusal is typed and leaves the input state untouched. The quote
 * carries the exact price/tariff split so the caller cannot silently invent a different payment.
 */
export function quoteMarketLoad(
  state: GameState,
  buyerCivId: string,
  supplierCivId: string,
  goodId: TradeGoodId,
  quantity: number,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): MarketLoadQuoteResult {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return { ok: false, reason: 'invalid-quantity' };
  }
  const definition = goodDefinition(goodId, definitions);
  const service = isLuxuryServiceGood(goodId);
  if (!definition || (!isStoredQuantityGood(definition) && !service)) return { ok: false, reason: 'no-offer' };
  if (service && quantity !== 1) return { ok: false, reason: 'invalid-quantity' };
  const offer = findOffer(state, buyerCivId, supplierCivId, goodId, definitions);
  if (!offer) return { ok: false, reason: 'not-eligible' };
  if (offer.available < quantity) return { ok: false, reason: 'insufficient-quantity' };

  // A scarce unit rotates: only the retained cursor buyer may take the first unit. A buyer with no
  // turn yet is a typed wait, not a hidden failure.
  if (offer.available < offer.eligibleBuyerCivIds.length
    && cursorBuyer(offer, state) !== buyerCivId) {
    return { ok: false, reason: 'awaiting-turn' };
  }

  if (service) {
    const policy = policyFor(state, supplierCivId, goodId);
    const serviceCapacity = getLuxuryServiceCapacity(state, supplierCivId, goodId, policy);
    const activeContracts = getSupplierServiceContracts(state, supplierCivId, goodId);
    const alreadyServed = activeContracts.includes(buyerCivId);
    if (!alreadyServed && activeContracts.length >= serviceCapacity) {
      return { ok: false, reason: 'service-capacity' };
    }
  } else {
    if (getExportableSurplus(state, supplierCivId, goodId) < quantity) {
      return { ok: false, reason: 'stale-offer' };
    }
    const capacity = definition.quantity?.storageCapacity ?? DEFAULT_STORAGE_PER_GOOD;
    if (getStorageHeadroom(getCivMaterialLedger(state, buyerCivId), goodId, capacity) < quantity) {
      return { ok: false, reason: 'insufficient-capacity' };
    }
  }
  if (offer.tariffPerUnit > 0 && (!offer.tariffRecipientCivId
    || !state.civilizations[offer.tariffRecipientCivId])) {
    return { ok: false, reason: 'no-tariff-recipient' };
  }

  const totalUnitPrice = offer.unitPrice + offer.tariffPerUnit;
  const procurement = getMarketProcurementPolicy(state, buyerCivId);
  if (totalUnitPrice > procurement.maxUnitPrice) {
    return { ok: false, reason: 'price-above-cap' };
  }

  const totalPrice = totalUnitPrice * quantity;
  const sellerProceeds = offer.unitPrice * quantity;
  const tariffProceeds = offer.tariffPerUnit * quantity;
  const buyerGold = state.civilizations[buyerCivId]?.gold ?? 0;
  if (buyerGold < totalPrice) return { ok: false, reason: 'insufficient-gold' };
  if (buyerGold - totalPrice < procurement.treasuryFloor) {
    return { ok: false, reason: 'treasury-floor' };
  }
  if (procurement.roundBudget !== undefined
    && (procurement.spentThisTurn ?? 0) + totalPrice > procurement.roundBudget) {
    return { ok: false, reason: 'round-budget' };
  }

  return {
    ok: true,
    quote: {
      turn: state.turn,
      offerId: offer.offerId,
      supplierCivId,
      buyerCivId,
      goodId,
      quantity,
      unitPrice: offer.unitPrice,
      tariffPerUnit: offer.tariffPerUnit,
      ...(offer.tariffRecipientCivId ? { tariffRecipientCivId: offer.tariffRecipientCivId } : {}),
      totalPrice,
      sellerProceeds,
      tariffProceeds,
    },
  };
}

/**
 * Atomic loading commit. It re-quotes against the current state, then moves native stock, imported
 * stock and gold in one candidate state. No UI or AI caller exists in MR11; MR12 adds the manifest and
 * receiving-capacity flow around this engine.
 */
export function commitMarketLoad(
  state: GameState,
  quote: MarketLoadQuote,
  options: MarketLoadCommitOptions = {},
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): MarketLoadCommitResult {
  const current = quoteMarketLoad(
    state,
    quote.buyerCivId,
    quote.supplierCivId,
    quote.goodId,
    quote.quantity,
    definitions,
  );
  if (!current.ok) return { ok: false, reason: current.reason, state };

  const offer = findOffer(state, quote.buyerCivId, quote.supplierCivId, quote.goodId, definitions);
  if (!offer || offer.offerId !== quote.offerId) {
    return { ok: false, reason: 'stale-offer', state };
  }
  const policy = policyFor(state, quote.supplierCivId, quote.goodId);
  const sellerLedger = getCivMaterialLedger(state, quote.supplierCivId);
  let sellerLedgerAfter = sellerLedger;
  if (options.settlement !== 'service') {
    const debited = spendNativeForExport(
      sellerLedger,
      quote.goodId,
      quote.quantity,
      policy?.protectedReserve ?? 0,
    );
    if (!debited.ok) return { ok: false, reason: 'stale-offer', state };
    sellerLedgerAfter = debited.ledger;
  }

  if (options.settlement === 'incoming' && !options.claimId) {
    return { ok: false, reason: 'stale-offer', state };
  }
  const buyerLedger = getCivMaterialLedger(state, quote.buyerCivId);
  const definition = goodDefinition(quote.goodId, definitions);
  let buyerLedgerAfter = buyerLedger;
  if (options.settlement !== 'service') {
    const credited = options.settlement === 'incoming'
      ? claimIncomingStock(
        buyerLedger,
        {
          id: options.claimId!,
          goodId: quote.goodId,
          ownerCivId: quote.buyerCivId,
          amount: quote.quantity,
        },
        definition?.quantity?.storageCapacity ?? DEFAULT_STORAGE_PER_GOOD,
      )
      : creditImportedStock(buyerLedger, quote.goodId, quote.quantity);
    if (!credited.ok) return { ok: false, reason: 'insufficient-capacity', state };
    buyerLedgerAfter = credited.ledger;
  }

  const paid = settleGoldTransfers(
    state,
    { [quote.buyerCivId]: current.quote.totalPrice },
    {
      [quote.supplierCivId]: current.quote.sellerProceeds,
      ...(current.quote.tariffProceeds > 0 && current.quote.tariffRecipientCivId
        ? { [current.quote.tariffRecipientCivId]: current.quote.tariffProceeds }
        : {}),
    },
  );
  if (!paid) return { ok: false, reason: 'insufficient-gold', state };

  const market = marketOf(state)!;
  const eligible = offer.eligibleBuyerCivIds;
  const servedIndex = eligible.indexOf(quote.buyerCivId);
  const cursor = servedIndex >= 0 && eligible.length > 0
    ? (servedIndex + 1) % eligible.length
    : (market.serviceCursorByOffer[offer.offerId] ?? 0);
  const served = [...(market.servedByOffer?.[offer.offerId] ?? []), quote.buyerCivId];
  const procurement = market.procurementByCiv?.[quote.buyerCivId];
  const nextState: GameState = {
    ...paid,
    ...(options.settlement === 'service'
      ? {}
      : {
        materialReservesByCiv: {
          ...(paid.materialReservesByCiv ?? {}),
          [quote.supplierCivId]: sellerLedgerAfter,
          [quote.buyerCivId]: buyerLedgerAfter,
        },
      }),
    commerceMarket: {
      ...market,
      offers: market.offers.map(candidate => candidate.offerId === offer.offerId
        ? { ...candidate, available: candidate.available - quote.quantity }
        : candidate),
      serviceCursorByOffer: {
        ...market.serviceCursorByOffer,
        [offer.offerId]: cursor,
      },
      servedByOffer: {
        ...(market.servedByOffer ?? {}),
        [offer.offerId]: served,
      },
      ...(procurement
        ? {
          procurementByCiv: {
            ...(market.procurementByCiv ?? {}),
            [quote.buyerCivId]: {
              ...procurement,
              spentThisTurn: (procurement.spentThisTurn ?? 0) + current.quote.totalPrice,
            },
          },
        }
        : {}),
    },
  };
  return {
    ok: true,
    state: nextState,
    result: current.quote,
    ...(options.settlement === 'incoming' && options.claimId ? { claimId: options.claimId } : {}),
  };
}
