import { describe, expect, it } from 'vitest';
import type { PacingMetadata } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  estimateTurnsToComplete,
  getMetadataComplexityMultiplier,
  getProductionOutputProfileForEra,
  getRecommendedTechCost,
  getRecommendedTechTurnWindow,
  getResearchOutputProfileForEra,
  getResearchOutputProfileForTech,
  getTargetTurnWindow,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
} from '@/systems/pacing-model';

function tech(id: string) {
  const found = TECH_TREE.find(candidate => candidate.id === id);
  if (!found) throw new Error(`missing tech ${id}`);
  return found;
}

describe('pacing-model', () => {
  it('gives Era 1 starter items a 2-4 turn target window', () => {
    expect(getTargetTurnWindow({ era: 1, band: 'starter', contentType: 'building' })).toEqual({ min: 2, max: 4 });
  });

  it('rounds ETA values up by turn', () => {
    expect(estimateTurnsToComplete({ cost: 12, outputPerTurn: 4 })).toBe(3);
    expect(estimateTurnsToComplete({ cost: 13, outputPerTurn: 4 })).toBe(4);
  });

  it('uses Era 1 production assumptions when the era is invalid', () => {
    expect(getProductionOutputProfileForEra(Number.NaN)).toBe(4);
  });
});

describe('research pacing model', () => {
  it('returns stable established-era research profiles', () => {
    expect(getResearchOutputProfileForEra(Number.NaN)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForEra(1)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForEra(2)).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
    expect(getResearchOutputProfileForEra(5)).toEqual({ name: 'era-5-established', outputPerTurn: 13 });
    expect(getResearchOutputProfileForEra(99)).toEqual({ name: 'era-5-established', outputPerTurn: 13 });
  });

  it('classifies starter prerequisites structurally from era, prerequisites, and pacing band', () => {
    expect(isStarterPrerequisiteTech(tech('stone-weapons'))).toBe(true);
    expect(isStarterPrerequisiteTech(tech('fire'))).toBe(true);
    expect(isStarterPrerequisiteTech(tech('espionage-scouting'))).toBe(false);
    expect(isStarterPrerequisiteTech(tech('archery'))).toBe(false);
  });

  it('classifies first real unlocks structurally without reading unlock prose', () => {
    expect(isFirstRealUnlockTech(tech('archery'))).toBe(true);
    expect(isFirstRealUnlockTech(tech('bronze-working'))).toBe(true);
    expect(isFirstRealUnlockTech(tech('writing'))).toBe(true);
    expect(isFirstRealUnlockTech(tech('early-empire'))).toBe(false);
    expect(isFirstRealUnlockTech(tech('lookouts'))).toBe(false);
  });

  it('uses the opening baseline profile for starter and first real unlock techs', () => {
    expect(getResearchOutputProfileForTech(tech('stone-weapons'))).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForTech(tech('bronze-working'))).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForTech(tech('early-empire'))).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
  });

  it('returns opening-specific turn windows before generic era windows', () => {
    expect(getRecommendedTechTurnWindow(tech('stone-weapons'))).toEqual({ min: 2, max: 5 });
    expect(getRecommendedTechTurnWindow(tech('archery'))).toEqual({ min: 8, max: 12 });
    expect(getRecommendedTechTurnWindow(tech('bronze-working'))).toEqual({ min: 9, max: 11 });
    expect(getRecommendedTechTurnWindow(tech('early-empire'))).toEqual({ min: 4, max: 7 });
  });

  it('applies metadata complexity with bounded cost pressure', () => {
    const neutral: PacingMetadata = {
      band: 'core',
      role: 'neutral',
      impact: 1,
      scope: 'city',
      snowball: 1,
      urgency: 1,
      situationality: 1,
      unlockBreadth: 1,
    };
    const broadAccelerant: PacingMetadata = {
      ...neutral,
      impact: 1.25,
      scope: 'empire',
      snowball: 1.25,
      unlockBreadth: 1.2,
    };
    const urgentNiche: PacingMetadata = {
      ...neutral,
      urgency: 1.25,
      situationality: 1.25,
    };

    expect(getMetadataComplexityMultiplier(broadAccelerant)).toBeGreaterThan(getMetadataComplexityMultiplier(neutral));
    expect(getMetadataComplexityMultiplier(urgentNiche)).toBeLessThan(getMetadataComplexityMultiplier(neutral));
    expect(getMetadataComplexityMultiplier({
      ...broadAccelerant,
      impact: 9,
      snowball: 9,
      unlockBreadth: 9,
    })).toBe(1.35);
    expect(getMetadataComplexityMultiplier({
      ...urgentNiche,
      urgency: 9,
      situationality: 9,
    })).toBe(0.75);
    expect(getMetadataComplexityMultiplier(broadAccelerant, { max: 1.1 })).toBe(1.1);
  });

  it('recommends readable opening tech costs inside accepted live turn windows', () => {
    const stone = getRecommendedTechCost(tech('stone-weapons'));
    const archery = getRecommendedTechCost(tech('archery'));
    const bronze = getRecommendedTechCost(tech('bronze-working'));

    expect(estimateTurnsToComplete({ cost: stone, outputPerTurn: 1 })).toBeGreaterThanOrEqual(2);
    expect(estimateTurnsToComplete({ cost: stone, outputPerTurn: 1 })).toBeLessThanOrEqual(5);
    expect(estimateTurnsToComplete({ cost: archery, outputPerTurn: 1 })).toBeGreaterThanOrEqual(8);
    expect(estimateTurnsToComplete({ cost: archery, outputPerTurn: 1 })).toBeLessThanOrEqual(12);
    expect(estimateTurnsToComplete({ cost: bronze, outputPerTurn: 1 })).toBeGreaterThanOrEqual(9);
    expect(estimateTurnsToComplete({ cost: bronze, outputPerTurn: 1 })).toBeLessThanOrEqual(11);
  });
});
