import { describe, expect, it } from 'vitest';
import type { GameState, OpponentChallenge } from '@/core/types';
import { createSpyFromUnit } from '@/systems/espionage-system';
import {
  runAICampaign,
  simulateAIRounds,
  simulateLateEraAIRounds,
  type AISimulationOptions,
} from './ai-playability-fixture';
import type { CampaignRoundSample } from './campaign-sample';

/**
 * #1693: hand the campaign an AI spy that is already in a mission-ready position.
 * Nothing here fabricates an event — the only thing seeded is state the AI could
 * have reached on its own, so the counters still come from the real AI turn.
 */
function seedMissionReadyAiSpy(state: GameState): GameState {
  const spyOwner = Object.values(state.civilizations)
    .filter(civ => !civ.isHuman)
    .map(civ => civ.id)
    .sort()[0]!;
  const spyCiv = state.civilizations[spyOwner]!;
  const target = Object.values(state.cities)
    .filter(city => city.owner !== spyOwner)
    .sort((left, right) => left.id.localeCompare(right.id))[0]!;
  spyCiv.techState.completed = [
    ...new Set([...spyCiv.techState.completed, 'espionage-scouting', 'espionage-informants']),
  ];
  const created = createSpyFromUnit(
    state.espionage![spyOwner]!, 'unit-1693-spy', spyOwner, 'spy_agent', 'seed-1693-campaign',
  );
  state.espionage![spyOwner] = {
    ...created.state,
    spies: {
      ...created.state.spies,
      'unit-1693-spy': {
        ...created.state.spies['unit-1693-spy']!,
        status: 'stationed',
        targetCivId: target.owner,
        targetCityId: target.id,
      },
    },
  };
  return state;
}

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

  // #1693: `spyMissionsStarted` is derived from `espionage:mission-started` — it is not a
  // second, end-of-round derivation. This drives one real AI turn whose only non-default
  // input is a mission-ready spy, so a zero here means the instrumentation missed a start
  // that actually happened.
  it('records an actual AI mission start in the campaign counters (#1693)', () => {
    const samples: CampaignRoundSample[] = [];
    const result = runAICampaign({
      seed: 'mission-metrics-1693',
      challenge: 'explorer',
      turns: 1,
      mapSize: 'small',
      humanCount: 1,
      aiCount: 2,
      personalitySet: ['diplomatic', 'trader'],
      observe: sample => samples.push(sample),
      prepareState: seedMissionReadyAiSpy,
    });

    const spyOwner = Object.values(result.finalState.civilizations)
      .filter(civ => !civ.isHuman)
      .map(civ => civ.id)
      .sort()[0]!;
    const mission = result.finalState.espionage![spyOwner]!.spies['unit-1693-spy']!.currentMission;
    expect(mission).not.toBeNull();

    expect(samples).toHaveLength(1);
    expect(samples[0]!.espionageEventCounts?.['mission-started']).toBe(1);
    const civSample = samples[0]!.civs.find(civ => civ.civId === spyOwner)!;
    expect(civSample.spyMissionsStarted).toBe(1);
    expect(civSample.spyMissionsStartedByType).toEqual({ [mission!.type]: 1 });
  }, 60_000);
});
