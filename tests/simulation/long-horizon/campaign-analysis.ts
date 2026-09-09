/**
 * #1005 — pure analysis of a long-horizon campaign.
 *
 * `analyzeCampaign` takes the plain-data `CampaignRoundSample[]` a campaign
 * produced and returns liveness / progress / envelope findings. It reads NOTHING
 * but the samples — no `GameState`, no clock, no filesystem — so:
 *
 *  - the same samples always yield the same report (the deterministic artifact
 *    is built from this), and
 *  - every detector can be unit-tested against a hand-built synthetic series,
 *    which is how the "an injected stall is detected" regression works without a
 *    single test-only hook in production code.
 *
 * Thresholds live in `DEFAULT_CAMPAIGN_ANALYSIS_CONFIG`. Each was measured
 * against `main`'s own campaign output and then given headroom — the measured
 * value and the multiplier are in the comment beside it. A detector that would
 * need a *different* threshold per challenge tier is a wrong detector: fix the
 * detector, never fork the threshold.
 */
import type { CampaignRoundSample, CampaignCivSample } from '../campaign-sample';

export type CampaignFindingCode =
  | 'no-research-choice'
  | 'production-idle'
  | 'tech-frozen'
  | 'expansion-frozen'
  | 'gold-hoard'
  | 'unit-count-runaway'
  | 'plan-stuck'
  | 'stagnant-war'
  | 'eliminated-resurrection';

export interface CampaignFinding {
  code: CampaignFindingCode;
  civId?: string;
  detail: string;
  firstRound: number;
  lastRound: number;
}

export interface CampaignObservation {
  code: string;
  detail: string;
}

export interface CampaignAnalysisConfig {
  /** consecutive rounds a living AI civ may sit with no research selected while techs are available */
  noResearchChoiceRounds: number;
  /** consecutive rounds every one of a living AI civ's cities may hold an empty production queue */
  productionIdleRounds: number;
  /** consecutive rounds a living AI civ may complete no technology while research is available */
  techFrozenRounds: number;
  /** consecutive strictly-non-decreasing-gold rounds tolerated... */
  goldHoardRounds: number;
  /** ...if gold also rose by at least this much across that window (both conditions required) */
  goldHoardAbsoluteRise: number;
  /** end-of-campaign unit-count growth (over first living round) that counts as a runaway force, when city count never grew */
  unitRunawayGrowthWithFlatCities: number;
  /** a single round's max plan-no-progress span that counts as a wedged plan */
  planStuckRounds: number;
  /** consecutive rounds of an unchanged non-empty war set with no capture and no peace event */
  stagnantWarRounds: number;
  /** super-linear round-work growth ratio worth an (informational) observation */
  roundWorkGrowthObservationRatio: number;
}

export const DEFAULT_CAMPAIGN_ANALYSIS_CONFIG: CampaignAnalysisConfig = {
  // Measured on main: a healthy AI never sits >1 round without research once it
  // has a city. 6 = generous (should be structurally impossible past turn ~3).
  noResearchChoiceRounds: 6,
  // Measured over the full 9-scenario matrix on main: a plan-driven AI's
  // all-cities-idle streak stays in the low single digits; 12 = comfortable
  // headroom. (The F1-stalled AI on main idles 67-172 rounds — this fires on it.)
  productionIdleRounds: 12,
  // Measured over the full matrix: the longest gap between completed techs for a
  // living AI with research available was under 45 rounds. 70 keeps a real
  // headroom while still catching a permanent research halt. Never fired on main.
  techFrozenRounds: 70,
  // Measured on main F1 case: gold rose from 22 to ~2900 across ~240 rounds,
  // never decreasing. A healthy AI's gold oscillates as it buys. 60 consecutive
  // non-decreasing rounds AND a >600 rise together is a strong "not spending".
  goldHoardRounds: 60,
  goldHoardAbsoluteRise: 600,
  // Measured over the full matrix: an F1-stalled AI on small/medium/large keeps
  // 1-2 units all game (Δ ~1). Only `lh-late-era-medium` runs away — every Era-9
  // AI ends 30-77 units above its first living round while never founding a 2nd
  // city (F3). 25 sits far above the healthy Δ and far below the runaway Δ.
  unitRunawayGrowthWithFlatCities: 25,
  // The fixture's own assertPlanInvariants already throws past expiry+1; a
  // 20-round no-progress span is well inside that and still clearly wedged.
  planStuckRounds: 20,
  // A 40-round war with zero captures either way, an unchanged war set and no
  // peace-requested/peace-made event is stagnation, not a legitimate long war.
  stagnantWarRounds: 40,
  // Informational only — #1007 owns real budgets. Flag >3x work growth for a 2x
  // entity growth.
  roundWorkGrowthObservationRatio: 3,
};

export interface CampaignReport {
  summary: {
    rounds: number;
    firstTurn: number;
    lastTurn: number;
    lastEra: number;
    terminated: boolean;
    winner: string | null;
    gameOverReason: string | null;
    livingCivIdsAtEnd: string[];
    eliminatedCivIdsAtEnd: string[];
  };
  // Per-civ END state (the whole block is "at end", so no `AtEnd` suffixes).
  perCiv: Array<{
    civId: string;
    isHuman: boolean;
    living: boolean;
    eliminated: boolean;
    cities: number;
    population: number;
    units: number;
    completedTechs: number;
    civEra: number;
    gold: number;
    capturesMade: number;
    capturesSuffered: number;
    peaceEventsInvolvingCiv: number;
    warDeclarationsInvolvingCiv: number;
    maxPlanNoProgressRounds: number;
  }>;
  findings: CampaignFinding[];
  observations: CampaignObservation[];
}

type CivSeries = { civId: string; isHuman: boolean; rows: CampaignCivSample[]; rounds: number[] };

function perCivSeries(samples: readonly CampaignRoundSample[]): CivSeries[] {
  const byCiv = new Map<string, CivSeries>();
  for (const sample of samples) {
    for (const civ of sample.civs) {
      let series = byCiv.get(civ.civId);
      if (!series) {
        series = { civId: civ.civId, isHuman: civ.isHuman, rows: [], rounds: [] };
        byCiv.set(civ.civId, series);
      }
      series.rows.push(civ);
      series.rounds.push(sample.round);
    }
  }
  return [...byCiv.values()].sort((a, b) => a.civId.localeCompare(b.civId));
}

/**
 * Longest run of consecutive indices `[i, j]` where `predicate(row)` holds for
 * every row in the run. Returns `null` if no run reaches `minLength`.
 */
function longestRun(
  series: CivSeries,
  minLength: number,
  predicate: (row: CampaignCivSample, index: number) => boolean,
): { firstRound: number; lastRound: number; length: number } | null {
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let i = 0; i < series.rows.length; i += 1) {
    if (predicate(series.rows[i]!, i)) {
      if (runStart === -1) runStart = i;
      const len = i - runStart + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
    }
  }
  if (bestLen < minLength) return null;
  return {
    firstRound: series.rounds[bestStart]!,
    lastRound: series.rounds[bestStart + bestLen - 1]!,
    length: bestLen,
  };
}

function activeAiRow(row: CampaignCivSample): boolean {
  return !row.isHuman && row.living && !row.isEliminated;
}

function detectNoResearchChoice(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    const run = longestRun(civ, config.noResearchChoiceRounds, row =>
      activeAiRow(row) && row.cities > 0 && !row.hasCurrentResearch && row.availableTechCount > 0);
    if (run) {
      findings.push({
        code: 'no-research-choice',
        civId: civ.civId,
        detail: `no research selected for ${run.length} consecutive rounds with techs available`,
        firstRound: run.firstRound,
        lastRound: run.lastRound,
      });
    }
  }
  return findings;
}

function detectProductionIdle(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    const run = longestRun(civ, config.productionIdleRounds, row =>
      activeAiRow(row) && row.cities > 0 && row.citiesWithEmptyQueue >= row.cities);
    if (run) {
      findings.push({
        code: 'production-idle',
        civId: civ.civId,
        detail: `every city idle for ${run.length} consecutive rounds`,
        firstRound: run.firstRound,
        lastRound: run.lastRound,
      });
    }
  }
  return findings;
}

/**
 * `tech-frozen`: a living AI civ completes NO technology for a long run while it
 * still has research available. Deliberately NOT a `population-frozen` twin — a
 * one-city city legitimately sits at its population ceiling for a long time, and
 * there is no sample-derivable "this civ has room to grow" gate, so a frozen
 * population is not on its own a bug. `availableTechCount > 0` is exactly that
 * gate for research.
 */
function detectTechFrozen(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    let anchorIndex = -1;
    let anchorValue = Number.NaN;
    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < civ.rows.length; i += 1) {
      const row = civ.rows[i]!;
      const hasRoomToTech = row.availableTechCount > 0 || row.hasCurrentResearch;
      if (!activeAiRow(row) || !hasRoomToTech) {
        anchorIndex = -1;
        continue;
      }
      if (anchorIndex === -1 || row.completedTechs !== anchorValue) {
        anchorIndex = i;
        anchorValue = row.completedTechs;
        continue;
      }
      const len = i - anchorIndex + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = anchorIndex;
      }
    }
    if (bestLen >= config.techFrozenRounds) {
      findings.push({
        code: 'tech-frozen',
        civId: civ.civId,
        detail: `completed-tech count held at ${civ.rows[bestStart]!.completedTechs} for ${bestLen} rounds`,
        firstRound: civ.rounds[bestStart]!,
        lastRound: civ.rounds[bestStart + bestLen - 1]!,
      });
    }
  }
  return findings;
}

function detectExpansionFrozen(series: CivSeries[]): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    const activeRows = civ.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => activeAiRow(row));
    if (activeRows.length < 2) continue;
    const startCities = activeRows[0]!.row.cities;
    const everGrew = activeRows.some(({ row }) => row.cities > startCities);
    // Only a signal if the civ actually survived a long stretch — a civ wiped
    // out early legitimately never expanded.
    if (!everGrew && activeRows.length >= 40) {
      findings.push({
        code: 'expansion-frozen',
        civId: civ.civId,
        detail: `city count never rose above ${startCities} across ${activeRows.length} living rounds`,
        firstRound: civ.rounds[activeRows[0]!.index]!,
        lastRound: civ.rounds[activeRows[activeRows.length - 1]!.index]!,
      });
    }
  }
  return findings;
}

/**
 * `unit-count-runaway`: a living AI civ that ENDS the campaign with far more
 * units than it started, while its city count never grew. A sane civ's army
 * scales with its cities/economy; a lone-city civ accumulating a 30-80 unit
 * stack it never expanded to support is a spawn/economy bug (late-game work
 * blowup, `#1005`'s stated target). Distinct from `expansion-frozen` (which is
 * about cities not growing) — a civ can be expansion-frozen with 1 unit.
 */
function detectUnitCountRunaway(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    const activeRows = civ.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => activeAiRow(row));
    if (activeRows.length < 40) continue;
    const first = activeRows[0]!.row;
    const lastEntry = activeRows[activeRows.length - 1]!;
    const citiesEverGrew = activeRows.some(({ row }) => row.cities > first.cities);
    const unitGrowth = lastEntry.row.units - first.units;
    if (!citiesEverGrew && unitGrowth >= config.unitRunawayGrowthWithFlatCities) {
      findings.push({
        code: 'unit-count-runaway',
        civId: civ.civId,
        detail: `units grew from ${first.units} to ${lastEntry.row.units} `
          + `while city count stayed at ${first.cities}`,
        firstRound: civ.rounds[activeRows[0]!.index]!,
        lastRound: civ.rounds[lastEntry.index]!,
      });
    }
  }
  return findings;
}

function detectGoldHoard(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    let runStart = -1;
    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < civ.rows.length; i += 1) {
      const row = civ.rows[i]!;
      const prev = i > 0 ? civ.rows[i - 1]! : null;
      const nonDecreasing = activeAiRow(row) && prev !== null && activeAiRow(prev)
        && row.gold >= prev.gold;
      if (nonDecreasing) {
        if (runStart === -1) runStart = i - 1;
        const len = i - runStart + 1;
        if (len > bestLen) {
          bestLen = len;
          bestStart = runStart;
        }
      } else {
        runStart = -1;
      }
    }
    if (bestLen >= config.goldHoardRounds) {
      const rise = civ.rows[bestStart + bestLen - 1]!.gold - civ.rows[bestStart]!.gold;
      if (rise >= config.goldHoardAbsoluteRise) {
        findings.push({
          code: 'gold-hoard',
          civId: civ.civId,
          detail: `gold never fell across ${bestLen} rounds and rose by ${rise}`,
          firstRound: civ.rounds[bestStart]!,
          lastRound: civ.rounds[bestStart + bestLen - 1]!,
        });
      }
    }
  }
  return findings;
}

function detectPlanStuck(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    let firstRound = -1;
    let lastRound = -1;
    let worst = 0;
    for (let i = 0; i < civ.rows.length; i += 1) {
      const row = civ.rows[i]!;
      if (activeAiRow(row) && row.maxPlanNoProgressRounds > config.planStuckRounds) {
        if (firstRound === -1) firstRound = civ.rounds[i]!;
        lastRound = civ.rounds[i]!;
        worst = Math.max(worst, row.maxPlanNoProgressRounds);
      }
    }
    if (firstRound !== -1) {
      findings.push({
        code: 'plan-stuck',
        civId: civ.civId,
        detail: `a plan sat ${worst} rounds without progress`,
        firstRound,
        lastRound,
      });
    }
  }
  return findings;
}

function detectStagnantWar(
  series: CivSeries[],
  config: CampaignAnalysisConfig,
): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    if (civ.isHuman) continue;
    let runStart = -1;
    let bestStart = -1;
    let bestLen = 0;
    let bestKey = '';
    for (let i = 0; i < civ.rows.length; i += 1) {
      const row = civ.rows[i]!;
      const start = runStart === -1 ? null : civ.rows[runStart]!;
      const continues = activeAiRow(row)
        && row.atWarWith.length > 0
        && start !== null
        && row.atWarWith.join(',') === start.atWarWith.join(',')
        && row.capturesMade === start.capturesMade
        && row.capturesSuffered === start.capturesSuffered
        && row.peaceEventsInvolvingCiv === start.peaceEventsInvolvingCiv;
      if (runStart !== -1 && continues) {
        const len = i - runStart + 1;
        if (len > bestLen) {
          bestLen = len;
          bestStart = runStart;
          bestKey = start!.atWarWith.join(', ');
        }
      } else if (activeAiRow(row) && row.atWarWith.length > 0) {
        runStart = i;
      } else {
        runStart = -1;
      }
    }
    if (bestLen >= config.stagnantWarRounds) {
      findings.push({
        code: 'stagnant-war',
        civId: civ.civId,
        detail: `at war with ${bestKey} for ${bestLen} rounds with no capture, no war-set change and no peace event`,
        firstRound: civ.rounds[bestStart]!,
        lastRound: civ.rounds[bestStart + bestLen - 1]!,
      });
    }
  }
  return findings;
}

function detectEliminatedResurrection(series: CivSeries[]): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  for (const civ of series) {
    let eliminatedAt = -1;
    for (let i = 0; i < civ.rows.length; i += 1) {
      const row = civ.rows[i]!;
      if (row.isEliminated && eliminatedAt === -1) eliminatedAt = i;
      if (eliminatedAt !== -1 && (row.cities > 0 || row.units > 0)) {
        findings.push({
          code: 'eliminated-resurrection',
          civId: civ.civId,
          detail: `regained ${row.cities} cities / ${row.units} units after elimination`,
          firstRound: civ.rounds[eliminatedAt]!,
          lastRound: civ.rounds[i]!,
        });
        break;
      }
    }
  }
  return findings;
}

function roundWorkObservations(
  samples: readonly CampaignRoundSample[],
  config: CampaignAnalysisConfig,
): CampaignObservation[] {
  if (samples.length < 20) return [];
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const entityGrowth = (last.totalUnits + last.totalCities)
    / Math.max(1, first.totalUnits + first.totalCities);
  const byteGrowth = last.stateBytesBeforeRound / Math.max(1, first.stateBytesBeforeRound);
  const observations: CampaignObservation[] = [
    {
      code: 'round-work-growth',
      detail: `entities x${entityGrowth.toFixed(2)}, state bytes x${byteGrowth.toFixed(2)} `
        + `over ${samples.length} samples`,
    },
  ];
  // Divide by max(entityGrowth, 1): if entities did not grow at all, a ballooning
  // state is the worst case, not an excused one.
  if (byteGrowth / Math.max(entityGrowth, 1) > config.roundWorkGrowthObservationRatio) {
    observations.push({
      code: 'round-work-blowup',
      detail: `state grew x${byteGrowth.toFixed(2)} for only x${entityGrowth.toFixed(2)} entities `
        + '— investigate for #1007',
    });
  }
  return observations;
}

export function analyzeCampaign(
  samples: readonly CampaignRoundSample[],
  config: CampaignAnalysisConfig = DEFAULT_CAMPAIGN_ANALYSIS_CONFIG,
): CampaignReport {
  if (samples.length === 0) {
    throw new Error('analyzeCampaign: no samples');
  }
  const series = perCivSeries(samples);
  const last = samples[samples.length - 1]!;
  const first = samples[0]!;

  const findings: CampaignFinding[] = [
    ...detectNoResearchChoice(series, config),
    ...detectProductionIdle(series, config),
    ...detectTechFrozen(series, config),
    ...detectExpansionFrozen(series),
    ...detectGoldHoard(series, config),
    ...detectUnitCountRunaway(series, config),
    ...detectPlanStuck(series, config),
    ...detectStagnantWar(series, config),
    ...detectEliminatedResurrection(series),
  ].sort((a, b) =>
    a.code.localeCompare(b.code)
    || (a.civId ?? '').localeCompare(b.civId ?? '')
    || a.firstRound - b.firstRound);

  return {
    summary: {
      rounds: samples.length,
      firstTurn: first.turn,
      lastTurn: last.turn,
      lastEra: last.era,
      terminated: last.gameOver,
      winner: last.winner,
      gameOverReason: last.gameOverReason,
      livingCivIdsAtEnd: last.civs.filter(c => c.living).map(c => c.civId).sort(),
      eliminatedCivIdsAtEnd: last.civs.filter(c => c.isEliminated).map(c => c.civId).sort(),
    },
    perCiv: last.civs.map(civ => ({
      civId: civ.civId,
      isHuman: civ.isHuman,
      living: civ.living,
      eliminated: civ.isEliminated,
      cities: civ.cities,
      population: civ.population,
      units: civ.units,
      completedTechs: civ.completedTechs,
      civEra: civ.civEra,
      gold: civ.gold,
      capturesMade: civ.capturesMade,
      capturesSuffered: civ.capturesSuffered,
      peaceEventsInvolvingCiv: civ.peaceEventsInvolvingCiv,
      warDeclarationsInvolvingCiv: civ.warDeclarationsInvolvingCiv,
      maxPlanNoProgressRounds: civ.maxPlanNoProgressRounds,
    })).sort((a, b) => a.civId.localeCompare(b.civId)),
    findings,
    observations: roundWorkObservations(samples, config),
  };
}
