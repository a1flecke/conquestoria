import { describe, expect, it } from 'vitest';
import type { CampaignFindingCode } from './campaign-analysis';
import {
  evaluateGapRatchet,
  findInvalidGapRegistrations,
  KNOWN_CAMPAIGN_GAPS,
  type KnownCampaignGap,
  type RatchetFinding,
} from './known-campaign-gaps';

/** #1407 phase 5 -- exact ratchet outcomes. Pure: gaps and findings are plain data, no matrix run needed. */

const scoped: KnownCampaignGap = {
  code: 'production-idle',
  issue: '#1',
  why: 'test',
  scenarios: ['s1', 's2'],
  accepted: [
    { scenario: 's1', civId: 'ai-1', maxRounds: 50 },
    { scenario: 's2', civId: 'ai-2', maxRounds: 30 },
  ],
};

const f = (civId: string, firstRound: number, lastRound: number, code: CampaignFindingCode = 'production-idle'): RatchetFinding =>
  ({ code, civId, firstRound, lastRound, detail: `${civId} ${firstRound}-${lastRound}` });

const run = (entries: Array<[string, RatchetFinding[]]>, gaps = [scoped]) =>
  evaluateGapRatchet(new Map(entries), gaps);

describe('known-gap ratchet v2 (#1407)', () => {
  it('the shipped register is well-formed', () => {
    expect(findInvalidGapRegistrations()).toEqual([]);
    expect(KNOWN_CAMPAIGN_GAPS.length).toBeGreaterThan(0);
  });

  it('all accepted occurrences reproducing within budget: clean', () => {
    const r = run([['s1', [f('ai-1', 10, 59)]], ['s2', [f('ai-2', 10, 20)]]]);
    expect(r.unknownFindings).toEqual([]);
    expect(r.staleOccurrences).toEqual([]);
    expect(r.staleGaps).toEqual([]);
  });

  it('a previously accepted failure that got longer is worsened, not covered', () => {
    const r = run([['s1', [f('ai-1', 10, 60)]], ['s2', [f('ai-2', 10, 20)]]]);
    expect(r.unknownFindings).toEqual([expect.objectContaining({ scenario: 's1', reason: 'worsened' })]);
  });

  it('old issue resolved + a NEW civ defect in the same scenario: new-civ unknown AND the old occurrence is stale', () => {
    const r = run([['s1', [f('ai-9', 10, 20)]], ['s2', [f('ai-2', 10, 20)]]]);
    expect(r.unknownFindings).toEqual([expect.objectContaining({ scenario: 's1', reason: 'new-civ' })]);
    expect(r.staleOccurrences.map(s => `${s.occurrence.scenario}/${s.occurrence.civId}`)).toEqual(['s1/ai-1']);
  });

  it('staleness is per occurrence: one still reproducing does not keep a fixed sibling alive', () => {
    const r = run([['s1', [f('ai-1', 10, 20)]], ['s2', []]]);
    expect(r.staleOccurrences.map(s => s.occurrence.scenario)).toEqual(['s2']);
    expect(r.unknownFindings).toEqual([]);
  });

  it('an occurrence elsewhere is not proof the original still exists', () => {
    const r = run([['s1', [f('ai-1', 10, 20)]], ['s2', [f('ai-1', 10, 20)]]]);
    expect(r.staleOccurrences.map(s => s.occurrence.civId)).toEqual(['ai-2']);
    expect(r.unknownFindings).toEqual([expect.objectContaining({ scenario: 's2', reason: 'new-civ' })]);
  });

  it('partial matrix: occurrences in scenarios that did not run are neither stale nor unknown', () => {
    const r = run([['s1', [f('ai-1', 10, 20)]]]);
    expect(r.staleOccurrences).toEqual([]);
    expect(r.unknownFindings).toEqual([]);
  });

  it('a renamed code is an unregistered finding plus a stale gap, never silently covered', () => {
    const r = run([['s1', [f('ai-1', 10, 20, 'gold-hoard')]], ['s2', []]]);
    expect(r.unknownFindings).toEqual([expect.objectContaining({ code: 'gold-hoard', reason: 'unregistered' })]);
    expect(r.staleOccurrences).toHaveLength(2);
  });

  it('all fixed: every accepted occurrence is stale and nothing is unknown', () => {
    const r = run([['s1', []], ['s2', []]]);
    expect(r.unknownFindings).toEqual([]);
    expect(r.staleOccurrences).toHaveLength(2);
  });

  it('an occurrence without civId accepts any civ of that scenario but still enforces its budget', () => {
    const gap: KnownCampaignGap = { ...scoped, scenarios: ['s1'], accepted: [{ scenario: 's1', maxRounds: 20 }] };
    expect(run([['s1', [f('ai-7', 1, 20)]]], [gap]).unknownFindings).toEqual([]);
    expect(run([['s1', [f('ai-7', 1, 21)]]], [gap]).unknownFindings).toEqual([expect.objectContaining({ reason: 'worsened' })]);
  });

  it('a legacy scenario-level entry keeps its version-1 meaning', () => {
    const legacy: KnownCampaignGap = { code: 'gold-hoard', issue: '#2', why: 'x', scenarios: ['s1'] };
    const r = run([['s1', [f('ai-1', 1, 400, 'gold-hoard')]], ['s2', [f('ai-1', 1, 5, 'gold-hoard')]]], [legacy]);
    expect(r.unknownFindings).toEqual([expect.objectContaining({ scenario: 's2', reason: 'unregistered' })]);
    expect(r.staleGaps).toEqual([]);
  });

  describe('registration validation', () => {
    it("rejects a blanket 'any' with no written rationale, and scoped/any mixes", () => {
      const bare: KnownCampaignGap = { code: 'gold-hoard', issue: '#3', why: 'x', scenarios: 'any' };
      expect(findInvalidGapRegistrations([bare])).toEqual([expect.stringContaining('wildcardRationale')]);
      expect(findInvalidGapRegistrations([{ ...bare, wildcardRationale: 'x'.repeat(60) }])).toEqual([]);
      expect(findInvalidGapRegistrations([{ ...bare, wildcardRationale: 'x'.repeat(60), accepted: [{ scenario: 's1' }] }]))
        .toEqual([expect.stringContaining("cannot be combined")]);
    });
    it('requires scenarios to list exactly the accepted scenarios', () => {
      expect(findInvalidGapRegistrations([{ ...scoped, scenarios: ['s1'] }])).toEqual([expect.stringContaining('exactly')]);
    });
  });
});
