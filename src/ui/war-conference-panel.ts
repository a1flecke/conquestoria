/**
 * #991 -- the peace conference: the negotiation surface for an active war,
 * not a decorative summary. Shows the war's name, its declared objectives and
 * whether they were met (#988's own war-goal status), the major recorded
 * events the viewer is entitled to see (already redacted by
 * `getWarPresentationForViewer`), and embeds the real settlement-offer
 * builder (#988's `openSettlementOfferPanel`) as the actual way to end it --
 * reused, never rebuilt.
 */
import type { GameState } from '@/core/types';
import type { SettlementTerm } from '@/core/types/diplomacy';
import { getWarPresentationForViewer } from '@/systems/war-history-system';
import { describeWarGoalLabel } from '@/systems/war-goal-system';
import { createGameButton } from '@/ui/ui-kit';
import { openSettlementOfferPanel } from '@/ui/settlement-offer-panel';

function describeGoalStatusLine(state: GameState, viewerId: string, opponentCivId: string): string | null {
  const label = describeWarGoalLabel(state, viewerId, opponentCivId);
  return label ? `Your goal: ${label}` : null;
}

export function openWarConferencePanel(
  container: HTMLElement,
  state: GameState,
  opponentCivId: string,
  warId: string,
  onProposeSettlement: (terms: SettlementTerm[]) => void,
): void {
  container.querySelector('#war-conference-panel')?.remove();

  const presentation = getWarPresentationForViewer(state, state.currentPlayer, warId);
  if (!presentation) return;

  const panel = document.createElement('div');
  panel.id = 'war-conference-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:75vh;overflow-y:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  title.textContent = presentation.name;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const statusLine = document.createElement('div');
  statusLine.style.cssText = 'font-size:12px;opacity:0.8;margin-bottom:8px;';
  statusLine.textContent = presentation.endTurn !== undefined
    ? `Concluded turn ${presentation.endTurn} (${(presentation.outcome ?? '').replace(/-/g, ' ')}).`
    : `Active since turn ${presentation.startTurn}.`;
  panel.appendChild(statusLine);

  const goalLine = describeGoalStatusLine(state, state.currentPlayer, opponentCivId);
  if (goalLine) {
    const goalDiv = document.createElement('div');
    goalDiv.style.cssText = 'font-size:12px;color:#e8c170;margin-bottom:12px;';
    goalDiv.textContent = goalLine;
    panel.appendChild(goalDiv);
  }

  const participantsHeader = document.createElement('div');
  participantsHeader.textContent = 'Participants';
  participantsHeader.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
  panel.appendChild(participantsHeader);
  for (const p of presentation.participants) {
    const row = document.createElement('div');
    row.style.cssText = 'font-size:12px;padding:2px 0;opacity:0.9;';
    const status = p.leftTurn !== undefined ? ` (left turn ${p.leftTurn})` : '';
    row.textContent = `${p.name} — ${p.side}${status}`;
    panel.appendChild(row);
  }

  const eventsHeader = document.createElement('div');
  eventsHeader.textContent = 'History';
  eventsHeader.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
  panel.appendChild(eventsHeader);
  for (const event of presentation.events) {
    const row = document.createElement('div');
    row.style.cssText = 'font-size:12px;padding:2px 0;opacity:0.8;';
    row.textContent = `Turn ${event.turn}: ${event.text}`;
    panel.appendChild(row);
  }

  if (presentation.endTurn === undefined) {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
    const negotiateBtn = createGameButton('Build Settlement Offer', 'primary');
    negotiateBtn.addEventListener('click', () => {
      panel.remove();
      openSettlementOfferPanel(container, state, opponentCivId, onProposeSettlement);
    });
    btnRow.appendChild(negotiateBtn);
    panel.appendChild(btnRow);
  }

  container.appendChild(panel);
}
