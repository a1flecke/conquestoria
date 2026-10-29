// src/ai/ai-trade-strategy.ts
// #1514 MR17: strategic AI trade use under the same legality, knowledge and accounting rules as a
// human. This module only ranks known offers and derives standing policies; it never mutates stock,
// bypasses consent, or reads the human projection.
import type { GameState, TradeRoute } from '@/core/types';
import type { TradeGoodId } from '@/core/types/commerce';
import {
  getCommerceResourcePolicy,
  getCommercialPassagePermission,
  setCommerceResourcePolicy,
} from '@/systems/commerce-permissions';
import { getCivMaterialLedger } from '@/systems/resource-material-state';
import { getFreeNativeQuantity } from '@/systems/resource-reserve-system';
import { getMarketOffersForBuyer } from '@/systems/resource-market-offers';
import { getCityMaterialProjection } from '@/systems/city-production-materials';
import { getCivFuelDemandByGood } from '@/systems/resource-fuel-system';
import { getTradeRouteQuote } from '@/systems/trade-route-economy';
import { getTradeRouteEligibility, resolveTradeOrigin } from '@/systems/trade-route-contract';
import { getEntitledRouteDanger, getTradeDangerFacts } from '@/systems/trade-danger-adapters';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import { isTradeUnitType } from '@/systems/trade-role-targeting';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { getAIMissingResource } from './ai-resource-marketplace';

export interface AITradeSupplierCandidate {
  supplierCivId: string;
  cityId: string;
  goodId: TradeGoodId;
  unitPrice: number;
  tariffPerUnit: number;
  totalUnitCost: number;
  roundTripRounds: number;
  dangerPenalty: number;
  score: number;
}

/** Reserve targets derived from actual active recipes and scheduled fuel demand. */
export function getAIReserveTargets(
  state: GameState,
  civId: string,
): Record<TradeGoodId, number> {
  const targets: Record<TradeGoodId, number> = {};
  const civ = state.civilizations[civId];
  if (!civ) return targets;
  for (const cityId of civ.cities ?? []) {
    const city = state.cities[cityId];
    if (!city) continue;
    const projection = getCityMaterialProjection(state, cityId);
    if (projection.itemId && projection.known) {
      for (const row of projection.recipe) {
        targets[row.goodId] = Math.max(targets[row.goodId] ?? 0, row.quantity);
      }
    }
  }
  for (const [goodId, demand] of Object.entries(getCivFuelDemandByGood(state, civId))) {
    targets[goodId] = Math.max(targets[goodId] ?? 0, demand * 3);
  }
  return targets;
}

/**
 * Rank only offers this AI can actually see. The score is total unit cost first, then round-trip
 * delay, then known danger; a hidden supplier never enters the list.
 */
export function getAITradeSuppliers(
  state: GameState,
  civId: string,
  goodId: TradeGoodId,
  caravanUnitId: string,
): AITradeSupplierCandidate[] {
  const caravan = state.units[caravanUnitId];
  if (!caravan || !isTradeUnitType(caravan.type)) return [];
  // The automated route executor resolves the origin the same way; ranking against any other city
  // would name a destination the AI cannot actually reach from where this trader stands.
  const origin = resolveTradeOrigin(state, caravan);
  if (!origin) return [];
  const dangerFacts = getTradeDangerFacts(state);
  const offers = getMarketOffersForBuyer(state, civId).filter(offer => offer.goodId === goodId);
  const candidates: AITradeSupplierCandidate[] = [];

  for (const offer of offers) {
    // Offers are supplier-scoped, so try each discovered city of that supplier and keep the best
    // legal one. A blockaded capital must not hide a reachable second city.
    const cities = Object.values(state.cities)
      .filter(candidate => candidate.owner === offer.supplierCivId)
      .filter(candidate => hasDiscoveredCity(state, civId, candidate.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    let best: AITradeSupplierCandidate | null = null;
    for (const city of cities) {
      const eligibility = getTradeRouteEligibility(state, {
        caravanUnitId,
        toCityId: city.id,
        actingCivId: civId,
        automated: true,
        originCityId: origin.id,
      });
      if (!eligibility.ok) continue;
      const quote = getTradeRouteQuote(state, {
        caravanUnitId,
        originCityId: origin.id,
        toCityId: city.id,
      });
      if (!quote) continue;
      const route: TradeRoute = {
        id: 'ai-procurement-preview',
        fromCityId: origin.id,
        toCityId: city.id,
        goldPerTrip: 0,
        turnsPerTrip: quote.turnsPerTrip,
        foreignCivId: city.owner,
      };
      const danger = getEntitledRouteDanger(state, civId, route, dangerFacts);
      const dangerPenalty = danger ? 20 : 0;
      const totalUnitCost = offer.unitPrice + offer.tariffPerUnit;
      const candidate: AITradeSupplierCandidate = {
        supplierCivId: offer.supplierCivId,
        cityId: city.id,
        goodId,
        unitPrice: offer.unitPrice,
        tariffPerUnit: offer.tariffPerUnit,
        totalUnitCost,
        roundTripRounds: quote.roundTripRounds,
        dangerPenalty,
        score: totalUnitCost * 10 + quote.roundTripRounds + dangerPenalty,
      };
      if (!best || candidate.score < best.score) best = candidate;
    }
    if (best) candidates.push(best);
  }
  return candidates.sort((left, right) => left.score - right.score
    || left.cityId.localeCompare(right.cityId));
}

/** Best known destination for the AI's current missing hard resource, or null. */
export function getAITradeDestination(
  state: GameState,
  civId: string,
  caravanUnitId: string,
): string | null {
  const resource = getAIMissingResource(state, civId);
  if (!resource) return null;
  return getAITradeSuppliers(state, civId, resourceGoodId(resource), caravanUnitId)[0]?.cityId ?? null;
}

/**
 * Bound new routes per turn: one per three cities minus routes already carrying procurement. This
 * prevents a loss from creating an unbounded replacement demand.
 */
export function getAITradeRouteDemand(state: GameState, civId: string): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;
  const idleTraders = (civ.units ?? [])
    .map(id => state.units[id])
    .filter(unit => unit && isTradeUnitType(unit.type) && !unit.committedToRouteId).length;
  const procurementRoutes = (state.marketplace?.tradeRoutes ?? [])
    .filter(route => state.cities[route.fromCityId]?.owner === civId && route.procurement).length;
  const targetRoutes = Math.max(1, Math.ceil((civ.cities ?? []).length / 3));
  return Math.max(0, Math.min(idleTraders, targetRoutes - procurementRoutes));
}

/**
 * Write native-surplus export policies through the same writer a human uses. Partners must pass the
 * actual commercial-passage permission, so war/embargo/elimination withholding is automatic; the
 * protected reserve keeps the AI's own planned target at home.
 */
export function applyAIExportPolicies(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const partners = Object.keys(state.civilizations)
    .filter(partner => partner !== civId)
    .filter(partner => getCommercialPassagePermission(state, civId, partner).allowed)
    .sort();
  const targets = getAIReserveTargets(state, civId);
  const ledger = getCivMaterialLedger(state, civId);
  let next = state;

  for (const definition of RESOURCE_DEFINITIONS) {
    if ((definition.economicRoles?.length ?? 0) === 0) continue;
    const goodId = resourceGoodId(definition.id);
    const freeNative = getFreeNativeQuantity(ledger, goodId);
    if (freeNative <= 0) continue;
    const protectedReserve = Math.min(freeNative, Math.max(0, targets[goodId] ?? 0));
    // Replacing a policy must not silently drop an existing tariff or service allotment; only the
    // reserve and the permitted-partner list are this strategy's business.
    const existing = getCommerceResourcePolicy(next, civId, goodId);
    next = setCommerceResourcePolicy(next, {
      civId,
      goodId,
      protectedReserve,
      partnerCivIds: freeNative > protectedReserve ? partners : [],
      ...(existing?.tariffPerUnit ? { tariffPerUnit: existing.tariffPerUnit } : {}),
      ...(existing?.tariffRecipientCivId ? { tariffRecipientCivId: existing.tariffRecipientCivId } : {}),
      ...(existing?.serviceAllotments ? { serviceAllotments: existing.serviceAllotments } : {}),
    });
  }
  return next;
}
