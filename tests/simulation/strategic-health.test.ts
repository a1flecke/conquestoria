import { describe, expect, it } from 'vitest';
import type { CampaignCivSample, CampaignRoundSample } from './campaign-sample';
import { summarizeStrategicHealth } from './strategic-health';

interface Spec {
  cities?: number;
  empty?: string[];
  converting?: string[];
  techs?: number;
  research?: boolean;
  applied?: number;
  produced?: number;
  gold?: number;
  discarded?: number;
  plan?: number;
}

function sample(round: number, spec: Spec): CampaignRoundSample {
  const produced = spec.produced ?? 10;
  const converted = spec.gold ?? 0;
  const civ = {
    civId: 'ai-1', isHuman: false, isEliminated: false, living: true,
    cities: spec.cities ?? 1, completedTechs: spec.techs ?? 0, civEra: 3,
    hasCurrentResearch: spec.research ?? true, availableTechCount: spec.research === false ? 0 : 5,
    citiesWithEmptyQueue: (spec.empty ?? []).length,
    emptyQueueCityIds: spec.empty ?? [], convertingCityIds: spec.converting ?? [],
    maxPlanNoProgressRounds: spec.plan ?? 0,
    production: {
      produced, appliedToBuild: spec.applied ?? 0, carriedOver: 0, convertedGold: converted, convertedScience: 0,
      discarded: spec.discarded ?? 0, suppressedByLock: 0,
    },
  } as unknown as CampaignCivSample;
  return { round, civs: [civ] } as unknown as CampaignRoundSample;
}
const run = (n: number, build: (r: number) => Spec) => Array.from({ length: n }, (_, r) => sample(r, build(r)));
const converting = { empty: ['c1'], converting: ['c1'], gold: 10 };

describe('strategic health vs economic utilization (#1407 phase 4)', () => {
  it('a 200-round fully converting empire with one tech is actionable stagnation despite zero waste', () => {
    const [h] = summarizeStrategicHealth(run(200, r => ({ ...converting, techs: r >= 100 ? 8 : 7 })));
    expect(h.health).toBe('actionable-stagnation');
    expect(h.convertedShare).toBe(1);
    expect(h.discardedShare).toBe(0);
    expect(h.longestNoConstructionRun).toBe(200);
    expect(h.techRatePer100).toBe(0.5);
  });

  it('legitimate content exhaustion (no research left) is terminal, not actionable', () => {
    const [h] = summarizeStrategicHealth(run(60, () => ({ ...converting, research: false, techs: 80 })));
    expect(h.health).toBe('terminal-content-exhaustion');
  });

  it('prolonged conversion with steady tech progress is reported but not a stall', () => {
    const [h] = summarizeStrategicHealth(run(60, r => ({ ...converting, techs: r })));
    expect(h.health).toBe('converting-with-progress');
    expect(h.techRatePer100).toBeGreaterThan(90);
  });

  it('a recovered producer is productive and its resume is counted', () => {
    const [h] = summarizeStrategicHealth(run(60, r => (r < 5 ? { ...converting, techs: 3 } : { applied: 10, techs: 3 })));
    expect(h.health).toBe('productive');
    expect(h.longestNoConstructionRun).toBe(5);
    expect(h.resumeEvents).toBe(1);
  });

  it('a mixed civ (one city building) never starts a no-construction run', () => {
    const [h] = summarizeStrategicHealth(run(40, () => ({ cities: 2, applied: 4, produced: 10, empty: ['c1'], converting: ['c1'], gold: 6 })));
    expect(h.longestNoConstructionRun).toBe(0);
    expect(h.health).toBe('productive');
  });

  it('exact accounting beats the snapshot: an empty queue that still built something is not a no-construction run', () => {
    const [h] = summarizeStrategicHealth(run(30, () => ({ empty: ['c1'], converting: [], applied: 10 })));
    expect(h.longestNoConstructionRun).toBe(0);
  });

  it('reports discard share independently of health and plan wedge during the run', () => {
    const [h] = summarizeStrategicHealth(run(40, r => ({ empty: ['c1'], converting: [], discarded: 10, plan: r, techs: 7 })));
    expect(h.discardedShare).toBe(1);
    expect(h.planNoProgressDuringRun).toBe(39);
  });

  it('a round gap breaks a no-construction run', () => {
    const samples = [...run(8, () => converting), ...run(8, () => converting).map(s => ({ ...s, round: s.round + 20 }))];
    expect(summarizeStrategicHealth(samples)[0]!.longestNoConstructionRun).toBe(8);
  });
});
