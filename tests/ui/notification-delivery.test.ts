import { describe, it, expect } from 'vitest';
import { makeState, make } from './helpers/notification-state';

describe('notification delivery contract', () => {
  it('toasts and logs for the active unsuppressed viewer', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('p1', 'War!', 'warning');
    expect(toast).toHaveBeenCalledWith('War!', 'warning', undefined, undefined);
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

  it('passes sfxCue through to the toast callback for the active unsuppressed viewer', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('p1', 'A religion event', 'success', undefined, undefined, 'religion-founded');
    expect(toast).toHaveBeenCalledWith('A religion event', 'success', undefined, 'religion-founded');
  });

  it('AI recipients get log-only', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('ai1', 'AI thing', 'info');
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['ai1'] ?? []).toHaveLength(0);
    expect(state.notificationLog!['ai1']).toHaveLength(1);
  });

  it('log-only: appends for the active viewer without a toast (#419 notification fatigue)', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.log('p1', 'Your spy gathered intelligence on Carthage.', 'success');
    expect(toast).not.toHaveBeenCalled();
    expect(state.notificationLog!['p1']).toHaveLength(1);
    expect(state.notificationLog!['p1'][0].message).toBe('Your spy gathered intelligence on Carthage.');
  });

  it('log-only: never queues a hot-seat handoff event for a non-current human', () => {
    const state = makeState({ hotSeat: { players: [] } as any });
    const { delivery, toast } = make(state); // currentPlayer is p1
    delivery.log('p2', 'Routine intel gathered.', 'success');
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['p2'] ?? []).toHaveLength(0);
    expect(state.notificationLog!['p2']).toHaveLength(1);
  });

  it('log-only: appends for AI recipients and keeps optional fields', () => {
    const state = makeState();
    const target = { kind: 'map' as const, coord: { q: 1, r: 2 }, label: 'Utica' };
    const { delivery, toast } = make(state);
    delivery.log('ai1', 'Routine intel gathered.', 'success', target);
    expect(toast).not.toHaveBeenCalled();
    expect(state.notificationLog!['ai1']).toHaveLength(1);
    expect(state.notificationLog!['ai1'][0].target).toEqual(target);
  });

  it('log-only: withHappenedTurn stamps the round the event belonged to', () => {
    const state = makeState();
    const { delivery } = make(state);
    delivery.withHappenedTurn(5, () => {
      delivery.log('p1', 'Happened last round', 'info');
    });
    expect(state.notificationLog!['p1'][0].turn).toBe(5);
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
