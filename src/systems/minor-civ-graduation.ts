import type { GameState, MinorCivState } from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { isMajorCivOwner } from '@/core/owner-kind';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { evaluateMinorCivEconomyPosture, getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { getMinorCivLeagueForMember } from '@/systems/minor-civ-league-system';
import { createSimulationRng } from '@/systems/simulation-rng';
import { resolveWorldAge } from '@/systems/tech-definitions';
import { getDominationProgress } from '@/systems/victory-system';
import {
  GRADUATION_CADENCE_TURNS,
  GRADUATION_MAX_LIVING_MAJORS,
  GRADUATION_MAX_PER_GAME,
  GRADUATION_SCORE,
  MINOR_CIV_GRADUATION_TUNING,
  type MinorCivGraduationEligibility,
  type MinorCivGraduationIneligibleReason,
  type MinorCivGraduationSignals,
} from '@/systems/minor-civ-graduation-rules';

/**
 * City-state graduation (#497), read side. Everything here is a pure function of `GameState`: no
 * writes, no events, no randomness. Nothing in `src/` calls it yet — the conversion that would act
 * on a decision lands in a later PR of the arc, and the architecture rule
 * `minor-civ-graduation-is-test-only-until-497-pr3` keeps it that way until then.
 */

function ineligible(minorCivId: string, reason: MinorCivGraduationIneligibleReason): MinorCivGraduationEligibility {
  return { eligible: false, minorCivId, reason };
}

/** The founding turn as a survival age, or null when it is absent, corrupt or in the future. */
function readAgeTurns(state: GameState, minorCiv: MinorCivState): number | null {
  const founded: unknown = minorCiv.foundedTurn;
  if (typeof founded !== 'number' || !Number.isInteger(founded) || founded < 0 || founded > state.turn) return null;
  return state.turn - founded;
}

function isInActiveCoalition(state: GameState, minorCivId: string): boolean {
  return Object.values(state.minorCivCoalitions ?? {}).some(coalition => (
    coalition.memberIds.includes(minorCivId)
    && (coalition.status === 'forming' || coalition.status === 'active')
  ));
}

/** Distinct major civilizations on the far end of a route that ends in this city-state's city. */
function countTradePartners(state: GameState, minorCiv: MinorCivState): number {
  const partners = new Set<string>();
  for (const route of state.marketplace?.tradeRoutes ?? []) {
    const otherCityId = route.fromCityId === minorCiv.cityId ? route.toCityId
      : route.toCityId === minorCiv.cityId ? route.fromCityId
        : null;
    if (otherCityId === null) continue;
    const partner = state.cities[otherCityId]?.owner;
    if (partner && isMajorCivOwner(partner) && state.civilizations[partner]) partners.add(partner);
  }
  return partners.size;
}

function countAlliedPatrons(minorCiv: MinorCivState): number {
  return Object.entries(minorCiv.chainStatusByCiv ?? {})
    .filter(([civId, status]) => isMajorCivOwner(civId) && status.status === 'allied')
    .length;
}

/**
 * Whether one city-state is a graduation candidate right now, judged only on recorded state. The
 * first failing gate is the reason returned; the gates run cheapest and most structural first, so
 * a malformed record is reported as malformed rather than as whatever it would have scored.
 * Whether the world as a whole is ready (cadence, world age, caps) is the planner's question.
 */
export function evaluateMinorCivGraduationEligibility(
  state: GameState,
  minorCivId: string,
): MinorCivGraduationEligibility {
  const minorCiv = state.minorCivs?.[minorCivId];
  if (!minorCiv) return ineligible(minorCivId, 'missing-minor-civ');
  if (minorCiv.isDestroyed) return ineligible(minorCivId, 'destroyed');
  if (!MINOR_CIV_DEFINITIONS.some(definition => definition.id === minorCiv.definitionId)) {
    return ineligible(minorCivId, 'unknown-definition');
  }
  const city = state.cities?.[minorCiv.cityId];
  if (!city) return ineligible(minorCivId, 'city-missing');
  if (city.owner !== minorCivId) return ineligible(minorCivId, 'city-not-owned');

  const tuning = MINOR_CIV_GRADUATION_TUNING[resolveOpponentChallenge(state)];
  const ageTurns = readAgeTurns(state, minorCiv);
  if (ageTurns === null) return ineligible(minorCivId, 'age-unknown');
  if (ageTurns < tuning.minAgeTurns) return ineligible(minorCivId, 'too-young');

  const populationCeiling = getMinorCivPopulationCeiling(state, minorCivId);
  const population = city.population;
  if (!Number.isFinite(population) || population < populationCeiling - tuning.populationHeadroom) {
    return ineligible(minorCivId, 'population-below-threshold');
  }
  const buildingCount = Array.isArray(city.buildings) ? city.buildings.length : 0;
  if (buildingCount < tuning.minBuildings) return ineligible(minorCivId, 'too-few-buildings');

  if ((minorCiv.diplomacy?.atWarWith?.length ?? 0) > 0) return ineligible(minorCivId, 'at-war');
  // Named before the generic threat below, because membership already makes the posture mobilizing.
  if (isInActiveCoalition(state, minorCivId)) return ineligible(minorCivId, 'coalition-member');
  const posture = evaluateMinorCivEconomyPosture(state, minorCivId);
  if (posture === 'mobilizing' || posture === 'recovering') return ineligible(minorCivId, 'under-threat');
  const league = getMinorCivLeagueForMember(state, minorCivId);
  if (league?.readiness.kind === 'concern') return ineligible(minorCivId, 'league-mobilized');

  const signals: MinorCivGraduationSignals = {
    ageTurns,
    population,
    populationCeiling,
    buildingCount,
    tradePartnerCount: countTradePartners(state, minorCiv),
    alliedPatronCount: countAlliedPatrons(minorCiv),
    leagueMember: league !== null,
  };
  return { eligible: true, minorCivId, signals };
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * How strong an eligible candidate's recorded position is, 0..1. Trade partners, allied patrons and
 * regional-compact membership each contribute up to their weight; a fact counts only up to its cap,
 * so no single relationship, however many, can carry a candidate on its own.
 */
export function scoreGraduationSignals(signals: MinorCivGraduationSignals): number {
  const share = (count: number, cap: number) => clampUnit(Math.min(count, cap) / cap);
  return clampUnit(
    GRADUATION_SCORE.tradePartnerWeight * share(signals.tradePartnerCount, GRADUATION_SCORE.tradePartnerCap)
    + GRADUATION_SCORE.alliedPatronWeight * share(signals.alliedPatronCount, GRADUATION_SCORE.alliedPatronCap)
    + (signals.leagueMember ? GRADUATION_SCORE.leagueMemberWeight : 0),
  );
}

/**
 * The chance an eligible candidate graduates on one cadence turn: the difficulty's base probability
 * at score 0 rising linearly to its maximum at score 1. A score outside 0..1 is clamped, so the
 * result never leaves the tier's range.
 */
export function getGraduationProbability(state: GameState, score: number): number {
  const { baseProbability, maxProbability } = MINOR_CIV_GRADUATION_TUNING[resolveOpponentChallenge(state)];
  return baseProbability + (maxProbability - baseProbability) * clampUnit(score);
}

export type MinorCivGraduationSkipReason =
  | 'game-over'
  | 'off-cadence'
  | 'world-too-young'
  | 'living-major-cap'
  | 'graduation-cap'
  | 'domination-imminent';

/** One eligible candidate's draw. `roll` is the raw stream value, kept so a result can be audited. */
export interface MinorCivGraduationRoll {
  minorCivId: string;
  score: number;
  probability: number;
  roll: number;
  succeeded: boolean;
}

export type MinorCivGraduationPlan =
  | { status: 'skipped'; turn: number; reason: MinorCivGraduationSkipReason }
  | {
    status: 'evaluated';
    turn: number;
    evaluations: MinorCivGraduationEligibility[];
    rolls: MinorCivGraduationRoll[];
    /** At most one city-state graduates per cadence turn. */
    selectedMinorCivId: string | null;
  };

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Of the rolls that succeeded, the strongest candidate (highest score, then lowest id, so the answer
 * never depends on the order the rolls arrive in). Null when nothing succeeded.
 */
export function selectGraduationCandidate(rolls: readonly MinorCivGraduationRoll[]): string | null {
  const winners = rolls.filter(entry => entry.succeeded);
  if (winners.length === 0) return null;
  winners.sort((a, b) => (b.score - a.score) || compareIds(a.minorCivId, b.minorCivId));
  return winners[0]!.minorCivId;
}

/** Civilizations that began as graduated city-states, living or not: the per-game cap counts history. */
export function countGraduatedCivilizations(state: GameState): number {
  return Object.values(state.civilizations).filter(civ => civ.graduatedFrom !== undefined).length;
}

/**
 * A living major that could win by Domination and is close: it has already secured at least one
 * rival (eliminated or made a vassal) and has at most one left to resolve. Requiring a secured
 * rival matters -- in an ordinary two-civilization game each side is always exactly one rival from
 * victory without being anywhere near it, and that must not freeze graduation for the whole game.
 */
function isDominationImminent(state: GameState, livingMajorIds: readonly string[]): boolean {
  return livingMajorIds.some(civId => {
    const progress = getDominationProgress(state, civId);
    return progress.eligible && progress.securedRivalCount >= 1 && progress.unresolvedRivalIds.length <= 1;
  });
}

/**
 * The whole graduation decision for one round, as data. Pure and deterministic: the same state
 * always yields the same plan, because every draw comes from `createSimulationRng`, which is keyed
 * by campaign id, turn and the candidate's full id — so saving and reloading cannot reroll it, and
 * no other system's randomness can move it. It writes nothing and emits nothing.
 *
 * World-level gates run cheapest first and short-circuit before any city-state is looked at.
 */
export function planMinorCivGraduations(state: GameState): MinorCivGraduationPlan {
  const turn = state.turn;
  const skipped = (reason: MinorCivGraduationSkipReason): MinorCivGraduationPlan => ({ status: 'skipped', turn, reason });

  if (state.gameOver) return skipped('game-over');
  if (turn <= 0 || turn % GRADUATION_CADENCE_TURNS !== 0) return skipped('off-cadence');

  const tuning = MINOR_CIV_GRADUATION_TUNING[resolveOpponentChallenge(state)];
  if (resolveWorldAge(state) < tuning.minWorldAge) return skipped('world-too-young');

  const livingMajorIds = Object.keys(state.civilizations)
    .filter(civId => getCivilizationLiveness(state, civId).living);
  if (livingMajorIds.length >= GRADUATION_MAX_LIVING_MAJORS[state.settings?.mapSize ?? 'medium']) {
    return skipped('living-major-cap');
  }
  if (countGraduatedCivilizations(state) >= GRADUATION_MAX_PER_GAME) return skipped('graduation-cap');
  if (isDominationImminent(state, livingMajorIds)) return skipped('domination-imminent');

  const evaluations = Object.keys(state.minorCivs ?? {}).sort(compareIds)
    .map(minorCivId => evaluateMinorCivGraduationEligibility(state, minorCivId));
  const rolls: MinorCivGraduationRoll[] = [];
  for (const evaluation of evaluations) {
    if (!evaluation.eligible) continue;
    const score = scoreGraduationSignals(evaluation.signals);
    const probability = getGraduationProbability(state, score);
    const roll = createSimulationRng(state, { domain: 'minor-civ-graduation', actorId: evaluation.minorCivId })();
    rolls.push({ minorCivId: evaluation.minorCivId, score, probability, roll, succeeded: roll < probability });
  }
  return { status: 'evaluated', turn, evaluations, rolls, selectedMinorCivId: selectGraduationCandidate(rolls) };
}
