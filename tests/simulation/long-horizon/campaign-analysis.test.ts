import { describe, expect, it } from 'vitest';
import type { CampaignCivSample, CampaignRoundSample } from '../campaign-sample';
import {
  analyzeCampaign,
  DEFAULT_CAMPAIGN_ANALYSIS_CONFIG,
  type CampaignFindingCode,
} from './campaign-analysis';

/**
 * #1005 — the analyzer is pure, so every detector is proven here against a
 * hand-built synthetic series. This is the "an injected stall IS detected"
 * regression: no test-only production hook, just data in and findings out.
 * Each `detects …` test would go green→red if its detector were deleted or its
 * threshold quietly widened past the injected fault.
 */

const CONFIG = DEFAULT_CAMPAIGN_ANALYSIS_CONFIG;

function healthyCiv(civId: string, round: number, overrides: Partial<CampaignCivSample> = {}): CampaignCivSample {
  return {
    civId,
    isHuman: false,
    isEliminated: false,
    living: true,
    cities: 1 + Math.floor(round / 40),
    population: 4 + Math.floor(round / 8),
    units: 2 + Math.floor(round / 30),
    settlers: 0,
    workers: 1,
    completedTechs: Math.floor(round / 6),
    civEra: 1 + Math.floor(round / 120),
    hasCurrentResearch: true,
    availableTechCount: 20,
    gold: 40 + (round % 7) * 15 - (round % 3) * 10,
    citiesWithEmptyQueue: round % 5 === 0 ? 1 : 0,
    atWarWith: [],
    activePlanCount: 1,
    maxPlanNoProgressRounds: round % 4,
    capturesMade: 0,
    capturesSuffered: 0,
    peaceEventsInvolvingCiv: 0,
    warDeclarationsInvolvingCiv: 0,
    ...overrides,
  };
}

function series(
  rounds: number,
  perRound: (round: number) => CampaignCivSample[],
  world: (round: number) => Partial<CampaignRoundSample> = () => ({}),
): CampaignRoundSample[] {
  return Array.from({ length: rounds }, (_, round) => {
    const civs = perRound(round);
    return {
      round,
      turn: round + 1,
      era: 1,
      gameOver: false,
      winner: null,
      gameOverReason: null,
      minorCivCount: 3,
      barbarianCampCount: 2,
      totalUnits: civs.reduce((sum, c) => sum + c.units, 0),
      totalCities: civs.reduce((sum, c) => sum + c.cities, 0),
      stateBytesBeforeRound: 500_000 + round * 200,
      planProgressTransitions: round,
      civs,
      ...world(round),
    };
  });
}

function codes(samples: CampaignRoundSample[]): CampaignFindingCode[] {
  return analyzeCampaign(samples, CONFIG).findings.map(f => f.code);
}

describe('analyzeCampaign — healthy baseline', () => {
  it('produces no findings for a healthy 300-round two-AI campaign', () => {
    const samples = series(300, round => [
      healthyCiv('ai-1', round),
      healthyCiv('ai-2', round, { gold: 60 + (round % 5) * 12 - (round % 2) * 20 }),
      healthyCiv('player', round, { isHuman: true, hasCurrentResearch: false, completedTechs: 0, cities: 1 }),
    ]);
    const report = analyzeCampaign(samples, CONFIG);
    expect(report.findings).toEqual([]);
    expect(report.summary.rounds).toBe(300);
    expect(report.summary.livingCivIdsAtEnd).toEqual(['ai-1', 'ai-2', 'player']);
  });

  it('ignores the passive human placeholder entirely', () => {
    // human never researches, never expands, hoards nothing changes — still zero findings
    const samples = series(200, round => [
      healthyCiv('ai-1', round),
      healthyCiv('player', round, {
        isHuman: true,
        hasCurrentResearch: false,
        completedTechs: 0,
        cities: 1,
        population: 5,
        gold: 100 + round * 10,
      }),
    ]);
    expect(codes(samples)).toEqual([]);
  });
});

describe('analyzeCampaign — detectors fire on injected stalls', () => {
  it('detects no-research-choice', () => {
    const samples = series(120, round => [
      healthyCiv('ai-1', round, round >= 20 && round <= 40
        ? { hasCurrentResearch: false, availableTechCount: 15 }
        : {}),
    ]);
    const finding = analyzeCampaign(samples, CONFIG).findings.find(f => f.code === 'no-research-choice');
    expect(finding).toBeDefined();
    expect(finding!.civId).toBe('ai-1');
    expect(finding!.firstRound).toBe(20);
    expect(finding!.lastRound).toBe(40);
  });

  it('detects production-idle only when every city is idle', () => {
    const idle = series(120, round => [
      healthyCiv('ai-1', round, round >= 30 && round <= 80 ? { cities: 2, citiesWithEmptyQueue: 2 } : { cities: 2 }),
    ]);
    expect(codes(idle)).toContain('production-idle');

    const oneIdle = series(120, round => [
      healthyCiv('ai-1', round, { cities: 3, citiesWithEmptyQueue: 1 }),
    ]);
    expect(codes(oneIdle)).not.toContain('production-idle');
  });

  it('detects tech-frozen while research is available', () => {
    const samples = series(200, round => [
      healthyCiv('ai-1', round, { completedTechs: round < 30 ? round : 30, availableTechCount: 12 }),
    ]);
    expect(codes(samples)).toContain('tech-frozen');
  });

  it('does not flag tech-frozen when the tech tree is exhausted', () => {
    const samples = series(200, round => [
      healthyCiv('ai-1', round, { completedTechs: 90, availableTechCount: 0, hasCurrentResearch: false }),
    ]);
    expect(codes(samples)).not.toContain('tech-frozen');
  });

  it('does NOT treat a long population plateau as a finding', () => {
    // A one-city city legitimately sits at its ceiling for a long time — there is
    // no sample signal for "has room to grow", so a frozen population is not on
    // its own a bug. (It was a detector during design and dropped after the
    // matrix showed it only ever echoed expansion-frozen / production-idle.)
    const samples = series(250, round => [
      healthyCiv('ai-1', round, { population: 15, completedTechs: Math.floor(round / 5) }),
    ]);
    expect(codes(samples)).not.toContain('population-frozen' as never);
  });

  it('detects expansion-frozen across the whole campaign', () => {
    const samples = series(150, round => [
      healthyCiv('ai-1', round, { cities: 1 }), // never grows
      healthyCiv('ai-2', round, { cities: 1 + Math.floor(round / 30) }), // grows
    ]);
    const findings = analyzeCampaign(samples, CONFIG).findings.filter(f => f.code === 'expansion-frozen');
    expect(findings.map(f => f.civId)).toEqual(['ai-1']);
  });

  it('does not flag expansion-frozen for a civ eliminated early', () => {
    const samples = series(150, round => [
      healthyCiv('ai-1', round, round < 12
        ? { cities: 1 }
        : { cities: 0, units: 0, living: false, isEliminated: true }),
    ]);
    expect(codes(samples)).not.toContain('expansion-frozen');
  });

  it('detects gold-hoard (monotonic rise, no spend)', () => {
    const samples = series(160, round => [
      healthyCiv('ai-1', round, { gold: 20 + round * 12 }), // strictly rising, never falls
    ]);
    expect(codes(samples)).toContain('gold-hoard');
  });

  it('does not flag gold-hoard when gold oscillates', () => {
    const samples = series(160, round => [
      healthyCiv('ai-1', round, { gold: 200 + (round % 6) * 40 - (round % 4) * 55 }),
    ]);
    expect(codes(samples)).not.toContain('gold-hoard');
  });

  it('detects unit-count-runaway (units balloon, cities flat) — the F3 shape', () => {
    const samples = series(250, round => [
      // 1 city all game; ~1 unit/round from round 150 → ends ~102 units above start
      healthyCiv('ai-1', round, {
        cities: 1,
        units: 2 + Math.max(0, round - 150),
        population: 15,
        completedTechs: Math.floor(round / 5),
      }),
    ]);
    const finding = analyzeCampaign(samples, CONFIG).findings.find(f => f.code === 'unit-count-runaway');
    expect(finding).toBeDefined();
    expect(finding!.civId).toBe('ai-1');
  });

  it('does not flag unit-count-runaway for a big army that GREW its empire', () => {
    const samples = series(250, round => [
      healthyCiv('ai-1', round, {
        cities: 1 + Math.floor(round / 40), // expands
        units: 2 + round, // huge army, but the empire scaled with it
      }),
    ]);
    expect(codes(samples)).not.toContain('unit-count-runaway' as never);
  });

  it('does not flag unit-count-runaway for a stable one-city garrison', () => {
    const samples = series(250, round => [
      healthyCiv('ai-1', round, { cities: 1, units: 3, completedTechs: Math.floor(round / 5) }),
    ]);
    expect(codes(samples)).not.toContain('unit-count-runaway' as never);
  });

  it('does not flag unit-count-runaway for a transient spike that resolves', () => {
    const samples = series(250, round => [
      healthyCiv('ai-1', round, {
        cities: 1,
        units: round >= 100 && round <= 130 ? 45 : 3, // crisis stack that dissipates
        completedTechs: Math.floor(round / 5),
      }),
    ]);
    expect(codes(samples)).not.toContain('unit-count-runaway' as never);
  });

  it('detects plan-stuck', () => {
    const samples = series(120, round => [
      healthyCiv('ai-1', round, round >= 50 && round <= 90
        ? { maxPlanNoProgressRounds: CONFIG.planStuckRounds + 5 }
        : {}),
    ]);
    expect(codes(samples)).toContain('plan-stuck');
  });

  it('detects stagnant-war but not an active long war', () => {
    const stagnant = series(160, round => [
      healthyCiv('ai-1', round, round >= 20
        ? { atWarWith: ['ai-2'], capturesMade: 0, capturesSuffered: 0, peaceEventsInvolvingCiv: 0 }
        : {}),
      healthyCiv('ai-2', round),
    ]);
    expect(codes(stagnant)).toContain('stagnant-war');

    const activeWar = series(160, round => [
      healthyCiv('ai-1', round, round >= 20
        ? {
            atWarWith: ['ai-2'],
            capturesMade: Math.floor((round - 20) / 15), // a capture every 15 rounds
            capturesSuffered: 0,
            peaceEventsInvolvingCiv: 0,
          }
        : {}),
      healthyCiv('ai-2', round),
    ]);
    expect(codes(activeWar)).not.toContain('stagnant-war');

    const negotiatedWar = series(160, round => [
      healthyCiv('ai-1', round, round >= 20
        ? {
            atWarWith: ['ai-2'],
            capturesMade: 0,
            capturesSuffered: 0,
            peaceEventsInvolvingCiv: Math.floor((round - 20) / 20), // keeps offering peace
          }
        : {}),
      healthyCiv('ai-2', round),
    ]);
    expect(codes(negotiatedWar)).not.toContain('stagnant-war');
  });

  it('detects eliminated-resurrection', () => {
    const samples = series(80, round => [
      healthyCiv('ai-1', round, round < 30
        ? {}
        : round < 60
          ? { cities: 0, units: 0, living: false, isEliminated: true }
          : { cities: 1, units: 1, living: false, isEliminated: true }), // resurrected!
    ]);
    expect(codes(samples)).toContain('eliminated-resurrection');
  });
});

describe('analyzeCampaign — observations', () => {
  it('reports round-work growth without ever making it a finding', () => {
    const samples = series(50, round => [healthyCiv('ai-1', round)], round => ({
      stateBytesBeforeRound: 100_000 * (1 + round), // wildly superlinear vs entity growth
      totalUnits: 3,
      totalCities: 1,
    }));
    const report = analyzeCampaign(samples, CONFIG);
    expect(report.observations.map(o => o.code)).toContain('round-work-blowup');
    expect(report.findings).toEqual([]);
  });
});

describe('analyzeCampaign — report shape', () => {
  it('summarises termination and per-civ end state', () => {
    const samples = series(40, round => [
      healthyCiv('ai-1', round),
      healthyCiv('ai-2', round, round >= 30 ? { living: false, isEliminated: true, cities: 0, units: 0 } : {}),
    ], round => (round === 39 ? { gameOver: true, winner: 'ai-1', gameOverReason: 'domination' } : {}));
    const report = analyzeCampaign(samples, CONFIG);
    expect(report.summary.terminated).toBe(true);
    expect(report.summary.winner).toBe('ai-1');
    expect(report.summary.eliminatedCivIdsAtEnd).toEqual(['ai-2']);
    expect(report.perCiv.find(c => c.civId === 'ai-1')!.living).toBe(true);
  });
});
