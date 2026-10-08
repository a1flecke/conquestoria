/**
 * GameState-level vassalage commands: propose/commit, independence, release,
 * overlord defence and the per-turn vassalage tick. Depends on the war module
 * (never the reverse) and on the pure rules in `diplomacy-vassal-rules.ts`.
 */
import type { GameState } from '@/core/types';
import type { DiplomacyState } from '@/core/types/diplomacy';
import type { EventBus } from '@/core/event-bus';
import { evaluateVassalageConsent } from '@/ai/ai-treaty-consent';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { withDiplomacy } from '@/systems/diplomacy-state';
import { getRelationship } from '@/systems/diplomacy-queries';
import { applyTreachery } from '@/systems/diplomacy-treachery';
import {
  enqueueTreatyProposal,
  hasPendingTreatyProposalBetween,
  pruneExpiredDiplomaticRequests,
} from '@/systems/diplomacy-requests';
import {
  acceptVassalage,
  canPetitionIndependence,
  endVassalage,
  endVassalageUnilateral,
  getVassalageEligibility,
  getVassalageMilitaryCount,
  hasActiveVassalage,
  petitionIndependence,
  processProtectionTimers,
} from '@/systems/diplomacy-vassal-rules';
import { emitAccessLossNotices } from '@/systems/territorial-access';
import { addWarPair, applyVassalageWarConsequences, resolveOpponentKind } from '@/systems/diplomacy-war';

export function proposeVassalage(state: GameState, vassalId: string, overlordId: string, bus: EventBus): GameState {
  if (!getVassalageEligibility(state, vassalId, overlordId).ok) return state;
  const current = pruneExpiredDiplomaticRequests(state);
  if (hasPendingTreatyProposalBetween(current, vassalId, overlordId, 'vassalage')) return current;
  const overlord = current.civilizations[overlordId];
  if (overlord.isHuman) return enqueueTreatyProposal(current, vassalId, overlordId, 'vassalage', -1, bus);
  const consent = evaluateVassalageConsent({
    relationship: getRelationship(overlord.diplomacy, vassalId),
    diplomacyFocus: resolveCivDefinition(current, overlord.civType)?.personality.diplomacyFocus ?? 0.5,
    militaryCount: getVassalageMilitaryCount(current, overlordId),
    vassalCount: overlord.diplomacy.vassalage.vassals.length,
    // Strategic-load signal — major-civ wars only. A city-state war shouldn't
    // make an AI overlord refuse a vassal for "strategic-caution" (#1041).
    warCount: majorCivWarOpponentIds(overlord.diplomacy.atWarWith).length,
  });
  if (consent.accepted) return commitVassalageAgreement(current, vassalId, overlordId, bus);
  // #1090: reason was previously always dropped -- routeTreatyDeclined always rendered the
  // same generic sentence regardless of why the overlord actually refused.
  bus.emit('diplomacy:treaty-declined', { proposerCivId: vassalId, targetCivId: overlordId, treaty: 'vassalage', reason: consent.reason });
  return current;
}

/** Only called after a recipient decision; applies all low-level outputs together. */
export function commitVassalageAgreement(state: GameState, vassalId: string, overlordId: string, bus: EventBus): GameState {
  if (!getVassalageEligibility(state, vassalId, overlordId).ok) return state;
  const vassal = state.civilizations[vassalId];
  const overlord = state.civilizations[overlordId];
  const result = acceptVassalage(vassal.diplomacy, overlord.diplomacy, vassalId, overlordId, state.turn, state.defensiveLeagues);
  const next = {
    ...state,
    civilizations: {
      ...state.civilizations,
      [vassalId]: { ...vassal, diplomacy: result.vassalState },
      [overlordId]: { ...overlord, diplomacy: result.overlordState },
    },
    defensiveLeagues: result.leagueUpdates ?? state.defensiveLeagues,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request =>
      !(request.type === 'treaty' && request.treatyType === 'vassalage'
        && (request.fromCivId === vassalId || request.toCivId === vassalId))),
  };
  const withObligations = applyVassalageWarConsequences(state, next, bus);
  bus.emit('diplomacy:treaty-accepted', { civA: vassalId, civB: overlordId, treaty: 'vassalage' });
  return withObligations;
}

export function proposeIndependence(state: GameState, vassalId: string, overlordId: string, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId) || !canPetitionIndependence(state, vassalId)) return state;
  const current = pruneExpiredDiplomaticRequests(state);
  if ((current.pendingDiplomacyRequests ?? []).some(request => request.type === 'independence'
    && request.fromCivId === vassalId && request.toCivId === overlordId)) return current;
  const overlord = current.civilizations[overlordId];
  if (!overlord.isHuman) {
    const accepted = (resolveCivDefinition(current, overlord.civType)?.personality.diplomacyFocus ?? 0.5) > 0.5;
    return resolveIndependence(current, vassalId, overlordId, accepted, bus);
  }
  bus.emit('diplomacy:independence-requested', { vassalId, overlordId });
  return { ...current, pendingDiplomacyRequests: [...(current.pendingDiplomacyRequests ?? []), {
    id: `independence:${vassalId}:${overlordId}:${state.turn}`, type: 'independence',
    fromCivId: vassalId, toCivId: overlordId, turnIssued: state.turn,
  }] };
}

function applyVassalageEnd(state: GameState, vassalId: string, overlordId: string,
  vassalDip: DiplomacyState, overlordDip?: DiplomacyState): GameState {
  let next = withDiplomacy(state, vassalId, vassalDip);
  if (overlordDip && next.civilizations[overlordId]) next = withDiplomacy(next, overlordId, overlordDip);
  return { ...next, pendingDiplomacyRequests: (next.pendingDiplomacyRequests ?? []).filter(request =>
    !((request.type === 'independence' || request.treatyType === 'vassalage')
      && ((request.fromCivId === vassalId && request.toCivId === overlordId)
        || (request.fromCivId === overlordId && request.toCivId === vassalId)))) };
}

export function resolveIndependence(state: GameState, vassalId: string, overlordId: string, accepted: boolean, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId) || !canPetitionIndependence(state, vassalId)) return state;
  const result = petitionIndependence(state.civilizations[vassalId].diplomacy,
    state.civilizations[overlordId].diplomacy, vassalId, overlordId, accepted);
  if (!accepted) {
    // Independence war ends incompatible bilateral treaties as well as the vassalage link.
    result.vassalState = { ...result.vassalState, treaties: result.vassalState.treaties.filter(t => t.civA !== overlordId && t.civB !== overlordId) };
    result.overlordState = { ...result.overlordState, treaties: result.overlordState.treaties.filter(t => t.civA !== vassalId && t.civB !== vassalId) };
  }
  const ended = applyVassalageEnd(state, vassalId, overlordId, result.vassalState, result.overlordState);
  const next = accepted ? ended : applyVassalageWarConsequences(state, ended, bus);
  bus.emit('diplomacy:independence-petition', { vassalId, overlordId, accepted });
  bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: accepted ? 'independence' : 'war' });
  emitAccessLossNotices(state, next, bus); // #871 (a refused petition is war, which keeps passage open)
  return next;
}

export function releaseVassal(state: GameState, overlordId: string, vassalId: string, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId)) return state;
  const result = endVassalage(state.civilizations[vassalId].diplomacy, state.civilizations[overlordId].diplomacy, vassalId, overlordId);
  const next = applyVassalageEnd(state, vassalId, overlordId, result.vassalState, applyTreachery(result.overlordState, 'vassalage'));
  bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: 'released' });
  emitAccessLossNotices(state, next, bus); // #871: vassal/overlord passage ends with the link
  return next;
}

export function defendVassal(state: GameState, overlordId: string, vassalId: string, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId)) return state;
  let next = state;
  for (const timer of state.civilizations[vassalId].diplomacy.vassalage.protectionTimers) {
    const enemyId = timer.attackerCivId;
    if (!state.civilizations[vassalId].diplomacy.atWarWith.includes(enemyId)) continue;
    const updated = addWarPair(next, overlordId, enemyId, false, bus);
    if (updated !== next) bus.emit('diplomacy:war-declared', { attackerId: overlordId, defenderId: enemyId, opponentKind: resolveOpponentKind(enemyId) });
    next = updated;
  }
  return applyVassalageWarConsequences(state, next, bus);
}

export function processVassalageTurn(state: GameState, bus: EventBus): GameState {
  let next = state;
  for (const vassalId of Object.keys(state.civilizations)) {
    let civ = next.civilizations[vassalId];
    const overlordId = civ.diplomacy?.vassalage.overlord;
    if (!overlordId) continue;
    const overlord = next.civilizations[overlordId];
    if (!overlord || !getCivilizationLiveness(next, overlordId).living) {
      next = applyVassalageEnd(next, vassalId, overlordId, endVassalageUnilateral(civ.diplomacy, vassalId, overlordId), overlord ? endVassalage(civ.diplomacy, overlord.diplomacy, vassalId, overlordId).overlordState : undefined);
      bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: 'overlord_eliminated' });
      continue;
    }
    if (!overlord.isHuman) next = defendVassal(next, overlordId, vassalId, bus);
    civ = next.civilizations[vassalId];
    const timers = civ.diplomacy.vassalage.protectionTimers.filter(timer =>
      civ.diplomacy.atWarWith.includes(timer.attackerCivId)
      && !next.civilizations[overlordId].diplomacy.atWarWith.includes(timer.attackerCivId));
    const ticked = processProtectionTimers({ ...civ.diplomacy, vassalage: { ...civ.diplomacy.vassalage, protectionTimers: timers } });
    next = withDiplomacy(next, vassalId, ticked);
    for (const timer of timers) {
      if (timer.turnsRemaining <= 1) bus.emit('diplomacy:protection-failed', { overlordId, vassalId, attackerId: timer.attackerCivId });
    }
    if (ticked.vassalage.protectionScore <= 20) {
      const result = endVassalage(ticked, next.civilizations[overlordId].diplomacy, vassalId, overlordId);
      next = applyVassalageEnd(next, vassalId, overlordId, result.vassalState, result.overlordState);
      bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: 'auto_breakaway' });
    } else if (!civ.isHuman && canPetitionIndependence(next, vassalId)) {
      next = proposeIndependence(next, vassalId, overlordId, bus);
    }
  }
  emitAccessLossNotices(state, next, bus); // #871: overlord eliminated / auto-breakaway end passage
  return next;
}
