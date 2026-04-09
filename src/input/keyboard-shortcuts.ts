export interface KeyboardShortcutCallbacks {
  onOpenCouncil: () => void;
  onOpenTech: () => void;
  onEndTurn: () => void;
}

export interface KeyboardShortcutOptions {
  canHandle?: () => boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function installKeyboardShortcuts(
  target: Document,
  callbacks: KeyboardShortcutCallbacks,
  options: KeyboardShortcutOptions = {},
): void {
  target.addEventListener('keydown', event => {
    if (isTypingTarget(event.target)) {
      return;
    }
    if (options.canHandle && !options.canHandle()) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'c') {
      event.preventDefault();
      callbacks.onOpenCouncil();
    } else if (key === 't') {
      event.preventDefault();
      callbacks.onOpenTech();
    } else if (key === 'e') {
      event.preventDefault();
      callbacks.onEndTurn();
    }
  });
}
