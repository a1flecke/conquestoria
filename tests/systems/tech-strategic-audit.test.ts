import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { buildTechAuditInventory } from '../helpers/tech-audit-inventory';
import { needsDecision, repeatedNicheSignatures } from '../helpers/tech-audit-judgement';
import { renderTechAuditReport } from '../helpers/tech-audit-report';
import { TECH_AUDIT_ENTRIES, WARFARE_RECONCILIATION } from './tech-audit/tech-audit-data';

// #420 child 1. The audit is a pinned artifact: docs/tech-strategic-choice-audit.md is generated from source, so a tech
// change that alters the picture fails here until the audit is regenerated and reviewed in the same PR.

const DOC = join(process.cwd(), 'docs/tech-strategic-choice-audit.md');
const rows = buildTechAuditInventory();
const repeated = repeatedNicheSignatures(rows);
const byId = new Map(rows.map(row => [row.id, row]));
const bandOf = (era: number): 2 | 3 | 4 | 0 => (era <= 4 ? 2 : era <= 8 ? 3 : era <= 11 ? 4 : 0);

describe('tech strategic-choice audit (#420 child 1)', () => {
  it('inventories every tech in Eras 1–12 and nothing beyond', () => {
    expect(rows.length).toBe(TECH_TREE.filter(tech => tech.era <= 12).length);
    expect(Math.max(...rows.map(row => row.era))).toBe(12);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });

  it('requires an authored judgement for every tech the rules flag', () => {
    const missing = rows.filter(row => needsDecision(row, repeated) && !TECH_AUDIT_ENTRIES[row.id]).map(row => row.id);
    expect(missing).toEqual([]);
  });

  it('keeps no authored entry for an unknown or no-longer-flagged tech', () => {
    const stale = Object.keys(TECH_AUDIT_ENTRIES).filter(id => {
      const row = byId.get(id);
      return !row || !needsDecision(row, repeated);
    });
    expect(stale).toEqual([]);
  });

  it('names a candidate built from existing mechanics for every REPLACE, TUNE and WIRE', () => {
    const bare = Object.entries(TECH_AUDIT_ENTRIES)
      .filter(([, entry]) => entry.cls === 'REPLACE' || entry.cls === 'WIRE' || (entry.cls === 'TUNE' && !entry.textFix))
      .filter(([, entry]) => !entry.candidate || entry.candidate.length < 20)
      .map(([id]) => id);
    expect(bare).toEqual([]);
  });

  it('assigns each scheduled tech to the child that owns its era band', () => {
    const wrong = Object.entries(TECH_AUDIT_ENTRIES)
      .filter(([id, entry]) => entry.child !== bandOf(byId.get(id)!.era))
      .map(([id, entry]) => `${id}: child ${entry.child}`);
    expect(wrong).toEqual([]);
  });

  it('leaves no flat yield in Eras 1–11 without a REPLACE decision', () => {
    const flat = rows.filter(row => row.era <= 11 && row.yieldEffects.some(e => ['cityFlat', 'empireFlat', 'empirePercent'].includes(e.kind)));
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.filter(row => TECH_AUDIT_ENTRIES[row.id]?.cls !== 'REPLACE').map(row => row.id)).toEqual([]);
  });

  it('reconciles all 24 warfare ideas, two per era, hard and soft', () => {
    expect(WARFARE_RECONCILIATION).toHaveLength(24);
    for (let era = 1; era <= 12; era++) {
      expect(WARFARE_RECONCILIATION.filter(w => w.era === era).map(w => w.kind).sort()).toEqual(['hard', 'soft']);
    }
  });

  it('pins the fact the AI valuation column rests on: the evaluator never reads effect tables', () => {
    const source = readFileSync(join(process.cwd(), 'src/ai/ai-tech-evaluation.ts'), 'utf8');
    expect(source).not.toMatch(/TECH_YIELD_MODIFIERS|TECH_COST_DISCOUNTS|UNIT_MODIFIERS/);
    const research = readFileSync(join(process.cwd(), 'src/ai/ai-research.ts'), 'utf8');
    expect(research).not.toMatch(/TECH_YIELD_MODIFIERS|UNIT_MODIFIERS/);
  });

  it('keeps docs/tech-strategic-choice-audit.md in sync with source', () => {
    const rendered = renderTechAuditReport(rows);
    if (process.env.UPDATE_TECH_AUDIT === '1') writeFileSync(DOC, rendered);
    expect(existsSync(DOC)).toBe(true);
    expect(readFileSync(DOC, 'utf8')).toBe(rendered);
  });
});
