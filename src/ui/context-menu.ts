import type { GameState } from '@/core/types';
import type { UiInteractionState } from '@/ui/ui-interaction-state';

export interface ContextMenuTarget {
  unitId?: string;
  cityId?: string;
}

export interface ContextMenuCallbacks {
  onStartAutoExplore?: (unitId: string) => void;
  onCancelAutoExplore?: (unitId: string) => void;
}

function makeMenuButton(label: string, onClick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'display:block;width:100%;padding:8px 12px;background:none;border:none;color:white;text-align:left;cursor:pointer;';
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  return button;
}

export function createContextMenu(
  container: HTMLElement,
  state: GameState,
  target: ContextMenuTarget,
  callbacks: ContextMenuCallbacks = {},
  interactions?: UiInteractionState,
): HTMLElement {
  container.querySelector('[data-context-menu="true"]')?.remove();

  const menu = document.createElement('div');
  menu.dataset.contextMenu = 'true';
  menu.style.cssText = 'position:relative;margin-top:8px;padding:6px;background:rgba(0,0,0,0.92);border:1px solid rgba(255,255,255,0.18);border-radius:10px;min-width:180px;';

  if (interactions?.isInteractionBlocked()) {
    menu.appendChild(makeMenuButton('No actions available'));
  } else if (target.unitId) {
    const unit = state.units[target.unitId];
    if (unit?.owner === state.currentPlayer) {
      if (unit.automation?.mode === 'auto-explore') {
        menu.appendChild(makeMenuButton('Cancel auto-explore', () => callbacks.onCancelAutoExplore?.(unit.id)));
      } else {
        menu.appendChild(makeMenuButton('Auto-explore', () => callbacks.onStartAutoExplore?.(unit.id)));
      }
    }
  }

  if (menu.childElementCount === 0) {
    menu.appendChild(makeMenuButton('No actions available'));
  }

  container.appendChild(menu);
  return menu;
}
