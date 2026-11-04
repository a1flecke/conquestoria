import type { OpponentChallenge } from '@/core/types/ai';

/**
 * City-state graduation (#497) — the numbers and the vocabulary, and nothing else. Import-light on
 * purpose: the evaluator, the planner and every later consumer (conversion, presentation, tests)
 * read the same table, so a tuning change is one edit here and never a hunt through logic.
 *
 * Every value is PROVISIONAL until the campaign validation in the last PR of the #497 arc; the
 * owner approves the final numbers. Difficulty changes timing, probability and caps only — never
 * what conversion does or what a graduated civilization receives.
 */

/** Graduation is considered only on turns that are an exact multiple of this. */
export const GRADUATION_CADENCE_TURNS = 50;

/** No graduation while this many majors already live, by map size. */
export const GRADUATION_MAX_LIVING_MAJORS: Readonly<Record<'small' | 'medium' | 'large', number>> = {
  small: 6,
  medium: 8,
  large: 10,
};

/**
 * At most this many city-states graduate in one campaign, however long it runs (provisional, owner decision D6).
 * Counted from the permanent `Civilization.graduatedFrom` record, so it survives a graduate's later elimination.
 */
export const GRADUATION_MAX_PER_GAME = 3;

export interface MinorCivGraduationTuning {
  /** The world must have reached at least this age. */
  readonly minWorldAge: number;
  /** A city-state must have existed at least this many turns. */
  readonly minAgeTurns: number;
  /** Population must be at least `ceiling - populationHeadroom`. */
  readonly populationHeadroom: number;
  /** The city must hold at least this many buildings. */
  readonly minBuildings: number;
  /** A candidate's chance per cadence turn at a graduation score of 0. */
  readonly baseProbability: number;
  /** A candidate's chance per cadence turn at a graduation score of 1; no candidate exceeds it. */
  readonly maxProbability: number;
}

export const MINOR_CIV_GRADUATION_TUNING: Readonly<Record<OpponentChallenge, MinorCivGraduationTuning>> = {
  explorer: {
    minWorldAge: 5,
    minAgeTurns: 200,
    populationHeadroom: 0,
    minBuildings: 6,
    baseProbability: 0.03,
    maxProbability: 0.06,
  },
  standard: {
    minWorldAge: 4,
    minAgeTurns: 150,
    populationHeadroom: 1,
    minBuildings: 5,
    baseProbability: 0.08,
    maxProbability: 0.15,
  },
  veteran: {
    minWorldAge: 3,
    minAgeTurns: 120,
    populationHeadroom: 2,
    minBuildings: 4,
    baseProbability: 0.12,
    maxProbability: 0.22,
  },
};

/** How a graduation score is built, and how many of each recorded fact can count toward it. */
export const GRADUATION_SCORE = {
  tradePartnerWeight: 0.4,
  tradePartnerCap: 3,
  alliedPatronWeight: 0.3,
  alliedPatronCap: 2,
  leagueMemberWeight: 0.3,
} as const;

/** Why a city-state is not a graduation candidate. The first failing gate is the reason reported. */
export type MinorCivGraduationIneligibleReason =
  | 'missing-minor-civ'
  | 'destroyed'
  | 'unknown-definition'
  | 'city-missing'
  | 'city-not-owned'
  | 'age-unknown'
  | 'too-young'
  | 'population-below-threshold'
  | 'too-few-buildings'
  | 'at-war'
  | 'coalition-member'
  | 'under-threat'
  | 'league-mobilized';

/** The recorded facts an eligible candidate is scored on. All raw counts; capping happens in scoring. */
export interface MinorCivGraduationSignals {
  readonly ageTurns: number;
  readonly population: number;
  readonly populationCeiling: number;
  readonly buildingCount: number;
  /** Distinct major civilizations with a trade route that ends in this city-state's city. */
  readonly tradePartnerCount: number;
  /** Major civilizations this city-state is currently allied with. */
  readonly alliedPatronCount: number;
  readonly leagueMember: boolean;
}

export type MinorCivGraduationEligibility =
  | { readonly eligible: true; readonly minorCivId: string; readonly signals: MinorCivGraduationSignals }
  | { readonly eligible: false; readonly minorCivId: string; readonly reason: MinorCivGraduationIneligibleReason };
