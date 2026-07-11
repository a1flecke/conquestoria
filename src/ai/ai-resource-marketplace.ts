import type { GameState, ResourceType } from '@/core/types';
import { BUILDINGS, getProductionCostForItem, TRAINABLE_UNITS } from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import {
  canBuyResourceAccess,
  getCivAvailableResources,
  performBuyResourceAccess,
} from '@/systems/resource-acquisition-system';

const ACCESS_DURATION_TURNS = 10;

function getRequiredResources(itemId: string): readonly ResourceType[] {
  return BUILDINGS[itemId]?.resourceRequired
    ?? TRAINABLE_UNITS.find(unit => unit.type === itemId)?.resourceRequired
    ?? [];
}

/**
 * Gives a major AI one deterministic, player-rule-equivalent resource purchase
 * for a queued hard input that can actually finish before temporary access expires.
 */
export function processAIResourceMarketplace(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !state.marketplace) return state;
  let working = state;

  for (const cityId of [...civ.cities].sort()) {
    const city = working.cities[cityId];
    const currentCiv = working.civilizations[civId];
    const itemId = city?.productionQueue[0];
    if (!city || !currentCiv || !itemId) continue;
    const available = getCivAvailableResources(working, civId);
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
    const price = (working.marketplace?.prices[resource] ?? 0) * 3;
    if (price <= 0 || currentCiv.gold < price) continue;
    const seller = Object.keys(currentCiv.diplomacy.relationships)
      .sort()
      .find(sellerId => canBuyResourceAccess(working, civId, sellerId, resource));
    if (!seller) continue;
    return performBuyResourceAccess(working, civId, seller, resource);
  }
  return working;
}
