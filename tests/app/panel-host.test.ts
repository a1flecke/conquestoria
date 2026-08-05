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
});
