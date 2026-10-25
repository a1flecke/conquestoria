import type { GameState, ResourceType } from '@/core/types';
import {
  BUILDINGS,
  getAvailableBuildings,
  getTrainableUnitsForCity,
  cityFollowsOwnFaith,
  TRAINABLE_UNITS,
} from '@/systems/city-system';
import { getCapitalCityId } from '@/systems/capital-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getMarketOfferForBuyer, getMarketProcurementPolicy, setMarketProcurementPolicy } from '@/systems/resource-market-offers';
import type { ResourceProcurementTerms } from '@/core/types/commerce';
import { findTradeGood, resourceGoodId } from '@/systems/trade-good-definitions';

const ACCESS_DURATION_TURNS = 10;

function getRequiredResources(itemId: string): readonly ResourceType[] {
  return BUILDINGS[itemId]?.resourceRequired
    ?? TRAINABLE_UNITS.find(unit => unit.type === itemId)?.resourceRequired
    ?? [];
}

function getResourcePurchaseCandidates(state: GameState, civId: string, cityId: string): string[] {
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city) return [];
  if (city.productionQueue.length > 0) return [city.productionQueue[0]];

  const reservedNationalProjects = getReservedNationalProjectKeys(state, civId);
  return [
    ...getAvailableBuildings(
      city,
      civ.techState.completed,
      state.map,
      undefined,
      resolveCivilizationEra(civ.techState.completed),
      reservedNationalProjects,
      civId,
      undefined,
      getCapitalCityId(state, civId),
    ).map(building => building.id),
    ...getTrainableUnitsForCity(
      city,
      civ.techState.completed,
      state.map,
      civ.civType,
      undefined,
      cityFollowsOwnFaith(state, city),
    ).map(unit => unit.type),
  ].sort();
}

/** The first hard resource the AI is short of in its current production plans. */
function missingResource(state: GameState, civId: string): ResourceType | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const available = getCivAvailableResources(state, civId);
  for (const cityId of [...civ.cities].sort()) {
    for (const itemId of getResourcePurchaseCandidates(state, civId, cityId)) {
      const missing = getRequiredResources(itemId).filter(resource => !available.has(resource));
      if (missing.length === 1) return missing[0]!;
    }
  }
  return null;
}

/**
 * #1509 MR12: the old AI ten-turn access purchase is retired. The AI only writes a conservative
 * standing policy; the route loader performs the actual posted-price purchase when a real trader
 * reaches a permitted supplier. No free stock and no instant buy.
 */
export function processAIResourceMarketplace(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !state.marketplace) return state;
  const existing = getMarketProcurementPolicy(state, civId);
  if (existing.maxUnitPrice !== Number.MAX_SAFE_INTEGER) return state;
  const budget = Math.max(0, Math.min(100, Math.floor(civ.gold / 3)));
  return setMarketProcurementPolicy(state, civId, {
    maxUnitPrice: 50,
    treasuryFloor: Math.max(0, Math.floor(civ.gold / 2)),
    roundBudget: budget,
    spentThisTurn: 0,
  });
}

/**
 * Conservative terms for a foreign route the AI is about to establish. The target is one standard
 * recipe, the max price is the currently visible offer, and the shared policy supplies budget/floor.
 */
export function getAIProcurementTerms(
  state: GameState,
  civId: string,
  destinationCityId: string,
): ResourceProcurementTerms | null {
  const destination = state.cities[destinationCityId];
  if (!destination || destination.owner === civId) return null;
  const resource = missingResource(state, civId);
  if (!resource) return null;
  const goodId = resourceGoodId(resource);
  const offer = getMarketOfferForBuyer(state, civId, destination.owner, goodId);
  if (!offer || offer.available <= 0) return null;
  const targetQuantity = findTradeGood(goodId)?.quantity?.standardRecipeQuantity ?? 10;
  return {
    orders: [{
      goodId,
      targetQuantity,
      maxUnitPrice: offer.unitPrice + offer.tariffPerUnit,
    }],
  };
}

// Kept for the existing AI test seam: no instant access is purchased.
export const AI_ACCESS_DURATION_TURNS = ACCESS_DURATION_TURNS;
