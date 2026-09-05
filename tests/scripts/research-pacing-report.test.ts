import { describe, expect, it } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  PRE_V24_TECH_COST_BY_ID,
  RESEARCH_COST_MIGRATION_TARGET_SCHEMA_VERSION,
} from '@/storage/research-cost-migration-v24';
import { RECOMMENDED_TECH_COST_BY_ID } from '../fixtures/research-cost-retune-v24';
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
    expect(report.eras[0]).toMatchObject({
      era: 1,
      bands: expect.objectContaining({ starter: expect.any(Number), core: expect.any(Number), marquee: expect.any(Number) }),
      scenarios: expect.any(Object),
      costPercentiles: expect.objectContaining({ currentP50: expect.any(Number), proposedP50: expect.any(Number) }),
      etaPercentiles: expect.any(Object),
    });
    expect(report.eras.every(era => Number.isFinite(era.adjacentEraRatio))).toBe(true);
    expect(report.unitUsefulLifetimeWarnings).toEqual([]);
    expect(report.failures).toEqual([]);
  });

  it('keeps the activated cost catalog and its fixed-point proposal inside the authored gates', () => {
    const current = buildResearchPacingReport();
    const proposed = buildResearchPacingReport({ proposedCosts: true });

    expect(current.failures).toEqual([]);
    expect(proposed.failures).toEqual([]);
  });

  it('makes the activated catalog equal the feedback fixed point and preserves one migration source map', () => {
    const report = buildResearchPacingReport({ proposedCosts: true });
    const currentCosts = new Map(TECH_TREE.map(tech => [tech.id, tech.cost]));

    expect(report.changedCostIds).toEqual([]);
    expect(new Set(report.changedCostIds).size).toBe(report.changedCostIds.length);
    expect(report.changedCostIds.every(id => currentCosts.has(id))).toBe(true);
    // Pinned to the literal historical value (not CURRENT_SAVE_SCHEMA_VERSION):
    // this constant records the schema version research-cost migration 24 was
    // actually activated at and must never change, even after later migrations
    // (e.g. #927's schema 25) move CURRENT_SAVE_SCHEMA_VERSION further ahead.
    expect(RESEARCH_COST_MIGRATION_TARGET_SCHEMA_VERSION).toBe(24);
    expect(Object.keys(PRE_V24_TECH_COST_BY_ID).sort()).toEqual(Object.keys(RECOMMENDED_TECH_COST_BY_ID).sort());
    const formulaCosts = getProposedResearchCostById();
    for (const [id, currentCost] of currentCosts) {
      expect(PRE_V24_TECH_COST_BY_ID[id]).not.toBeUndefined();
      expect(RECOMMENDED_TECH_COST_BY_ID[id]).toBe(currentCost);
      expect(formulaCosts[id]).toBe(currentCost);
    }
  });

  it('remains a viewer-independent, non-mutating laboratory in hot-seat games', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { slotId: 'p1', name: 'Alice', civType: 'rome', isHuman: true },
        { slotId: 'p2', name: 'Bob', civType: 'zulu', isHuman: true },
      ],
    }, 'research-pacing-hot-seat');
    const before = structuredClone(state);

    const firstViewer = buildResearchPacingReport({ proposedCosts: true });
    state.currentPlayer = 'p2';
    const secondViewer = buildResearchPacingReport({ proposedCosts: true });

    expect(firstViewer.eras).toEqual(secondViewer.eras);
    expect({ ...state, currentPlayer: before.currentPlayer }).toEqual(before);
  });
});
