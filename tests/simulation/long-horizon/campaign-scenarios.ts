/**
 * #1005 — the deterministic long-horizon scenario matrix and its runner.
 *
 * Bounded and deliberate: all three challenge tiers, all four AI personalities,
 * small / medium / large maps, solo and hot seat, and an early- and a late-era
 * start. Every scenario is a fixed seed, so `runScenario` is reproducible and
 * the report artifact it feeds is byte-stable per commit.
 *
 * Measured wall-clock (this workstation, per-round invariant battery on, full
 * matrix run 2026-09-09 on `main` + #985 MR4) is in the comment beside each row
 * — used to size `SCENARIO_TIMEOUT_MS`, never asserted. Whole matrix ≈ 19 min
 * sequential; Vitest runs the matrix and the continuity file concurrently.
 */
import type { AICampaignOptions, AIPersonality, AISimulationOptions } from '../ai-playability-fixture';
import { runAICampaign } from '../ai-playability-fixture';
import type { OpponentChallenge } from '@/core/types';
import type { CampaignRoundSample } from '../campaign-sample';
import type { LongHorizonScenario, ScenarioRun } from './campaign-report';

export const LONG_HORIZON_SCENARIOS: readonly LongHorizonScenario[] = [
  // measured 15.4s
  {
    seed: 'lh-explorer-small', challenge: 'explorer', mapSize: 'small',
    humanCount: 1, aiCount: 2, turns: 300,
    personalities: ['aggressive', 'diplomatic'], lateEra: false, stopOnGameOver: true,
  },
  // measured 19.4s
  {
    seed: 'lh-standard-small', challenge: 'standard', mapSize: 'small',
    humanCount: 1, aiCount: 2, turns: 300,
    personalities: ['expansionist', 'trader'], lateEra: false, stopOnGameOver: true,
  },
  // measured 18.4s
  {
    seed: 'lh-veteran-small', challenge: 'veteran', mapSize: 'small',
    humanCount: 1, aiCount: 3, turns: 300,
    personalities: ['aggressive', 'expansionist', 'trader'], lateEra: false, stopOnGameOver: true,
  },
  // measured 94.9s
  {
    seed: 'lh-standard-medium', challenge: 'standard', mapSize: 'medium',
    humanCount: 1, aiCount: 3, turns: 400,
    personalities: ['diplomatic', 'trader', 'expansionist'], lateEra: false, stopOnGameOver: true,
  },
  // measured 116.6s
  {
    seed: 'lh-veteran-medium', challenge: 'veteran', mapSize: 'medium',
    humanCount: 1, aiCount: 4, turns: 400,
    personalities: ['aggressive', 'diplomatic', 'expansionist', 'trader'],
    lateEra: false, stopOnGameOver: true,
  },
  // measured 166.7s
  {
    seed: 'lh-standard-large', challenge: 'standard', mapSize: 'large',
    humanCount: 1, aiCount: 4, turns: 300,
    personalities: ['aggressive', 'diplomatic', 'expansionist', 'trader'],
    lateEra: false, stopOnGameOver: true,
  },
  // measured 427.8s (matrix worst case)
  {
    seed: 'lh-veteran-large', challenge: 'veteran', mapSize: 'large',
    humanCount: 1, aiCount: 5, turns: 500,
    personalities: ['aggressive', 'diplomatic', 'expansionist', 'trader', 'aggressive'],
    lateEra: false, stopOnGameOver: true,
  },
  // measured 64.9s — hot seat
  {
    seed: 'lh-hotseat-medium', challenge: 'standard', mapSize: 'medium',
    humanCount: 2, aiCount: 2, turns: 300,
    personalities: ['aggressive', 'trader'], lateEra: false, stopOnGameOver: true,
  },
  // measured 223.6s — deterministic Era-9 start (250 turns, heavier per round)
  {
    seed: 'lh-late-era-medium', challenge: 'standard', mapSize: 'medium',
    humanCount: 1, aiCount: 3, turns: 250,
    personalities: ['aggressive', 'trader', 'diplomatic'], lateEra: true, stopOnGameOver: true,
  },
] as const;

export function scenarioBySeed(seed: string): LongHorizonScenario {
  const scenario = LONG_HORIZON_SCENARIOS.find(s => s.seed === seed);
  if (!scenario) throw new Error(`unknown long-horizon scenario: ${seed}`);
  return scenario;
}

function toCampaignOptions(
  scenario: LongHorizonScenario,
  extra: Partial<AICampaignOptions>,
): AICampaignOptions {
  const base: AISimulationOptions = {
    seed: scenario.seed,
    challenge: scenario.challenge as OpponentChallenge,
    turns: scenario.turns,
    mapSize: scenario.mapSize as AISimulationOptions['mapSize'],
    humanCount: scenario.humanCount,
    aiCount: scenario.aiCount,
    personalitySet: [...scenario.personalities] as AIPersonality[],
  };
  return {
    ...base,
    lateEra: scenario.lateEra,
    // The long-horizon Era-9 scenario is a campaign-observability run, not the
    // 20-turn force-composition probe: its analysis detectors watch the AI, so
    // the probe's terminal hard-throw assertions must not fire (no-op for every
    // non-lateEra scenario). See `AICampaignOptions.lateEraForceAssertions`.
    lateEraForceAssertions: false,
    stopOnGameOver: scenario.stopOnGameOver,
    ...extra,
  };
}

/** Run one scenario end to end, collecting its plain-data sample series. */
export function runScenario(
  scenario: LongHorizonScenario,
  extra: Partial<AICampaignOptions> = {},
): ScenarioRun {
  const samples: CampaignRoundSample[] = [];
  const result = runAICampaign(toCampaignOptions(scenario, {
    ...extra,
    observe: sample => {
      samples.push(sample);
      extra.observe?.(sample);
    },
  }));
  return {
    scenario,
    samples,
    termination: result.termination,
    saveReloadRounds: result.saveReloadRounds,
    timings: {
      roundDurationsMs: result.metrics.roundDurationsMs,
      elapsedMs: result.metrics.elapsedMs,
    },
    finalState: result.finalState,
  };
}

/** measured-worst (`lh-veteran-large`, 428s) x3 ≈ 1284s, rounded up, per .claude/rules/hooks-and-tooling.md */
export const SCENARIO_TIMEOUT_MS = 1_500_000;
