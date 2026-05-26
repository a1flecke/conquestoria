import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';
import { createGameButton } from '@/ui/ui-kit';
import { createWonderSpectacleVignette } from '@/ui/wonder-spectacle-vignette';

export type WonderDiscoveryCeremonyAction = 'continue' | 'skip' | 'open-atlas';

export interface WonderDiscoveryCeremonyCallbacks {
  onResolve: (action: WonderDiscoveryCeremonyAction) => void;
}

export interface WonderDiscoveryCeremonyOptions {
  reducedMotion?: boolean;
  revealDurationMs?: number;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

export function createWonderDiscoveryCeremony(
  container: HTMLElement,
  item: WonderDiscoveryRevealItem,
  callbacks: WonderDiscoveryCeremonyCallbacks,
  options: WonderDiscoveryCeremonyOptions = {},
): HTMLElement {
  container.querySelector('#wonder-discovery-ceremony')?.remove();
  const reducedMotion = options.reducedMotion ?? false;
  let resolved = false;

  const overlay = document.createElement('section');
  overlay.id = 'wonder-discovery-ceremony';
  overlay.tabIndex = -1;
  overlay.dataset.wonderDiscoveryMotion = reducedMotion ? 'static' : 'animated';
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
    'width:min(560px,calc(100vw - 28px))',
    'border:1px solid rgba(232,193,112,0.42)',
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
  skip.dataset.wonderDiscoveryAction = 'skip';
  skipRow.appendChild(skip);

  const spectacleMode = getWonderSpectacleRenderMode({
    surface: 'reveal',
    wonderId: item.wonderId,
    discovered: true,
    reducedMotion,
  });
  const vignette = createWonderSpectacleVignette({
    wonderId: item.wonderId,
    name: item.name,
    mode: spectacleMode === 'reveal-amplified' ? 'reveal-amplified' : 'reveal-static',
    reducedMotion,
  });
  vignette.style.width = '148px';
  vignette.style.height = '148px';
  vignette.style.flexBasis = '148px';

  const facts = document.createElement('div');
  facts.style.cssText = 'display:grid;grid-template-columns:1fr;gap:8px;width:100%;text-align:left;';
  appendText(facts, 'p', item.effectSummary, 'margin:0;padding:10px;border-radius:8px;background:rgba(255,255,255,0.07);font-size:13px;line-height:1.35;');
  appendText(facts, 'p', item.rewardSummary, 'margin:0;padding:10px;border-radius:8px;background:rgba(232,193,112,0.12);font-size:13px;line-height:1.35;color:#ffe2a1;');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;width:100%;';
  const continueButton = createGameButton('Continue', 'primary');
  continueButton.dataset.wonderDiscoveryAction = 'continue';
  const atlasButton = createGameButton('Open Atlas', 'secondary');
  atlasButton.dataset.wonderDiscoveryAction = 'open-atlas';
  actions.append(continueButton, atlasButton);

  function resolve(action: WonderDiscoveryCeremonyAction): void {
    if (resolved) return;
    resolved = true;
    overlay.remove();
    callbacks.onResolve(action);
  }

  skip.addEventListener('click', () => resolve('skip'));
  continueButton.addEventListener('click', () => resolve('continue'));
  atlasButton.addEventListener('click', () => resolve('open-atlas'));
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') resolve('skip');
  });

  panel.append(skipRow, vignette);
  appendText(panel, 'p', item.title, 'margin:0;color:#e8c170;font-size:12px;letter-spacing:0;text-transform:uppercase;font-weight:700;');
  appendText(panel, 'h2', item.name, 'margin:0;font-size:32px;line-height:1.05;letter-spacing:0;');
  appendText(panel, 'p', item.revealLine, 'margin:0;font-size:15px;line-height:1.45;max-width:46ch;');
  panel.append(facts, actions);
  overlay.appendChild(panel);
  container.appendChild(overlay);
  overlay.focus();

  window.setTimeout(() => {
    overlay.dataset.wonderDiscoveryPhase = 'settled';
  }, reducedMotion ? 0 : options.revealDurationMs ?? 3600);

  return overlay;
}
