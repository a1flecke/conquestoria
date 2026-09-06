import type { GameState } from '@/core/types';
import {
  createProductionCostContext,
  getProductionCostForItem,
  type ProductionCostContext,
} from '@/systems/city-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import {
  getActiveNationalProjectsForCiv,
  getCircularManufacturingMaterial,
} from '@/systems/national-project-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { hasActiveRecoveredHarnesses } from '@/systems/rogue-elephant-host-system';
import { hasActiveHerdingInsight } from '@/systems/stampede-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

export type { ProductionCostContext } from '@/systems/city-system';

/**
 * The one place a production cost's inputs are derived from game state (#984).
 *
 * Callers name the state, the owning civilization and (where one exists) the
 * host city. They never decide which era, tech list, national projects,
 * resources, substitution or reward charges belong in a production cost --
 * that judgement lives here, once.
 *
 * `era` is always the owning civilization's own technology-derived era
 * (`resolveCivilizationEra`). `state.era` is World Age -- the era a *majority*
 * of living civilizations has reached -- and is more than 2x the civ era for a
 * laggard. Passing it into a production cost is the defect this module exists
 * to make unrepresentable.
 *
 * Deterministic, side-effect free, and never mutates state. It reads only the
 * owning civilization's own records, so it is safe on an AI turn and in hot
 * seat: nothing here is scoped to `state.currentPlayer`.
 */
export function buildProductionCostContext(
  state: GameState,
  civId: string,
  cityId?: string | null,
): ProductionCostContext {
  const civ = state.civilizations[civId];
  const city = cityId ? state.cities[cityId] : undefined;
  // A city this civilization does not own never contributes its building
  // discounts to this civilization's cost.
  const hostCity = city && city.owner === civId ? city : undefined;
  if (!civ) {
    // An unknown or non-major owner (a razed civ id, a minor civ) gets the
    // neutral context rather than a half-built one silently attributed to it.
    return createProductionCostContext({
      city: hostCity ? { buildings: hostCity.buildings ?? [] } : null,
    });
  }
  const completedTechs = civ.techState?.completed ?? [];
  return {
    city: hostCity ? { buildings: hostCity.buildings ?? [] } : null,
    bonusEffect: resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect,
    era: resolveCivilizationEra(completedTechs),
    completedTechs,
    activeNationalProjects: getActiveNationalProjectsForCiv(state, civId),
    availableResources: getCivAvailableResources(state, civId),
    materialSubstitution: getCircularManufacturingMaterial(state, civId),
    herdingInsight: hasActiveHerdingInsight(state, civId),
    recoveredHarnesses: hasActiveRecoveredHarnesses(state, civId),
  };
}

/**
 * Prices one item from an already-built context. Use this when several items
 * are priced for the same civilization and city (a build list, a production
 * queue, an AI candidate sweep) so the context is derived once.
 */
export function getContextualProductionCost(
  itemId: string,
  context: ProductionCostContext,
): number {
  return getProductionCostForItem(itemId, context);
}

/** Prices a single item for one civilization and city. */
export function getProductionCostForCivItem(
  state: GameState,
  civId: string,
  cityId: string | null,
  itemId: string,
): number {
  return getContextualProductionCost(itemId, buildProductionCostContext(state, civId, cityId));
}
