import { describe, expect, it } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  buildResearchPacingScenario,
  getResearchScenarioOutputs,
  ISSUE_917_RESEARCH_SCENARIO,
  RESEARCH_SCENARIOS,
  validateResearchPacingScenarios,
  getResearchScenarioCityCount,
} from './helpers/research-pacing-scenarios';

describe('research pacing scenarios', () => {
  it('keeps explicit tall, standard, and wide city-count contracts for every authored era', () => {
    for (const scenario of Object.values(RESEARCH_SCENARIOS)) {
      expect(scenario.cityCounts).toHaveLength(13);
      expect([...scenario.cityCounts].every((count, index) => Number.isInteger(count) && count > 0 && (index === 0 || count >= scenario.cityCounts[index - 1]))).toBe(true);
    }
    expect(getResearchScenarioCityCount('tall', 13)).toBe(5);
    expect(getResearchScenarioCityCount('standard', 13)).toBe(7);
    expect(getResearchScenarioCityCount('wide', 13)).toBe(26);
  });

  it('keeps the #917 distribution separate and numerically honest', () => {
    expect(ISSUE_917_RESEARCH_SCENARIO.turn).toBe(117);
    expect(ISSUE_917_RESEARCH_SCENARIO.personalEra).toBe(2);
    expect(ISSUE_917_RESEARCH_SCENARIO.cityScience.reduce((total, value) => total + value, 0)).toBe(58);
    expect(ISSUE_917_RESEARCH_SCENARIO.coordinatedScience).toBe(24);
  });

  it('feeds each cohort\'s own research arrival back into its later infrastructure output', () => {
    const earlier = buildResearchPacingScenario({ scenario: 'standard', era: 6, infrastructureShare: 0.6 });
    const later = buildResearchPacingScenario({ scenario: 'standard', era: 7, infrastructureShare: 0.6 });

    expect(earlier.completedTechIds.length).toBeGreaterThan(0);
    expect(later.completedTechIds.length).toBeGreaterThan(earlier.completedTechIds.length);
    expect(later.arrivalTurn).toBeGreaterThan(earlier.arrivalTurn);
    expect(later.grossScience).toBeGreaterThanOrEqual(earlier.grossScience);
    expect(later.netScience).toBeGreaterThanOrEqual(earlier.netScience);
  });

  it('uses the #917 regression distribution only for its named reproduction', () => {
    const scenario = buildResearchPacingScenario({ scenario: 'issue-917', era: 2, infrastructureShare: 0.6 });

    expect(scenario.grossScience).toBe(58);
    expect(scenario.netScience).toBe(24);
    expect(scenario.cityScience).toEqual(ISSUE_917_RESEARCH_SCENARIO.cityScience);
  });

  it('pins all authored scenario outputs and resists infrastructure-share drift', () => {
    const outputs = getResearchScenarioOutputs();

    expect(outputs).toHaveLength(13 * 3);
    expect(outputs.every(output => output.grossScience >= output.netScience && output.netScience > 0)).toBe(true);
    expect(outputs.filter(output => output.scenario === 'standard').map(output => output.infrastructureShare))
      .toEqual(Array(13).fill(0.6));

    for (const era of Array.from({ length: 13 }, (_, index) => index + 1)) {
      const low = buildResearchPacingScenario({ scenario: 'standard', era, infrastructureShare: 0.5 });
      const high = buildResearchPacingScenario({ scenario: 'standard', era, infrastructureShare: 0.7 });
      expect(high.netScience).toBeGreaterThanOrEqual(low.netScience);
    }
  });

  it('builds only prerequisite-complete personal frontiers with no future-era leakage', () => {
    const techById = new Map(TECH_TREE.map(tech => [tech.id, tech]));

    for (const output of getResearchScenarioOutputs()) {
      const completed = new Set(output.completedTechIds);
      for (const techId of completed) {
        const tech = techById.get(techId);
        expect(tech, techId).toBeDefined();
        expect(tech!.era).toBeLessThanOrEqual(output.era);
        expect(tech!.prerequisites.every(prerequisite => completed.has(prerequisite))).toBe(true);
      }
    }
  });

  it('reports actionable failures for a missing future-era scenario instead of borrowing Era 13', () => {
    expect(() => buildResearchPacingScenario({ scenario: 'standard', era: 14, infrastructureShare: 0.6 }))
      .toThrow('Missing research pacing scenario for authored era 14');
  });

  it('validates every authored era, standard band gate, tall ceiling, wide floor, and continuity ratio', () => {
    expect(() => validateResearchPacingScenarios()).not.toThrow();
  });
});
