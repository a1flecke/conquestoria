import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import type { CampaignRoundSample } from '../campaign-sample';
import {
  buildDeterministicArtifact,
  decimateSamples,
  serializeDeterministicArtifact,
  type ScenarioRun,
} from './campaign-report';

/**
 * #1005 design-review fix (1): the deterministic report artifact must never
 * carry a wall-clock value, a date, or a filesystem path — otherwise two runs
 * on the same commit stop being byte-identical and the artifact is useless for
 * diffing. This proves the builder keeps the machine-specific data out.
 */

function sample(round: number): CampaignRoundSample {
  return {
    round,
    turn: round + 1,
    era: 1 + Math.floor(round / 50),
    gameOver: false,
    winner: null,
    gameOverReason: null,
    minorCivCount: 3,
    barbarianCampCount: 2,
    totalUnits: 6 + round,
    totalCities: 4 + Math.floor(round / 20),
    stateBytesBeforeRound: 300_000 + round * 400,
    planProgressTransitions: round,
    civs: [
      {
        civId: 'ai-1',
        isHuman: false,
        isEliminated: false,
        living: true,
        cities: 1 + Math.floor(round / 30),
        population: 4 + round,
        units: 2 + Math.floor(round / 15),
        settlers: 0,
        workers: 1,
        completedTechs: Math.floor(round / 5),
        civEra: 1,
        hasCurrentResearch: true,
        availableTechCount: 20,
        gold: 50 + (round % 6) * 20,
        citiesWithEmptyQueue: 0,
        atWarWith: round > 10 ? ['ai-2'] : [],
        activePlanCount: 1,
        maxPlanNoProgressRounds: round % 3,
        capturesMade: 0,
        capturesSuffered: 0,
        peaceEventsInvolvingCiv: 0,
        warDeclarationsInvolvingCiv: round > 10 ? 1 : 0,
      },
    ],
  };
}

function run(rounds: number): ScenarioRun {
  const samples = Array.from({ length: rounds }, (_, i) => sample(i));
  return {
    scenario: {
      seed: 'lh-test',
      challenge: 'standard',
      mapSize: 'small',
      humanCount: 1,
      aiCount: 1,
      turns: rounds,
      personalities: ['aggressive'],
      lateEra: false,
      stopOnGameOver: true,
    },
    samples,
    termination: { reason: 'turn-cap', roundsCompleted: rounds, winner: null, gameOverReason: null },
    saveReloadRounds: [],
    timings: { roundDurationsMs: [1, 2, 3], elapsedMs: 999 },
    finalState: {} as GameState,
  };
}

describe('campaign report artifact', () => {
  it('contains no wall-clock, date or path data', () => {
    const serialized = serializeDeterministicArtifact(buildDeterministicArtifact(run(60)));
    const parsed = JSON.parse(serialized) as unknown;

    const forbiddenKey = /(ms|Ms)$|elapsed|duration|timestamp|date|path|cwd/i;
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          expect(forbiddenKey.test(key), `forbidden key "${key}" at ${path}`).toBe(false);
          walk(child, `${path}.${key}`);
        }
      }
    };
    walk(parsed, '$');

    // No absolute filesystem paths anywhere in the serialized text.
    expect(serialized).not.toMatch(/\/(Users|home)\//);
    expect(serialized).not.toMatch(/[A-Za-z]:\\\\/);
    // No node version / cpu leak.
    expect(serialized).not.toContain(process.version);
  });

  it('serializes with recursively sorted keys and a trailing newline', () => {
    const serialized = serializeDeterministicArtifact(buildDeterministicArtifact(run(40)));
    expect(serialized.endsWith('}\n')).toBe(true);

    const topKeys = Object.keys(JSON.parse(serialized) as Record<string, unknown>);
    expect(topKeys).toEqual([...topKeys].sort());
  });

  it('is byte-identical for identical input (determinism of the builder itself)', () => {
    const a = serializeDeterministicArtifact(buildDeterministicArtifact(run(50)));
    const b = serializeDeterministicArtifact(buildDeterministicArtifact(run(50)));
    expect(a).toBe(b);
  });

  it('decimates to every 10th round plus the last', () => {
    const samples = Array.from({ length: 47 }, (_, i) => sample(i));
    const decimated = decimateSamples(samples);
    expect(decimated.map(s => s.round)).toEqual([0, 10, 20, 30, 40, 46]);
  });

  it('records save/reload rounds and termination in the artifact', () => {
    const base = run(30);
    const artifact = buildDeterministicArtifact({ ...base, saveReloadRounds: [15] });
    expect(artifact.scenario.saveReloadRounds).toEqual([15]);
    expect(artifact.termination.reason).toBe('turn-cap');
  });
});
