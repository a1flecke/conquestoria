import { createPrimaryActionBar, type PrimaryActionBarCallbacks } from '@/ui/primary-action-bar';

export interface GameShellCallbacks extends PrimaryActionBarCallbacks {
  onNextUnit: () => void;
  onOpenNotificationLog: () => void;
  onToggleIconLegend: () => void;
  onOpenWonderAtlas: () => void;
  onOpenPirateWaters?: () => void;
  onOpenMenu: () => void;
  iconLegendOverlay?: HTMLElement;
}

function removeExistingShell(container: HTMLElement): void {
  for (const id of ['game-shell', 'hud', 'bottom-bar', 'btn-next-unit', 'btn-notif-log', 'btn-icon-legend', 'btn-wonder-atlas', 'btn-pirate-waters', 'notifications', 'info-panel', 'icon-legend']) {
    container.querySelector(`#${id}`)?.remove();
  }
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

export function createGameShell(container: HTMLElement, callbacks: GameShellCallbacks): HTMLDivElement {
  removeExistingShell(container);

  const shell = document.createElement('div');
  shell.id = 'game-shell';

  shell.appendChild(createHud());
  shell.appendChild(createPrimaryActionBar(callbacks));

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
  const pirateWatersButton = createFloatingButton('btn-pirate-waters', 'Pirates', 'Open Pirate Waters', () => callbacks.onOpenPirateWaters?.());
  pirateWatersButton.hidden = true;
  utilityToolbar.appendChild(pirateWatersButton);
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
  infoPanel.style.cssText = 'position:absolute;bottom:80px;left:12px;right:12px;z-index:10;display:none;';
  shell.appendChild(infoPanel);

  container.appendChild(shell);
  return shell;
}
