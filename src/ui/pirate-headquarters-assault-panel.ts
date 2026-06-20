import type { PendingPirateHeadquartersAssault } from '@/input/pirate-headquarters-assault';
import { createGameButton } from '@/ui/ui-kit';

export interface PirateHeadquartersAssaultPanelCallbacks {
  onConfirm(): void;
  onCancel(): void;
}

function line(value: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = value;
  paragraph.style.cssText = 'margin:6px 0;font-size:13px;';
  return paragraph;
}

export function createPirateHeadquartersAssaultPanel(
  container: HTMLElement,
  pending: PendingPirateHeadquartersAssault,
  callbacks: PirateHeadquartersAssaultPanelCallbacks,
): HTMLElement {
  container.querySelector('#pirate-headquarters-assault-panel')?.remove();
  const panel = document.createElement('section');
  panel.id = 'pirate-headquarters-assault-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'pirate-assault-title');
  panel.style.cssText = 'position:absolute;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;background:rgba(3,7,18,0.72);padding:16px;color:#f8fafc;';

  const card = document.createElement('div');
  card.style.cssText = 'width:min(420px,92vw);background:#111827;border:1px solid #d4a13c;border-radius:14px;padding:18px;box-shadow:0 18px 48px rgba(0,0,0,0.5);';
  const title = document.createElement('h2');
  title.id = 'pirate-assault-title';
  title.textContent = 'Assault Pirate Enclave';
  card.appendChild(title);

  const preview = pending.preview;
  const integrityBefore = preview.integrityAfter + preview.damageToHeadquarters;
  card.appendChild(line(`Integrity: ${integrityBefore} -> ${preview.integrityAfter}`));
  card.appendChild(line(`Counterfire: ${preview.counterfireDamage} HP`));
  card.appendChild(line("Consumes this unit's action and movement."));
  card.appendChild(line(`Destruction bounty: ${preview.bounty} gold`));
  if (preview.integrityAfter === 0) card.appendChild(line('This assault will destroy the enclave.'));

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:16px;';
  const cancel = createGameButton('Cancel', 'ghost');
  cancel.setAttribute('aria-label', 'Cancel pirate assault');
  cancel.addEventListener('click', callbacks.onCancel);
  const confirm = createGameButton('Confirm assault', 'danger');
  confirm.dataset.action = 'confirm-pirate-assault';
  confirm.disabled = !preview.available;
  confirm.addEventListener('click', () => {
    confirm.disabled = true;
    callbacks.onConfirm();
  });
  actions.appendChild(cancel);
  actions.appendChild(confirm);
  card.appendChild(actions);
  panel.appendChild(card);
  container.appendChild(panel);
  return panel;
}
