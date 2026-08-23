import type { Civilization, GeneralProgressState } from '@/core/types';

/**
 * Threshold formula (contract §13 — "data-driven and not yet locked", this
 * is the initial tuning): base cost 100, +40 per General already earned,
 * with the per-General increment itself shrinking by 5% each time (floored
 * at +15) so escalation visibly softens in the late game without ever fully
 * flattening or resetting. Same formula regardless of difficulty or era —
 * satisfies contract's explicit "same thresholds across difficulty" and "no
 * full reset at era transition."
 */
const BASE_THRESHOLD = 100;
const BASE_INCREMENT = 40;
const INCREMENT_DECAY = 0.95;
const MIN_INCREMENT = 15;

export function getGeneralThreshold(generalsEarned: number): number {
  let threshold = BASE_THRESHOLD;
  let increment = BASE_INCREMENT;
  for (let i = 0; i < generalsEarned; i++) {
    threshold += increment;
    increment = Math.max(MIN_INCREMENT, increment * INCREMENT_DECAY);
  }
  return threshold;
}

export function addGeneralProgress(
  current: GeneralProgressState | undefined,
  points: number,
): GeneralProgressState {
  const base = current ?? { points: 0, generalsEarned: 0 };
  return { ...base, points: base.points + points };
}

export function hasCrossedGeneralThreshold(progress: GeneralProgressState): boolean {
  return progress.points >= getGeneralThreshold(progress.generalsEarned);
}

/**
 * Bounded bonus awards (contract §13). Ordinary combat-XP progress is
 * handled separately in combat-reward-system.ts, scaled off the unit's own
 * veterancy XP gain rather than a flat award here — see
 * GENERAL_PROGRESS_XP_RATIO. Every value here is well under
 * getGeneralThreshold(0), so no single bonus insta-earns a General.
 */
export const GENERAL_PROGRESS_AWARDS = {
  cityCapture: 30,
  successfulDefense: 25,
  strongerForceVictory: 20,
} as const;

/** Fraction of a kill's own veterancy XP award that also becomes General
 * progress — small on purpose so trivial kills barely move the needle. */
export const GENERAL_PROGRESS_XP_RATIO = 0.5;

/** A defeated force counts as "materially stronger" once it exceeds the
 * victor's strength by at least this factor (contract §13). */
export const STRONGER_FORCE_MARGIN = 1.25;

export function awardGeneralProgress(
  civ: Pick<Civilization, 'generalProgress'>,
  points: number,
): NonNullable<Civilization['generalProgress']> {
  return addGeneralProgress(civ.generalProgress, points);
}
