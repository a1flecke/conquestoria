export interface UnitDeleteConfirmationConfig {
  unitName: string;
  /** Overrides the default `Delete ${unitName}?` title — use for non-destructive but
   * final actions (e.g. a missionary consumed by a successful preach) so the framing
   * doesn't read as a warning about an accidental/destructive action. */
  title?: string;
  bodyText?: string;
  /** Overrides the default "Delete Unit" confirm-button label — pair with `hideCancel`
   * for actions where the removal already happened and this panel is acknowledging it,
   * not gating it. */
  confirmLabel?: string;
  /** Hides the Cancel button — use when the unit removal already occurred (e.g. a
   * missionary consumed by its own last preach charge) so there is nothing left to
   * cancel; onConfirm becomes the single "OK" dismissal. */
  hideCancel?: boolean;
  /** 'danger' (default) is the destructive-action red styling. 'neutral' swaps the title
   * color and the confirm button to a calm, non-alarming palette — use for acknowledgment
   * dialogs (like a missionary consumed by a successful preach) where nothing bad
   * happened; a red "OK" button after good news reads as a warning to younger players. */
  tone?: 'danger' | 'neutral';
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

  const isNeutral = config.tone === 'neutral';

  const title = document.createElement('h2');
  title.textContent = config.title ?? `Delete ${config.unitName}?`;
  title.style.cssText = `font-size:18px;margin:0 0 8px;color:${isNeutral ? '#b39ddb' : '#fca5a5'};`;
  dialog.appendChild(title);

  const body = document.createElement('p');
  body.textContent = config.bodyText ?? 'This removes the unit permanently.';
  body.style.cssText = 'font-size:13px;line-height:1.4;margin:0 0 16px;opacity:0.85;';
  dialog.appendChild(body);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
  if (!config.hideCancel) {
    buttons.appendChild(createButton(
      'Cancel',
      'padding:9px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;cursor:pointer;',
      config.onCancel,
    ));
  }
  buttons.appendChild(createButton(
    config.confirmLabel ?? 'Delete Unit',
    `padding:9px 14px;border-radius:8px;border:0;background:${isNeutral ? '#7c5cbf' : '#b91c1c'};color:white;cursor:pointer;font-weight:bold;`,
    config.onConfirm,
  ));
  dialog.appendChild(buttons);

  panel.appendChild(dialog);
  container.appendChild(panel);
  return panel;
}
