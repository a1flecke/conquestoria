import type { ResourceType, Tech } from '@/core/types';
import type { AIStrategicRole } from '@/core/types/ai';
import { BUILDINGS, TRAINABLE_UNITS, getTrainableUnit } from '@/systems/city-system';
import { buildTechUnlockIndex, type TechUnlockIndex } from '@/systems/tech-unlock-index';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { TECH_COST_DISCOUNTS, TECH_YIELD_MODIFIERS, type YieldKind } from '@/systems/tech-yield-definitions';
import { UNIT_MODIFIERS } from '@/systems/unit-modifier-definitions';
import { getBespokeTechValue } from './ai-tech-bespoke-value';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { evaluateProductionPrerequisites } from '@/systems/production-prerequisites';
import { getAIStrategicRoles } from './ai-unit-roles';

const EFFECT_YIELD_WEIGHTS = { food: 1, production: 1.25, gold: 1.5, science: 1.25 } as const;

function weighYields(yields: Partial<Record<keyof typeof EFFECT_YIELD_WEIGHTS, number>>): number {
  return (Object.keys(EFFECT_YIELD_WEIGHTS) as Array<keyof typeof EFFECT_YIELD_WEIGHTS>)
    .reduce((sum, key) => sum + (yields[key] ?? 0) * EFFECT_YIELD_WEIGHTS[key], 0);
}

/**
 * A rough, state-independent turn value for one yield-table row (#1304). The AI cannot know how many matching
 * buildings, routes or worked tiles it will have, so rows that scale with a choice are priced at a small assumed
 * count and unconditional rows at a typical early empire size. Only what the AI could read from the public
 * catalog; never opponent state.
 */
function yieldRowValue(effect: YieldKind): number {
  switch (effect.kind) {
    case 'cityFlat': return weighYields(effect.yields) * 3;
    case 'cityFlatConditional': return weighYields(effect.yields) * 1.5;
    case 'perBuildingCategory':
    case 'perBuildingId':
    case 'perImprovement':
    case 'perPopulation':
    case 'terrainYield': return weighYields(effect.yields) * 2;
    case 'empireFlat': return weighYields(effect.yields);
    case 'empirePercent': return effect.percent / 5 * 3;
    case 'perTradeRoute':
    case 'perLuxuryResource':
    case 'perRoutePartnerCiv':
    case 'perCityRoute': return ('gold' in effect ? effect.gold : 0) * 1.5 * 2;
    case 'tradeRoutePercent': return effect.percent / 10;
    case 'perCompletedLegendaryWonder': return effect.gold * 1.5;
    case 'perOwnedNaturalWonder': return effect.science * 1.25;
    case 'lowestCityScience': return effect.science * 1.25;
    case 'foodFromScience': return 2;
    case 'maintenanceDiscount': return 2;
    case 'foundingBonus': return effect.food / 5;
    case 'foundingProductionBonus': return effect.production / 5;
  }
}

/** Largest economic-support contribution a tech's own effect rows may add: comparable to one modest building. */
export const TECH_EFFECT_VALUE_CAP = 3;
const TECH_EFFECT_VALUE_SCALE = 0.3;
const TECH_COMBAT_ROW_SPIKE = 0.25;
const TECH_COMBAT_SPIKE_CAP = 0.5;
const TECH_DISCOUNT_VALUE = 0.3;

/**
 * #1604: per-technology effect values, indexed once. These used to rescan `TECH_YIELD_MODIFIERS`,
 * `TECH_COST_DISCOUNTS` and `UNIT_MODIFIERS` on every call — once per candidate technology inside
 * `evaluateAITechCapabilities`, i.e. on the per-AI-round research path. The tables are static; the length guard
 * rebuilds the index if a caller extends one in place. Same sums, same caps, same 0 for a technology with no rows.
 */
let economicValueByTech: ReadonlyMap<string, number> | null = null;
let economicValueTableSize = -1;
let combatValueByTech: ReadonlyMap<string, number> | null = null;
let combatValueTableSize = -1;

export function getTechEconomicEffectValue(techId: string): number {
  const tableSize = TECH_YIELD_MODIFIERS.length + TECH_COST_DISCOUNTS.length;
  if (economicValueByTech === null || economicValueTableSize !== tableSize) {
    const totals = new Map<string, number>();
    for (const modifier of TECH_YIELD_MODIFIERS) {
      totals.set(modifier.techId, (totals.get(modifier.techId) ?? 0) + yieldRowValue(modifier.effect));
    }
    for (const discount of TECH_COST_DISCOUNTS) {
      totals.set(discount.techId, (totals.get(discount.techId) ?? 0) + TECH_DISCOUNT_VALUE / TECH_EFFECT_VALUE_SCALE);
    }
    economicValueByTech = new Map([...totals].map(([id, total]) => [
      id,
      Math.min(TECH_EFFECT_VALUE_CAP, total * TECH_EFFECT_VALUE_SCALE),
    ]));
    economicValueTableSize = tableSize;
  }
  return economicValueByTech.get(techId) ?? 0;
}

export function getTechCombatEffectValue(techId: string): number {
  if (combatValueByTech === null || combatValueTableSize !== UNIT_MODIFIERS.length) {
    const rows = new Map<string, number>();
    for (const modifier of UNIT_MODIFIERS) {
      if (modifier.source.kind !== 'tech' || modifier.effect !== 'combatStrength') continue;
      rows.set(modifier.source.id, (rows.get(modifier.source.id) ?? 0) + 1);
    }
    combatValueByTech = new Map([...rows].map(([id, count]) => [
      id,
      Math.min(TECH_COMBAT_SPIKE_CAP, count * TECH_COMBAT_ROW_SPIKE),
    ]));
    combatValueTableSize = UNIT_MODIFIERS.length;
  }
  return combatValueByTech.get(techId) ?? 0;
}

export interface AITechCapabilities {
  rolesUnlocked: Partial<Record<AIStrategicRole, number>>;
  buildingYieldValue: Partial<
    Record<'food' | 'production' | 'gold' | 'science', number>
  >;
  resourcesRevealed: ResourceType[];
  eraProgress: number;
  militaryPowerSpike: number;
  economicSupport: number;
  /** #1316: bounded value of effects owned by bespoke system code (see ai-tech-bespoke-value.ts). */
  bespokeEffectValue: number;
  situationality: number;
}

export function evaluateAITechCapabilities(
  tech: Tech,
  completedTechs?: ReadonlySet<string>,
  knownTechIds?: ReadonlySet<string>,
  /**
   * #1604: reverse prerequisite index. `planAIResearch` builds one per call and passes it to every evaluation, so a
   * research plan costs one catalogue pass instead of one per candidate. A direct caller that omits it gets a fresh
   * build, which keeps the result identical to the scan it replaces (including any in-place `requiredTechs` fixture).
   */
  unlockIndex: TechUnlockIndex = buildTechUnlockIndex(),
): AITechCapabilities {
  const rolesUnlocked: Partial<Record<AIStrategicRole, number>> = {};
  let militaryPowerSpike = 0;
  const isAvailableAfterResearch = (definition: typeof TRAINABLE_UNITS[number] | typeof BUILDINGS[string]): boolean =>
    !completedTechs || !evaluateProductionPrerequisites(definition, completedTechs).missing
      .some(techId => !knownTechIds || knownTechIds.has(techId));
  const unitTypes = new Set(tech.unlocksUnits ?? []);
  if (completedTechs) {
    // #1604: the reverse index replaces a scan of all 91 trainable units per candidate technology. A definition
    // requires this technology iff `required` (its canonical prerequisite list) contains it, so the index answers
    // exactly the old `required.includes(tech.id)` test; eligibility is still re-checked per definition below.
    for (const unit of unlockIndex.unitsByTech.get(tech.id) ?? []) {
      if (isAvailableAfterResearch(unit)) {
        unitTypes.add(unit.type);
      }
    }
  }
  for (const type of unitTypes) {
    const catalogEntry = getTrainableUnit(type);
    const definition = UNIT_DEFINITIONS[type];
    if (!catalogEntry || !definition) continue;
    if (!isAvailableAfterResearch(catalogEntry)) continue;
    for (const role of getAIStrategicRoles(type)) {
      rolesUnlocked[role] = (rolesUnlocked[role] ?? 0) + 1;
    }
    militaryPowerSpike += Math.max(0, definition.strength) / 20;
  }

  const buildingYieldValue: AITechCapabilities['buildingYieldValue'] = {};
  const buildingIds = new Set(tech.unlocksBuildings ?? []);
  if (completedTechs) {
    // #1604: same reverse index for the 167-entry building catalogue.
    for (const building of unlockIndex.buildingsByTech.get(tech.id) ?? []) {
      if (isAvailableAfterResearch(building)) {
        buildingIds.add(building.id);
      }
    }
  }
  for (const buildingId of buildingIds) {
    const building = BUILDINGS[buildingId];
    if (building && !isAvailableAfterResearch(building)) continue;
    const yields = building?.yields;
    if (!yields) continue;
    for (const key of ['food', 'production', 'gold', 'science'] as const) {
      buildingYieldValue[key] = (buildingYieldValue[key] ?? 0) + yields[key];
    }
  }
  const economicSupport = (buildingYieldValue.food ?? 0)
    + (buildingYieldValue.production ?? 0) * 1.25
    + (buildingYieldValue.gold ?? 0) * 1.5
    + (buildingYieldValue.science ?? 0) * 1.25
    + getTechEconomicEffectValue(tech.id);

  return {
    rolesUnlocked,
    buildingYieldValue,
    resourcesRevealed: RESOURCE_DEFINITIONS
      .filter(definition => definition.tech === tech.id)
      .map(definition => definition.id as ResourceType)
      .sort(),
    eraProgress: tech.era,
    militaryPowerSpike: militaryPowerSpike + (tech.pacing?.impact ?? 0) + getTechCombatEffectValue(tech.id),
    economicSupport,
    bespokeEffectValue: getBespokeTechValue(tech.id),
    situationality: tech.pacing?.situationality ?? 0,
  };
}
