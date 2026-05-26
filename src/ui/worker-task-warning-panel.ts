export interface WorkerTaskWarningPanelConfig {
  improvementName: string;
  turnsLeft: number;
  onConfirm: () => void;
  onCancel: () => void;
}

import { createGameButton } from '@/ui/ui-kit';

export interface WorkerReplacementConfirmPanelConfig {
  existingName: string;
  newName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function createWorkerReplacementConfirmPanel(
  container: HTMLElement,
  config: WorkerReplacementConfirmPanelConfig,
): HTMLElement {
  container.querySelector('#worker-replacement-confirm-panel')?.remove();
  let closed = false;
  const panel = document.createElement('div');
  panel.id = 'worker-replacement-confirm-panel';
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;background:rgba(18,18,18,0.96);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:16px;max-width:360px;color:white;';

  const title = document.createElement('h3');
  title.textContent = `Replace ${config.existingName}?`;
  const body = document.createElement('p');
  body.textContent = `Building ${config.newName} will remove the existing ${config.existingName}.`;

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;';

  const cancel = createGameButton('Keep', 'ghost');
  cancel.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onCancel();
  });

  const confirm = createGameButton('Replace', 'danger');
  confirm.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onConfirm();
  });

  buttonRow.append(cancel, confirm);
  panel.append(title, body, buttonRow);
  container.appendChild(panel);
  return panel;
}

export function createWorkerTaskWarningPanel(
  container: HTMLElement,
  config: WorkerTaskWarningPanelConfig,
): HTMLElement {
  container.querySelector('#worker-task-warning-panel')?.remove();
  let closed = false;
  const panel = document.createElement('div');
  panel.id = 'worker-task-warning-panel';
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;background:rgba(18,18,18,0.96);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:16px;max-width:360px;color:white;';

  const turnsLabel = config.turnsLeft === 1 ? '1 turn remaining' : `${config.turnsLeft} turns remaining`;
  const title = document.createElement('h3');
  title.textContent = `${config.improvementName} in progress — ${turnsLabel}`;
  const body = document.createElement('p');
  body.textContent = 'Moving this worker now means work in progress will be lost.';

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;';

  const cancel = createGameButton('Keep working', 'ghost');
  cancel.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onCancel();
  });

  const confirm = createGameButton('Move anyway', 'danger');
  confirm.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onConfirm();
  });

  buttonRow.append(cancel, confirm);
  panel.append(title, body, buttonRow);
  container.appendChild(panel);
  return panel;
}
