import { describe, expect, it } from 'vitest';
import { getEffectiveTechCost, getTechById, createTechState, processResearch } from '@/systems/tech-system';
import { buildTechProgressionView } from '@/systems/tech-progression';

describe('getEffectiveTechCost — quantum-computing science-track discount', () => {
  it('discounts an unresearched science-track tech by 15% (ceil)', () => {
    const genomics = getTechById('genomics')!;
    expect(genomics.track).toBe('science');
    expect(genomics.cost).toBe(390);
    expect(getEffectiveTechCost(genomics, ['quantum-computing'])).toBe(Math.ceil(390 * 0.85));
  });

  it('leaves a non-science-track tech unchanged', () => {
    const cyberWarfare = getTechById('cyber-warfare')!;
    expect(cyberWarfare.track).not.toBe('science');
    expect(getEffectiveTechCost(cyberWarfare, ['quantum-computing'])).toBe(cyberWarfare.cost);
  });

  it('leaves science-track techs unchanged without quantum-computing', () => {
    const genomics = getTechById('genomics')!;
    expect(getEffectiveTechCost(genomics, [])).toBe(genomics.cost);
  });
});

describe('processResearch honors the effective (discounted) cost', () => {
  it('completes a science-track tech once progress reaches the discounted cost, not the raw cost', () => {
    const genomics = getTechById('genomics')!;
    const discountedCost = Math.ceil(genomics.cost * 0.85);
    let state = createTechState();
    state = { ...state, completed: ['quantum-computing'], currentResearch: 'genomics', researchProgress: 0 };

    const belowDiscount = processResearch(state, discountedCost - 1);
    expect(belowDiscount.completedTech).toBeNull();

    const atDiscount = processResearch(state, discountedCost);
    expect(atDiscount.completedTech).toBe('genomics');
  });
});

describe('tech-panel ETA estimates use the effective cost', () => {
  it('buildTechProgressionView reports fewer turns-to-research for a science tech once quantum-computing is completed', () => {
    const baseState = { ...createTechState(), currentResearch: 'genomics' };
    const withQC = { ...baseState, completed: ['quantum-computing'] };

    const viewWithout = buildTechProgressionView(baseState, { zoom: 'all', sciencePerTurn: 10 });
    const viewWith = buildTechProgressionView(withQC, { zoom: 'all', sciencePerTurn: 10 });

    const nodeWithout = viewWithout.nodes.find(n => n.tech.id === 'genomics');
    const nodeWith = viewWith.nodes.find(n => n.tech.id === 'genomics');
    expect(nodeWithout?.turnsToResearch).not.toBeNull();
    expect(nodeWith?.turnsToResearch).not.toBeNull();
    expect(nodeWith!.turnsToResearch!).toBeLessThan(nodeWithout!.turnsToResearch!);
  });
});
