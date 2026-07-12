import { describe, it, expect } from 'vitest';
import { makeState, make } from './helpers/notification-state';
import { clearStaleSoloPendingEvents } from '@/core/hotseat-events';

describe('#551 regressions', () => {
  it('a consequence for the previous player never toasts on the next player\'s screen', () => {
    const state = makeState({ hotSeat: { players: [] } as any, currentPlayer: 'p2' });
    const { delivery, toast } = make(state);
    // Simulate round-commit: war declared against p1 while p2 is the viewer.
    delivery.withHappenedTurn(9, () => {
      delivery.deliver('p1', 'The Aztecs declared war on you!', 'warning');
    });
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['p1'][0]).toMatchObject({ message: expect.stringContaining('declared war'), turn: 9 });
    expect(state.notificationLog!['p1'][0].turn).toBe(9);
  });

  it('solo never accumulates pendingEvents', () => {
    const state = makeState(); // solo
    const { delivery } = make(state);
    delivery.deliver('p1', 'You met the Mayans.', 'info');
    delivery.deliver('p1', 'Barbarians spotted!', 'warning');
    expect(Object.values(state.pendingEvents ?? {}).flat()).toHaveLength(0);
  });
});

describe('clearStaleSoloPendingEvents (#551 save compat)', () => {
  it('clears a solo save carrying stale queued events', () => {
    const state = makeState({
      pendingEvents: { p1: [{ type: 'first-contact', message: 'Encountered Bob', turn: 3 }] },
    });
    clearStaleSoloPendingEvents(state);
    expect(state.pendingEvents).toEqual({});
  });

  it('leaves a hot-seat save\'s queue intact', () => {
    const state = makeState({
      hotSeat: { players: [] } as any,
      pendingEvents: { p1: [{ type: 'first-contact', message: 'Encountered Bob', turn: 3 }] },
    });
    clearStaleSoloPendingEvents(state);
    expect(state.pendingEvents!['p1']).toHaveLength(1);
  });

  it('is a no-op when pendingEvents is already empty', () => {
    const state = makeState({ pendingEvents: {} });
    clearStaleSoloPendingEvents(state);
    expect(state.pendingEvents).toEqual({});
  });
});
