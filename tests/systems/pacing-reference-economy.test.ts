import { describe, expect, it } from 'vitest';
import { getReferenceEconomyOutput } from './helpers/pacing-reference-economy';
import { getResearchOutputProfileForEra } from '@/systems/pacing-model';

describe('pacing reference economy (Part C exact-value pin)', () => {
  // These numbers are captured from a real run of getReferenceEconomyOutput at each era, for
  // both profiles — see tests/systems/helpers/pacing-reference-economy.ts for the derivation
  // methodology and why two profiles exist. If a future MR adds a new tech-yield bonus and this
  // test fails, that is Part C working as designed (see .claude/rules/game-balance.md's Pacing
  // Regression Prevention section): update BOTH this expectation and the matching
  // RESEARCH_OUTPUT_BY_ERA entry in pacing-model.ts together, with a one-line justification.
  const expectedBoundedByEra: Record<number, number> = {
    1: 2, 2: 6, 3: 8, 4: 9, 5: 9, 6: 24, 7: 29, 8: 46, 9: 59, 10: 66, 11: 93, 12: 103, 13: 102,
  };
  const expectedMaximalByEra: Record<number, number> = {
    1: 2, 2: 6, 3: 8, 4: 9, 5: 13, 6: 34, 7: 48, 8: 79, 9: 118, 10: 135, 11: 170, 12: 198, 13: 236,
  };

  it.each(Object.entries(expectedBoundedByEra))('era %s bounded-profile reference economy produces the pinned science output', (era, expected) => {
    const output = getReferenceEconomyOutput(Number(era), 'bounded');
    expect(output.science).toBe(expected);
  });

  it.each(Object.entries(expectedMaximalByEra))('era %s maximal-profile reference economy produces the pinned science output', (era, expected) => {
    const output = getReferenceEconomyOutput(Number(era), 'maximal');
    expect(output.science).toBe(expected);
  });

  it('maximal profile output is never lower than bounded profile output at any era (sanity)', () => {
    for (let era = 1; era <= 13; era++) {
      const bounded = getReferenceEconomyOutput(era, 'bounded').science;
      const maximal = getReferenceEconomyOutput(era, 'maximal').science;
      expect(maximal).toBeGreaterThanOrEqual(bounded);
    }
  });

  it('reference economy science output stays monotonic apart from the measured one-point bounded Era 13 transition', () => {
    for (const profile of ['bounded', 'maximal'] as const) {
    const outputs = Array.from({ length: 13 }, (_, i) => getReferenceEconomyOutput(i + 1, profile).science);
      for (let i = 1; i < outputs.length; i++) {
        const allowedDrop = profile === 'bounded' && i + 1 === 13 ? 1 : 0;
        expect(outputs[i], `${profile} era ${i + 2} drops too far from era ${i + 1}`).toBeGreaterThanOrEqual(outputs[i - 1] - allowedDrop);
      }
    }
  });

  // Guardrail added post-MR13 review: this fixture's building-eligibility logic determines
  // RESEARCH_OUTPUT_BY_ERA, which determines tech costs across an entire era. A logic bug here
  // (e.g. accidentally re-counting buildings, or removing the bounded/maximal distinction) can
  // silently blow up era-over-era growth without any single number looking obviously wrong in
  // isolation — this is exactly what happened during MR13 review (era 12 output was ~2x higher
  // than intended before the two-profile split existed). Cap the era-over-era growth ratio so a
  // future fixture change that produces runaway output fails loudly here, before it cascades
  // into a silent multi-hundred-tech cost retune.
  it('era-over-era output growth ratio stays bounded (regression guardrail)', () => {
    const MAX_GROWTH_RATIO = 3;
    for (const profile of ['bounded', 'maximal'] as const) {
      for (let era = 2; era <= 13; era++) {
        const previous = getReferenceEconomyOutput(era - 1, profile).science;
        const current = getReferenceEconomyOutput(era, profile).science;
        if (previous <= 0) continue;
        const ratio = current / previous;
        expect(ratio, `${profile} era ${era - 1}->${era} growth ratio ${ratio.toFixed(2)}x exceeds ${MAX_GROWTH_RATIO}x`).toBeLessThanOrEqual(MAX_GROWTH_RATIO);
      }
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
  //
  // Era 10-12 constants target the 'maximal' profile, not 'bounded': tuning against the lower
  // bounded output would let a completionist player (who builds every available building, a
  // real playstyle) blow through late-game tech far faster than the target window — the exact
  // "feels automatic" failure mode the pacing design doc warns against. See the fixture's own
  // top-of-file comment for the full reasoning.
  it('era 10-13 profile constants are tightly derived from the maximal reference economy', () => {
    for (const era of [10, 11, 12, 13]) {
      const profile = getResearchOutputProfileForEra(era);
      const reference = getReferenceEconomyOutput(era, 'maximal');
      expect(Math.abs(profile.outputPerTurn - reference.science)).toBeLessThanOrEqual(3);
    }
  });
});
