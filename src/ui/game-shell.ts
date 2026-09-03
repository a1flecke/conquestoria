import { createPrimaryActionBar, type PrimaryActionBarCallbacks } from '@/ui/primary-action-bar';

export interface GameShellCallbacks extends PrimaryActionBarCallbacks {
  onNextUnit: () => void;
  onOpenNotificationLog: () => void;
  onToggleIconLegend: () => void;
  onOpenWonderAtlas: () => void;
  onOpenPirateWaters?: () => void;
  /** #887 Phase B — opens the Great General Hall of Fame. Optional: the button
   * stays inert (never thrown) until the composition root wires it. */
  onOpenHallOfFame?: () => void;
  onOpenMenu: () => void;
  /** Keeps the canvas viewport above the bottom action bar as its height changes. */
  onBottomBarHeightChange?: (height: number) => void;
  iconLegendOverlay?: HTMLElement;
  /** #544 MR2: initial paint state, read from RenderLoop at shell-construction time. */
  supplyOverlayEnabled: boolean;
  /** #544 MR2: toggles the overlay and returns the new enabled state, for repainting the button. */
  onToggleSupplyOverlay: () => boolean;
}

let stopBottomBarLayoutTracking: (() => void) | undefined;

function removeExistingShell(container: HTMLElement): void {
  stopBottomBarLayoutTracking?.();
  stopBottomBarLayoutTracking = undefined;
  for (const id of ['game-shell', 'hud', 'bottom-bar', 'btn-next-unit', 'btn-notif-log', 'btn-icon-legend', 'btn-wonder-atlas', 'btn-hall-of-fame', 'btn-pirate-waters', 'notifications', 'info-panel', 'icon-legend']) {
    container.querySelector(`#${id}`)?.remove();
  }
}

function trackBottomBarLayout(
  container: HTMLElement,
  bottomBar: HTMLElement,
  onBottomBarHeightChange: GameShellCallbacks['onBottomBarHeightChange'],
): () => void {
  const sync = () => {
    // 88px is the compact action bar's minimum touch-safe height. The measured
    // value takes over when labels wrap or a device needs more room.
    const height = Math.max(88, Math.ceil(bottomBar.getBoundingClientRect().height));
    container.style.setProperty('--bottom-ui-height', `${height}px`);
    onBottomBarHeightChange?.(height);
  };

  sync();
  window.addEventListener('resize', sync);
  const observer = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(sync);
  observer?.observe(bottomBar);

  return () => {
    window.removeEventListener('resize', sync);
    observer?.disconnect();
  };
}

function createHud(): HTMLDivElement {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText = 'position:absolute;top:0;left:0;right:0;min-height:60px;padding:8px 12px;background:rgba(0,0,0,0.6);display:flex;justify-content:space-between;align-items:center;font-size:13px;z-index:10;';
  return hud;
}

function createFloatingButton(id: string, text: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  button.style.cssText = 'min-height:44px;min-width:40px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:14px;padding:4px 8px;cursor:pointer;';
  button.addEventListener('click', () => onClick());
  return button;
}

/** #544 MR2: visually distinguishes the Supply overlay toggle's on/off state. */
function paintSupplyOverlayButton(button: HTMLButtonElement, enabled: boolean): void {
  button.style.background = enabled ? 'rgba(80,200,120,0.55)' : 'rgba(0,0,0,0.6)';
  button.setAttribute('aria-pressed', String(enabled));
}

export function createGameShell(container: HTMLElement, callbacks: GameShellCallbacks): HTMLDivElement {
  removeExistingShell(container);

  const shell = document.createElement('div');
  shell.id = 'game-shell';

  shell.appendChild(createHud());
  const bottomBar = createPrimaryActionBar(callbacks);
  shell.appendChild(bottomBar);

  const utilityToolbar = document.createElement('div');
  utilityToolbar.id = 'utility-toolbar';
  utilityToolbar.style.cssText = 'position:absolute;top:60px;right:12px;z-index:21;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 24px);';

  const nextUnitButton = createFloatingButton('btn-next-unit', '⏩', 'Select next unmoved unit', callbacks.onNextUnit);
  nextUnitButton.style.display = 'none';
  nextUnitButton.style.padding = '4px 10px';
  utilityToolbar.appendChild(nextUnitButton);

  utilityToolbar.appendChild(createFloatingButton('btn-notif-log', '📜', 'View message log', callbacks.onOpenNotificationLog));
  utilityToolbar.appendChild(createFloatingButton('btn-icon-legend', '🗺️', 'Toggle icon legend', callbacks.onToggleIconLegend));
  utilityToolbar.appendChild(createFloatingButton('btn-wonder-atlas', '✦', 'Open Wonder Atlas', callbacks.onOpenWonderAtlas));
  const supplyOverlayButton = createFloatingButton('btn-supply-overlay', '🚚', 'Toggle supply overlay', () => {
    paintSupplyOverlayButton(supplyOverlayButton, callbacks.onToggleSupplyOverlay());
  });
  paintSupplyOverlayButton(supplyOverlayButton, callbacks.supplyOverlayEnabled);
  utilityToolbar.appendChild(supplyOverlayButton);
  const pirateWatersButton = createFloatingButton('btn-pirate-waters', 'Pirates', 'Open Pirate Waters', () => callbacks.onOpenPirateWaters?.());
  pirateWatersButton.hidden = true;
  utilityToolbar.appendChild(pirateWatersButton);
  // #887 Phase B: hidden until the current player has earned a General — hud-controller.update() toggles it (same pattern as btn-pirate-waters).
  const hallOfFameButton = createFloatingButton('btn-hall-of-fame', '🎖️', 'Great Generals — Hall of Fame', () => callbacks.onOpenHallOfFame?.());
  hallOfFameButton.hidden = true;
  utilityToolbar.appendChild(hallOfFameButton);
  utilityToolbar.appendChild(createFloatingButton('btn-pause-menu', '☰', 'Pause menu', callbacks.onOpenMenu));
  shell.appendChild(utilityToolbar);

  if (callbacks.iconLegendOverlay) {
    shell.appendChild(callbacks.iconLegendOverlay);
  }

  const notificationArea = document.createElement('div');
  notificationArea.id = 'notifications';
  notificationArea.style.cssText = 'position:absolute;top:64px;left:12px;right:80px;z-index:20;display:flex;flex-direction:column;gap:8px;';
  shell.appendChild(notificationArea);

  const infoPanel = document.createElement('div');
  infoPanel.id = 'info-panel';
  infoPanel.setAttribute('aria-label', 'Selected unit details and actions (scroll for more)');
  infoPanel.style.cssText = 'position:absolute;bottom:calc(var(--bottom-ui-height) + 12px);left:12px;width:calc(100% - 24px);max-width:620px;max-height:calc(100% - 84px - var(--bottom-ui-height));overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;z-index:10;display:none;';
  shell.appendChild(infoPanel);

  container.appendChild(shell);
  stopBottomBarLayoutTracking = trackBottomBarLayout(container, bottomBar, callbacks.onBottomBarHeightChange);
  return shell;
}
