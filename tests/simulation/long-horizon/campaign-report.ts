/**
 * #1005 — build and write the campaign report artifacts.
 *
 * Two files per scenario, under the gitignored `.verification/` tree:
 *
 *  - `.verification/ai-long-horizon/<seed>.json` — DETERMINISTIC. Config,
 *    analysis report, and a decimated sample series. Sorted keys, trailing
 *    newline, and — enforced by `campaign-report.test.ts` — no wall-clock value,
 *    date, or filesystem path anywhere in it. Same seed ⇒ byte-identical file,
 *    so "did this change move the AI?" is answerable by diffing.
 *  - `.verification/ai-long-horizon/<seed>.timings.json` — machine-specific
 *    (`roundDurationsMs`, `elapsedMs`, node version, cpu count). NEVER asserted
 *    on; it exists for local human investigation only.
 *
 * `buildDeterministicArtifact` is pure (no IO) so the determinism test can
 * compare two runs' artifact objects without going near the disk.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import type { GameState } from '@/core/types';
import type { CampaignRoundSample } from '../campaign-sample';
import type { AICampaignResult } from '../ai-playability-fixture';
import { analyzeCampaign, type CampaignAnalysisConfig, type CampaignReport } from './campaign-analysis';

export interface LongHorizonScenario {
  seed: string;
  challenge: string;
  mapSize: string;
  humanCount: number;
  aiCount: number;
  turns: number;
  personalities: readonly string[];
  lateEra: boolean;
  stopOnGameOver: boolean;
}

export interface ScenarioRun {
  scenario: LongHorizonScenario;
  samples: readonly CampaignRoundSample[];
  termination: AICampaignResult['termination'];
  saveReloadRounds: readonly number[];
  timings: { roundDurationsMs: readonly number[]; elapsedMs: number };
  /** Final `GameState` — continuity tests only; never serialized into an artifact. */
  finalState: GameState;
}

interface DecimatedCivSample {
  civId: string;
  living: boolean;
  cities: number;
  population: number;
  units: number;
  completedTechs: number;
  civEra: number;
  gold: number;
  atWarWith: string[];
}

interface DecimatedSample {
  round: number;
  turn: number;
  era: number;
  gameOver: boolean;
  totalUnits: number;
  totalCities: number;
  civs: DecimatedCivSample[];
}

export interface DeterministicArtifact {
  scenario: LongHorizonScenario & { saveReloadRounds: number[] };
  termination: {
    reason: string;
    roundsCompleted: number;
    winner: string | null;
    gameOverReason: string | null;
  };
  report: CampaignReport;
  sampleSeries: DecimatedSample[];
}

/** Every 10th round plus the final round (deduplicated). */
export function decimateSamples(samples: readonly CampaignRoundSample[]): DecimatedSample[] {
  const chosen = new Map<number, CampaignRoundSample>();
  for (let i = 0; i < samples.length; i += 1) {
    if (i % 10 === 0 || i === samples.length - 1) chosen.set(i, samples[i]!);
  }
  return [...chosen.values()].map(sample => ({
    round: sample.round,
    turn: sample.turn,
    era: sample.era,
    gameOver: sample.gameOver,
    totalUnits: sample.totalUnits,
    totalCities: sample.totalCities,
    civs: sample.civs.map(civ => ({
      civId: civ.civId,
      living: civ.living,
      cities: civ.cities,
      population: civ.population,
      units: civ.units,
      completedTechs: civ.completedTechs,
      civEra: civ.civEra,
      gold: civ.gold,
      atWarWith: civ.atWarWith,
    })),
  }));
}

export function buildDeterministicArtifact(
  run: ScenarioRun,
  config?: CampaignAnalysisConfig,
): DeterministicArtifact {
  return {
    scenario: {
      ...run.scenario,
      personalities: [...run.scenario.personalities],
      saveReloadRounds: [...run.saveReloadRounds],
    },
    termination: {
      reason: run.termination.reason,
      roundsCompleted: run.termination.roundsCompleted,
      winner: run.termination.winner,
      gameOverReason: run.termination.gameOverReason,
    },
    report: analyzeCampaign(run.samples, config),
    sampleSeries: decimateSamples(run.samples),
  };
}

/** Recursively sort object keys so the serialization is stable across runs. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map(key => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function serializeDeterministicArtifact(artifact: DeterministicArtifact): string {
  return `${JSON.stringify(sortKeys(artifact), null, 2)}\n`;
}

export function writeCampaignArtifacts(
  verificationDir: string,
  run: ScenarioRun,
  config?: CampaignAnalysisConfig,
): { deterministicPath: string; timingsPath: string } {
  const dir = join(verificationDir, 'ai-long-horizon');
  mkdirSync(dir, { recursive: true });

  const deterministicPath = join(dir, `${run.scenario.seed}.json`);
  writeFileSync(
    deterministicPath,
    serializeDeterministicArtifact(buildDeterministicArtifact(run, config)),
  );

  const timingsPath = join(dir, `${run.scenario.seed}.timings.json`);
  writeFileSync(
    timingsPath,
    `${JSON.stringify({
      seed: run.scenario.seed,
      node: process.version,
      cpuCount: cpus().length,
      elapsedMs: Math.round(run.timings.elapsedMs),
      roundDurationsMs: run.timings.roundDurationsMs.map(ms => Math.round(ms)),
    }, null, 2)}\n`,
  );

  return { deterministicPath, timingsPath };
}
