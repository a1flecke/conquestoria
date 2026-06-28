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
