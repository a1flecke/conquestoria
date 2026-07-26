import type { AIStrategicRole, UnitType } from '@/core/types';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

const COMBAT_ROLES = new Set<AIStrategicRole>([
  'capture',
  'frontline',
  'ranged',
  'siege',
  'mobile',
  'air-combat',
  'naval-combat',
  'escort',
]);

export function getAIStrategicRoles(type: UnitType): readonly AIStrategicRole[] {
  const catalogDefinition = getUnitRoleDefinition(type);
  if (catalogDefinition) return catalogDefinition.aiRoles;

  // Non-trainable actors, such as pirate-only hulls, retain generic AI handling.
  const definition = UNIT_DEFINITIONS[type];
  if (definition.domain === 'air') {
    return definition.attackProfile ? ['air-combat', 'ranged'] : ['recon'];
  }
  if (definition.cargoCapacity !== undefined) {
    return definition.strength > 0 ? ['transport', 'escort'] : ['transport'];
  }
  if (definition.domain === 'naval') return ['naval-combat', 'escort'];
  if (definition.strength <= 0) return [];
  if (
    definition.attackProfile?.kind === 'siege'
    || definition.attackProfile?.kind === 'bombard'
  ) {
    return ['siege', 'ranged'];
  }
  if (definition.attackProfile?.kind === 'ranged') {
    return definition.movementPoints >= 3
      ? ['ranged', 'mobile', 'capture']
      : ['ranged', 'capture'];
  }
  if (definition.movementPoints >= 3) return ['mobile', 'capture'];
  return ['frontline', 'capture'];
}

export function hasAICombatRole(type: UnitType): boolean {
  return getAIStrategicRoles(type).some(role => COMBAT_ROLES.has(role));
}

export function hasAITradeRole(type: UnitType): boolean {
  return getAIStrategicRoles(type).includes('trade');
}
