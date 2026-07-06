import { describe, expect, it } from 'vitest';
import { getReferenceEconomyOutput } from './helpers/pacing-reference-economy';
import { getResearchOutputProfileForEra } from '@/systems/pacing-model';

describe('pacing reference economy (Part C exact-value pin)', () => {
  // These numbers are captured from a real run of getReferenceEconomyOutput at each era —
  // see tests/systems/helpers/pacing-reference-economy.ts for the derivation methodology.
  // If a future MR adds a new tech-yield bonus and this test fails, that is Part C working as
  // designed (see .claude/rules/game-balance.md's Pacing Regression Prevention section):
  // update BOTH this expectation and the matching RESEARCH_OUTPUT_BY_ERA entry in
  // pacing-model.ts together, with a one-line justification.
  const expectedScienceByEra: Record<number, number> = {
    1: 2, 2: 6, 3: 8, 4: 9, 5: 13, 6: 34, 7: 48, 8: 79, 9: 118, 10: 135, 11: 170, 12: 198,
  };

  it.each(Object.entries(expectedScienceByEra))('era %s reference economy produces the pinned science output', (era, expected) => {
    const output = getReferenceEconomyOutput(Number(era));
    expect(output.science).toBe(expected);
  });

  it('reference economy science output increases monotonically with era', () => {
    const outputs = Array.from({ length: 12 }, (_, i) => getReferenceEconomyOutput(i + 1).science);
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
    }
  });

  // Scope note (documented deviation, see PR description): eras 1-9's RESEARCH_OUTPUT_BY_ERA
  // constants predate this fixture and are already load-bearing across many other pinned
  // tests (pacing-model.test.ts, pacing-audit.test.ts). Re-grounding them to this fixture's
  // numbers would require a much larger Part E retune across eras 1-9's tech costs, which is
  // out of MR13/#481's stated non-goal ("not a blanket re-tune of all ~368 tech costs").
  // Eras 10-12 did not exist before this MR (F2), so they get a tight fixture-derived pin;
  // eras 1-9 only get a sanity floor (must still be positive and non-decreasing, already
  // covered by the monotonic test above).
  it('era 10-12 RESEARCH_OUTPUT_BY_ERA constants are tightly derived from the reference economy', () => {
    for (const era of [10, 11, 12]) {
      const profile = getResearchOutputProfileForEra(era);
      const reference = getReferenceEconomyOutput(era);
      expect(Math.abs(profile.outputPerTurn - reference.science)).toBeLessThanOrEqual(3);
    }
  });
});
