export interface UnitDeleteConfirmationConfig {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function createButton(label: string, styles: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = styles;
  button.addEventListener('click', onClick);
  return button;
}

export function createUnitDeleteConfirmationPanel(
  container: HTMLElement,
  config: UnitDeleteConfirmationConfig,
): HTMLElement {
  container.querySelector('#unit-delete-confirmation-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'unit-delete-confirmation-panel';
  panel.style.cssText = 'position:absolute;inset:0;z-index:45;background:rgba(9,10,16,0.86);display:flex;align-items:center;justify-content:center;padding:16px;';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'max-width:360px;width:100%;background:#171923;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:16px;color:white;box-shadow:0 18px 60px rgba(0,0,0,0.45);';

  const title = document.createElement('h2');
  title.textContent = `Delete ${config.unitName}?`;
  title.style.cssText = 'font-size:18px;margin:0 0 8px;color:#fca5a5;';
  dialog.appendChild(title);

  const body = document.createElement('p');
  body.textContent = 'This removes the unit permanently.';
  body.style.cssText = 'font-size:13px;line-height:1.4;margin:0 0 16px;opacity:0.85;';
  dialog.appendChild(body);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
  buttons.appendChild(createButton(
    'Cancel',
    'padding:9px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;cursor:pointer;',
    config.onCancel,
  ));
  buttons.appendChild(createButton(
    'Delete Unit',
    'padding:9px 14px;border-radius:8px;border:0;background:#b91c1c;color:white;cursor:pointer;font-weight:bold;',
    config.onConfirm,
  ));
  dialog.appendChild(buttons);

  panel.appendChild(dialog);
  container.appendChild(panel);
  return panel;
}
