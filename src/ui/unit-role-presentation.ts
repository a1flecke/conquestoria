import type { CombatRole, UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { evaluateProductionPrerequisites } from '@/systems/production-prerequisites';
import { TECH_TREE } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export interface IconTextFact {
  icon: string;
  text: string;
}

export interface UnitRolePresentation {
  summary: string;
  roleText: string;
  counters: readonly IconTextFact[];
  vulnerabilities: readonly IconTextFact[];
  upgrade: IconTextFact;
  requirements: readonly IconTextFact[];
}

const ROLE_LABELS: Record<CombatRole, string> = {
  frontline: 'frontline',
  ranged: 'ranged',
  siege: 'siege',
  shock: 'shock',
  pursuit: 'pursuit',
  reconnaissance: 'reconnaissance',
  detection: 'detection',
  'anti-mounted': 'anti-mounted',
  'anti-armor': 'anti-armor',
  'air-superiority': 'air-superiority',
  'ground-air-defense': 'ground anti-air defense',
  'capital-ship': 'capital ships',
  escort: 'escort',
  'formation-support': 'formation support',
  capture: 'capture',
  civilian: 'civilian',
};

function pluralRole(role: CombatRole): string {
  return `${ROLE_LABELS[role]} units`;
}

function techName(id: string): string {
  return TECH_TREE.find(tech => tech.id === id)?.name ?? id;
}

export function getUnitRolePresentation(
  type: UnitType,
  completedTechs: readonly string[] = [],
): UnitRolePresentation | undefined {
  const definition = getUnitRoleDefinition(type);
  if (!definition) return undefined;

  const entry = TRAINABLE_UNITS.find(unit => unit.type === type);
  const roleNames = [definition.primaryRole, ...(definition.secondaryRoles ?? [])]
    .map(role => ROLE_LABELS[role]);
  const prerequisites = entry
    ? evaluateProductionPrerequisites(entry, completedTechs)
    : { required: [], satisfied: [], missing: [] };
  const target = entry?.upgradesTo;

  return {
    summary: definition.roleSummary,
    roleText: `Role: ${roleNames.join(' · ')}`,
    counters: definition.counters.map(role => ({ icon: '🎯', text: `Strong against ${pluralRole(role)}` })),
    vulnerabilities: definition.vulnerableTo.map(role => ({ icon: '⚠️', text: `Vulnerable to ${pluralRole(role)}` })),
    upgrade: target
      ? { icon: '⬆️', text: `Upgrades to ${UNIT_DEFINITIONS[target].name}` }
      : definition.terminalReason
        ? { icon: '🏁', text: definition.terminalReason }
        : { icon: '—', text: 'No upgrade path' },
    requirements: prerequisites.required.map(id => ({
      icon: prerequisites.satisfied.includes(id) ? '✓' : '🔒',
      text: `${techName(id)} · ${prerequisites.satisfied.includes(id) ? 'Complete' : 'Missing'}`,
    })),
  };
}
