import type { GameState } from '@/core/types';
import type { GameSession } from '@/app/ports';

export function createGameSession(initial: GameState): GameSession {
  let state = initial;
  const listeners = new Set<(next: GameState) => void>();

  const publish = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        // One failing view must not strand the others mid-refresh.
        console.error('GameSession subscriber failed:', error);
      }
    }
  };

  return {
    getState: () => state,
    commit(next) { state = next; publish(); },
    update(fn) { state = fn(state); publish(); },
    setStateWithoutRefresh(next) { state = next; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
