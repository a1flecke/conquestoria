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

  it('setStateWithoutRefresh changes state and notifies nobody', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    session.subscribe(listener);

    session.setStateWithoutRefresh(stub(2));

    expect(session.getState().turn).toBe(2);
    expect(listener).not.toHaveBeenCalled();
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
