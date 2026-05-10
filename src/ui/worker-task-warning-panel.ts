export interface WorkerTaskWarningPanelConfig {
  improvementName: string;
  onConfirm: () => void;
  onCancel: () => void;
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

  const title = document.createElement('h3');
  title.textContent = `${config.improvementName} in progress`;
  const body = document.createElement('p');
  body.textContent = 'Moving this worker now means work in progress will be lost.';

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;';

  const cancel = document.createElement('button');
  cancel.textContent = 'Keep working';
  cancel.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onCancel();
  });

  const confirm = document.createElement('button');
  confirm.textContent = 'Move anyway';
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
