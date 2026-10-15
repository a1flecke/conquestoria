import type { LastStandPreview, RallyPreview, SeizeEligibleUnit } from '@/systems/great-general-abilities';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';
import { markModal } from '@/ui/modal-contract';
import type { GeneralIdentity } from '@/systems/great-general-presentation';
import { createGeneralPortrait } from '@/ui/general-portrait';

function panelShell(container: HTMLElement, id: string): HTMLElement {
  container.querySelector(`#${id}`)?.remove();
  const panel = document.createElement('div');
  panel.id = id;
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:50;padding:16px;overflow:auto;';
  container.appendChild(panel);
  return panel;
}

/** #889: which General is acting, drawn as the same crest every other surface uses (optional so a caller with no identity still works). */
function identityHeader(panel: HTMLElement, title: string, identity: GeneralIdentity | undefined): void {
  const heading = document.createElement('h2');
  heading.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;display:flex;align-items:center;gap:10px;';
  if (identity) heading.appendChild(createGeneralPortrait(identity.presentation, { size: 34, name: identity.name }));
  heading.appendChild(document.createTextNode(identity ? `${title} — ${identity.name}` : title));
  panel.appendChild(heading);
}

/** Final Command is the weightiest decision a General offers: say so plainly, name who retires, and say where their story is kept. */
function finalCommandNotice(panel: HTMLElement, identity?: GeneralIdentity): void {
  const notice = document.createElement('p');
  notice.dataset.finalCommand = 'true';
  const who = identity ? `${identity.name}'s` : 'this General\'s';
  notice.textContent = `Final Command: this is ${who} last Command Charge. They will retire at the end of this turn and take their place in your Hall of Fame.`;
  notice.style.cssText = 'font-size:12px;color:#e8c170;font-weight:bold;margin:8px 0;padding:8px 10px;border-left:3px solid #e8c170;background:rgba(232,193,112,0.1);border-radius:0 8px 8px 0;';
  panel.appendChild(notice);
}

/** `disableConfirm` (review fix): true when there is nothing for Confirm to
 * actually do (e.g. Rally/Last Stand previewed zero eligible targets) --
 * disabling it here is UI-layer defense-in-depth alongside the state-layer
 * guards in issueRally/issueSeizeTheMoment/issueLastStand that already
 * refuse to spend a charge on a no-op; this just stops the player from
 * clicking a Confirm that both know will do nothing. */
function confirmCancelRow(panel: HTMLElement, onConfirm: () => void, onCancel: () => void, disableConfirm = false): void {
  let fired = false;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

  const confirmButton = createGameButton('Confirm', 'primary', { disabled: disableConfirm });
  confirmButton.addEventListener('click', () => {
    if (fired || disableConfirm) return;
    fired = true;
    panel.remove();
    onConfirm();
  });
  row.appendChild(confirmButton);

  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.addEventListener('click', () => {
    if (fired) return;
    fired = true;
    panel.remove();
    onCancel();
  });
  row.appendChild(cancelButton);

  panel.appendChild(row);
  // Confirm spends a Command Charge: Cancel is the safe default and answers Escape (#1459).
  markModal(panel, { cancel: cancelButton, initialFocus: cancelButton });
}

export function createRallyPanel(
  container: HTMLElement,
  preview: RallyPreview,
  onConfirm: () => void,
  onCancel: () => void,
  identity?: GeneralIdentity,
): HTMLElement {
  const panel = panelShell(container, 'rally-panel');

  identityHeader(panel, 'Rally', identity);

  if (preview.eligibility.isFinalCharge) finalCommandNotice(panel, identity);

  if (preview.targets.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No units in range are eligible for Rally right now.';
    empty.style.cssText = 'font-size:13px;opacity:0.8;';
    panel.appendChild(empty);
  }

  for (const target of preview.targets) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;font-size:12px;';
    row.textContent = `${target.unitId}: HP ${target.healthBefore} -> ${target.healthAfter}, ${target.stageBefore} -> ${target.stageAfter}`;
    panel.appendChild(row);
  }

  confirmCancelRow(panel, onConfirm, onCancel, preview.targets.length === 0);
  return panel;
}

export function createSeizeThePanelMoment(
  container: HTMLElement,
  _generalUnitId: string,
  eligible: SeizeEligibleUnit[],
  onConfirm: (selectedUnitIds: string[]) => void,
  onCancel: () => void,
  identity?: GeneralIdentity,
): HTMLElement {
  const panel = panelShell(container, 'seize-the-moment-panel');

  identityHeader(panel, 'Seize the Moment', identity);

  const intro = document.createElement('p');
  intro.textContent = 'Choose which units get one more action:';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 12px;';
  panel.appendChild(intro);

  if (eligible.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No units nearby have already acted this turn -- nothing eligible for Seize the Moment yet.';
    empty.style.cssText = 'font-size:13px;opacity:0.8;';
    panel.appendChild(empty);
  }

  const checkboxes: HTMLInputElement[] = [];
  for (const entry of eligible) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.unitId = entry.unitId;
    checkboxes.push(checkbox);
    label.appendChild(checkbox);
    label.append(document.createTextNode(`${entry.label} (${entry.unitId})`));
    panel.appendChild(label);
  }

  let fired = false;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

  const confirmButton = createGameButton('Confirm', 'primary', { disabled: checkboxes.every(cb => !cb.checked) });
  const syncConfirmDisabled = () => setButtonDisabled(confirmButton, checkboxes.every(cb => !cb.checked));
  for (const checkbox of checkboxes) checkbox.addEventListener('change', syncConfirmDisabled);
  confirmButton.addEventListener('click', () => {
    if (fired || checkboxes.every(cb => !cb.checked)) return;
    fired = true;
    const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.unitId!);
    panel.remove();
    onConfirm(selected);
  });
  row.appendChild(confirmButton);

  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.addEventListener('click', () => {
    if (fired) return;
    fired = true;
    panel.remove();
    onCancel();
  });
  row.appendChild(cancelButton);

  panel.appendChild(row);
  markModal(panel, { cancel: cancelButton, initialFocus: cancelButton });
  return panel;
}

export function createLastStandPanel(
  container: HTMLElement,
  preview: LastStandPreview,
  onConfirm: () => void,
  onCancel: () => void,
  identity?: GeneralIdentity,
): HTMLElement {
  const panel = panelShell(container, 'last-stand-panel');

  identityHeader(panel, 'Last Stand', identity);

  if (preview.eligibility.isFinalCharge) finalCommandNotice(panel, identity);

  const summary = document.createElement('p');
  summary.textContent = `Defense +${preview.defenseBonusPercent}% for ${preview.durationTurns} turn(s), with one shared Hold! save for the formation.`;
  summary.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 8px;';
  panel.appendChild(summary);

  if (preview.targets.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No eligible combat units in that area.';
    empty.style.cssText = 'font-size:13px;opacity:0.8;';
    panel.appendChild(empty);
  }

  for (const target of preview.targets) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:6px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;font-size:12px;';
    row.textContent = target.unitId;
    panel.appendChild(row);
  }

  confirmCancelRow(panel, onConfirm, onCancel, preview.targets.length === 0);
  return panel;
}
