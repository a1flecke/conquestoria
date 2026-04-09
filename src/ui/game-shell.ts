import { createPrimaryActionBar, type PrimaryActionBarCallbacks } from '@/ui/primary-action-bar';

export interface GameShellCallbacks extends PrimaryActionBarCallbacks {
  onNextUnit: () => void;
  onOpenNotificationLog: () => void;
  onToggleIconLegend: () => void;
  iconLegendOverlay?: HTMLElement;
}

function removeExistingShell(container: HTMLElement): void {
  for (const id of ['game-shell', 'hud', 'bottom-bar', 'btn-next-unit', 'btn-notif-log', 'btn-icon-legend', 'notifications', 'info-panel', 'icon-legend']) {
    container.querySelector(`#${id}`)?.remove();
  }
}

function createHud(): HTMLDivElement {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:8px 12px;background:rgba(0,0,0,0.6);display:flex;justify-content:space-between;font-size:13px;z-index:10;';
  return hud;
}

function createFloatingButton(id: string, text: string, title: string, right: number, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  button.style.cssText = `position:absolute;top:44px;right:${right}px;z-index:21;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:14px;padding:4px 8px;cursor:pointer;`;
  button.addEventListener('click', () => onClick());
  return button;
}

export function createGameShell(container: HTMLElement, callbacks: GameShellCallbacks): HTMLDivElement {
  removeExistingShell(container);

  const shell = document.createElement('div');
  shell.id = 'game-shell';

  shell.appendChild(createHud());
  shell.appendChild(createPrimaryActionBar(callbacks));

  const nextUnitButton = createFloatingButton('btn-next-unit', '⏩', 'Select next unmoved unit', 12, callbacks.onNextUnit);
  nextUnitButton.style.display = 'none';
  nextUnitButton.style.padding = '4px 10px';
  shell.appendChild(nextUnitButton);

  shell.appendChild(createFloatingButton('btn-notif-log', '📜', 'View message log', 52, callbacks.onOpenNotificationLog));
  shell.appendChild(createFloatingButton('btn-icon-legend', '🗺️', 'Toggle icon legend', 92, callbacks.onToggleIconLegend));

  if (callbacks.iconLegendOverlay) {
    shell.appendChild(callbacks.iconLegendOverlay);
  }

  const notificationArea = document.createElement('div');
  notificationArea.id = 'notifications';
  notificationArea.style.cssText = 'position:absolute;top:40px;left:12px;right:80px;z-index:20;display:flex;flex-direction:column;gap:8px;';
  shell.appendChild(notificationArea);

  const infoPanel = document.createElement('div');
  infoPanel.id = 'info-panel';
  infoPanel.style.cssText = 'position:absolute;bottom:80px;left:12px;right:12px;z-index:10;display:none;';
  shell.appendChild(infoPanel);

  container.appendChild(shell);
  return shell;
}
