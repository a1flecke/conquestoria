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
  resolveEraRelativeCostBand,
  resolveTechPacingBand,
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

  it('returns correct production output per era', () => {
    expect(getProductionOutputProfileForEra(1)).toBe(4);
    expect(getProductionOutputProfileForEra(7)).toBe(16);
    expect(getProductionOutputProfileForEra(8)).toBe(18);
    expect(getProductionOutputProfileForEra(9)).toBe(20);
    expect(getProductionOutputProfileForEra(10)).toBe(22);
    expect(getProductionOutputProfileForEra(11)).toBe(24);
    expect(getProductionOutputProfileForEra(12)).toBe(26);
    expect(getProductionOutputProfileForEra(99)).toBe(26);
  });
});

describe('research pacing model', () => {
  it('returns stable established-era research profiles', () => {
    expect(getResearchOutputProfileForEra(Number.NaN)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForEra(1)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForEra(2)).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
    expect(getResearchOutputProfileForEra(5)).toEqual({ name: 'era-5-established', outputPerTurn: 13 });
    expect(getResearchOutputProfileForEra(6)).toEqual({ name: 'era-6-established', outputPerTurn: 16 });
    expect(getResearchOutputProfileForEra(7)).toEqual({ name: 'era-7-established', outputPerTurn: 19 });
    expect(getResearchOutputProfileForEra(8)).toEqual({ name: 'era-8-established', outputPerTurn: 22 });
    expect(getResearchOutputProfileForEra(9)).toEqual({ name: 'era-9-established', outputPerTurn: 25 });
    expect(getResearchOutputProfileForEra(99)).toEqual({ name: 'era-12-established', outputPerTurn: 34 });
  });

  it('extends the research baseline through era 12 instead of clamping at era 9 (F2 regression)', () => {
    const era9 = getResearchOutputProfileForEra(9);
    const era10 = getResearchOutputProfileForEra(10);
    const era11 = getResearchOutputProfileForEra(11);
    const era12 = getResearchOutputProfileForEra(12);

    expect(era10.outputPerTurn).toBeGreaterThan(era9.outputPerTurn);
    expect(era11.outputPerTurn).toBeGreaterThan(era10.outputPerTurn);
    expect(era12.outputPerTurn).toBeGreaterThan(era11.outputPerTurn);
    expect(new Set([era9.name, era10.name, era11.name, era12.name]).size).toBe(4);
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
    expect(getResearchOutputProfileForTech(tech('espionage-scouting'))).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
    expect(getResearchOutputProfileForTech(tech('lookouts'))).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
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

describe('era-relative pacing bands (F1 regression)', () => {
  it('does not collapse every era-5+ tech into marquee', () => {
    const eraGte5 = TECH_TREE.filter(t => t.era >= 5);
    const bands = new Set(eraGte5.map(t => resolveTechPacingBand(t)));
    expect(bands.size).toBeGreaterThan(1);
  });

  it('lands a cheap flat-bonus tech and a unit-unlock tech in the same era in different bands', () => {
    const cheapFlat = tech('colonial-trade');
    const unitUnlock = tech('black-powder');
    expect(cheapFlat.era).toBe(unitUnlock.era);
    expect(resolveTechPacingBand(cheapFlat)).not.toBe(resolveTechPacingBand(unitUnlock));
  });

  it("resolveEraRelativeCostBand computes cost percentile within the tech's own era, not absolute thresholds", () => {
    // Every era-12 tech has 2 prerequisites (endgame techs all converge), so the cheapest one
    // still floors at 'specialist' rather than 'marquee' — that floor comes from prerequisite
    // count, not from being forced upward purely by era-12's larger absolute costs, which is
    // exactly what this test guards: it must not resolve to 'marquee' or 'power-spike'.
    const era12Techs = TECH_TREE.filter(t => t.era === 12);
    const cheapestEra12 = era12Techs.reduce((min, t) => (t.cost < min.cost ? t : min));
    expect(['marquee', 'power-spike']).not.toContain(resolveEraRelativeCostBand(cheapestEra12, TECH_TREE));
  });
});
