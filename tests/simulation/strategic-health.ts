/**
 * Strategic-health diagnostics for AI production (#1407 phase 4).
 *
 * ECONOMIC UTILIZATION ("was output wasted?") and STRATEGIC HEALTH ("is this civ still building toward anything?") are
 * independent questions and are reported separately: an empire that converts 100% of its output to gold for 200
 * rounds has zero waste and is still stagnant. Pure analysis of plain-data samples -- no clock, RNG, filesystem or
 * state access -- and a DIAGNOSTIC CATEGORY, never a gameplay change or a ratchet input (the long-horizon ratchet
 * does not consume it until Phase 5/6 calibrate it on full-length runs).
 *
 * Not measured here: candidate availability. Samples do not record the legal candidate set; distinguishing "research
 * available but misprioritised" from "candidate-generation gate" or "unmet force demand" needs that telemetry (a
 * Phase 6 root-cause trace per stalled case), so `actionable-stagnation` only says WHERE to look, not why.
 */
import type { CampaignCivSample, CampaignRoundSample } from './campaign-sample';
import {
  classifyProductionIdleState,
  FALLBACK_ONLY_STALL_MIN_ROUNDS,
  summarizeProductionContinuity,
  type ContinuityClassification,
} from './ai-production-continuity';

export type StrategicHealth =
  | 'productive'
  | 'converting-with-progress'
  | 'terminal-content-exhaustion'
  | 'actionable-stagnation';

export interface CivStrategicHealth {
  civId: string;
  health: StrategicHealth;
  /** The underlying continuity classification this health was derived from. */
  continuity: ContinuityClassification;
  /** Longest run of consecutive rounds where the civ produced output and applied none of it to construction. */
  longestNoConstructionRun: number;
  /** Σ converted (gold+science) / Σ produced over the whole run; 0 when nothing was produced or accounting is absent. */
  convertedShare: number;
  /** Σ discarded / Σ produced; independent of health. */
  discardedShare: number;
  /** Whether any sampled round of the civ carried exact accounting. */
  hasAccounting: boolean;
  /** Completed techs per 100 living rounds across the whole run. */
  techRatePer100: number;
  resumeEvents: number;
  /** Largest `maxPlanNoProgressRounds` seen while the longest no-construction run was in progress. */
  planNoProgressDuringRun: number;
}

/** True when the civ made no construction progress this round. Exact accounting wins over the queue snapshot. */
function noConstruction(row: CampaignCivSample): boolean {
  if (row.production) return row.production.produced > 0 && row.production.appliedToBuild + row.production.carriedOver === 0;
  const state = classifyProductionIdleState(row);
  return state === 'all-converting' || state === 'all-unconverted-empty';
}

export function summarizeStrategicHealth(
  samples: readonly CampaignRoundSample[],
  civIds?: readonly string[],
): CivStrategicHealth[] {
  const evidence = summarizeProductionContinuity(samples, civIds);
  return evidence.map(e => {
    const rows = samples.map(sample => sample.civs.find(civ => civ.civId === e.civId));
    let produced = 0;
    let converted = 0;
    let discarded = 0;
    let hasAccounting = false;
    let run = 0;
    let runPlan = 0;
    let longest = 0;
    let longestPlan = 0;
    let previousRound: number | undefined;
    let firstTechs: number | undefined;
    let lastTechs = 0;
    let livingRounds = 0;
    rows.forEach((row, index) => {
      const round = samples[index]!.round;
      const contiguous = previousRound !== undefined && round === previousRound + 1;
      previousRound = round;
      if (!row || !row.living || row.cities === 0) { run = 0; runPlan = 0; return; }
      livingRounds += 1;
      firstTechs ??= row.completedTechs;
      lastTechs = row.completedTechs;
      if (row.production) {
        hasAccounting = true;
        produced += row.production.produced;
        converted += row.production.convertedGold + row.production.convertedScience;
        discarded += row.production.discarded;
      }
      if (noConstruction(row)) {
        run = contiguous || run === 0 ? run + 1 : 1;
        runPlan = Math.max(run === 1 ? 0 : runPlan, row.maxPlanNoProgressRounds);
        if (run > longest) { longest = run; longestPlan = runPlan; }
      } else {
        run = 0;
        runPlan = 0;
      }
    });
    const stalled = longest >= FALLBACK_ONLY_STALL_MIN_ROUNDS;
    let health: StrategicHealth;
    switch (e.classification) {
      case 'terminal-conversion': health = 'terminal-content-exhaustion'; break;
      case 'stalled-fallback-only': health = 'actionable-stagnation'; break;
      case 'prolonged-with-progress': health = 'converting-with-progress'; break;
      default: health = stalled && e.classification !== 'no-fallback' ? 'converting-with-progress' : 'productive';
    }
    const share = (value: number) => (produced > 0 ? Math.round((value / produced) * 1000) / 1000 : 0);
    return {
      civId: e.civId,
      health,
      continuity: e.classification,
      longestNoConstructionRun: longest,
      convertedShare: share(converted),
      discardedShare: share(discarded),
      hasAccounting,
      techRatePer100: livingRounds > 1 && firstTechs !== undefined
        ? Math.round(((lastTechs - firstTechs) / livingRounds) * 1000) / 10
        : 0,
      resumeEvents: e.resumeEvents,
      planNoProgressDuringRun: longestPlan,
    };
  });
}
