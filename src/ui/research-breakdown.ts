import type { ResearchOutputBreakdown, ResearchOutputDisplayRowKind } from '@/systems/research-output-system';
import { createGameButton } from '@/ui/ui-kit';

export interface ResearchBreakdownOptions {
  onClose: () => void;
  returnFocusTo?: HTMLElement;
}

const ROW_LABELS: Record<ResearchOutputDisplayRowKind, string> = {
  'city-gross': 'City science',
  coordination: 'Research network',
  'empire-bonus': 'Empire research',
  'temporary-penalty': 'Temporary setback',
  final: 'Final research',
};

function formatScience(science: number): string {
  return `${science >= 0 ? '+' : ''}${science}`;
}

/** Renders the canonical research-output explanation without duplicating its math. */
export function createResearchBreakdown(
  breakdown: ResearchOutputBreakdown,
  options: ResearchBreakdownOptions,
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.dataset.role = 'research-breakdown';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'research-breakdown-title');
  panel.style.cssText = [
    'position:absolute',
    'inset:0',
    'z-index:80',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
    'padding:16px',
    'background:rgba(7,9,16,0.82)',
  ].join(';');

  const dialog = document.createElement('div');
  dialog.style.cssText = [
    'box-sizing:border-box',
    'width:min(420px, 100%)',
    'max-height:calc(100dvh - 32px)',
    'overflow-y:auto',
    'border:1px solid rgba(232,193,112,0.45)',
    'border-radius:14px',
    'background:#141827',
    'color:#f4f1e8',
    'box-shadow:0 24px 64px rgba(0,0,0,0.55)',
    'padding:16px',
  ].join(';');
  panel.appendChild(dialog);

  const heading = document.createElement('h2');
  heading.id = 'research-breakdown-title';
  heading.textContent = 'Research details';
  heading.style.cssText = 'margin:0 0 12px;color:#e8c170;font-size:20px;';
  dialog.appendChild(heading);

  const description = document.createElement('p');
  description.textContent = 'Your research each turn, from city work through empire-wide effects.';
  description.style.cssText = 'margin:0 0 12px;line-height:1.4;opacity:0.78;font-size:13px;';
  dialog.appendChild(description);

  const rows = document.createElement('div');
  rows.style.cssText = 'display:grid;gap:7px;';
  for (const row of breakdown.rows) {
    const line = document.createElement('div');
    line.dataset.researchOutputKind = row.kind;
    line.style.cssText = row.kind === 'final'
      ? 'display:flex;justify-content:space-between;gap:16px;border-top:1px solid rgba(232,193,112,0.38);margin-top:4px;padding-top:10px;color:#e8c170;font-weight:bold;'
      : 'display:flex;justify-content:space-between;gap:16px;';
    const label = document.createElement('span');
    label.textContent = ROW_LABELS[row.kind];
    const value = document.createElement('span');
    value.textContent = formatScience(row.science);
    line.append(label, value);
    rows.appendChild(line);
  }
  dialog.appendChild(rows);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;margin-top:16px;';
  const close = createGameButton('Close', 'ghost');
  close.dataset.action = 'close-research-breakdown';
  actions.appendChild(close);
  dialog.appendChild(actions);

  let closed = false;
  const dismiss = (): void => {
    if (closed) return;
    closed = true;
    panel.remove();
    if (options.returnFocusTo?.isConnected) options.returnFocusTo.focus();
    options.onClose();
  };
  close.addEventListener('click', dismiss);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismiss();
  });

  return panel;
}
