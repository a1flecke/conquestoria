import type { Civilization, GameState, GeneralProgressState } from '@/core/types';
import { GENERAL_DEFINITIONS, type GeneralDefinition } from '@/systems/great-general-definitions';
import { seededLcg, weightedPick } from '@/systems/seeded-lcg';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

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

const CANDIDATE_COUNT = 3;

function eraWeight(candidateEra: number, currentEra: number): number {
  const distance = Math.abs(candidateEra - currentEra);
  if (distance === 0) return 100;
  if (distance === 1) return 40; // adjacent-era, lower weight
  return 5; // farther era: fallback-only weight, still possible, rarely picked
}

/**
 * 2-3 weighted candidates for `civId` (contract §13). Deterministic for a
 * given `seed` — callers pass a per-round, per-civ-derived seed; this
 * function only draws from the shared seeded RNG (never the browser's
 * unseeded random source). Excludes every General already in this civ's
 * `generalHistory` forever (contract: "a used General never appears
 * again... never resurrect").
 */
export function generateGeneralCandidates(
  state: GameState,
  civId: string,
  seed: number,
): GeneralDefinition[] {
  const civ = state.civilizations[civId];
  const civType = civ?.civType ?? '';
  const usedIds = new Set((civ?.generalHistory ?? []).map(entry => entry.generalDefinitionId));
  const currentEra = resolveCivilizationEra(civ?.techState.completed ?? []);

  const eligible = GENERAL_DEFINITIONS.filter(g =>
    !usedIds.has(g.id) && (g.civTypeEligibility.length === 0 || g.civTypeEligibility.includes(civType)),
  );

  const rng = seededLcg(seed);
  const picked: GeneralDefinition[] = [];
  const pool = [...eligible];
  while (picked.length < CANDIDATE_COUNT && pool.length > 0) {
    const weights = pool.map(g => eraWeight(g.era, currentEra));
    const choice = weightedPick(pool, weights, rng);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }
  return picked;
}

/**
 * Queues a candidate-choice prompt once `civId` crosses its next threshold
 * (contract §13: "Queue candidate choice to a natural break; do not
 * interrupt action resolution or allow indefinite deferral"). A no-op if
 * the civ has no progress, hasn't crossed the threshold, or already has a
 * pending choice queued — the queue is cleared only by spawnGeneralForCiv
 * actually resolving it, which structurally prevents indefinite deferral
 * (the entry stays queued, visible, and blocking until chosen).
 */
export function checkAndQueueGeneralCandidateChoice(
  state: GameState,
  civId: string,
  triggerEventLabel: string,
  seed: number,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ?.generalProgress || !hasCrossedGeneralThreshold(civ.generalProgress)) return state;
  if ((state.pendingGeneralCandidateChoices ?? []).some(choice => choice.civId === civId)) return state;

  const candidates = generateGeneralCandidates(state, civId, seed);
  if (candidates.length === 0) return state; // roster fully exhausted, nothing to offer

  return {
    ...state,
    pendingGeneralCandidateChoices: [
      ...(state.pendingGeneralCandidateChoices ?? []),
      { civId, candidateDefinitionIds: candidates.map(c => c.id), triggerEventLabel },
    ],
  };
}
