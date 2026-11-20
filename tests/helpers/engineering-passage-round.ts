import type { EventBus } from '@/core/event-bus';
import { resolveHotSeatPostSimulation } from '@/core/hotseat-outcome';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { evaluateAuthoredClaimants, type AuthoredPassage, type AuthoredUndertaking } from './engineering-passage-evaluation';

interface AuthoredCandidate {
  undertakingId: string;
  passage: AuthoredPassage;
  undertaking: AuthoredUndertaking;
}

interface AuthoredQualification {
  undertakingId: string;
  claimantIds: readonly string[];
}

interface AuthoredRoundResult {
  completedRound: number;
  qualifications: readonly AuthoredQualification[];
}

export function recordAuthoredQualifications(
  history: readonly AuthoredRoundResult[],
  completedRound: number,
  qualified: readonly AuthoredQualification[],
): readonly AuthoredRoundResult[] {
  // Each call supplies the entire cohort observed at a completed checkpoint.
  const latest = history.at(-1);
  if (latest && completedRound <= latest.completedRound) return history;

  const recorded = new Set(history.flatMap(result => result.qualifications.map(entry => entry.undertakingId)));
  const qualifications: AuthoredQualification[] = [];
  for (const entry of qualified) {
    if (recorded.has(entry.undertakingId)) continue;
    qualifications.push(entry);
    recorded.add(entry.undertakingId);
  }
  qualifications.sort((left, right) => left.undertakingId.localeCompare(right.undertakingId));
  return qualifications.length > 0 ? [...history, { completedRound, qualifications }] : history;
}

/** Replay the game's shared round, then read one finalized snapshot for the opt-in fixture. */
export function replayAuthoredPassageRound(
  state: GameState, bus: EventBus, candidates: readonly AuthoredCandidate[],
  history: readonly AuthoredRoundResult[] = [],
) {
  if (state.gameOver) return { state, history };
  const completedRound = state.turn;
  const finalized = processTurn(state, bus);
  const qualified = candidates.flatMap(({ undertakingId, passage, undertaking }) => {
    const claimantIds = evaluateAuthoredClaimants(finalized, passage, undertaking, completedRound);
    return claimantIds.length > 0 ? [{ undertakingId, claimantIds }] : [];
  });
  return {
    state: state.hotSeat ? resolveHotSeatPostSimulation(finalized, state.currentPlayer).state : finalized,
    history: recordAuthoredQualifications(history, completedRound, qualified),
  };
}
