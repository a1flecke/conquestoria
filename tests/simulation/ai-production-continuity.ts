/**
 * Fallback-only stagnation evidence for AI production (idle-production fallback arc).
 *
 * Positive gold or science output does not prove an AI is playing purposefully: a civ whose every city is converting
 * output with nothing queued is *surviving*, not building. This reduces a bounded run's per-round samples (plain data,
 * from `runAICampaign`'s `observe`) to compact per-civ evidence and a semantic classification. It is test evidence
 * only -- no runtime service, no persisted field, no wall-clock input.
 *
 * Definitions (all measured at round end, per city id):
 *  - wasted city-round: empty queue AND not converting, for the 2nd+ consecutive round end. One such round end is
 *    normal (the city finished something this round and the AI re-queues at the start of the next); two in a row means
 *    the AI pass left it neither building nor converting. Known residual: a cheap item queued and finished inside one
 *    turn (a worker/warrior in a populous city) also leaves the city empty at round end, so this slightly OVER-counts
 *    waste; it is an upper bound, never an undercount (verified on the baseline seed: every enqueue succeeded and the
 *    leftover rounds were one-turn worker/warrior completions).
 *  - converting city-round: empty queue with `idleProduction` gold/science.
 *  - resume: a city converting at one round end that holds a queue at the next.
 *  - fallback-only round (`all-converting`): the civ has cities and EVERY city is empty and converting. A civ where
 *    some empty cities convert and others do not is `mixed-converting-and-unconverted` (counted separately in
 *    `mixedRounds`), never fallback-only.
 *  - Streaks require consecutive sample rounds (`round` increasing by exactly 1); a gap, duplicate or missing civ
 *    row resets them, and a sample without city-id telemetry is `unknown` -- neither wasted nor converting.
 */
import type { CampaignRoundSample, CampaignCivSample } from './campaign-sample';

/** A fallback-only stretch shorter than this is ordinary temporary idleness. Measured baseline: <= 2 (60-round small campaign). */
export const FALLBACK_ONLY_STALL_MIN_ROUNDS = 10;

/** How a civ's cities stood at one round end. `unknown` = no city-id telemetry; it is never read as waste or conversion. */
export type ProductionIdleState =
  | 'unknown'
  | 'building'
  | 'all-converting'
  | 'mixed-converting-and-unconverted'
  | 'all-unconverted-empty';

/** The single classification of a civ-round, shared by the short continuity campaign and the long-horizon analyzer. */
export function classifyProductionIdleState(row: CampaignCivSample): ProductionIdleState {
  if (row.cities <= 0 || !row.emptyQueueCityIds || !row.convertingCityIds) return 'unknown';
  const empty = new Set(row.emptyQueueCityIds);
  if (empty.size < row.cities) return 'building';
  let converting = 0;
  for (const id of row.convertingCityIds) if (empty.has(id)) converting += 1;
  if (converting >= row.cities) return 'all-converting';
  return converting === 0 ? 'all-unconverted-empty' : 'mixed-converting-and-unconverted';
}

/**
 * A stretch of `length` rounds shows meaningful tech progress only at >= 1 completed tech per this many rounds. A
 * semantic bound (not calibrated on 200-500 round runs; Phase 6 of #1407 calibrates it), so one tech inside a
 * 200-round stretch no longer reads as healthy.
 */
export const STREAK_MIN_ROUNDS_PER_TECH = 20;

export type ContinuityClassification =
  | 'no-fallback'
  | 'healthy-temporary'
  | 'terminal-conversion'
  | 'prolonged-with-progress'
  | 'stalled-fallback-only';

export interface CivContinuityEvidence {
  civId: string;
  rounds: number;
  wastedCityRounds: number;
  convertingCityRounds: number;
  resumeEvents: number;
  fallbackOnlyRounds: number;
  /** Round ends where some empty cities convert and others do not (not fallback-only). */
  mixedRounds: number;
  /** Round ends where no city holds a queue and none converts. */
  allUnconvertedRounds: number;
  /** Round ends with no usable city-id telemetry. */
  unknownRounds: number;
  longestFallbackOnlyStreak: number;
  /** Techs per 100 rounds across the longest fallback-only streak (0 when there is none). */
  streakTechRatePer100: number;
  /** Progress made across the longest fallback-only streak (start of streak -> its last round). */
  streakTechsGained: number;
  streakCitiesGained: number;
  streakEraGained: number;
  /** Whether any research remained when the longest streak ended. */
  researchRemainedAtStreakEnd: boolean;
  classification: ContinuityClassification;
}

interface StreakWindow { start: number; end: number }

function civRow(sample: CampaignRoundSample, civId: string): CampaignCivSample | undefined {
  return sample.civs.find(civ => civ.civId === civId);
}

function classify(e: Omit<CivContinuityEvidence, 'classification'>): ContinuityClassification {
  if (e.convertingCityRounds === 0) return 'no-fallback';
  if (e.longestFallbackOnlyStreak < FALLBACK_ONLY_STALL_MIN_ROUNDS) return 'healthy-temporary';
  if (!e.researchRemainedAtStreakEnd) return 'terminal-conversion';
  const techsRequired = Math.ceil(e.longestFallbackOnlyStreak / STREAK_MIN_ROUNDS_PER_TECH);
  const progressed = e.streakTechsGained >= techsRequired || e.streakCitiesGained > 0 || e.streakEraGained > 0;
  return progressed ? 'prolonged-with-progress' : 'stalled-fallback-only';
}

export function summarizeProductionContinuity(
  samples: readonly CampaignRoundSample[],
  civIds?: readonly string[],
): CivContinuityEvidence[] {
  const ids = civIds ?? [...new Set(samples.flatMap(s => s.civs.filter(c => !c.isHuman && c.living).map(c => c.civId)))].sort();
  return ids.map(civId => {
    let wasted = 0;
    let converting = 0;
    let resumes = 0;
    let fallbackOnly = 0;
    let mixed = 0;
    let allUnconverted = 0;
    let unknown = 0;
    let streak = 0;
    let best: StreakWindow = { start: 0, end: -1 };
    let current: StreakWindow = { start: 0, end: -1 };
    let longest = 0;
    let previousEmpty = new Set<string>();
    let previousConverting = new Set<string>();
    let previousCities = 0;
    let previousRound: number | undefined;
    const rows: Array<CampaignCivSample | undefined> = samples.map(s => civRow(s, civId));

    const resetContinuity = () => {
      streak = 0;
      previousEmpty = new Set();
      previousConverting = new Set();
      previousCities = 0;
    };

    rows.forEach((row, index) => {
      const round = samples[index]!.round;
      const contiguous = previousRound !== undefined && round === previousRound + 1;
      if (previousRound !== undefined && round <= previousRound) return; // duplicate / out-of-order sample: ignore
      previousRound = round;
      if (!row || !row.living || row.cities === 0) {
        resetContinuity();
        return;
      }
      if (!contiguous) resetContinuity();
      const state = classifyProductionIdleState(row);
      if (state === 'unknown') {
        unknown += 1;
        resetContinuity();
        return;
      }
      const empty = new Set(row.emptyQueueCityIds);
      const conv = new Set(row.convertingCityIds);
      for (const id of empty) {
        if (conv.has(id)) converting += 1;
        else if (previousEmpty.has(id) && !previousConverting.has(id)) wasted += 1;
      }
      // A converting city that vanished from the empty set resumed building -- unless the civ lost cities, in which
      // case up to that many disappearances are captures/razes, not resumes.
      let missing = 0;
      for (const id of previousConverting) if (!empty.has(id)) missing += 1;
      resumes += Math.max(0, missing - Math.max(0, previousCities - row.cities));
      if (state === 'mixed-converting-and-unconverted') mixed += 1;
      if (state === 'all-unconverted-empty') allUnconverted += 1;
      if (state === 'all-converting') {
        fallbackOnly += 1;
        if (streak === 0) current = { start: index, end: index };
        streak += 1;
        current.end = index;
        if (streak > longest) { longest = streak; best = { ...current }; }
      } else {
        streak = 0;
      }
      previousEmpty = empty;
      previousConverting = conv;
      previousCities = row.cities;
    });

    const first = best.end >= 0 ? rows[best.start] : undefined;
    const last = best.end >= 0 ? rows[best.end] : undefined;
    const base = {
      civId,
      rounds: samples.length,
      wastedCityRounds: wasted,
      convertingCityRounds: converting,
      resumeEvents: resumes,
      fallbackOnlyRounds: fallbackOnly,
      mixedRounds: mixed,
      allUnconvertedRounds: allUnconverted,
      unknownRounds: unknown,
      longestFallbackOnlyStreak: longest,
      streakTechRatePer100: longest > 0 && first && last
        ? Math.round(((last.completedTechs - first.completedTechs) / longest) * 1000) / 10
        : 0,
      streakTechsGained: first && last ? last.completedTechs - first.completedTechs : 0,
      streakCitiesGained: first && last ? last.cities - first.cities : 0,
      streakEraGained: first && last ? last.civEra - first.civEra : 0,
      researchRemainedAtStreakEnd: last ? last.hasCurrentResearch || last.availableTechCount > 0 : false,
    };
    return { ...base, classification: classify(base) };
  });
}

export function formatContinuityReport(label: string, evidence: readonly CivContinuityEvidence[]): string {
  const header = 'civ | wasted | converting | resumes | fbOnlyRounds | longestStreak | +techs | +cities | class';
  const lines = evidence.map(e => [
    e.civId, e.wastedCityRounds, e.convertingCityRounds, e.resumeEvents, e.fallbackOnlyRounds,
    e.longestFallbackOnlyStreak, e.streakTechsGained, e.streakCitiesGained, e.classification,
  ].join(' | '));
  return [`[${label}]`, header, ...lines].join('\n');
}
