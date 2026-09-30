/**
 * Compatibility barrel for the city domain (#1008).
 *
 * The former kitchen-sink module is now split across cohesive siblings:
 *
 * - `city-building-catalog.ts`         static building / national-project data
 * - `city-unit-catalog.ts`             static trainable-unit data + meta lists
 * - `city-local-infrastructure.ts`     local-infrastructure families + healing
 * - `city-lifecycle.ts`                founding, coastal geography, razing
 * - `city-availability.ts`             availability / obsolescence / trainability
 * - `city-production-cost.ts`          cost types + pure pricing rules
 * - `city-production-presentation.ts`  icons, display names, queue copy (UI-facing)
 * - `city-turn.ts`                     production completion + per-turn processing
 *
 * Dependency direction is enforced by
 * `tests/app/architecture-boundaries.test.ts` (#1008):
 *
 *   catalogs → availability → cost → turn
 *   lifecycle → availability
 *   presentation is leaf-ward of every simulation module
 *
 * This module exists so the pre-split public surface stays importable by the
 * many existing callers (most notably the city/production/pacing test suites).
 * It intentionally re-exports only that public surface -- no internal helper
 * that was private before is leaked here. New production code should import the
 * specific domain module so its dependency direction is explicit; the barrel is
 * a compatibility facade, not the home of any city rule.
 */
export { BUILDINGS } from './city-building-catalog';

export {
  ERA_1_2_MELEE_UNIT_TYPES,
  MELEE_RANGED_UNIT_TYPES,
  TERMINAL_COMBAT_UNITS,
  TRAINABLE_UNITS,
} from './city-unit-catalog';

export { LOCAL_INFRASTRUCTURE_BUILDINGS, getLocalCityHealingBonus } from './city-local-infrastructure';

export {
  CITY_NAMES,
  civHasCoastalCity,
  foundCity,
  isCityCoastal,
  isPositionCoastal,
  razeForestForProduction,
} from './city-lifecycle';
export type { FoundCityOptions } from './city-lifecycle';

export {
  cityFollowsOwnFaith,
  getAvailableBuildings,
  getDetectionUnitTypeForCiv,
  getTrainableUnitsForCiv,
  getTrainableUnitsForCity,
  isBuildingObsolete,
  isUnitObsolete,
} from './city-availability';

export {
  SETTLER_COST_BY_ERA,
  applyProductionBonus,
  createProductionCostContext,
  getCatalogProductionCost,
  getProductionCostForItem,
  getSettlerProductionCost,
} from './city-production-cost';
export type { ActiveNationalProjectRef, ProductionCostContext } from './city-production-cost';

export {
  PRODUCTION_ICON_FALLBACK,
  PRODUCTION_ICONS,
  describeDroppedProductionItem,
  getProductionDisplayName,
  getProductionIconForItem,
} from './city-production-presentation';

export { completeCityProductionItem, processCity } from './city-turn';
export type {
  CityProcessResult,
  CityProductionCompletionResult,
  CompleteCityProductionItemOptions,
} from './city-turn';
