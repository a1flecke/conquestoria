import { describe, expect, it } from 'vitest';
import type { CampaignCivSample, CampaignRoundSample } from './campaign-sample';
import {
  classifyProductionIdleState,
  FALLBACK_ONLY_STALL_MIN_ROUNDS,
  STREAK_MIN_ROUNDS_PER_TECH,
  formatContinuityReport,
  summarizeProductionContinuity,
} from './ai-production-continuity';
import { runContinuityCampaign } from './ai-production-continuity-campaign';

interface RowSpec {
  cities?: number;
  empty?: string[];
  converting?: string[];
  techs?: number;
  era?: number;
  research?: boolean;
}

function sample(round: number, spec: RowSpec): CampaignRoundSample {
  const cities = spec.cities ?? 1;
  const civ = {
    civId: 'ai-1', isHuman: false, isEliminated: false, living: true,
    cities, completedTechs: spec.techs ?? 0, civEra: spec.era ?? 1,
    hasCurrentResearch: spec.research ?? true, availableTechCount: spec.research === false ? 0 : 5,
    citiesWithEmptyQueue: (spec.empty ?? []).length,
    emptyQueueCityIds: spec.empty ?? [], convertingCityIds: spec.converting ?? [],
  } as unknown as CampaignCivSample;
  return { round, civs: [civ] } as unknown as CampaignRoundSample;
}

function run(count: number, build: (round: number) => RowSpec): CampaignRoundSample[] {
  return Array.from({ length: count }, (_, round) => sample(round, build(round)));
}

describe('AI production continuity evidence (synthetic controls)', () => {
  it('healthy temporary idleness: short empty-queue blips, always re-queued', () => {
    const [e] = summarizeProductionContinuity(run(30, r => (r % 5 === 0 ? { empty: ['c1'] } : {})));
    expect(e.wastedCityRounds).toBe(0);
    expect(e.classification).toBe('no-fallback');
  });

  it('a short fallback stretch that resumes building is healthy, and the resume is counted', () => {
    const [e] = summarizeProductionContinuity(run(30, r =>
      (r >= 5 && r < 8 ? { empty: ['c1'], converting: ['c1'] } : {})));
    expect(e.convertingCityRounds).toBe(3);
    expect(e.resumeEvents).toBe(1);
    expect(e.longestFallbackOnlyStreak).toBe(3);
    expect(e.classification).toBe('healthy-temporary');
  });

  it('terminal conversion: long fallback-only stretch with no research left is not flagged as a stall', () => {
    const [e] = summarizeProductionContinuity(run(40, r =>
      ({ empty: ['c1'], converting: ['c1'], research: false, techs: 80, era: 12 + 0 * r })));
    expect(e.longestFallbackOnlyStreak).toBeGreaterThanOrEqual(FALLBACK_ONLY_STALL_MIN_ROUNDS);
    expect(e.classification).toBe('terminal-conversion');
  });

  it('prolonged fallback-only WITH progress (techs keep landing) is reported but not a stall', () => {
    const [e] = summarizeProductionContinuity(run(40, r =>
      ({ empty: ['c1'], converting: ['c1'], techs: r })));
    expect(e.classification).toBe('prolonged-with-progress');
  });

  it('prolonged fallback-only with research available and NO progress is flagged as a stall', () => {
    const [e] = summarizeProductionContinuity(run(40, () =>
      ({ empty: ['c1'], converting: ['c1'], techs: 7, era: 3 })));
    expect(e.classification).toBe('stalled-fallback-only');
  });

  it('counts an empty, unconverted city across two consecutive round ends as wasted output', () => {
    const [e] = summarizeProductionContinuity(run(6, r => (r >= 1 && r <= 3 ? { empty: ['c1'] } : {})));
    expect(e.wastedCityRounds).toBe(2);
  });

  it('a mixed civ (one city building) is not fallback-only', () => {
    const [e] = summarizeProductionContinuity(run(40, () =>
      ({ cities: 2, empty: ['c1'], converting: ['c1'], techs: 7 })));
    expect(e.fallbackOnlyRounds).toBe(0);
    expect(e.classification).toBe('healthy-temporary');
  });
});

describe('AI production continuity evidence (real bounded campaign)', () => {
  it('measures the fixed-seed campaign, and the fallback actually engages', () => {
    const first = summarizeProductionContinuity(runContinuityCampaign());
    expect(first.length).toBeGreaterThan(0);
    expect(first.reduce((sum, e) => sum + e.convertingCityRounds, 0)).toBeGreaterThan(0);
    // A 60-round small-map campaign is far too short to prove anything about a 200-500 round game, but it must at
    // least not contain a stall.
    expect(first.filter(e => e.classification === 'stalled-fallback-only')).toEqual([]);
    if (process.env.CONTINUITY_REPORT === '1') {
      throw new Error(`\n${formatContinuityReport('with idle fallback', first)}`);
    }
  }, 60_000);
});

describe('shared continuity semantics (#1407 phase 2)', () => {
  const both = { cities: 2, empty: ['a', 'b'], converting: ['a', 'b'], techs: 7, era: 3 };

  it('fallback-only means EVERY city converts; a mixed empty/converting civ is counted separately', () => {
    const [e] = summarizeProductionContinuity(run(30, () =>
      ({ cities: 2, empty: ['a', 'b'], converting: ['a'], techs: 7 })));
    expect(e.fallbackOnlyRounds).toBe(0);
    expect(e.mixedRounds).toBe(30);
    expect(e.allUnconvertedRounds).toBe(0);
  });

  it('counts all-unconverted rounds and treats missing telemetry as unknown', () => {
    const [u] = summarizeProductionContinuity(run(5, () => ({ cities: 2, empty: ['a', 'b'] })));
    expect(u.allUnconvertedRounds).toBe(5);
    const legacy = run(5, () => ({ cities: 2 })).map(s => {
      const civ = { ...s.civs[0]! } as Record<string, unknown>;
      delete civ.emptyQueueCityIds; delete civ.convertingCityIds;
      return { ...s, civs: [civ] } as unknown as CampaignRoundSample;
    });
    const [k] = summarizeProductionContinuity(legacy);
    expect(k.unknownRounds).toBe(5);
    expect(k.wastedCityRounds).toBe(0);
    expect(k.fallbackOnlyRounds).toBe(0);
  });

  it('one tech inside a 200-round all-converting streak is a stall, not progress', () => {
    const [e] = summarizeProductionContinuity(run(200, r => ({ ...both, techs: r >= 100 ? 8 : 7 })));
    expect(e.streakTechsGained).toBe(1);
    expect(e.classification).toBe('stalled-fallback-only');
    expect(e.streakTechRatePer100).toBe(0.5);
  });

  it('progress exactly at the per-tech threshold is progress', () => {
    const len = 40;
    const need = Math.ceil(len / STREAK_MIN_ROUNDS_PER_TECH);
    const at = summarizeProductionContinuity(run(len, r => ({ ...both, techs: 7 + (r >= len - 1 ? need : 0) })))[0]!;
    expect(at.classification).toBe('prolonged-with-progress');
    const below = summarizeProductionContinuity(run(len, r => ({ ...both, techs: 7 + (r >= len - 1 ? need - 1 : 0) })))[0]!;
    expect(below.classification).toBe('stalled-fallback-only');
  });

  it('a gap in the round sequence resets the streak instead of bridging it', () => {
    const samples = [...run(8, () => both), ...run(8, () => both).map(s => ({ ...s, round: s.round + 20 }))];
    const [e] = summarizeProductionContinuity(samples);
    expect(e.longestFallbackOnlyStreak).toBe(8);
    expect(e.classification).toBe('healthy-temporary');
  });

  it('a duplicated sample round is ignored', () => {
    const base = run(12, () => both);
    const [e] = summarizeProductionContinuity([...base.slice(0, 6), base[5]!, ...base.slice(6)]);
    expect(e.longestFallbackOnlyStreak).toBe(12);
  });

  it('a captured converting city is not counted as a resume', () => {
    const samples = [
      sample(0, { cities: 2, empty: ['a', 'b'], converting: ['a', 'b'] }),
      sample(1, { cities: 1, empty: ['a'], converting: ['a'] }),
    ];
    expect(summarizeProductionContinuity(samples)[0]!.resumeEvents).toBe(0);
    const resumed = [
      sample(0, { cities: 2, empty: ['a', 'b'], converting: ['a', 'b'] }),
      sample(1, { cities: 2, empty: ['a'], converting: ['a'] }),
    ];
    expect(summarizeProductionContinuity(resumed)[0]!.resumeEvents).toBe(1);
  });

  it('terminal conversion is still distinguished from a stall', () => {
    const [e] = summarizeProductionContinuity(run(60, () => ({ ...both, research: false })));
    expect(e.classification).toBe('terminal-conversion');
  });

  it('the long-horizon classifier is the same function', () => {
    const row = sample(0, both).civs[0]!;
    expect(classifyProductionIdleState(row)).toBe('all-converting');
  });
});

describe('exact production accounting on the baseline campaign (#1407 phase 3)', () => {
  it('every sampled civ carries conserved accounting and conversion is real', () => {
    const samples = runContinuityCampaign();
    let converted = 0;
    for (const sample of samples) {
      for (const civ of sample.civs) {
        expect(civ.production).toBeDefined();
        const p = civ.production!;
        expect(p.appliedToBuild + p.carriedOver + p.convertedGold + p.convertedScience + p.discarded).toBeCloseTo(p.produced, 9);
        expect(p.discarded).toBeGreaterThanOrEqual(0);
        converted += p.convertedGold + p.convertedScience;
      }
    }
    expect(converted).toBeGreaterThan(0);
  }, 60_000);
});
