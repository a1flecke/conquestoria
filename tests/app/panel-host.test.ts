// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPanelHost } from '@/app/panel-host';

describe('panel host interaction blocking', () => {
  it('notifies unblock listeners exactly once when the overlay clears', () => {
    const host = createPanelHost(document.createElement('div'));
    const listener = vi.fn();
    host.onInteractionUnblocked(listener);

    host.setBlockingOverlay('turn-handoff');
    expect(host.isInteractionBlocked()).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    host.setBlockingOverlay(null);
    expect(host.isInteractionBlocked()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the overlay is replaced by another overlay', () => {
    const host = createPanelHost(document.createElement('div'));
    const listener = vi.fn();
    host.onInteractionUnblocked(listener);

    host.setBlockingOverlay('a');
    host.setBlockingOverlay('b');

    expect(listener).not.toHaveBeenCalled();
  });

  // #787 Phase 12 (#794): the overlay is now a reference count, not a single
  // slot, so a second blocker pushed while the first is still active nests
  // instead of clobbering it -- both must clear before interaction resumes.
  describe('reference-counted nesting (#794)', () => {
    it('stays blocked after one blocker clears if a second is still pushed, and only unblocks once both clear', () => {
      const host = createPanelHost(document.createElement('div'));
      const listener = vi.fn();
      host.onInteractionUnblocked(listener);

      host.setBlockingOverlay('ceremony');
      host.setBlockingOverlay('turn-handoff');
      expect(host.isInteractionBlocked()).toBe(true);

      host.setBlockingOverlay(null);
      expect(host.isInteractionBlocked()).toBe(true);
      expect(listener).not.toHaveBeenCalled();

      host.setBlockingOverlay(null);
      expect(host.isInteractionBlocked()).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires the unblock listener exactly once even with three nested blockers', () => {
      const host = createPanelHost(document.createElement('div'));
      const listener = vi.fn();
      host.onInteractionUnblocked(listener);

      host.setBlockingOverlay('a');
      host.setBlockingOverlay('b');
      host.setBlockingOverlay('c');
      host.setBlockingOverlay(null);
      host.setBlockingOverlay(null);
      expect(listener).not.toHaveBeenCalled();
      expect(host.isInteractionBlocked()).toBe(true);

      host.setBlockingOverlay(null);
      expect(host.isInteractionBlocked()).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('an extra clear on an already-unblocked host is a no-op, not a negative count', () => {
      const host = createPanelHost(document.createElement('div'));
      const listener = vi.fn();
      host.onInteractionUnblocked(listener);

      host.setBlockingOverlay(null);
      expect(host.isInteractionBlocked()).toBe(false);
      expect(listener).not.toHaveBeenCalled();

      host.setBlockingOverlay('x');
      expect(host.isInteractionBlocked()).toBe(true);
      host.setBlockingOverlay(null);
      expect(host.isInteractionBlocked()).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
