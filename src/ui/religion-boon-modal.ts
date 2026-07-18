import type { ReligionBoon } from '@/core/types';
import { BOON_DESCRIPTIONS } from '@/systems/religion-definitions';
import { createGameButton } from '@/ui/ui-kit';

export interface ReligionBoonModalConfig {
  religionName: string;
  onChooseBoon: (boon: ReligionBoon) => void;
}

const BOON_LABELS: Record<ReligionBoon, string> = {
  serenity: 'Serenity',
  tithes: 'Tithes',
  fervor: 'Fervor',
};

// Models directly on required-choice-panel.ts: full-screen overlay, textContent only
// (XSS-safe), createGameButton for every action. A civ's religion founds immediately
// (no blocking the game), but stays without effects until a boon is chosen — this modal
// re-opens at the start of the owner's turn every turn the boon remains unset.
export function createReligionBoonModal(
  container: HTMLElement,
  config: ReligionBoonModalConfig,
): HTMLElement {
  container.querySelector('#religion-boon-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'religion-boon-modal';
  modal.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:45;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = `Choose a Boon for ${config.religionName}`;
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  modal.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Your faith has no effect until you choose how it blesses your empire. Pick one — this cannot be changed later.';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  modal.appendChild(intro);

  const boons: ReligionBoon[] = ['serenity', 'tithes', 'fervor'];
  for (const boon of boons) {
    const card = document.createElement('div');
    card.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

    const heading = document.createElement('h3');
    heading.textContent = BOON_LABELS[boon];
    heading.style.cssText = 'font-size:16px;color:#e8c170;margin:0 0 6px;';
    card.appendChild(heading);

    const desc = document.createElement('p');
    desc.textContent = BOON_DESCRIPTIONS[boon];
    desc.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 10px;';
    card.appendChild(desc);

    const button = createGameButton(`Choose ${BOON_LABELS[boon]}`, 'primary');
    button.style.width = '100%';
    button.dataset.chooseBoon = boon;
    button.addEventListener('click', () => config.onChooseBoon(boon));
    card.appendChild(button);

    modal.appendChild(card);
  }

  container.appendChild(modal);
  return modal;
}
