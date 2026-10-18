import type { GameState, ResourceType } from '@/core/types';
import {
  BUILDINGS,
  getAvailableBuildings,
  getTrainableUnitsForCity,
  cityFollowsOwnFaith,
  TRAINABLE_UNITS,
} from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { buildProductionCostContext, getContextualProductionCost } from '@/systems/production-cost-context';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getCapitalCityId } from '@/systems/capital-system';
import {
  getCivAvailableResources,
  getResourceAccessCost,
  getResourcePurchaseDecision,
  performBuyResourceAccess,
} from '@/systems/resource-acquisition-system';

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

/**
 * Gives a major AI one deterministic, player-rule-equivalent resource purchase for a queued item or
 * an idle-city hard-gated candidate that can finish before temporary access expires.
 *
 * MR01 containment (#1498): eligibility comes from the same canonical
 * `getResourcePurchaseDecision` the human paths use, which currently refuses every instant purchase
 * while the import market is rebuilt. The AI therefore buys nothing and receives no compensating
 * free resources; its production and trade planning are untouched.
 */
export function processAIResourceMarketplace(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !state.marketplace) return state;
  let working = state;

  for (const cityId of [...civ.cities].sort()) {
    const city = working.cities[cityId];
    const currentCiv = working.civilizations[civId];
    if (!city || !currentCiv) continue;
    const available = getCivAvailableResources(working, civId);
    const productionCostContext = buildProductionCostContext(working, civId, cityId);
    for (const itemId of getResourcePurchaseCandidates(working, civId, cityId)) {
      const missing = getRequiredResources(itemId).filter(resource => !available.has(resource));
      if (missing.length !== 1) continue;

      const cost = getContextualProductionCost(itemId, productionCostContext);
      const output = Math.max(1, calculateProjectedCityYields(
        working,
        cityId,
        resolveCivDefinition(working, currentCiv.civType)?.bonusEffect,
      ).production);
      if (Math.ceil(Math.max(0, cost - city.productionProgress) / output) > ACCESS_DURATION_TURNS) continue;

      const resource = missing[0];
      const price = getResourceAccessCost(working, resource);
      if (currentCiv.gold < price) continue;
      const seller = Object.keys(currentCiv.diplomacy.relationships)
        .sort()
        .find(sellerId => getResourcePurchaseDecision(working, civId, sellerId, resource).allowed);
      if (!seller) continue;
      const purchase = performBuyResourceAccess(working, civId, seller, resource);
      return purchase.ok ? purchase.state : working;
    }
  }
  return working;
}
