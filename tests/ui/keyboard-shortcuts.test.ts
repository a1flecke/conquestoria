/** @vitest-environment jsdom */

import { installKeyboardShortcuts } from '@/input/keyboard-shortcuts';
import { createUiInteractionState } from '@/ui/ui-interaction-state';

describe('keyboard shortcuts', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('does not fire end-turn or panel shortcuts while turn handoff is active', () => {
    const interactions = createUiInteractionState();
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
});
