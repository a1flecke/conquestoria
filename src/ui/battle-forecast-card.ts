import type { BattleForecastView } from './battle-forecast-projection';

/**
 * The unit-vs-unit battle preview card (#1135), extracted from `map-interaction-controller.ts`.
 * Pure DOM from a viewer-safe `BattleForecastView`; every dynamic string goes through `textContent`
 * (unit and civ names are game-generated). Works on tap alone (no hover), reads without colour
 * (icon + words), and uses no animation. Layers: headline -> two damage lines -> one-line "why" ->
 * an expandable "More details" for the exact factors.
 */
export interface BattleForecastCardInput {
  view: BattleForecastView;
  /** Extra always-visible notes (beast traits, stack info) the controller already knows. */
  notes: Array<{ text: string; emphasis: 'warning' | 'info' }>;
  /** Confirm button label and card title; defaults to the ordinary-attack wording. Air strikes (#1213) use "Strike". */
  action?: { label: string; title: string };
}

export interface BattleForecastCardCallbacks {
  onAttack: () => void;
  onCancel: () => void;
}

const BAND_COLOR: Record<BattleForecastView['band'], string> = {
  'strong-advantage': '#6b9b4b',
  advantage: '#6b9b4b',
  even: '#e8c170',
  risky: '#e08a3c',
  'severe-risk': '#d94a4a',
};

function line(text: string, css: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = css;
  el.textContent = text;
  return el;
}

function list(title: string, items: readonly string[]): HTMLDivElement | null {
  if (items.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:6px;';
  wrap.appendChild(line(title, 'font-weight:600;font-size:11px;'));
  for (const item of items) wrap.appendChild(line(`• ${item}`, 'font-size:11px;line-height:1.35;opacity:0.9;'));
  return wrap;
}

export function renderBattleForecastCard(
  panel: HTMLElement,
  input: BattleForecastCardInput,
  callbacks: BattleForecastCardCallbacks,
): void {
  const { view } = input;
  const card = document.createElement('div');
  card.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', view.ariaLabel);
  card.setAttribute('data-testid', 'battle-forecast');

  card.appendChild(line(input.action?.title ?? 'Battle Preview', 'font-size:13px;color:#e8c170;margin-bottom:6px;'));

  const headline = line(`${view.icon} ${view.headline}`, `font-size:14px;font-weight:700;margin-bottom:6px;color:${BAND_COLOR[view.band]};`);
  headline.setAttribute('data-testid', 'battle-forecast-headline');
  card.appendChild(headline);

  card.appendChild(line(view.you.summary + (view.you.fate ? ` ${capitalise(view.you.fate)}.` : ''), 'font-size:12px;margin-bottom:2px;'));
  card.appendChild(line(view.them.summary + (view.them.fate ? ` ${capitalise(view.them.fate)}.` : ''), 'font-size:12px;margin-bottom:6px;'));
  card.appendChild(line(view.why, 'font-size:11px;opacity:0.85;margin-bottom:6px;'));

  if (view.interception) {
    const block = document.createElement('div');
    block.setAttribute('data-testid', 'battle-forecast-interception');
    block.style.cssText = 'margin-bottom:8px;padding:6px 8px;border-left:3px solid #e08a3c;background:rgba(0,0,0,0.25);';
    block.appendChild(line(`⚠ ${view.interception.headline}`, 'font-size:11px;font-weight:600;margin-bottom:3px;'));
    for (const text of view.interception.lines) block.appendChild(line(text, 'font-size:11px;line-height:1.35;opacity:0.92;'));
    card.appendChild(block);
  }

  for (const note of input.notes) {
    card.appendChild(line(note.text, note.emphasis === 'warning'
      ? 'font-size:10px;color:#f4c842;margin-bottom:6px;'
      : 'font-size:10px;opacity:0.72;margin-bottom:8px;'));
  }

  const details = document.createElement('details');
  details.setAttribute('data-testid', 'battle-forecast-details');
  details.style.cssText = 'margin-bottom:8px;';
  const summary = document.createElement('summary');
  summary.style.cssText = 'cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:12px;font-weight:600;';
  summary.textContent = 'More details';
  details.appendChild(summary);
  details.appendChild(line(`Defender: ${view.ownerName} · HP ${view.them.hp}/100`, 'font-size:11px;opacity:0.9;'));
  for (const block of [
    list('Working for you', view.workingForYou),
    list('Working against you', view.workingAgainstYou),
    list('Not active', view.notActive),
    list('What you could change', view.tips),
  ]) {
    if (block) details.appendChild(block);
  }
  details.appendChild(line('Estimate uses only what you can see — enemy research, hidden units and unseen buildings are not included.', 'margin-top:6px;font-size:11px;font-style:italic;opacity:0.85;'));
  details.appendChild(line('Damage is an estimate: each fight has some luck, so the real result can land anywhere in the ranges shown.', 'margin-top:6px;font-size:10px;opacity:0.7;'));
  card.appendChild(details);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;';
  const attackBtn = document.createElement('button');
  attackBtn.id = 'btn-attack-confirm';
  attackBtn.type = 'button';
  attackBtn.textContent = input.action?.label ?? 'Attack';
  attackBtn.style.cssText = 'flex:1;min-height:44px;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'btn-cancel-attack';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'flex:1;min-height:44px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
  row.appendChild(attackBtn);
  row.appendChild(cancelBtn);
  card.appendChild(row);

  panel.innerHTML = '';
  panel.appendChild(card);
  cancelBtn.addEventListener('click', callbacks.onCancel);
  attackBtn.addEventListener('click', callbacks.onAttack);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
