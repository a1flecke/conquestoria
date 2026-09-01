import type { GeneralDefinition } from '@/systems/great-general-definitions';
import { getGeneralSpecialtyPresentation } from '@/systems/great-general-specialties';
import { createGameButton } from '@/ui/ui-kit';

export function createGeneralCandidatePanel(
  container: HTMLElement,
  candidates: GeneralDefinition[],
  onChoose: (generalDefinitionId: string) => void,
): HTMLElement {
  container.querySelector('#general-candidate-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'general-candidate-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:50;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = 'A Great General has emerged!';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Choose who will answer the call to command:';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  panel.appendChild(intro);

  let fired = false;

  for (const candidate of candidates) {
    const card = document.createElement('section');
    card.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

    const button = createGameButton(`${candidate.portraitIcon} ${candidate.name} — Era ${candidate.era}`, 'primary');
    button.dataset.choice = candidate.id;
    button.style.width = '100%';
    button.addEventListener('click', () => {
      if (fired) return;
      fired = true;
      panel.remove();
      onChoose(candidate.id);
    });
    card.appendChild(button);

    const detail = document.createElement('div');
    detail.textContent = candidate.descriptor;
    detail.style.cssText = 'font-size:12px;opacity:0.75;margin-top:6px;';
    card.appendChild(detail);

    // #885: one-line specialty summary so the choice is informed. Absent for a
    // Field Commander / generated officer.
    const specialty = getGeneralSpecialtyPresentation(candidate);
    if (specialty) {
      const specLine = document.createElement('div');
      specLine.textContent = `${specialty.displayName}: ${specialty.summary}`;
      specLine.style.cssText = 'font-size:11px;opacity:0.85;margin-top:4px;color:#f0c674;';
      card.appendChild(specLine);
    }

    panel.appendChild(card);
  }

  container.appendChild(panel);
  return panel;
}
