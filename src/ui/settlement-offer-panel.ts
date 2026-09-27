/**
 * #988: build and send a negotiated peace settlement. Sending an empty term
 * list is a legal, unconditional white-peace offer (the plain "Make Peace"
 * button on the main diplomacy panel still exists for that immediate case;
 * this panel is for a negotiated settlement with terms). Only ever lists
 * cities the viewer has actually discovered (`hasDiscoveredCity`) -- the set
 * of offerable terms is itself information, per #988's viewer-safety rule.
 */
import type { GameState, SettlementTerm } from '@/core/types';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import { createGameButton } from '@/ui/ui-kit';

const REPARATIONS_STEP = 25;
const REPARATIONS_MAX = 500;

export function openSettlementOfferPanel(
  container: HTMLElement,
  state: GameState,
  opponentCivId: string,
  onPropose: (terms: SettlementTerm[]) => void,
): void {
  container.querySelector('#settlement-offer-panel')?.remove();

  const viewerId = state.currentPlayer;
  const opponent = state.civilizations[opponentCivId];
  if (!opponent) return;

  const panel = document.createElement('div');
  panel.id = 'settlement-offer-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:70vh;overflow-y:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  title.textContent = `Negotiate Peace with ${opponent.name}`;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px;opacity:0.65;margin-bottom:12px;';
  hint.textContent = 'Check the terms you want to demand, then send. Sending with nothing checked offers unconditional (white) peace.';
  panel.appendChild(hint);

  const pendingTerms: SettlementTerm[] = [];

  function addCheckbox(label: string, onToggle: (checked: boolean) => void): void {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 4px;min-height:44px;cursor:pointer;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => onToggle(checkbox.checked));
    const text = document.createElement('span');
    text.style.cssText = 'font-size:13px;';
    text.textContent = label;
    row.appendChild(checkbox);
    row.appendChild(text);
    panel.appendChild(row);
  }

  // Demand city cession -- only cities the viewer has actually discovered.
  const demandableCities = Object.values(state.cities)
    .filter(city => city.owner === opponentCivId && hasDiscoveredCity(state, viewerId, city.id));
  if (demandableCities.length > 0) {
    const sectionHeader = document.createElement('div');
    sectionHeader.textContent = 'Demand City Cession';
    sectionHeader.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    panel.appendChild(sectionHeader);
    for (const city of demandableCities) {
      addCheckbox(city.name, checked => {
        const term: SettlementTerm = { kind: 'transfer_city', cityId: city.id, fromCivId: opponentCivId, toCivId: viewerId };
        if (checked) pendingTerms.push(term);
        else {
          const idx = pendingTerms.findIndex(t => t.kind === 'transfer_city' && t.cityId === city.id);
          if (idx >= 0) pendingTerms.splice(idx, 1);
        }
      });
    }
  }

  // Demand reparations -- an amount the viewer picks; if the opponent
  // cannot actually afford it, the whole offer is legally rejected at
  // acceptance time like any other illegal term (no gold-visibility leak).
  const reparationsSection = document.createElement('div');
  reparationsSection.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
  reparationsSection.textContent = 'Demand Reparations';
  panel.appendChild(reparationsSection);
  const reparationsAmount = document.createElement('input');
  reparationsAmount.type = 'range';
  reparationsAmount.min = String(REPARATIONS_STEP);
  reparationsAmount.max = String(REPARATIONS_MAX);
  reparationsAmount.step = String(REPARATIONS_STEP);
  reparationsAmount.value = String(REPARATIONS_STEP);
  reparationsAmount.style.cssText = 'width:140px;vertical-align:middle;';
  const reparationsLabel = document.createElement('span');
  reparationsLabel.style.cssText = 'font-size:12px;margin-left:8px;';
  reparationsLabel.textContent = `${REPARATIONS_STEP} gold`;
  reparationsAmount.addEventListener('input', () => {
    reparationsLabel.textContent = `${reparationsAmount.value} gold`;
    const idx = pendingTerms.findIndex(t => t.kind === 'reparations');
    if (idx >= 0) {
      pendingTerms[idx] = { kind: 'reparations', fromCivId: opponentCivId, toCivId: viewerId, goldAmount: Number(reparationsAmount.value) };
    }
  });
  addCheckbox('Demand gold reparations', checked => {
    if (checked) {
      pendingTerms.push({ kind: 'reparations', fromCivId: opponentCivId, toCivId: viewerId, goldAmount: Number(reparationsAmount.value) });
    } else {
      const idx = pendingTerms.findIndex(t => t.kind === 'reparations');
      if (idx >= 0) pendingTerms.splice(idx, 1);
    }
  });
  const reparationsRow = document.createElement('div');
  reparationsRow.style.cssText = 'padding:0 4px 8px 32px;';
  reparationsRow.appendChild(reparationsAmount);
  reparationsRow.appendChild(reparationsLabel);
  panel.appendChild(reparationsRow);

  // Force vassalage -- only offered when the opponent is not already anyone's
  // vassal (public diplomatic knowledge); final eligibility is still
  // re-validated for real at acceptance time.
  if (!opponent.diplomacy.vassalage.overlord) {
    const vassalageSection = document.createElement('div');
    vassalageSection.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    vassalageSection.textContent = 'Force Vassalage';
    panel.appendChild(vassalageSection);
    addCheckbox(`Demand ${opponent.name} become your vassal`, checked => {
      const term: SettlementTerm = { kind: 'vassalize', vassalId: opponentCivId, overlordId: viewerId };
      if (checked) pendingTerms.push(term);
      else {
        const idx = pendingTerms.findIndex(t => t.kind === 'vassalize');
        if (idx >= 0) pendingTerms.splice(idx, 1);
      }
    });
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
  const sendBtn = createGameButton('Send Offer', 'primary');
  sendBtn.addEventListener('click', () => {
    onPropose([...pendingTerms]);
    panel.remove();
  });
  const cancelBtn = createGameButton('Cancel', 'secondary');
  cancelBtn.addEventListener('click', () => panel.remove());
  btnRow.appendChild(sendBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  container.appendChild(panel);
}
