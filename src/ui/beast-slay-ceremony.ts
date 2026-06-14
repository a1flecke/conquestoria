import { createGameButton } from '@/ui/ui-kit';
import type { UnitType } from '@/core/types';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';

export interface BeastSlayCeremonyOptions {
  beastName: string;
  unitType: UnitType;
  slayerName: string;
  rewardLines: string[];
  onContinue: () => void;
}

export function showBeastSlayCeremony(container: HTMLElement, options: BeastSlayCeremonyOptions): HTMLElement {
  container.querySelector('#beast-slay-ceremony')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'beast-slay-ceremony';
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(8,8,18,0.95);z-index:60;display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'width:calc(100% - 48px);max-width:360px;background:#1a1a2e;border:2px solid #e8c170;border-radius:14px;padding:24px;text-align:center;';

  const kicker = document.createElement('div');
  kicker.textContent = 'A LEGEND FALLS';
  kicker.style.cssText = 'font-size:12px;letter-spacing:3px;color:#d1a35a;margin-bottom:8px;';
  card.appendChild(kicker);

  const art = document.createElement('div');
  art.style.cssText = 'width:140px;height:140px;margin:0 auto 8px;filter:drop-shadow(0 0 12px rgba(232,193,112,0.5));';
  const spriteRenderer = UNIT_SPRITE_CATALOG[options.unitType];
  if (spriteRenderer) {
    art.innerHTML = spriteRenderer({ palette: { mid: '#888', dark: '#555', bright: '#bbb', trim: '#999' } as never, svgOnly: true });
  }
  card.appendChild(art);

  const title = document.createElement('h2');
  title.textContent = `The ${options.beastName} has fallen!`;
  title.style.cssText = 'font-size:22px;color:#e8c170;margin:0 0 4px;';
  card.appendChild(title);

  const credit = document.createElement('p');
  credit.textContent = `Slain by the forces of ${options.slayerName}. Bards will sing of this day.`;
  credit.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 12px;';
  card.appendChild(credit);

  const rewards = document.createElement('div');
  rewards.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:10px;margin-bottom:16px;';
  for (const line of options.rewardLines) {
    const row = document.createElement('div');
    row.textContent = line;
    row.style.cssText = 'font-size:14px;color:#9ad17b;padding:2px 0;';
    rewards.appendChild(row);
  }
  card.appendChild(rewards);

  const continueButton = createGameButton('Continue', 'primary');
  continueButton.style.cssText += ';width:100%;min-height:44px;';
  const dismiss = () => { overlay.remove(); document.removeEventListener('keydown', onKey); options.onContinue(); };
  continueButton.addEventListener('click', dismiss);
  card.appendChild(continueButton);

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dismiss(); } };
  document.addEventListener('keydown', onKey);

  overlay.appendChild(card);
  container.appendChild(overlay);
  return overlay;
}
