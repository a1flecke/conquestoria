export interface EndTurnWarningUnit {
  unitId: string;
  label: string;
  positionLabel: string;
}

export interface EndTurnWarningConfig {
  unmovedUnits: EndTurnWarningUnit[];
  onGoToUnit: (unitId: string) => void;
  onEndTurnAnyway: () => void;
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

export function createEndTurnWarningPanel(
  container: HTMLElement,
  config: EndTurnWarningConfig,
): HTMLElement {
  container.querySelector('#end-turn-warning-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'end-turn-warning-panel';
  panel.style.cssText = 'position:absolute;inset:0;z-index:44;background:rgba(9,10,16,0.86);display:flex;align-items:center;justify-content:center;padding:16px;';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'max-width:420px;width:100%;background:#171923;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:16px;color:white;box-shadow:0 18px 60px rgba(0,0,0,0.45);';

  const count = config.unmovedUnits.length;
  const title = document.createElement('h2');
  title.textContent = `${count} ${count === 1 ? 'unit still needs' : 'units still need'} orders`;
  title.style.cssText = 'font-size:18px;margin:0 0 8px;color:#e8c170;';
  dialog.appendChild(title);

  const body = document.createElement('p');
  body.textContent = 'End the turn anyway, or jump to an unmoved unit first?';
  body.style.cssText = 'font-size:13px;line-height:1.4;margin:0 0 12px;opacity:0.85;';
  dialog.appendChild(body);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0 0 16px;padding-left:18px;font-size:12px;line-height:1.5;';
  for (const unit of config.unmovedUnits.slice(0, 6)) {
    const item = document.createElement('li');
    item.textContent = `${unit.label} at ${unit.positionLabel}`;
    list.appendChild(item);
  }
  if (config.unmovedUnits.length > 6) {
    const item = document.createElement('li');
    item.textContent = `${config.unmovedUnits.length - 6} more`;
    list.appendChild(item);
  }
  dialog.appendChild(list);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
  buttons.appendChild(createButton(
    'Cancel',
    'padding:9px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;cursor:pointer;',
    config.onCancel,
  ));
  buttons.appendChild(createButton(
    'Go to Unit',
    'padding:9px 14px;border-radius:8px;border:1px solid rgba(232,193,112,0.6);background:rgba(232,193,112,0.12);color:#f8e5b8;cursor:pointer;font-weight:bold;',
    () => config.onGoToUnit(config.unmovedUnits[0].unitId),
  ));
  buttons.appendChild(createButton(
    'End Turn Anyway',
    'padding:9px 14px;border-radius:8px;border:0;background:#b45309;color:white;cursor:pointer;font-weight:bold;',
    config.onEndTurnAnyway,
  ));
  dialog.appendChild(buttons);

  panel.appendChild(dialog);
  container.appendChild(panel);
  return panel;
}
