import { describe, expect, it } from 'vitest';
import type { OpponentChallenge } from '@/core/types';
import {
  simulateAIRounds,
  simulateLateEraAIRounds,
  type AISimulationOptions,
} from './ai-playability-fixture';

const SHORT_SCENARIOS: AISimulationOptions[] = [
  {
    seed: 'playability-a',
    challenge: 'explorer',
    turns: 30,
    mapSize: 'small',
    humanCount: 1,
    aiCount: 2,
    personalitySet: ['aggressive', 'diplomatic'],
  },
  {
    seed: 'playability-b',
    challenge: 'standard',
    turns: 30,
    mapSize: 'small',
    humanCount: 1,
    aiCount: 2,
    personalitySet: ['expansionist', 'trader'],
  },
  {
    seed: 'playability-c',
    challenge: 'veteran',
    turns: 30,
    mapSize: 'small',
    humanCount: 1,
    aiCount: 2,
    personalitySet: ['aggressive', 'expansionist'],
  },
  {
    seed: 'playability-d',
    challenge: 'explorer',
    turns: 30,
    mapSize: 'small',
    humanCount: 1,
    aiCount: 2,
    personalitySet: ['diplomatic', 'trader'],
  },
  {
    seed: 'playability-e',
    challenge: 'standard',
    turns: 30,
    mapSize: 'small',
    humanCount: 2,
    aiCount: 1,
    personalitySet: ['aggressive'],
  },
  {
    seed: 'playability-f',
    challenge: 'veteran',
    turns: 30,
    mapSize: 'small',
    humanCount: 2,
    aiCount: 1,
    personalitySet: ['trader'],
  },
];

function extendedScenarios(): AISimulationOptions[] {
  const challenges: OpponentChallenge[] = ['explorer', 'standard', 'veteran'];
  return Array.from({ length: 30 }, (_, index) => ({
    seed: `playability-extended-${String(index + 1).padStart(2, '0')}`,
    challenge: challenges[index % challenges.length]!,
    turns: 60,
    mapSize: index < 12 ? 'small' : index < 24 ? 'medium' : 'large',
    humanCount: index < 24 ? 1 : 3,
    aiCount: index < 24 ? 2 : 1,
    personalitySet: [
      ['aggressive', 'diplomatic', 'expansionist', 'trader'][index % 4]!,
      ['trader', 'expansionist', 'diplomatic', 'aggressive'][index % 4]!,
    ].slice(0, index < 24 ? 2 : 1) as AISimulationOptions['personalitySet'],
  }));
}

describe('purposeful AI playability simulation', () => {
  const scenarios = process.env.AI_SIM_EXTENDED === '1'
    ? extendedScenarios()
    : SHORT_SCENARIOS;

  it.each(scenarios)(
    '$seed completes bounded production rounds without violating strategic invariants',
    options => {
      const metrics = simulateAIRounds(options);

      expect(metrics.turns).toBe(options.turns);
      expect(metrics.maxObjectiveCandidatesPerActor).toBeLessThanOrEqual(12);
      expect(metrics.maxPathQueriesPerActor).toBeLessThanOrEqual(24);
      expect(metrics.roundDurationsMs).toHaveLength(options.turns);
      expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(Object.values(metrics.maxIndependentThreatsByHuman))
        .toHaveLength(options.humanCount);

      console.info(JSON.stringify({
        scenario: options.seed,
        challenge: options.challenge,
        mapSize: options.mapSize,
        captures: metrics.cityCaptures,
        campsResolved: metrics.campsResolved,
        pirateRaids: metrics.pirateRaids,
        planProgress: metrics.planProgressTransitions,
        warningLead: metrics.visibleWarningLeadRounds,
        modernShare: metrics.modernUnitShareByCiv,
        maxThreats: metrics.maxIndependentThreatsByHuman,
        elapsedMs: Math.round(metrics.elapsedMs),
      }));
    },
    120_000,
  );

  it('keeps a viable modern mixed force in the deterministic Era 9 fixture', () => {
    const metrics = simulateLateEraAIRounds({
      seed: 'playability-era-9',
      challenge: 'standard',
      turns: 20,
      mapSize: 'small',
      humanCount: 1,
      aiCount: 2,
      personalitySet: ['aggressive', 'trader'],
    });

    for (const share of Object.values(metrics.modernUnitShareByCiv)) {
      expect(share).toBeGreaterThanOrEqual(0.6);
    }
    for (const era of Object.values(metrics.eraByCiv)) {
      expect(era).toBeGreaterThanOrEqual(9);
    }
  }, 120_000);
});
