import type {
  AIStrategicRole,
  ResourceType,
  Tech,
} from '@/core/types';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { evaluateProductionPrerequisites } from '@/systems/production-prerequisites';
import { getAIStrategicRoles } from './ai-unit-roles';

export interface AITechCapabilities {
  rolesUnlocked: Partial<Record<AIStrategicRole, number>>;
  buildingYieldValue: Partial<
    Record<'food' | 'production' | 'gold' | 'science', number>
  >;
  resourcesRevealed: ResourceType[];
  eraProgress: number;
  militaryPowerSpike: number;
  economicSupport: number;
  situationality: number;
}

export function evaluateAITechCapabilities(
  tech: Tech,
  completedTechs?: ReadonlySet<string>,
  knownTechIds?: ReadonlySet<string>,
): AITechCapabilities {
  const rolesUnlocked: Partial<Record<AIStrategicRole, number>> = {};
  let militaryPowerSpike = 0;
  const isAvailableAfterResearch = (definition: typeof TRAINABLE_UNITS[number] | typeof BUILDINGS[string]): boolean =>
    !completedTechs || !evaluateProductionPrerequisites(definition, completedTechs).missing
      .some(techId => !knownTechIds || knownTechIds.has(techId));
  const unitTypes = new Set(tech.unlocksUnits ?? []);
  if (completedTechs) {
    for (const unit of TRAINABLE_UNITS) {
      if (evaluateProductionPrerequisites(unit, completedTechs).required.includes(tech.id)
        && isAvailableAfterResearch(unit)) {
        unitTypes.add(unit.type);
      }
    }
  }
  for (const type of unitTypes) {
    const catalogEntry = TRAINABLE_UNITS.find(unit => unit.type === type);
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
    for (const building of Object.values(BUILDINGS)) {
      if (evaluateProductionPrerequisites(building, completedTechs).required.includes(tech.id)
        && isAvailableAfterResearch(building)) {
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
    + (buildingYieldValue.science ?? 0) * 1.25;

  return {
    rolesUnlocked,
    buildingYieldValue,
    resourcesRevealed: RESOURCE_DEFINITIONS
      .filter(definition => definition.tech === tech.id)
      .map(definition => definition.id as ResourceType)
      .sort(),
    eraProgress: tech.era,
    militaryPowerSpike: militaryPowerSpike + (tech.pacing?.impact ?? 0),
    economicSupport,
    situationality: tech.pacing?.situationality ?? 0,
  };
}
