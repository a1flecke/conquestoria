import type {
  AIStrategicRole,
  ResourceType,
  Tech,
} from '@/core/types';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
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

export function evaluateAITechCapabilities(tech: Tech): AITechCapabilities {
  const rolesUnlocked: Partial<Record<AIStrategicRole, number>> = {};
  let militaryPowerSpike = 0;
  for (const type of tech.unlocksUnits ?? []) {
    const catalogEntry = TRAINABLE_UNITS.find(unit => unit.type === type);
    const definition = UNIT_DEFINITIONS[type];
    if (!catalogEntry || !definition) continue;
    for (const role of getAIStrategicRoles(type)) {
      rolesUnlocked[role] = (rolesUnlocked[role] ?? 0) + 1;
    }
    militaryPowerSpike += Math.max(0, definition.strength) / 20;
  }

  const buildingYieldValue: AITechCapabilities['buildingYieldValue'] = {};
  for (const buildingId of tech.unlocksBuildings ?? []) {
    const yields = BUILDINGS[buildingId]?.yields;
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
