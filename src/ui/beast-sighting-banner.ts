import type { UnitType } from '@/core/types';
import type { FactionPalette } from '@/renderer/sprites/sprite-system';
import { createGameButton } from '@/ui/ui-kit';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';

export interface BeastSightingBannerOptions {
  name: string;
  flavor: string;
  unitType: UnitType;
  onContinue: () => void;
  onOpenBestiary: () => void;
}

const NEUTRAL_PALETTE: FactionPalette = { dark: '#555', mid: '#888', bright: '#bbb', trim: '#999' };

export function showBeastSightingBanner(container: HTMLElement, options: BeastSightingBannerOptions): HTMLElement {
  container.querySelector('#beast-sighting-banner')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'beast-sighting-banner';
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(8,8,18,0.9);z-index:60;display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:340px;background:#1a1a2e;border:2px solid #e8c170;border-radius:14px;padding:20px;text-align:center;';

  const kicker = document.createElement('div');
  kicker.textContent = 'BEAST SIGHTED';
  kicker.style.cssText = 'font-size:12px;letter-spacing:3px;color:#d1a35a;margin-bottom:8px;';
  card.appendChild(kicker);

  const art = document.createElement('div');
  art.style.cssText = 'width:120px;height:120px;margin:0 auto 8px;';
  const sprite = UNIT_SPRITE_CATALOG[options.unitType];
  // Sprite SVGs are module-authored strings, never game/user input — safe for innerHTML.
  art.innerHTML = sprite({ palette: NEUTRAL_PALETTE, svgOnly: true });
  card.appendChild(art);

  const nameEl = document.createElement('h2');
  nameEl.textContent = options.name;
  nameEl.style.cssText = 'font-size:22px;color:#e8c170;margin:0 0 8px;';
  card.appendChild(nameEl);

  const flavorEl = document.createElement('p');
  flavorEl.textContent = options.flavor;
  flavorEl.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 16px;';
  card.appendChild(flavorEl);

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;justify-content:center;';
  const continueButton = createGameButton('Continue', 'primary');
  continueButton.addEventListener('click', () => { overlay.remove(); options.onContinue(); });
  buttonRow.appendChild(continueButton);
  const bestiaryButton = createGameButton('Open Bestiary', 'secondary');
  bestiaryButton.addEventListener('click', () => { overlay.remove(); options.onOpenBestiary(); });
  buttonRow.appendChild(bestiaryButton);
  card.appendChild(buttonRow);

  overlay.appendChild(card);
  container.appendChild(overlay);
  return overlay;
}
