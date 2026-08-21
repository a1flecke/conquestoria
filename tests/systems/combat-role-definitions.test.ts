import { describe, expect, it } from 'vitest';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import {
  getUnitRoleDefinition,
  validateUnitRoleDefinitions,
} from '@/systems/combat-role-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { TECH_TREE } from '@/systems/tech-definitions';

describe('combat role definitions', () => {
  it('classifies every trainable unit with readable, typed metadata', () => {
    for (const unit of TRAINABLE_UNITS) {
      const definition = getUnitRoleDefinition(unit.type);
      expect(definition, unit.type).toBeDefined();
      expect(definition!.roleSummary.trim(), unit.type).not.toBe('');
      expect(definition!.roleSummary.trim().split(/\s+/).length, unit.type).toBeLessThanOrEqual(18);
      expect(definition!.aiRoles.length, unit.type).toBeGreaterThan(0);
    }
  });

  it('classifies the Paratrooper as frontline, weaker in a fight than the infantry it deploys alongside (#543)', () => {
    expect(getUnitRoleDefinition('paratrooper')).toMatchObject({
      primaryRole: 'frontline',
    });
  });

  it('keeps counterplay distinct rather than treating every unit as a generalist', () => {
    expect(getUnitRoleDefinition('pikeman')).toMatchObject({
      primaryRole: 'anti-mounted',
      counters: ['shock'],
      vulnerableTo: ['ranged', 'siege'],
    });
    expect(getUnitRoleDefinition('cavalry')).toMatchObject({
      primaryRole: 'shock',
      secondaryRoles: ['pursuit'],
      vulnerableTo: ['anti-mounted'],
    });
    expect(getUnitRoleDefinition('artillery')).toMatchObject({
      primaryRole: 'siege',
      vulnerableTo: ['shock', 'pursuit'],
    });
    expect(getUnitRoleDefinition('combat_drone')).toMatchObject({
      primaryRole: 'formation-support',
      secondaryRoles: ['ranged'],
    });
  });

  it('supports overlapping typed local-infrastructure families without losing existing discounts', () => {
    const lightSupport = ['horseman', 'cavalry', 'armored_car', 'beast_handler'] as const;
    const heavy = ['chariot', 'knight', 'cuirassier', 'war_elephant'] as const;

    for (const type of lightSupport) {
      expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies, type).toContain('mounted-light-support');
    }
    for (const type of heavy) {
      expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies, type).toContain('mounted-heavy');
    }
    for (const type of ['catapult', 'ballista', 'trebuchet'] as const) {
      expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies, type).toContain('classical-siege');
    }
    for (const type of ['armored_car', 'tank', 'mechanized_infantry', 'main_battle_tank'] as const) {
      expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies, type).toContain('armored');
    }
    expect(getUnitRoleDefinition('armored_car')?.localInfrastructureFamilies)
      .toEqual(expect.arrayContaining(['mounted-light-support', 'armored']));
    for (const type of ['cannon', 'anti_tank_gun', 'mobile_aa', 'attack_helicopter', 'combat_drone'] as const) {
      expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies ?? [], type).not.toContain('armored');
    }
  });

  it('accepts the live catalog and rejects malformed upgrade contracts', () => {
    const reachableTechIds = new Set(TECH_TREE.map(tech => tech.id));
    expect(validateUnitRoleDefinitions(TRAINABLE_UNITS, UNIT_DEFINITIONS, reachableTechIds)).toEqual([]);

    const impossibleTarget = TRAINABLE_UNITS.map(unit => {
      if (unit.type === 'warrior') return { ...unit, upgradesTo: 'archer' as const };
      if (unit.type === 'archer') return { ...unit, requiredTechs: ['never-reachable'] };
      return unit;
    });
    expect(validateUnitRoleDefinitions(impossibleTarget, UNIT_DEFINITIONS, reachableTechIds))
      .toContain('warrior: target archer needs unreachable technology never-reachable');

    const cyclic = TRAINABLE_UNITS.map(unit => {
      if (unit.type === 'warrior') return { ...unit, upgradesTo: 'archer' as const };
      if (unit.type === 'archer') return { ...unit, upgradesTo: 'warrior' as const };
      return unit;
    });
    expect(validateUnitRoleDefinitions(cyclic, UNIT_DEFINITIONS, reachableTechIds))
      .toContain('warrior: upgrade cycle detected');

    const inferredEdge = TRAINABLE_UNITS.map(unit => unit.type === 'warrior'
      ? { ...unit, upgradesTo: undefined }
      : unit);
    expect(validateUnitRoleDefinitions(inferredEdge, UNIT_DEFINITIONS, reachableTechIds))
      .toContain('warrior: combat unit needs an upgrade target or terminal reason');
  });
});
