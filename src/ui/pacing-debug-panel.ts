import type { GameState } from '@/core/types';
import { buildPacingAudit } from '@/systems/pacing-audit';

export function createPacingDebugPanel(container: HTMLElement, _state: GameState): HTMLElement {
  container.querySelector('#pacing-debug-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'pacing-debug-panel';
  panel.style.cssText = 'position:absolute;top:12px;right:12px;z-index:45;background:rgba(0,0,0,0.88);color:white;padding:12px;border-radius:10px;width:320px;max-height:70vh;overflow:auto;';

  const title = document.createElement('h3');
  title.textContent = 'Pacing Debug';
  title.style.cssText = 'margin:0 0 10px;font-size:16px;color:#e8c170;';
  panel.appendChild(title);

  const rows = buildPacingAudit();
  let showAll = false;

  const showAllButton = document.createElement('button');
  showAllButton.type = 'button';
  showAllButton.dataset.action = 'show-all-audit';
  showAllButton.textContent = 'Show all rows';
  showAllButton.style.cssText = 'margin-bottom:10px;';
  if (rows.length > 12) {
    panel.appendChild(showAllButton);
  }

  const list = document.createElement('div');
  panel.appendChild(list);

  const renderRows = () => {
    list.textContent = '';
    (showAll ? rows : rows.slice(0, 12)).forEach(row => {
      const entry = document.createElement('div');
      entry.style.cssText = `font-size:12px;margin-bottom:8px;padding:8px;border-radius:8px;background:${row.outlier ? 'rgba(120,40,40,0.4)' : 'rgba(255,255,255,0.06)'};`;
      entry.textContent = `${row.label} · ${row.estimatedTurns} turns · Recommended ${row.recommendedCost} · Target ${row.target.min}-${row.target.max} · ${row.outlierReason}`;
      list.appendChild(entry);
    });
  };

  showAllButton.addEventListener('click', () => {
    showAll = true;
    showAllButton.remove();
    renderRows();
  });

  renderRows();

  container.appendChild(panel);
  return panel;
}
