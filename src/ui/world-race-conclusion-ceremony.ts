import type { WorldRaceConclusionMomentItem } from '@/systems/world-race-presentation';
import { createGameButton } from '@/ui/ui-kit';

export interface WorldRaceConclusionCeremonyCallbacks {
  onResolve: () => void;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

/** #992: a static resolution card, same weight as event-chain-conclusion-ceremony.ts --
 * a world race has no bespoke visual identity to spectacle-ize either. winnerName is
 * already redacted by buildWorldRaceConclusionMomentItem; this file never re-derives it. */
export function createWorldRaceConclusionCeremony(
  container: HTMLElement,
  item: WorldRaceConclusionMomentItem,
  callbacks: WorldRaceConclusionCeremonyCallbacks,
): HTMLElement {
  container.querySelector('#world-race-conclusion-ceremony')?.remove();
  let resolved = false;

  const overlay = document.createElement('section');
  overlay.id = 'world-race-conclusion-ceremony';
  overlay.tabIndex = -1;
  overlay.style.cssText = [
    'position:absolute',
    'inset:0',
    'z-index:80',
    'background:rgba(4,7,13,0.78)',
    'color:#f8f1df',
    'display:grid',
    'place-items:center',
    'padding:18px',
    'pointer-events:auto',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(480px,calc(100vw - 28px))',
    'border:1px solid rgba(232,193,112,0.42)',
    'border-radius:8px',
    'background:linear-gradient(180deg,rgba(20,24,32,0.98),rgba(30,34,44,0.98))',
    'box-shadow:0 22px 70px rgba(0,0,0,0.62)',
    'padding:22px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:14px',
    'text-align:center',
  ].join(';');

  function resolve(): void {
    if (resolved) return;
    resolved = true;
    overlay.remove();
    callbacks.onResolve();
  }

  const continueButton = createGameButton('Continue', 'primary');
  continueButton.dataset.worldRaceConclusionAction = 'continue';
  continueButton.addEventListener('click', resolve);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') resolve();
  });

  const headline = item.won
    ? `Your empire won the ${item.displayName} race!`
    : item.winnerName
      ? `${item.winnerName} won the ${item.displayName} race.`
      : `A civilization you have not yet met has won the ${item.displayName} race.`;

  appendText(panel, 'p', item.displayName, 'margin:0;color:#e8c170;font-size:12px;letter-spacing:0;text-transform:uppercase;font-weight:700;');
  appendText(panel, 'h2', headline, 'margin:0;font-size:22px;line-height:1.2;letter-spacing:0;');
  if (item.won) {
    appendText(panel, 'p', item.rewardSummary, 'margin:0;font-size:15px;line-height:1.45;max-width:46ch;');
  }
  panel.appendChild(continueButton);
  overlay.appendChild(panel);
  container.appendChild(overlay);
  overlay.focus();

  return overlay;
}
