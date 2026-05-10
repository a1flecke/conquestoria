export interface ForeignCityEntryPanelConfig {
  cityName: string;
  defenderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

import { createGameButton } from '@/ui/ui-kit';

export function createForeignCityEntryPanel(
  container: HTMLElement,
  config: ForeignCityEntryPanelConfig,
): HTMLElement {
  container.querySelector('#foreign-city-entry-panel')?.remove();
  let closed = false;
  const panel = document.createElement('div');
  panel.id = 'foreign-city-entry-panel';
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;background:rgba(18,18,18,0.96);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:16px;max-width:360px;color:white;';

  const title = document.createElement('h3');
  title.textContent = `Enter ${config.cityName}?`;
  const body = document.createElement('p');
  body.textContent = `Entering this neutral city declares war on ${config.defenderName}.`;

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;';

  const cancel = createGameButton('Cancel', 'ghost');
  cancel.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onCancel();
  });

  const confirm = createGameButton('Continue', 'secondary');
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
