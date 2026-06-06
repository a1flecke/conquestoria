import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { createGameButton } from '@/ui/ui-kit';
import { createWonderVideoView } from '@/ui/wonder-video-view';
import { createWonderVisualVignette } from '@/ui/wonder-vignette';

export type LegendaryWonderCompletionCeremonyAction = 'continue' | 'skip' | 'open-city' | 'open-journal';

export interface LegendaryWonderCompletionCeremonyCallbacks {
  onResolve: (action: LegendaryWonderCompletionCeremonyAction) => void;
}

export interface LegendaryWonderCompletionCeremonyOptions {
  reducedMotion?: boolean;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

export function createLegendaryWonderCompletionCeremony(
  container: HTMLElement,
  item: LegendaryWonderCompletionCeremonyItem,
  callbacks: LegendaryWonderCompletionCeremonyCallbacks,
  options: LegendaryWonderCompletionCeremonyOptions = {},
): HTMLElement {
  container.querySelector('#legendary-wonder-completion-ceremony')?.remove();
  const reducedMotion = options.reducedMotion ?? false;
  let resolved = false;

  const overlay = document.createElement('section');
  overlay.id = 'legendary-wonder-completion-ceremony';
  overlay.tabIndex = -1;
  overlay.dataset.legendaryCompletionMotion = reducedMotion ? 'static' : 'animated';
  overlay.style.cssText = [
    'position:absolute',
    'inset:0',
    'z-index:82',
    'background:rgba(4,7,13,0.8)',
    'color:#f8f1df',
    'display:grid',
    'place-items:center',
    'padding:18px',
    'pointer-events:auto',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(560px,calc(100vw - 28px))',
    'border:1px solid rgba(232,193,112,0.46)',
    'border-radius:8px',
    `background:linear-gradient(180deg,rgba(20,24,32,0.98),${item.visual.palette.base})`,
    'box-shadow:0 22px 70px rgba(0,0,0,0.62)',
    'padding:22px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:14px',
    'text-align:center',
  ].join(';');

  const skipRow = document.createElement('div');
  skipRow.style.cssText = 'display:flex;justify-content:flex-end;width:100%;';
  const skip = createGameButton('Skip', 'ghost');
  skip.dataset.legendaryCompletionAction = 'skip';
  skipRow.appendChild(skip);

  const visual = item.videoPreview && !reducedMotion
    ? createWonderVideoView({ preview: item.videoPreview, autoplay: 'immediate' })
    : createWonderVisualVignette(item.name, item.visual, { reducedMotion, kind: 'legendary' });
  visual.style.width = item.videoPreview && !reducedMotion ? 'min(360px, 100%)' : '148px';
  visual.style.height = item.videoPreview && !reducedMotion ? 'auto' : '148px';
  visual.style.flexBasis = item.videoPreview && !reducedMotion ? 'auto' : '148px';

  const facts = document.createElement('div');
  facts.style.cssText = 'display:grid;grid-template-columns:1fr;gap:8px;width:100%;text-align:left;';
  appendText(facts, 'p', item.rewardSummary, 'margin:0;padding:10px;border-radius:8px;background:rgba(232,193,112,0.12);font-size:13px;line-height:1.35;color:#ffe2a1;');
  appendText(facts, 'p', item.rewardActiveLabel, 'margin:0;padding:10px;border-radius:8px;background:rgba(255,255,255,0.07);font-size:13px;line-height:1.35;');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;width:100%;';
  const continueButton = createGameButton('Continue', 'primary');
  continueButton.dataset.legendaryCompletionAction = 'continue';
  const cityButton = createGameButton('Open City', 'secondary');
  cityButton.dataset.legendaryCompletionAction = 'open-city';
  const journalButton = createGameButton('Open Journal', 'secondary');
  journalButton.dataset.legendaryCompletionAction = 'open-journal';
  actions.append(continueButton, cityButton, journalButton);

  function resolve(action: LegendaryWonderCompletionCeremonyAction): void {
    if (resolved) return;
    resolved = true;
    overlay.remove();
    callbacks.onResolve(action);
  }

  skip.addEventListener('click', () => resolve('skip'));
  continueButton.addEventListener('click', () => resolve('continue'));
  cityButton.addEventListener('click', () => resolve('open-city'));
  journalButton.addEventListener('click', () => resolve('open-journal'));
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') resolve('skip');
  });

  panel.append(skipRow, visual);
  appendText(panel, 'p', item.title, 'margin:0;color:#e8c170;font-size:12px;letter-spacing:0;text-transform:uppercase;font-weight:700;');
  appendText(panel, 'h2', item.name, 'margin:0;font-size:32px;line-height:1.05;letter-spacing:0;');
  appendText(panel, 'p', item.cityName, 'margin:0;color:#f0d897;font-size:14px;line-height:1.35;');
  appendText(panel, 'p', item.achievementLine, 'margin:0;font-size:15px;line-height:1.45;max-width:46ch;');
  panel.append(facts, actions);
  overlay.appendChild(panel);
  container.appendChild(overlay);
  overlay.focus();

  return overlay;
}
