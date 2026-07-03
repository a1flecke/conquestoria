import { describe, expect, it } from 'vitest';
import { evaluateAITechCapabilities } from '@/ai/ai-tech-evaluation';
import type { Tech } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';

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
});
