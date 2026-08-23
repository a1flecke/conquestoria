import type { Unit, UnitDefinition, UnitType } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from './unit-system';
import { UNIT_CLASS_BY_TYPE } from './unit-modifier-definitions';

/**
 * Definition-driven participation check (contract #544 §4). Explicit
 * `definition.participatesInLandSupply` always wins. Otherwise: only
 * major-civ-owned land units with a non-civilian combat class participate.
 * Barbarians, beasts, rebels, pirates, and crisis forces default to `false`
 * regardless of unit type, because a barbarian `warrior` uses the exact same
 * `UnitType` as a player `warrior` — participation cannot be a pure function
 * of type alone.
 */
export function unitParticipatesInLandSupply(
  unit: Pick<Unit, 'type' | 'owner'>,
  definition: UnitDefinition = UNIT_DEFINITIONS[unit.type],
): boolean {
  if (definition.participatesInLandSupply !== undefined) {
    return definition.participatesInLandSupply;
  }
  if (classifyOwner(unit.owner) !== 'major') return false;
  if ((definition.domain ?? 'land') !== 'land') return false;
  const classes = UNIT_CLASS_BY_TYPE[unit.type] ?? [];
  return classes.length > 0 && !classes.includes('civilian');
}

export function getUnitLandSupplyCost(type: UnitType): number {
  const definition = UNIT_DEFINITIONS[type];
  return definition.landSupplyCost ?? 1;
}

export interface ShoreSupplyCapability {
  landSupplyCapacity: number;
  projectsLandSupplyRange: number;
}

export function getShoreSupplyCapability(type: UnitType): ShoreSupplyCapability | null {
  const definition = UNIT_DEFINITIONS[type];
  if (definition.landSupplyCapacity === undefined || definition.projectsLandSupplyRange === undefined) {
    return null;
  }
  return {
    landSupplyCapacity: definition.landSupplyCapacity,
    projectsLandSupplyRange: definition.projectsLandSupplyRange,
  };
}
