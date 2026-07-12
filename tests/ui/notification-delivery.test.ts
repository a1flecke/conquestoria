import { describe, it, expect, vi } from 'vitest';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import type { GameState } from '@/core/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 6,
    currentPlayer: 'p1',
    idCounters: {},
    civilizations: {
      p1: { isHuman: true } as any,
      p2: { isHuman: true } as any,
      ai1: { isHuman: false } as any,
    },
    notificationLog: {},
    pendingEvents: {},
    ...overrides,
  } as unknown as GameState;
}

function make(state: GameState, suppressed = false) {
  const toast = vi.fn();
  const delivery = createNotificationDelivery({
    getState: () => state,
    toast,
    isSuppressed: () => suppressed,
  });
  return { delivery, toast };
}

describe('notification delivery contract', () => {
  it('toasts and logs for the active unsuppressed viewer', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('p1', 'War!', 'warning');
    expect(toast).toHaveBeenCalledWith('War!', 'warning', undefined);
    expect(state.notificationLog!['p1']).toHaveLength(1);
    expect(state.notificationLog!['p1'][0].turn).toBe(6);
  });

  it('hot seat: queues (no toast) for a non-current human — the leak regression', () => {
    const state = makeState({ hotSeat: { players: [] } as any });
    const { delivery, toast } = make(state); // currentPlayer is p1
    delivery.deliver('p2', 'Secret consequence', 'warning');
    expect(toast).not.toHaveBeenCalled();
    expect(state.notificationLog!['p2']).toHaveLength(1);
    expect(state.pendingEvents!['p2']).toHaveLength(1);
    expect(state.pendingEvents!['p2'][0].message).toBe('Secret consequence');
  });

  it('hot seat: queues for the current player while presentation is suppressed', () => {
    const state = makeState({ hotSeat: { players: [] } as any });
    const { delivery, toast } = make(state, true);
    delivery.deliver('p1', 'Mid-handoff event', 'info');
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['p1']).toHaveLength(1);
  });

  it('solo: toasts even for consequence events (single human is always the viewer)', () => {
    const state = makeState(); // no hotSeat
    const { delivery, toast } = make(state);
    delivery.deliver('p1', 'You met the Aztecs.', 'info');
    expect(toast).toHaveBeenCalledTimes(1);
    expect(state.pendingEvents!['p1'] ?? []).toHaveLength(0); // never queue in solo
  });

  it('AI recipients get log-only', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('ai1', 'AI thing', 'info');
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['ai1'] ?? []).toHaveLength(0);
    expect(state.notificationLog!['ai1']).toHaveLength(1);
  });

  it('withHappenedTurn stamps the round the event belonged to', () => {
    const state = makeState(); // state.turn === 6
    const { delivery } = make(state);
    delivery.withHappenedTurn(5, () => {
      delivery.deliver('p1', 'Happened last round', 'info');
    });
    expect(state.notificationLog!['p1'][0].turn).toBe(5);
    delivery.deliver('p1', 'Happens now', 'info');
    expect(state.notificationLog!['p1'][1].turn).toBe(6); // context reset
  });

  it('withHappenedTurn resets context even when fn throws', () => {
    const state = makeState();
    const { delivery } = make(state);
    expect(() => delivery.withHappenedTurn(5, () => { throw new Error('boom'); })).toThrow('boom');
    delivery.deliver('p1', 'after throw', 'info');
    expect(state.notificationLog!['p1'][0].turn).toBe(6);
  });
});
