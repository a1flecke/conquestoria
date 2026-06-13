import type { BeastHoardChoice } from '@/core/types';
import type { HoardChoicePreview } from '@/systems/beast-system';
import { createGameButton } from '@/ui/ui-kit';

export function createBeastHoardPanel(
  container: HTMLElement,
  preview: HoardChoicePreview,
  onChoose: (choice: BeastHoardChoice) => void,
): HTMLElement {
  container.querySelector('#beast-hoard-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'beast-hoard-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:50;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = `The ${preview.beastName} is slain!`;
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Claim your prize. Choose one:';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  panel.appendChild(intro);

  let fired = false;

  const options: Array<{ choice: BeastHoardChoice; label: string; detail: string }> = [
    { choice: 'gold', label: `\u{1F4B0} Gold Hoard — +${preview.gold} gold`, detail: 'The beast guarded a fortune. Take it all, right now.' },
    { choice: 'lore', label: `\u{1F4DC} Ancient Lore — +${preview.lore} research`, detail: 'Secrets of a forgotten age speed your current research.' },
    { choice: 'trophy', label: `\u{1F3C6} Beast Trophy — +${preview.trophyGoldPerTurn} gold every turn`, detail: 'Claim the lair as a monument. Pilgrims and traders pay tribute forever.' },
  ];

  for (const option of options) {
    const card = document.createElement('section');
    card.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

    const button = createGameButton(option.label, 'primary');
    button.dataset.choice = option.choice;
    button.style.width = '100%';
    button.addEventListener('click', () => {
      if (fired) return;
      fired = true;
      panel.remove();
      onChoose(option.choice);
    });
    card.appendChild(button);

    const detail = document.createElement('div');
    detail.textContent = option.detail;
    detail.style.cssText = 'font-size:12px;opacity:0.75;margin-top:6px;';
    card.appendChild(detail);

    panel.appendChild(card);
  }

  container.appendChild(panel);
  return panel;
}
