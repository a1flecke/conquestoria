import { describe, expect, it } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { PRE_V23_TECH_COST_BY_ID } from '@/storage/research-cost-migration-v23';
import { RECOMMENDED_TECH_COST_BY_ID } from '../fixtures/research-cost-retune-v23';
import {
  buildResearchPacingReport,
  getProposedResearchCostById,
  renderResearchPacingMarkdown,
} from '../../scripts/report-research-pacing';

describe('research pacing report', () => {
  it('renders a byte-stable all-era Markdown and JSON report schema', () => {
    const report = buildResearchPacingReport({ proposedCosts: true });
    const first = renderResearchPacingMarkdown(report);
    const second = renderResearchPacingMarkdown(buildResearchPacingReport({ proposedCosts: true }));

    expect(first).toBe(second);
    expect(report.eras).toHaveLength(13);
    expect(report.eras[0]).toMatchObject({ era: 1, scenarios: expect.any(Object), costPercentiles: expect.any(Object), etaPercentiles: expect.any(Object) });
    expect(report.eras.every(era => Number.isFinite(era.adjacentEraRatio))).toBe(true);
    expect(report.unitUsefulLifetimeWarnings).toEqual([]);
    expect(report.failures).toEqual([]);
  });

  it('keeps legacy costs diagnostic while proposed costs satisfy the authored gates', () => {
    const legacy = buildResearchPacingReport();
    const proposed = buildResearchPacingReport({ proposedCosts: true });

    expect(legacy.failures.length).toBeGreaterThan(0);
    expect(legacy.failures.join('\n')).toMatch(/#917|one-turn|continuity/i);
    expect(proposed.failures).toEqual([]);
  });

  it('covers every changed cost once and leaves live tech definitions untouched', () => {
    const report = buildResearchPacingReport({ proposedCosts: true });
    const currentCosts = new Map(TECH_TREE.map(tech => [tech.id, tech.cost]));

    expect(report.changedCostIds.length).toBeGreaterThan(0);
    expect(new Set(report.changedCostIds).size).toBe(report.changedCostIds.length);
    expect(report.changedCostIds.every(id => currentCosts.has(id))).toBe(true);
    expect(Object.keys(PRE_V23_TECH_COST_BY_ID).sort()).toEqual(report.changedCostIds);
    expect(Object.keys(RECOMMENDED_TECH_COST_BY_ID).sort()).toEqual(report.changedCostIds);
    const formulaCosts = getProposedResearchCostById();
    for (const id of report.changedCostIds) {
      expect(PRE_V23_TECH_COST_BY_ID[id]).toBe(currentCosts.get(id));
      expect(RECOMMENDED_TECH_COST_BY_ID[id]).not.toBe(currentCosts.get(id));
      expect(RECOMMENDED_TECH_COST_BY_ID[id]).toBe(formulaCosts[id]);
    }
  });
});
