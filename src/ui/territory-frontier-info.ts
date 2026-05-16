import type { TerritoryFrontierState } from '@/core/types';

export function renderTerritoryFrontierInfo(frontier: TerritoryFrontierState): HTMLElement {
  const panel = document.createElement('section');
  panel.dataset.territoryFrontier = frontier.trend;

  const title = document.createElement('div');
  title.textContent = frontier.trend === 'likely-to-flip' ? 'Border likely to shift' : 'Contested border';

  const reason = document.createElement('p');
  reason.textContent = frontier.reason;

  panel.appendChild(title);
  panel.appendChild(reason);
  return panel;
}
