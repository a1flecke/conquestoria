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

  buildPacingAudit().slice(0, 12).forEach(row => {
    const entry = document.createElement('div');
    entry.textContent = `${row.label}: ${row.estimatedTurns} turns (target ${row.target.min}-${row.target.max})`;
    entry.style.cssText = 'font-size:12px;margin-bottom:6px;';
    panel.appendChild(entry);
  });

  container.appendChild(panel);
  return panel;
}
