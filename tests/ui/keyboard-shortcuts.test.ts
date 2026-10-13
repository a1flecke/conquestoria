/** @vitest-environment jsdom */

import { installKeyboardShortcuts } from '@/input/keyboard-shortcuts';
import type { UiInteractionState } from '@/ui/ui-interaction-state';

// #787 phase 11: `createUiInteractionState` (the factory) was retired once
// `PanelHost` -- its only remaining production constructor -- inlined the
// same closure directly. This test only ever needed the interface shape, so
// it builds its own minimal stateful fixture instead of calling a shared
// factory.
function makeInteractions(): UiInteractionState {
  let blockingOverlayId: string | null = null;
  return {
    setBlockingOverlay: id => { blockingOverlayId = id; },
    isInteractionBlocked: () => blockingOverlayId !== null,
  };
}

describe('keyboard shortcuts', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('does not fire end-turn or panel shortcuts while turn handoff is active', () => {
    const interactions = makeInteractions();
    interactions.setBlockingOverlay('turn-handoff');
    const callbacks = { onOpenCouncil: vi.fn(), onOpenTech: vi.fn(), onEndTurn: vi.fn() };

    installKeyboardShortcuts(document, callbacks, {
      canHandle: () => !interactions.isInteractionBlocked(),
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));

    expect(callbacks.onEndTurn).not.toHaveBeenCalled();
    expect(callbacks.onOpenCouncil).not.toHaveBeenCalled();
    expect(callbacks.onOpenTech).not.toHaveBeenCalled();
  });
  it('does not fire shortcuts from inside an open dialog (#1459)', () => {
    const callbacks = { onOpenCouncil: vi.fn(), onOpenTech: vi.fn(), onEndTurn: vi.fn() };
    installKeyboardShortcuts(document, callbacks);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);

    const end = new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true });
    button.dispatchEvent(end);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));

    expect(callbacks.onEndTurn).not.toHaveBeenCalled();
    expect(callbacks.onOpenCouncil).not.toHaveBeenCalled();
    expect(callbacks.onOpenTech).not.toHaveBeenCalled();
    expect(end.defaultPrevented).toBe(false);
  });

  it('still fires shortcuts when focus is on the map or a toolbar button (#1459)', () => {
    const callbacks = { onOpenCouncil: vi.fn(), onOpenTech: vi.fn(), onEndTurn: vi.fn() };
    installKeyboardShortcuts(document, callbacks);
    const toolbarButton = document.createElement('button');
    document.body.appendChild(toolbarButton);

    toolbarButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));

    expect(callbacks.onEndTurn).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenTech).toHaveBeenCalledTimes(1);
  });
});
