/**
 * #1005 — the deterministic long-horizon scenario matrix and its runner.
 *
 * Bounded and deliberate: all three challenge tiers, all four AI personalities,
 * small / medium / large maps, solo and hot seat, and an early- and a late-era
 * start. Every scenario is a fixed seed, so `runScenario` is reproducible and
 * the report artifact it feeds is byte-stable per commit.
 *
 * Measured wall-clock (this workstation, per-round invariant battery on, full
 * matrix run 2026-09-09 on `main` + #985 MR4; `lh-veteran-large` re-measured for
 * #1094, see its row comment) is in the comment beside each row — used to size
 * `SCENARIO_TIMEOUT_MS`, never asserted. Whole matrix ≈ 19 min sequential pre-#1094,
 * ≈ 40 min as of #1094's AI gold-spending pass (attributable almost entirely to
 * `lh-veteran-large`'s own increase); Vitest runs the matrix and the continuity
 * file concurrently.
 *
 * #1125 investigated `lh-veteran-large`'s #1094-era increase directly: found and fixed
 * an exact, provable redundancy (`getRushBuyQuote` recomputing the whole-civ economy
 * projection once per producing city instead of once per round — see
 * `src/ai/ai-treasury.ts`), confirmed via direct instrumentation on a real (not
 * synthetic-fixture) campaign to reduce that specific computation by ~20%. That fix did
 * NOT measurably change `lh-veteran-large`'s own wall-clock (1567.3s measured post-fix
 * vs. the 1520s figure below — statistically indistinguishable) — the dominant driver of
 * this scenario's cost is a DIFFERENT, unrelated hotspot (`calculateCityYields` growing
 * super-linearly across a campaign, tracked separately as #1126). The 1520s figure below
 * remains the accurate current number; do not revise it down based on #1125's fix.
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
  // measured 1520s as of #1094 (matrix worst case; was 427.8s pre-#1094). #1094's AI
  // gold-spending fix (src/ai/ai-treasury.ts) calls getRushBuyQuote -- a real,
  // civ-wide economy projection -- once per actively-producing city, every round;
  // measured 1135.7s on unmodified pre-#1094 main vs 1500-1520s with the fix, a ~32%
  // genuine wall-clock increase from real new work, not noise (two isolated runs of
  // the fixed code independently landed in that range). See the #1094 PR for the
  // full attribution; do not "fix" this by suppressing the gold-spending pass.
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
  // #1107 -- mapSeed replaces the original literal seed, which produced a
  // 10-tile landmass for one AI civ (smaller than MIN_CITY_CENTER_DISTANCE,
  // mathematically un-recoverable) -- a genuine statistical outlier, not the
  // representative shape of the coastal-recovery bug class (0/25 alternate
  // seeds tried reproduced it). lh-1107-search-0 reproduces the same "coastal
  // territory, non-coastal city" shape on a genuinely recoverable 43-tile
  // landmass (civ ai-1). seed stays the stable label.
  {
    seed: 'lh-late-era-medium', mapSeed: 'lh-1107-search-0',
    challenge: 'standard', mapSize: 'medium',
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
    seed: scenario.mapSeed ?? scenario.seed,
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

/**
 * measured-worst (`lh-veteran-large`, 1520s as of #1094 -- see that row's comment)
 * x3 ~= 4560s, rounded up, per .claude/rules/hooks-and-tooling.md. Was 1_500_000
 * (428s x3) pre-#1094; #1094's AI gold-spending pass genuinely raised the worst-case
 * scenario's wall clock, it did not make the timeout itself flaky to fix.
 */
export const SCENARIO_TIMEOUT_MS = 4_800_000;
