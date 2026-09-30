import { describe, it, expect, vi } from 'vitest';
import { createGameSession } from '@/app/game-session';
import type { GameState } from '@/core/types';

const stub = (turn: number): GameState => ({ turn } as unknown as GameState);

describe('createGameSession', () => {
  it('commit publishes the new state to every subscriber exactly once', () => {
    const session = createGameSession(stub(1));
    const a = vi.fn();
    const b = vi.fn();
    session.subscribe(a);
    session.subscribe(b);

    session.commit(stub(2));

    expect(session.getState().turn).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(session.getState());
  });

  it('unpublished.adopt changes state and notifies nobody', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    session.subscribe(listener);

    session.unpublished.adopt(stub(2), 'pre-world-entry');

    expect(session.getState().turn).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it('exposes no silent write on the controller-facing GameSession surface (#1015)', () => {
    const session = createGameSession(stub(1));
    // The silent writer is reachable only through the separate `unpublished` handle,
    // which bootstrap hands to named owners; a controller typed as GameSession has
    // no such member. (The type-level half is pinned in architecture-boundaries.)
    expect(Object.keys(session).sort()).toEqual(['batch', 'commit', 'getState', 'subscribe', 'unpublished', 'update']);
    expect('setStateWithoutRefresh' in session).toBe(false);
  });

  describe('batch', () => {
    it('applies each write to getState immediately but publishes the FINAL state exactly once', () => {
      const session = createGameSession(stub(1));
      const listener = vi.fn();
      session.subscribe(listener);
      const seenInside: number[] = [];

      session.batch(() => {
        session.commit(stub(2));
        seenInside.push(session.getState().turn);
        session.update(state => ({ ...state, turn: state.turn + 1 } as GameState));
        seenInside.push(session.getState().turn);
        expect(listener).not.toHaveBeenCalled();
      });

      expect(seenInside).toEqual([2, 3]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(session.getState());
      expect(session.getState().turn).toBe(3);
    });

    it('publishes synchronously when the batch returns, before the caller continues', () => {
      const session = createGameSession(stub(1));
      const order: string[] = [];
      session.subscribe(() => order.push('publish'));

      session.batch(() => { session.commit(stub(2)); order.push('inside'); });
      order.push('after');

      expect(order).toEqual(['inside', 'publish', 'after']);
    });

    it('returns the callback value, so a whole function body can be wrapped and return through it', () => {
      const session = createGameSession(stub(1));
      const result = session.batch(() => { session.commit(stub(5)); return session.getState().turn * 2; });
      expect(result).toBe(10);
    });

    it('a batch that never wrote publishes nothing', () => {
      const session = createGameSession(stub(1));
      const listener = vi.fn();
      session.subscribe(listener);

      session.batch(() => { session.getState(); });

      expect(listener).not.toHaveBeenCalled();
    });

    it('nested batches coalesce into the outermost one', () => {
      const session = createGameSession(stub(1));
      const listener = vi.fn();
      session.subscribe(listener);

      session.batch(() => {
        session.commit(stub(2));
        session.batch(() => { session.commit(stub(3)); });
        expect(listener).not.toHaveBeenCalled();
        session.commit(stub(4));
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(session.getState().turn).toBe(4);
    });

    it('still publishes the final state, once, when the callback throws after a write, and rethrows', () => {
      const session = createGameSession(stub(1));
      const listener = vi.fn();
      session.subscribe(listener);

      expect(() => session.batch(() => { session.commit(stub(2)); throw new Error('boom'); })).toThrow('boom');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(session.getState().turn).toBe(2);
      // and the session is usable afterwards: depth was unwound
      session.commit(stub(3));
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('does not leak deferral: an unpublished adopt inside a batch stays silent', () => {
      const session = createGameSession(stub(1));
      const listener = vi.fn();
      session.subscribe(listener);

      session.batch(() => { session.unpublished.adopt(stub(2), 'derived-bookkeeping'); });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  it('update applies a pure transform and publishes once', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    session.subscribe(listener);

    session.update(state => ({ ...state, turn: state.turn + 1 }));

    expect(session.getState().turn).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops delivery', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    const off = session.subscribe(listener);

    off();
    session.commit(stub(2));

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers in registration order', () => {
    // main.ts registers the renderer before the HUD and relies on that order:
    // updateHUD() reads the same state the renderer was just handed.
    const session = createGameSession(stub(1));
    const order: string[] = [];
    session.subscribe(() => order.push('renderer'));
    session.subscribe(() => order.push('hud'));

    session.commit(stub(2));
    session.update(state => ({ ...state, turn: state.turn + 1 }));

    expect(order).toEqual(['renderer', 'hud', 'renderer', 'hud']);
  });

  it('a subscriber that throws does not prevent later subscribers from running', () => {
    const session = createGameSession(stub(1));
    const boom = vi.fn(() => { throw new Error('render failed'); });
    const after = vi.fn();
    session.subscribe(boom);
    session.subscribe(after);

    expect(() => session.commit(stub(2))).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
