// ── #1010: DEPRECATED compatibility facade ──────────────────────────────────
// unit-system.ts used to be the module every unit question went through (1790
// lines, ~200 importers). Its responsibilities now live in cohesive modules:
//
//   unit-definitions        the static catalog (UNIT_DEFINITIONS)
//   unit-descriptions       player-facing copy (UNIT_DESCRIPTIONS)
//   unit-lifecycle          createUnit, resetUnitTurn
//   unit-healing            healing/rest rules
//   unit-order-state        "which units still need orders"
//   unit-movement-cost / -legality / -pathfinding / -queries   the movement subsystem
//   unit-low-level-move     GUARDED position movers -- deliberately NOT re-exported here
//
// New code imports the owning module. This file re-exports the same names so an
// out-of-tree branch written against the old surface still compiles, but nothing
// in `src/` or `tests/` may import it any more --
// `tests/app/architecture-boundaries.test.ts` ("#1010 — unit-system facade")
// fails on any importer and on any export beyond the list below, so the facade
// can shrink but never regrow. Delete it once no branch depends on it.
//
// Explicit named re-exports (never `export *`). The four sibling-only helpers in
// unit-movement-cost.ts (terrainCostForParams, isPassableForParams,
// hasRoadMovementDiscount, isPassableForUnitInContext) stay internal, and
// getMovementBlockerReason (unit-movement-explainer.ts) is not here because it
// would cycle through this facade.
export { UNIT_DEFINITIONS } from './unit-definitions';
export { UNIT_DESCRIPTIONS } from './unit-descriptions';
export { createUnit, resetUnitTurn } from './unit-lifecycle';
export {
  HEAL_PASSIVE,
  HEAL_RESTING,
  HEAL_IN_CITY,
  HEAL_IN_TERRITORY,
  canHeal,
  healUnit,
  restUnit,
} from './unit-healing';
export { getUnmovedUnits, isUnitAwaitingOrders } from './unit-order-state';
export {
  getMovementCost,
  getMovementCostForUnit,
  canHullEnterOcean,
  getMovementCostForUnitInContext,
  getMovementStepCostFor,
  movementStepCostParamsForType,
  getMovementStepCost,
  type MovementStepCostParams,
  type UnitMovementContext,
} from './unit-movement-cost';
export {
  BLOCKING_MAP_ENTITY_MESSAGES,
  isBlockingCityFor,
  getBlockingMapEntityAt,
  getBlockingMapEntityKeys,
  getBlockingMapEntityKeysForOwner,
  type UnitMovementBlockerCode,
  type BlockingMapEntity,
} from './unit-movement-legality';
export { findPath, findPathToCity } from './unit-pathfinding';
export {
  getMovementRange,
  getMovementRangeDetails,
  type MovementBlockerReason,
  type MovementRangeDetails,
} from './unit-movement-queries';
