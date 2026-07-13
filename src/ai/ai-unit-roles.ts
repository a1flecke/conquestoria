import type { AIStrategicRole, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

const ROLE_OVERRIDES: Partial<Record<UnitType, readonly AIStrategicRole[]>> = {
  scout: ['recon'],
  observation_balloon: ['recon'],
  caravan: ['trade'],
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line. Without this override these
  // fall through to the naval-domain branch below and get misclassified as
  // ['naval-combat', 'escort'] despite strength 0 and no cargoCapacity.
  naval_trader: ['trade'],
  steamship_trader: ['trade'],
  cargo_freighter: ['trade'],
  container_ship: ['trade'],
  expedition: ['resource-expedition', 'recon'],
  settler: ['settlement'],
  worker: ['worker'],
  spy_scout: ['espionage', 'recon'],
  spy_informant: ['espionage'],
  spy_agent: ['espionage'],
  spy_operative: ['espionage'],
  spy_hacker: ['espionage'],
  cyber_unit: ['espionage'],
  scout_hound: ['detection', 'frontline'],
  shadow_warden: ['detection', 'frontline'],
  war_hound: ['detection', 'frontline', 'mobile', 'capture'],
};

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
  const override = ROLE_OVERRIDES[type];
  if (override) return override;

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
