import type { GeneralPresentation } from '@/systems/great-general-presentation';
import { createGeneralPortrait } from '@/ui/general-portrait';
import { markModal } from '@/ui/modal-contract';
import { createGameButton } from '@/ui/ui-kit';

/**
 * #889: the retirement moment (presented through the ceremony coordinator's big-moment queue). A Great General's career ends at the end of the owner's round after
 * Final Command, silently, so this is the player's one chance to see who left and that their story
 * was kept. It is deliberately short: crest, one line of who, the existing end-of-career sentence
 * (the system already wrote it, with the career's real numbers), and two buttons. No animation
 * (so nothing to gate on reduced motion) and no audio of its own (mute is untouched).
 *
 * Sequencing is not this file's job: `CeremonyCoordinator.enqueueGeneralRetirement` queues it behind any other
 * ceremony, one at a time, dropped on a hot-seat handoff, and calls `onResolve` when the player is done.
 */
export interface GeneralRetirementCeremonyOptions {
  name: string;
  /** Undefined only when the definition cannot be resolved; the card then shows the name without a crest. */
  presentation?: GeneralPresentation;
  /** The end-of-career line written by the system. */
  careerLine: string;
  onOpenHallOfFame?: () => void;
  /** Fired once, after the card is gone (Continue, Enter, Escape or View Hall of Fame). */
  onResolve: () => void;
}

const CEREMONY_ID = 'general-retirement-ceremony';

export function showGeneralRetirementCeremony(container: HTMLElement, options: GeneralRetirementCeremonyOptions): HTMLElement {
  container.querySelector(`#${CEREMONY_ID}`)?.remove();

  const overlay = document.createElement('div');
  overlay.id = CEREMONY_ID;
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(8,8,18,0.95);z-index:60;display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'width:calc(100% - 48px);max-width:360px;background:#1a1a2e;border:2px solid #e8c170;border-radius:14px;padding:24px;text-align:center;';

  const kicker = document.createElement('div');
  kicker.textContent = 'A CAREER ENDS';
  kicker.style.cssText = 'font-size:12px;letter-spacing:3px;color:#d1a35a;margin-bottom:10px;';
  card.appendChild(kicker);

  if (options.presentation) {
    const crest = createGeneralPortrait(options.presentation, { size: 88, name: options.name });
    crest.style.filter = 'drop-shadow(0 0 10px rgba(232,193,112,0.45))';
    crest.style.marginBottom = '8px';
    card.appendChild(crest);
  }

  const title = document.createElement('h2');
  title.id = `${CEREMONY_ID}-title`;
  title.textContent = `${options.name} retires`;
  title.style.cssText = 'font-size:22px;color:#e8c170;margin:0 0 6px;';
  card.appendChild(title);

  const career = document.createElement('p');
  career.textContent = options.careerLine;
  career.style.cssText = 'font-size:13px;opacity:0.9;margin:0 0 6px;';
  card.appendChild(career);

  const kept = document.createElement('p');
  kept.textContent = 'Their service is kept in your Hall of Fame.';
  kept.style.cssText = 'font-size:12px;opacity:0.7;margin:0 0 16px;';
  card.appendChild(kept);

  const continueButton = createGameButton('Continue', 'primary');
  continueButton.style.cssText += ';width:100%;min-height:44px;';
  let finished = false;
  const dismiss = (afterwards?: () => void) => {
    if (finished) return;
    finished = true;
    overlay.remove();
    options.onResolve();
    afterwards?.();
  };
  continueButton.addEventListener('click', () => dismiss());
  card.appendChild(continueButton);

  if (options.onOpenHallOfFame) {
    const hallButton = createGameButton('View Hall of Fame', 'ghost');
    hallButton.style.cssText += ';width:100%;min-height:44px;margin-top:8px;';
    hallButton.addEventListener('click', () => dismiss(options.onOpenHallOfFame));
    card.appendChild(hallButton);
  }

  overlay.appendChild(card);
  // Escape and Enter dismiss (the shared contract adds the dialog role, name and Tab trap, #1459); Continue is the safe default.
  markModal(overlay, { cancel: continueButton, initialFocus: continueButton });
  overlay.setAttribute('aria-labelledby', title.id);
  container.appendChild(overlay);
  return overlay;
}
