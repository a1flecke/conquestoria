import { describe, expect, it } from 'vitest';
import { getEmpireFlatTechYields } from '@/systems/tech-yield-system';
import {
  getReferenceEconomyOutput,
  getRepresentativeEmpireOutput,
} from './helpers/pacing-reference-economy';
import { getResearchOutputProfileForEra } from '@/systems/pacing-model';

describe('pacing reference economy (Part C exact-value pin)', () => {
  // These numbers are captured from a real run of getReferenceEconomyOutput at each era, for
  // both profiles — see tests/systems/helpers/pacing-reference-economy.ts for the derivation
  // methodology and why two profiles exist. If a future MR adds a new tech-yield bonus and this
  // test fails, that is Part C working as designed (see .claude/rules/game-balance.md's Pacing
  // Regression Prevention section): update BOTH this expectation and the matching
  // RESEARCH_OUTPUT_BY_ERA entry in pacing-model.ts together, with a one-line justification.
  // #591 MR4: eras 7-13 shifted upward. Sacred Council (a milestone national project) is
  // the first building to list `temple` in requiresBuildings, which forces `temple` past
  // the bounded profile's "recently-gated" window (isForcedPrereq in
  // eligibleBuildingIds) at every later era -- temple's own +1 science now counts as
  // active production indefinitely, same as any other prereq chain. This is intentional:
  // a milestone project is buildable forever, so its prerequisite building staying
  // "relevant infrastructure" indefinitely in the reference economy is the correct model,
  // not a leak.
  // #441: Security Bureau now enters the bounded loadout at era 13 through its era-10 gate.
  // That crosses the reference fixture's four-buildings-per-population threshold, adding one
  // worked tile and therefore one science.
  const expectedBoundedByEra: Record<number, number> = {
    1: 2, 2: 6, 3: 8, 4: 9, 5: 9, 6: 24, 7: 35, 8: 50, 9: 68, 10: 75, 11: 103, 12: 113, 13: 114,
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

  it('reference economy science output stays monotonic across every era', () => {
    for (const profile of ['bounded', 'maximal'] as const) {
    const outputs = Array.from({ length: 13 }, (_, i) => getReferenceEconomyOutput(i + 1, profile).science);
      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i], `${profile} era ${i + 2} drops below era ${i + 1}`).toBeGreaterThanOrEqual(outputs[i - 1]);
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

describe('representative multi-city reference economy', () => {
  // Timeouts below are widened from vitest's 5s/30s defaults (#608): this
  // machine routinely runs several Claude Code worktree agents concurrently,
  // each invoking `yarn test` independently, and this describe block's cohort
  // simulation is CPU-heavy enough to blow past the defaults under that
  // contention even with no code regression. Measured worst observed
  // durations across two contended runs: cohort count 19.1s, empire-flat
  // yields 31.7s, unrounded averages 40.6s, infrastructure ordering 84.9s.
  // Each timeout below carries roughly 2x headroom over the worst observed
  // value, not the solo-run duration, so it still catches a genuine
  // regression while tolerating 2-3 concurrent agents on this hardware.
  it('uses the documented 1/3/5/7/9 cohort count', () => {
    expect(getRepresentativeEmpireOutput(1).cityCount).toBe(1);
    expect(getRepresentativeEmpireOutput(3).cityCount).toBe(2);
    expect(getRepresentativeEmpireOutput(5).cityCount).toBe(3);
    expect(getRepresentativeEmpireOutput(7).cityCount).toBe(4);
    expect(getRepresentativeEmpireOutput(9).cityCount).toBe(5);
  }, 45_000);

  it('applies empire-flat yields once after city aggregation', () => {
    const output = getRepresentativeEmpireOutput(10);
    const cityTotals = output.cities.reduce((total, city) => ({
      science: total.science + city.yieldsBeforeEmpireFlat.science,
      production: total.production + city.yieldsBeforeEmpireFlat.production,
    }), { science: 0, production: 0 });
    const flat = getEmpireFlatTechYields(output.completedTechIds);

    expect(output.total).toEqual({
      science: Math.round(cityTotals.science + flat.science),
      production: Math.round(cityTotals.production + flat.production),
    });
  }, 60_000);

  it('derives averages from unrounded empire totals', () => {
    const output = getRepresentativeEmpireOutput(10);
    const cityTotals = output.cities.reduce((total, city) => ({
      science: total.science + city.yieldsBeforeEmpireFlat.science,
      production: total.production + city.yieldsBeforeEmpireFlat.production,
    }), { science: 0, production: 0 });
    const flat = getEmpireFlatTechYields(output.completedTechIds);

    expect(output.averagePerCity).toEqual({
      science: Number(((cityTotals.science + flat.science) / output.cityCount).toFixed(2)),
      production: Number(((cityTotals.production + flat.production) / output.cityCount).toFixed(2)),
    });
  }, 75_000);

  it('orders infrastructure allocation across sensitivity shares', () => {
    const light = getRepresentativeEmpireOutput(10, { infrastructureShare: 0.5 });
    const canonical = getRepresentativeEmpireOutput(10, { infrastructureShare: 0.6 });
    const heavy = getRepresentativeEmpireOutput(10, { infrastructureShare: 0.7 });
    const allocated = (output: typeof canonical) => output.cities
      .reduce((sum, city) => sum + city.infrastructureProductionAllocated, 0);

    expect(allocated(light)).toBeLessThan(allocated(canonical));
    expect(allocated(canonical)).toBeLessThan(allocated(heavy));
  }, 150_000);

  it('pins the canonical 60% representative profile for eras 10-13', () => {
    const outputs = [10, 11, 12, 13].map(era => {
      const output = getRepresentativeEmpireOutput(era);
      return {
        era,
        cityCount: output.cityCount,
        total: output.total,
        averagePerCity: output.averagePerCity,
      };
    });

    expect(outputs).toEqual([
      { era: 10, cityCount: 5, total: { science: 590, production: 520 }, averagePerCity: { science: 117.9, production: 103.92 } },
      { era: 11, cityCount: 5, total: { science: 734, production: 607 }, averagePerCity: { science: 146.7, production: 121.4 } },
      { era: 12, cityCount: 5, total: { science: 829, production: 607 }, averagePerCity: { science: 165.8, production: 121.4 } },
      // MR5's live Era-13 city effects, research/building follow-ups, and
      // production-budgeted 7-turn costs deliberately raise this diagnostic
      // reference. This is a gameplay target update, not a snapshot workaround.
      { era: 13, cityCount: 5, total: { science: 1220, production: 775 }, averagePerCity: { science: 243.9, production: 155 } },
    ]);
  }, 60_000);

  it('keeps maximal as the era 10-13 target while representative is diagnostic', () => {
    for (const era of [10, 11, 12, 13]) {
      const profile = getResearchOutputProfileForEra(era);
      const maximal = getReferenceEconomyOutput(era, 'maximal');

      expect(Math.abs(profile.outputPerTurn - maximal.science)).toBeLessThanOrEqual(3);
    }
  });
});
