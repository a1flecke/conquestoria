export interface KeyboardShortcutCallbacks {
  onOpenCouncil: () => void;
  onOpenTech: () => void;
  onEndTurn: () => void;
  onCenterUnit?: () => void;
  onFortify?: () => void;
  onSettle?: () => void;
  onNextUnit?: () => void;
  onStartJourney?: () => void;
  getSelectedUnitId?: () => string | null;
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
    const hasUnit = callbacks.getSelectedUnitId ? callbacks.getSelectedUnitId() !== null : false;

    if (key === 'c') {
      event.preventDefault();
      if (hasUnit && callbacks.onCenterUnit) {
        callbacks.onCenterUnit();
      } else {
        callbacks.onOpenCouncil();
      }
    } else if (key === 't') {
      event.preventDefault();
      callbacks.onOpenTech();
    } else if (key === 'e') {
      event.preventDefault();
      callbacks.onEndTurn();
    } else if (key === 'n') {
      event.preventDefault();
      callbacks.onNextUnit?.();
    } else if (key === 'f' && hasUnit) {
      event.preventDefault();
      callbacks.onFortify?.();
    } else if (key === 'b' && hasUnit) {
      event.preventDefault();
      callbacks.onSettle?.();
    } else if (key === 'g' && hasUnit) {
      event.preventDefault();
      callbacks.onStartJourney?.();
    }
  });
}
