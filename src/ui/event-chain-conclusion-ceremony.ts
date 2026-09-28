import type { EventChainConclusionMomentItem } from '@/systems/event-chain-presentation';
import { createGameButton } from '@/ui/ui-kit';

export interface EventChainConclusionCeremonyCallbacks {
  onResolve: () => void;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

/** #993: the simplest possible "big moment" ceremony -- a static resolution
 * card, no animation or sound. Financial Panic (#990's only shipped chain)
 * has no visual identity of its own to spectacle-ize, unlike a wonder; this
 * intentionally does not invent one. */
export function createEventChainConclusionCeremony(
  container: HTMLElement,
  item: EventChainConclusionMomentItem,
  callbacks: EventChainConclusionCeremonyCallbacks,
): HTMLElement {
  container.querySelector('#event-chain-conclusion-ceremony')?.remove();
  let resolved = false;

  const overlay = document.createElement('section');
  overlay.id = 'event-chain-conclusion-ceremony';
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
  continueButton.dataset.eventChainConclusionAction = 'continue';
  continueButton.addEventListener('click', resolve);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') resolve();
  });

  appendText(panel, 'p', item.title, 'margin:0;color:#e8c170;font-size:12px;letter-spacing:0;text-transform:uppercase;font-weight:700;');
  appendText(panel, 'h2', item.optionLabel, 'margin:0;font-size:26px;line-height:1.1;letter-spacing:0;');
  appendText(panel, 'p', item.optionDescription, 'margin:0;font-size:15px;line-height:1.45;max-width:46ch;');
  panel.appendChild(continueButton);
  overlay.appendChild(panel);
  container.appendChild(overlay);
  overlay.focus();

  return overlay;
}
