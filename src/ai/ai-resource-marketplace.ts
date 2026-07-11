import type { GameState, ResourceType } from '@/core/types';
import {
  BUILDINGS,
  getAvailableBuildings,
  getProductionCostForItem,
  getTrainableUnitsForCity,
  TRAINABLE_UNITS,
} from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import {
  canBuyResourceAccess,
  getCivAvailableResources,
  getResourceAccessCost,
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
      state.era,
      reservedNationalProjects,
      civId,
    ).map(building => building.id),
    ...getTrainableUnitsForCity(
      city,
      civ.techState.completed,
      state.map,
      civ.civType,
      undefined,
    ).map(unit => unit.type),
  ].sort();
}

/**
 * Gives a major AI one deterministic, player-rule-equivalent resource purchase
 * for a queued item or an idle-city hard-gated candidate that can finish before
 * temporary access expires. The latter runs before normal AI production chooses
 * a candidate, so hard requirements are reachable instead of filtered forever.
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
    for (const itemId of getResourcePurchaseCandidates(working, civId, cityId)) {
      const missing = getRequiredResources(itemId).filter(resource => !available.has(resource));
      if (missing.length !== 1) continue;

      const cost = getProductionCostForItem(itemId, {
        city,
        era: working.era,
        completedTechs: currentCiv.techState.completed,
        availableResources: available,
      });
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
        .find(sellerId => canBuyResourceAccess(working, civId, sellerId, resource));
      if (!seller) continue;
      return performBuyResourceAccess(working, civId, seller, resource);
    }
  }
  return working;
}
