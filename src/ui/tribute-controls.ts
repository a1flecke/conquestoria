import type { GameState, PendingDiplomaticRequest } from '@/core/types';
import type { DiplomacyPanelCallbacks } from '@/ui/diplomacy-panel';
import { createGameButton } from '@/ui/ui-kit';
import { DIPLOMATIC_ACTION_DENIAL_MESSAGES } from '@/systems/diplomacy-actions';
import { isDiplomaticRequestLive, PENDING_DIPLOMATIC_REQUEST_TTL_TURNS } from '@/systems/diplomacy-requests';
import { resolveDiplomaticAction } from '@/systems/diplomacy-system';
import { getLiveTributeBetween, getTributeDemandEligibility } from '@/systems/diplomacy-tribute';

/** Denials that describe a civilization the viewer cannot act on at all: nothing useful to say, so say nothing. */
const SILENT_DENIALS = new Set(['unknown-civilization', 'self', 'not-alive', 'not-met', 'at-war', 'self-target']);

const rounds = (n: number): string => `${n} round${n === 1 ? '' : 's'}`;

/**
 * Viewer-owned tribute controls mounted by the live diplomacy panel (#1334). Everything shown is the viewer's own:
 * a contract or pending demand appears only when the viewer is a party, and the credibility line never quotes a strength
 * number. Availability and the executor both come from `resolveDiplomaticAction('demand_tribute')`, so a button is shown
 * exactly when pressing it can do something.
 */
export function createTributeControls(state: GameState, otherId: string, callbacks: DiplomacyPanelCallbacks): HTMLElement {
  const box = document.createElement('section');
  box.dataset.role = 'tribute-controls';
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
  const button = (label: string, callback: () => void, danger = false, confirmLabel?: string) => {
    const control = createGameButton(label, danger ? 'danger' : 'secondary');
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
    request.type === 'tribute' && isDiplomaticRequestLive(state, request)
    && ((request.fromCivId === viewerId && request.toCivId === otherId) || (request.fromCivId === otherId && request.toCivId === viewerId)));
  const incoming = pending.find(request => request.toCivId === viewerId);
  const outgoing = pending.find(request => request.fromCivId === viewerId);
  const contract = getLiveTributeBetween(state, viewerId, otherId);

  if (contract) {
    const paying = contract.tribute.payerId === viewerId;
    text(paying
      ? `Tribute: you pay ${other.name} ${contract.tribute.goldPerRound} gold per round. ${rounds(contract.turnsRemaining)} remaining.`
      : `Tribute: ${other.name} pays you ${contract.tribute.goldPerRound} gold per round. ${rounds(contract.turnsRemaining)} remaining.`);
    return box;
  }

  if (incoming?.tribute) {
    const expires = PENDING_DIPLOMATIC_REQUEST_TTL_TURNS - (state.turn - incoming.turnIssued);
    text(`${other.name} demands ${incoming.tribute.goldPerRound} gold per round for ${rounds(incoming.tribute.rounds)}. If you accept, you pay that each round and cannot pay more or less. If you refuse, relations worsen, but no war starts automatically. Expires in ${expires} turns.`);
    button('Accept Demand', () => callbacks.onAcceptTreatyProposal?.(incoming.id));
    button('Refuse (no war)', () => callbacks.onDeclineTreatyProposal?.(incoming.id));
    return box;
  }

  if (outgoing) {
    text(`Awaiting ${other.name}'s answer to your tribute demand. Expires in ${PENDING_DIPLOMATIC_REQUEST_TTL_TURNS - (state.turn - outgoing.turnIssued)} turns.`);
    return box;
  }

  const eligibility = getTributeDemandEligibility(state, viewerId, otherId);
  if (eligibility.ok && resolveDiplomaticAction(state, viewerId, otherId, 'demand_tribute').ok) {
    const { goldPerRound, rounds: term } = eligibility.terms;
    text(`Demand ${goldPerRound} gold per round for ${rounds(term)}. Your forces are clearly stronger than the forces you know of, so the demand is credible. They may accept or refuse. Refusal worsens relations but does not automatically start a war.`);
    button('Demand Tribute', () => callbacks.onAction(otherId, 'demand_tribute'), false, 'Confirm Demand');
    return box;
  }

  const denied = resolveDiplomaticAction(state, viewerId, otherId, 'demand_tribute');
  if (!denied.ok && !SILENT_DENIALS.has(denied.reason)) {
    text(`Tribute demand unavailable: ${DIPLOMATIC_ACTION_DENIAL_MESSAGES[denied.reason]}`);
  }
  return box;
}
