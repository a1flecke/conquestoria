import type { DominationPanelModel } from '@/systems/domination-types';
import { createGameButton } from '@/ui/ui-kit';

export interface DominationPanelCallbacks {
  onClose(): void;
  onOpenDiplomacy(): void;
  onOpenCity(cityId: string): void;
  onOpenEspionage(): void;
}

/** Renders a viewer-safe value model; this UI has no access to GameState. */
export function createVictoryProgressPanel(
  model: DominationPanelModel,
  callbacks: DominationPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('section');
  panel.id = 'victory-progress-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Victory progress');
  panel.style.cssText = 'position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;background:rgba(15,15,25,0.97);color:#fff;padding:16px;box-sizing:border-box;';

  const heading = document.createElement('h2');
  heading.textContent = 'Victory progress';
  heading.style.margin = '0 0 8px';
  panel.appendChild(heading);

  for (const text of [
    model.ruleText,
    model.ownStatusText,
    `Under your rule: ${model.ownVassalCount} vassal${model.ownVassalCount === 1 ? '' : 's'}. Defeats you have confirmed: ${model.ownEarnedDefeatCount}.`,
  ]) {
    const line = document.createElement('p');
    line.textContent = text;
    panel.appendChild(line);
  }

  const rows = document.createElement('div');
  rows.setAttribute('aria-label', 'Known empire reports');
  rows.style.cssText = 'min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px;';
  if (model.rows.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No rival reports yet.';
    rows.appendChild(empty);
  }
  for (const row of model.rows) {
    const item = document.createElement('article');
    item.dataset.civId = row.civId;
    item.dataset.evidence = row.evidence;
    item.style.cssText = 'padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.12);';
    const title = document.createElement('strong');
    title.textContent = row.civName;
    const text = document.createElement('p');
    text.textContent = row.text;
    text.style.margin = '4px 0 0';
    item.append(title, text);
    rows.appendChild(item);
  }
  panel.appendChild(rows);

  const uncertainty = document.createElement('p');
  uncertainty.textContent = model.uncertaintyText;
  uncertainty.style.opacity = '0.8';
  panel.appendChild(uncertainty);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  if (model.guidance.kind === 'diplomacy') {
    const button = createGameButton(model.guidance.text, 'secondary');
    button.addEventListener('click', callbacks.onOpenDiplomacy);
    actions.appendChild(button);
  } else if (model.guidance.kind === 'owned-city') {
    const cityId = model.guidance.cityId;
    const button = createGameButton(model.guidance.text, 'secondary');
    button.addEventListener('click', () => callbacks.onOpenCity(cityId));
    actions.appendChild(button);
  } else if (model.guidance.kind === 'espionage') {
    const button = createGameButton(model.guidance.text, 'secondary');
    button.addEventListener('click', callbacks.onOpenEspionage);
    actions.appendChild(button);
  } else {
    const guidance = document.createElement('span');
    guidance.textContent = model.guidance.text;
    actions.appendChild(guidance);
  }
  const close = createGameButton('Close', 'close');
  close.addEventListener('click', callbacks.onClose);
  actions.appendChild(close);
  panel.appendChild(actions);
  return panel;
}
