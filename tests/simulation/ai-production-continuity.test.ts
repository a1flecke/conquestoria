import { describe, expect, it } from 'vitest';
import type { CampaignCivSample, CampaignRoundSample } from './campaign-sample';
import {
  FALLBACK_ONLY_STALL_MIN_ROUNDS,
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
