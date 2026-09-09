import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { isMajorCivOwner } from '@/core/owner-kind';
import { canPetitionIndependence, isDiplomaticRequestLive } from './diplomacy-system';
import { evaluateDominationFacts, type DominationProgress } from './domination-rules';
import { buildDominationActorFacts } from './domination-sovereignty';

export function getDominationProgress(state: GameState, civId: string): DominationProgress {
  return evaluateDominationFacts(
    buildDominationActorFacts(state),
    civId,
    hasCompetitiveFoundingRecords(state),
  );
}

export function checkDominationVictory(state: GameState): string | null {
  const facts = buildDominationActorFacts(state);
  const competitive = hasCompetitiveFoundingRecords(state);
  const candidates = facts
    .filter(fact => evaluateDominationFacts(facts, fact.civId, competitive).conditionMet)
    .map(fact => fact.civId);

  return candidates.length === 1 ? candidates[0] : null;
}

export function getDominationResolutionBlocker(
  state: GameState,
  contenderId: string,
): { kind: 'independence'; requestIds: string[] } | null {
  const directVassalIds = new Set(getDominationProgress(state, contenderId).directVassalIds);
  const requestIds = (state.pendingDiplomacyRequests ?? [])
    .filter(request => request.type === 'independence'
      && request.toCivId === contenderId
      && directVassalIds.has(request.fromCivId)
      && isDiplomaticRequestLive(state, request)
      && canPetitionIndependence(state, request.fromCivId))
    .map(request => request.id)
    .sort(compareIds);
  return requestIds.length > 0 ? { kind: 'independence', requestIds } : null;
}

export function finalizeDominationVictory(state: GameState, bus: EventBus): GameState {
  if (state.gameOver) return state;
  const victorId = checkDominationVictory(state);
  if (!victorId || getDominationResolutionBlocker(state, victorId)) return state;
  const finished: GameState = { ...state, gameOver: true, winner: victorId, gameOverReason: 'domination' };
  bus.emit('victory:resolved', { winnerId: victorId, reason: 'domination', turn: state.turn });
  return finished;
}

function hasCompetitiveFoundingRecords(state: GameState): boolean {
  return Object.entries(state.civilizations)
    .filter(([civId, civ]) => isMajorCivOwner(civId) && !civ.breakaway)
    .length >= 2;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
