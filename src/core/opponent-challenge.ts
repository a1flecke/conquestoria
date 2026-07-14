import type { GameState, OpponentChallenge } from './types';

export interface OpponentChallengeProfile {
  mobilizationRounds: number;
  maxPrimaryForce: number;
  retreatHealthPercent: number;
  tacticalTopK: number;
  seededSuboptimalChance: number;
  seededMistakeScoreBand: number;
  maxIndependentCrisesPerHuman: number;
  recoveryRounds: number;
  planReconsiderRounds: number;
  crisisCooldownTurns: number;
  crisisGraceMaxEra: number;
  crisisGraceMinTurns: number;
  crisisSeverityMultiplier: number;
  // Barbarian/pirate city sieges only permanently destroy an undefended city once
  // state.era exceeds this value for the city owner's resolved challenge; below it,
  // a city that hits 0 HP is sacked (survives at 1 HP) instead. See #522.
  citySiegeDestructionEra: number;
}

export const OPPONENT_CHALLENGE_PROFILES: Record<OpponentChallenge, OpponentChallengeProfile> = {
  explorer: {
    mobilizationRounds: 2,
    maxPrimaryForce: 4,
    retreatHealthPercent: 55,
    tacticalTopK: 3,
    seededSuboptimalChance: 0.3,
    seededMistakeScoreBand: 12,
    maxIndependentCrisesPerHuman: 1,
    recoveryRounds: 3,
    planReconsiderRounds: 3,
    crisisCooldownTurns: 12,
    crisisGraceMaxEra: 2,
    crisisGraceMinTurns: 30,
    crisisSeverityMultiplier: 0.5,
    citySiegeDestructionEra: 3,
  },
  standard: {
    mobilizationRounds: 1,
    maxPrimaryForce: 6,
    retreatHealthPercent: 40,
    tacticalTopK: 2,
    seededSuboptimalChance: 0.1,
    seededMistakeScoreBand: 8,
    maxIndependentCrisesPerHuman: 2,
    recoveryRounds: 2,
    planReconsiderRounds: 2,
    crisisCooldownTurns: 8,
    crisisGraceMaxEra: 1,
    crisisGraceMinTurns: 20,
    crisisSeverityMultiplier: 1.0,
    citySiegeDestructionEra: 2,
  },
  veteran: {
    mobilizationRounds: 0,
    maxPrimaryForce: 8,
    retreatHealthPercent: 25,
    tacticalTopK: 1,
    seededSuboptimalChance: 0,
    seededMistakeScoreBand: 0,
    maxIndependentCrisesPerHuman: 3,
    recoveryRounds: 1,
    planReconsiderRounds: 1,
    crisisCooldownTurns: 5,
    crisisGraceMaxEra: 1,
    crisisGraceMinTurns: 10,
    crisisSeverityMultiplier: 1.3,
    citySiegeDestructionEra: 1,
  },
};

export function isOpponentChallenge(value: unknown): value is OpponentChallenge {
  return value === 'explorer' || value === 'standard' || value === 'veteran';
}

export function resolveOpponentChallenge(
  state: Pick<GameState, 'opponentChallenge'>,
): OpponentChallenge {
  return isOpponentChallenge(state.opponentChallenge) ? state.opponentChallenge : 'standard';
}

// Per-civ challenge governs internal-pressure knobs (crises, unrest contagion)
// ONLY — AI opponent behavior always stays on the game-wide `opponentChallenge`.
export function resolveChallengeForCiv(
  state: Pick<GameState, 'opponentChallenge' | 'civilizations'>,
  civId: string,
): OpponentChallenge {
  const civ = state.civilizations[civId];
  if (civ?.isHuman && isOpponentChallenge(civ.challenge)) return civ.challenge;
  return resolveOpponentChallenge(state);
}

// Severity for world pressure (crises, pirate fleets). Humans: personal challenge.
// AI: ALWAYS 'standard' — never resolveChallengeForCiv, whose game-wide
// opponentChallenge would invert difficulty (veteran would make AI suffer MORE,
// making the game easier). Spec: docs/superpowers/specs/2026-07-11-world-pressure-symmetry-design.md
export function resolvePressureSeverityForCiv(
  state: Pick<GameState, 'opponentChallenge' | 'civilizations'>,
  civId: string,
): OpponentChallenge {
  const civ = state.civilizations[civId];
  if (civ?.isHuman) return resolveChallengeForCiv(state, civId);
  return 'standard';
}

export function getChallengeProfileForCiv(
  state: Pick<GameState, 'opponentChallenge' | 'civilizations'>,
  civId: string,
): OpponentChallengeProfile {
  return OPPONENT_CHALLENGE_PROFILES[resolveChallengeForCiv(state, civId)];
}

export function setPendingOpponentChallenge(
  state: GameState,
  challenge: OpponentChallenge,
): GameState {
  if (challenge === resolveOpponentChallenge(state)) {
    if (state.pendingOpponentChallenge === undefined) return state;
    const { pendingOpponentChallenge: _removed, ...withoutPending } = state;
    return withoutPending;
  }
  return state.pendingOpponentChallenge === challenge
    ? state
    : { ...state, pendingOpponentChallenge: challenge };
}

export function setPendingChallengeForCiv(
  state: GameState,
  civId: string,
  challenge: OpponentChallenge,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  if (challenge === resolveChallengeForCiv(state, civId)) {
    if (civ.pendingChallenge === undefined) return state;
    const { pendingChallenge: _removed, ...withoutPending } = civ;
    return { ...state, civilizations: { ...state.civilizations, [civId]: withoutPending } };
  }
  return civ.pendingChallenge === challenge
    ? state
    : { ...state, civilizations: { ...state.civilizations, [civId]: { ...civ, pendingChallenge: challenge } } };
}

// Applies civId's own pendingChallenge (if any) — call whenever currentPlayer
// switches to civId, since "applies at the start of your next turn" means
// exactly that transition, not just the once-per-round hotseat cycle boundary.
export function applyPendingChallengeForCiv(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.pendingChallenge === undefined) return state;
  if (!isOpponentChallenge(civ.pendingChallenge)) {
    const { pendingChallenge: _removed, ...withoutPending } = civ;
    return { ...state, civilizations: { ...state.civilizations, [civId]: withoutPending } };
  }
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, challenge: civ.pendingChallenge, pendingChallenge: undefined },
    },
  };
}

export function applyPendingOpponentChallenge(state: GameState): GameState {
  if (state.pendingOpponentChallenge === undefined) return state;
  if (!isOpponentChallenge(state.pendingOpponentChallenge)) {
    const { pendingOpponentChallenge: _removed, ...withoutPending } = state;
    return withoutPending;
  }
  return {
    ...state,
    opponentChallenge: state.pendingOpponentChallenge,
    pendingOpponentChallenge: undefined,
  };
}
