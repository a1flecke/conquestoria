/**
 * #1604 — reverse indexes over the static production catalogues.
 *
 * The AI research evaluator asks, once per candidate technology, "which trainable units and buildings does this
 * technology unlock?". Answering that with a `TRAINABLE_UNITS`/`BUILDINGS` scan makes one `planAIResearch` call
 * (candidates x catalogue) `evaluateProductionPrerequisites` calls — ~258 per candidate, each allocating its own
 * prerequisite arrays. This module answers the same question from one index instead, so the cost is one build plus a
 * Map lookup per candidate.
 *
 * The index is built from the catalogue's CURRENT fields by the caller that needs it — `planAIResearch` builds one per
 * call and re-evaluates `evaluateAITechCapabilities` against it — rather than memoized globally. `requiredTechs` is
 * mutated in place by test fixtures (and by nothing in production), so a process-lifetime cache would silently answer
 * from a stale catalogue; a per-call build keeps the same view of the data the scan would have had.
 *
 * Semantics are identical to the scans it replaces: `getRequiredTechIds` is the canonical, state-independent
 * prerequisite list (a definition's `required` in `evaluateProductionPrerequisites`), entries keep catalogue order,
 * and the index holds references to the catalogue entries themselves — never copies.
 */
import { BUILDINGS } from './city-building-catalog';
import { TRAINABLE_UNITS } from './city-unit-catalog';
import { TECH_TREE } from './tech-definitions';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { getRequiredTechIds } from './production-prerequisites';

/** The catalogue's own entry types, so this module adds no new importer of the `src/core/types.ts` barrel (#1361). */
export type TrainableUnit = (typeof TRAINABLE_UNITS)[number];
export type BuildingEntry = (typeof BUILDINGS)[string];
type TechEntry = (typeof TECH_TREE)[number];
/** `keyof UNIT_DEFINITIONS` is exactly `UnitType`; importing it here would add a `core/types` importer. */
type UnitTypeKey = keyof typeof UNIT_DEFINITIONS;

export interface TechUnlockIndex {
  readonly unitsByTech: ReadonlyMap<string, readonly TrainableUnit[]>;
  readonly buildingsByTech: ReadonlyMap<string, readonly BuildingEntry[]>;
}

function append<T>(index: Map<string, T[]>, key: string, entry: T): void {
  const existing = index.get(key);
  if (existing) existing.push(entry);
  else index.set(key, [entry]);
}

/** One pass over both catalogues; hand the result to every `evaluateAITechCapabilities` call in the same search. */
export function buildTechUnlockIndex(): TechUnlockIndex {
  const units = new Map<string, TrainableUnit[]>();
  for (const unit of TRAINABLE_UNITS) {
    for (const required of getRequiredTechIds(unit)) append(units, required, unit);
  }
  const buildings = new Map<string, BuildingEntry[]>();
  for (const building of Object.values(BUILDINGS)) {
    for (const required of getRequiredTechIds(building)) append(buildings, required, building);
  }
  return { unitsByTech: units, buildingsByTech: buildings };
}

/**
 * The first technology, in `TECH_TREE` order, that unlocks `type` — exactly what
 * `TECH_TREE.find(tech => tech.unlocksUnits?.includes(type))` returned. Memoized by tree length, which is the same
 * contract as `getTechById`; no caller mutates `unlocksUnits` in place.
 */
let unlockTechByUnitType: ReadonlyMap<string, TechEntry> | null = null;
let unlockTechByUnitTypeSize = -1;

export function getUnitUnlockTech(type: UnitTypeKey): TechEntry | undefined {
  if (unlockTechByUnitType === null || unlockTechByUnitTypeSize !== TECH_TREE.length) {
    const index = new Map<string, TechEntry>();
    for (const tech of TECH_TREE) {
      for (const unitType of tech.unlocksUnits ?? []) {
        if (!index.has(unitType)) index.set(unitType, tech);
      }
    }
    unlockTechByUnitType = index;
    unlockTechByUnitTypeSize = TECH_TREE.length;
  }
  return unlockTechByUnitType.get(type);
}
