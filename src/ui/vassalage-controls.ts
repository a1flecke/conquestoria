import type { GameState } from '@/core/types';
import type { DiplomacyPanelCallbacks } from '@/ui/diplomacy-panel';
import { createGameButton } from '@/ui/ui-kit';
import {
  canPetitionIndependence, getVassalageEligibility, isDiplomaticRequestLive,
  PENDING_DIPLOMATIC_REQUEST_TTL_TURNS, VASSALAGE_TRIBUTE_RATE,
  VASSALAGE_PROTECTION_TURNS, VASSALAGE_PROTECTION_PENALTY,
} from '@/systems/diplomacy-system';

/** Viewer-owned controls mounted by the live diplomacy panel. */
export function createVassalageControls(state: GameState, otherId: string, callbacks: DiplomacyPanelCallbacks): HTMLElement {
  const box = document.createElement('section');
  box.dataset.role = 'vassalage-controls';
  box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;font-size:12px;';
  const viewerId = state.currentPlayer;
  const viewer = state.civilizations[viewerId];
  const other = state.civilizations[otherId];
  if (!viewer || !other) return box;
  const text = (message: string) => {
    const line = document.createElement('p');
    line.style.cssText = 'flex-basis:100%;margin:0;line-height:1.5;';
    line.textContent = message; box.append(line);
  };
  let used = false;
  const button = (label: string, callback: () => void, danger = false, confirmLabel?: string) => {
    const control = createGameButton(label, danger ? 'danger' : 'secondary');
    control.setAttribute('aria-label', `${label}: ${other.name}`);
    let armed = false;
    control.addEventListener('click', () => {
      if (used || !box.parentElement) return;
      if (confirmLabel && !armed) { armed = true; control.textContent = confirmLabel; control.setAttribute('aria-label', `${confirmLabel}: ${other.name}`); return; }
      used = true;
      box.querySelectorAll('button').forEach(b => { b.disabled = true; });
      callback();
    });
    box.append(control);
  };
  const requests = (state.pendingDiplomacyRequests ?? []).filter(r => isDiplomaticRequestLive(state, r)
    && ((r.fromCivId === viewerId && r.toCivId === otherId) || (r.fromCivId === otherId && r.toCivId === viewerId))
    && (r.type === 'independence' || r.treatyType === 'vassalage'));
  const incoming = requests.find(r => r.toCivId === viewerId);
  const outgoing = requests.find(r => r.fromCivId === viewerId);
  const vassal = viewer.diplomacy.vassalage.overlord === otherId ? viewer
    : other.diplomacy.vassalage.overlord === viewerId ? other : null;
  const eligible = getVassalageEligibility(state, viewerId, otherId).ok;
  if (!vassal && !incoming && !outgoing && !eligible) return box;
  const share = VASSALAGE_TRIBUTE_RATE * 100;
  text(`Vassalage: the vassal pays ${share}% of positive gold income before treasury upkeep (rounded down), joins the overlord's wars, and gives up independent war and treaty choices. Protection is a promise to respond, not an automatic human decision.`);
  if (vassal) {
    const role = vassal === viewer ? 'Your overlord' : 'Your vassal';
    text(`${role}: ${other.name}. Protection: ${vassal.diplomacy.vassalage.protectionScore}/100. ${vassal === viewer ? 'You pay' : 'You receive'} ${share}% tribute.`);
    const timers = vassal.diplomacy.vassalage.protectionTimers;
    for (const timer of timers) {
      const attacker = state.civilizations[timer.attackerCivId]?.name ?? 'an attacker';
      text(`Protection needed against ${attacker}: ${timer.turnsRemaining} turns left. Missing the ${VASSALAGE_PROTECTION_TURNS}-turn response costs ${VASSALAGE_PROTECTION_PENALTY} protection; at 20 or less the vassal becomes independent.`);
    }
    if (vassal !== viewer) {
      if (timers.length) {
        text('Defend Vassal joins every listed war to fulfill your protection promise.');
        button('Defend Vassal', () => callbacks.onAction(otherId, 'defend_vassal'));
      }
      text('Releasing this vassal ends tribute and protection peacefully and adds 40 treachery for abandoning your promise.');
      button('Release Vassal', () => callbacks.onAction(otherId, 'release_vassal'), true, 'Confirm Release');
    } else if (!outgoing && canPetitionIndependence(state, viewerId)) {
      text('Ask for independence. Refusal starts a war with your overlord and adds 20 treachery to your civilization.');
      button('Petition Independence', () => callbacks.onAction(otherId, 'petition_independence'));
    } else if (vassal === viewer && !outgoing) {
      text('To petition for independence, rebuild your military to 60% of your overlord’s military units. Each 20 protection lost lowers that threshold by 10 percentage points. At 20 protection or less, you leave peacefully. Your overlord can also release you.');
    }
  }
  if (incoming) {
    const expires = PENDING_DIPLOMATIC_REQUEST_TTL_TURNS - (state.turn - incoming.turnIssued);
    const petition = incoming.type === 'independence';
    text(petition ? `${other.name} asks for independence. Grant it peacefully, or refuse and face war. Expires in ${expires} turns.`
      : `${other.name} offers to become your vassal. Accept to receive tribute and take responsibility for protection. Expires in ${expires} turns.`);
    button(petition ? 'Grant Independence' : 'Accept Vassalage', () => callbacks.onAcceptTreatyProposal?.(incoming.id));
    button(petition ? 'Refuse — War' : 'Decline Vassalage', () => callbacks.onDeclineTreatyProposal?.(incoming.id), petition);
  } else if (outgoing) {
    text(`Awaiting ${other.name}'s decision on ${outgoing.type === 'independence' ? 'independence' : 'your vassalage offer'}. Expires in ${PENDING_DIPLOMATIC_REQUEST_TTL_TURNS - (state.turn - outgoing.turnIssued)} turns.`);
  } else if (!vassal && eligible) {
    text(`Offer to become ${other.name}'s vassal. Your current defensive league ends only if the offer is accepted.`);
    button('Offer Vassalage', () => callbacks.onAction(otherId, 'offer_vassalage'));
  }
  return box;
}
