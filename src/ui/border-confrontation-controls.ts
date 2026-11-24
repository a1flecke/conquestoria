/**
 * #1766: viewer-owned border-confrontation controls mounted by the live diplomacy panel.
 *
 * Everything here is the viewer's own information: a demand or promise appears only when the viewer is a party, and
 * the "does the visible situation satisfy the promise" line is derived from the same `hasBorderTension` knowledge
 * rules as the tension reason -- the host sees only units it can see, the intruder sees its own units against cities
 * it has found. Availability comes from the canonical eligibility + executor, so a button appears exactly when
 * pressing it can do something.
 */
import type { GameState } from '@/core/types';
import type { BorderConfrontation, PendingDiplomaticRequest } from '@/core/types/diplomacy';
import type { DiplomacyPanelCallbacks } from '@/ui/diplomacy-panel';
import { createGameButton } from '@/ui/ui-kit';
import { DIPLOMATIC_ACTION_DENIAL_MESSAGES } from '@/systems/diplomacy-actions';
import { resolveDiplomaticAction } from '@/systems/diplomacy-system';
import { isDiplomaticRequestLive, PENDING_DIPLOMATIC_REQUEST_TTL_TURNS } from '@/systems/diplomacy-requests';
import {
  BORDER_CONFRONTATION_RECORD_RETENTION_TURNS,
  getBorderConfrontationEligibility,
  getBorderConfrontations,
  getBorderConfrontationStatusForViewer,
  getLastBorderConfrontation,
} from '@/systems/border-confrontation';
import { BORDER_TENSION_RADIUS } from '@/systems/border-tension';

/** Denials that describe a civilization the viewer cannot act on at all: nothing useful to say, so say nothing. */
const SILENT_DENIALS = new Set(['unknown-civilization', 'self', 'not-alive', 'no-contact']);

const STATUS_TEXT: Record<BorderConfrontation['status'], string> = {
  promised: 'Promise active',
  fulfilled: 'Promise kept',
  broken: 'Promise broken',
  refused: 'Demand refused',
  invalidated: 'Promise no longer applies',
};

export function createBorderConfrontationControls(
  state: GameState,
  otherId: string,
  callbacks: DiplomacyPanelCallbacks,
): HTMLElement {
  const box = document.createElement('section');
  box.dataset.role = 'border-confrontation-controls';
  box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;font-size:12px;';
  const viewerId = state.currentPlayer;
  const viewer = state.civilizations[viewerId];
  const other = state.civilizations[otherId];
  if (!viewer || !other || viewerId === otherId) return box;

  const text = (message: string) => {
    const line = document.createElement('p');
    line.style.cssText = 'flex-basis:100%;margin:0;line-height:1.5;';
    line.textContent = message;
    box.append(line);
  };
  let used = false;
  const button = (label: string, callback: () => void, confirmLabel?: string) => {
    const control = createGameButton(label, 'secondary');
    control.setAttribute('aria-label', `${label}: ${other.name}`);
    let armed = false;
    control.addEventListener('click', () => {
      if (used || !box.parentElement) return;
      if (confirmLabel && !armed) {
        armed = true;
        control.textContent = confirmLabel;
        control.setAttribute('aria-label', `${confirmLabel}: ${other.name}`);
        return;
      }
      used = true;
      box.querySelectorAll('button').forEach(b => { b.disabled = true; });
      callback();
    });
    box.append(control);
  };

  const pending = (state.pendingDiplomacyRequests ?? []).filter((request: PendingDiplomaticRequest) =>
    request.type === 'withdrawal' && isDiplomaticRequestLive(state, request)
    && ((request.fromCivId === viewerId && request.toCivId === otherId) || (request.fromCivId === otherId && request.toCivId === viewerId)));
  const incoming = pending.find(request => request.toCivId === viewerId);
  const outgoing = pending.find(request => request.fromCivId === viewerId);

  if (incoming) {
    const expires = PENDING_DIPLOMATIC_REQUEST_TTL_TURNS - (state.turn - incoming.turnIssued);
    text(`${other.name} demands that your armed forces pull back from its cities. Their troops are within ${BORDER_TENSION_RADIUS} hexes of a city they can see. Promise to withdraw: keeping it improves relations, breaking it damages relations and your reputation. Refuse: an immediate larger relationship penalty, with no broken-promise reputation cost. No war is declared either way. Expires in ${expires} turns.`);
    button('Promise to withdraw', () => callbacks.onAcceptWithdrawalDemand?.(incoming.id), 'Confirm promise');
    button('Refuse', () => callbacks.onRefuseWithdrawalDemand?.(incoming.id), 'Confirm refusal');
    return box;
  }

  if (outgoing) {
    text(`You demanded that ${other.name} pull its troops back. Expires in ${PENDING_DIPLOMATIC_REQUEST_TTL_TURNS - (state.turn - outgoing.turnIssued)} turns.`);
    return box;
  }

  const active = getBorderConfrontations(state).find(record =>
    record.status === 'promised'
    && ((record.hostCivId === viewerId && record.intruderCivId === otherId)
      || (record.hostCivId === otherId && record.intruderCivId === viewerId)));
  if (active) {
    const turnsLeft = Math.max(0, (active.deadlineTurn ?? state.turn) - state.turn);
    const viewerIsHost = active.hostCivId === viewerId;
    const satisfies = getBorderConfrontationStatusForViewer(state, viewerId, active);
    text(viewerIsHost
      ? `${other.name} promised to withdraw its troops by turn ${active.deadlineTurn}. As things stand ${satisfies ? 'that promise is satisfied' : 'its armed units are still near your cities'}. ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} remain.`
      : `You promised ${other.name} to withdraw by turn ${active.deadlineTurn}. As things stand ${satisfies ? 'you have pulled back far enough' : 'your armed units are still inside the disputed radius'}. ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} remain. Breaking the promise will damage relations and your reputation.`);
    return box;
  }

  const last = getLastBorderConfrontation(state, viewerId, otherId);
  if (last && (state.turn - (last.resolvedTurn ?? last.issuedTurn)) < BORDER_CONFRONTATION_RECORD_RETENTION_TURNS) {
    const label = STATUS_TEXT[last.status];
    const outcome = last.status === 'fulfilled'
      ? 'Relations improved.'
      : last.status === 'broken'
        ? 'Relations worsened and the betrayal was noted by other civilizations.'
        : last.status === 'refused'
          ? 'Relations worsened; no war was declared.'
          : 'War, vassalage, an alliance or Open Borders made it moot.';
    text(`Last border confrontation with ${other.name}: ${label} (turn ${last.resolvedTurn ?? last.issuedTurn}). ${outcome}`);
  }

  const eligibility = getBorderConfrontationEligibility(state, viewerId, otherId);
  if (eligibility.ok && resolveDiplomaticAction(state, viewerId, otherId, 'demand_withdrawal').ok) {
    text(`Their armed units are near your cities. Demand that they pull back. They may promise a timed withdrawal or refuse; refusing worsens relations but does not start a war.`);
    button('Demand withdrawal', () => callbacks.onDemandWithdrawal?.(otherId), 'Confirm demand');
    return box;
  }

  const denied = resolveDiplomaticAction(state, viewerId, otherId, 'demand_withdrawal');
  if (!eligibility.ok && !SILENT_DENIALS.has(eligibility.reason)) {
    text(`Withdrawal demand unavailable: ${DIPLOMATIC_ACTION_DENIAL_MESSAGES[eligibility.reason]}`);
  } else if (!denied.ok && !SILENT_DENIALS.has(denied.reason)) {
    text(`Withdrawal demand unavailable: ${DIPLOMATIC_ACTION_DENIAL_MESSAGES[denied.reason]}`);
  }
  return box;
}
