import { describe, expect, it } from 'vitest';
import {
  evaluateAITechCapabilities,
  getTechCombatEffectValue,
  getTechEconomicEffectValue,
  TECH_EFFECT_VALUE_CAP,
} from '@/ai/ai-tech-evaluation';
import type { Tech } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { TRAINABLE_UNITS } from '@/systems/city-system';

describe('structured AI technology capabilities', () => {
  it('derives military roles and building yields from typed catalogs', () => {
    const military = evaluateAITechCapabilities(
      TECH_TREE.find(tech => tech.id === 'siege-warfare')!,
    );
    const economy = evaluateAITechCapabilities(
      TECH_TREE.find(tech => tech.id === 'writing')!,
    );

    expect(military.rolesUnlocked.siege).toBeGreaterThan(0);
    expect(economy.buildingYieldValue.science).toBeGreaterThan(0);
  });

  it('does not use unlock display prose for capability scoring', () => {
    const source = TECH_TREE.find(tech => tech.id === 'siege-warfare')!;
    const altered: Tech = {
      ...source,
      unlocks: ['This prose deliberately claims limitless cavalry and gold'],
    };

    expect(evaluateAITechCapabilities(altered))
      .toEqual(evaluateAITechCapabilities(source));
  });

  it('considers structured era-12 unit unlocks without hardcoded tech IDs', () => {
    const eraTwelve = TECH_TREE
      .filter(tech => tech.era === 12 && (tech.unlocksUnits?.length ?? 0) > 0)
      .map(tech => evaluateAITechCapabilities(tech));

    expect(eraTwelve).not.toHaveLength(0);
    expect(eraTwelve.some(capabilities =>
      (capabilities.rolesUnlocked.frontline ?? 0) > 0
      || (capabilities.rolesUnlocked['air-combat'] ?? 0) > 0,
    )).toBe(true);
  });

  it('does not claim a role is unlocked until every conjunctive unit gate is complete', () => {
    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      const archery = TECH_TREE.find(tech => tech.id === 'archery')!;
      expect(evaluateAITechCapabilities(archery, new Set(['archery'])).rolesUnlocked.ranged)
        .toBeUndefined();
      expect(evaluateAITechCapabilities(archery, new Set(['archery', 'bronze-working'])).rolesUnlocked.ranged)
        .toBeGreaterThan(0);
    } finally {
      archer.requiredTechs = original;
    }
  });

  it('credits the final conjunctive technology when it completes an earlier unit unlock', () => {
    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      const bronzeWorking = TECH_TREE.find(tech => tech.id === 'bronze-working')!;
      expect(evaluateAITechCapabilities(
        bronzeWorking,
        new Set(['archery', 'bronze-working']),
        new Set(['archery', 'bronze-working']),
      ).rolesUnlocked.ranged).toBeGreaterThan(0);
    } finally {
      archer.requiredTechs = original;
    }
  });

  it('values a tech\'s own table effect through one bounded term (#1304)', () => {
    const tech = (id: string) => TECH_TREE.find(t => t.id === id)!;
    const effectOnly = evaluateAITechCapabilities(tech('empiricism'));
    const noEffect = evaluateAITechCapabilities(tech('fire'));
    expect(effectOnly.economicSupport).toBeGreaterThan(noEffect.economicSupport);
    expect(getTechEconomicEffectValue('empiricism')).toBeGreaterThan(0);
    // #1340: the production pair is valued through its generic rows, not a tech-id branch.
    expect(getTechEconomicEffectValue('mass-production')).toBeGreaterThan(0);
    expect(getTechEconomicEffectValue('parliamentary-reform')).toBeGreaterThan(0);
    // #1341: the science pair too.
    expect(getTechEconomicEffectValue('rationalism')).toBeGreaterThan(0);
    expect(getTechEconomicEffectValue('pragmatism')).toBeGreaterThan(0);
    expect(getTechEconomicEffectValue('fire')).toBe(0);
    expect(getTechCombatEffectValue('naval-gunnery')).toBeGreaterThan(0);
    for (const t of TECH_TREE) {
      expect(getTechEconomicEffectValue(t.id)).toBeLessThanOrEqual(TECH_EFFECT_VALUE_CAP);
      expect(getTechCombatEffectValue(t.id)).toBeLessThanOrEqual(0.5);
    }
  });

  it('prices a scaling effect no higher than the flat effect it replaced', () => {
    // Banking-style conditional rows must not outrank an unconditional city-wide bonus of the same size.
    expect(getTechEconomicEffectValue('empiricism')).toBeLessThanOrEqual(TECH_EFFECT_VALUE_CAP);
    expect(getTechEconomicEffectValue('banking')).toBeLessThan(TECH_EFFECT_VALUE_CAP);
  });
});
