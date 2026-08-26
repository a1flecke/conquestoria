import { createGameButton } from '@/ui/ui-kit';
import type { StrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';

export function createStrategicArsenalPanel(
  container: HTMLElement,
  presentation: StrategicArsenalSummaryPresentation,
  onClose: () => void,
): HTMLElement {
  document.getElementById('strategic-arsenal-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'strategic-arsenal-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,0.92);z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:440px;width:100%;background:rgba(30,18,16,0.98);border:1px solid rgba(200,60,40,0.4);border-radius:18px;padding:20px;color:#f5e7c9;';
  panel.appendChild(card);

  const closeButton = createGameButton('✕', 'close');
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.style.cssText += 'float:right;font-size:20px;';
  closeButton.addEventListener('click', () => {
    onClose();
    panel.remove();
  });
  card.appendChild(closeButton);

  const title = document.createElement('h2');
  title.textContent = 'Strategic Arsenal';
  title.style.cssText = 'margin:0 0 12px;font-size:20px;color:#e8917a;';
  card.appendChild(title);

  const arsenalLine = document.createElement('div');
  arsenalLine.textContent = `Warheads: ${presentation.arsenalCount} / ${presentation.arsenalCapacity}`;
  arsenalLine.style.cssText = 'margin-bottom:10px;font-size:14px;';
  card.appendChild(arsenalLine);

  const platformsTitle = document.createElement('div');
  platformsTitle.textContent = 'Launch platforms:';
  platformsTitle.style.cssText = 'font-weight:bold;margin:12px 0 6px;';
  card.appendChild(platformsTitle);

  if (presentation.platforms.length === 0) {
    const none = document.createElement('div');
    none.textContent = 'None.';
    none.style.cssText = 'opacity:0.7;margin-bottom:10px;';
    card.appendChild(none);
  } else {
    for (const platform of presentation.platforms) {
      const row = document.createElement('div');
      row.textContent = platform.kind === 'building' ? 'Missile Silo (city)' : 'Missile Submarine';
      row.style.cssText = 'margin-bottom:4px;font-size:13px;';
      card.appendChild(row);
    }
  }

  if (presentation.strikesReceivedFromCivIds.length > 0) {
    const struckTitle = document.createElement('div');
    struckTitle.textContent = `Struck by ${presentation.strikesReceivedFromCivIds.length} civilization(s) previously.`;
    struckTitle.style.cssText = 'margin-top:12px;font-size:13px;opacity:0.85;';
    card.appendChild(struckTitle);
  }

  container.appendChild(panel);
  return panel;
}
