import type { GameState } from '@/core/types';
import type { GameSession, UnpublishedStateWriter } from '@/app/ports';

/**
 * A session plus the restricted writer for the few transitions that must NOT
 * publish (#1015). Controllers are typed against `GameSession`, which has no
 * silent write at all; only `bootstrap.ts` holds this wider type and hands
 * `unpublished` to the named callers pinned in `architecture-boundaries.test.ts`.
 */
export type GameSessionHandle = GameSession & { readonly unpublished: UnpublishedStateWriter };

export function createGameSession(initial: GameState): GameSessionHandle {
  let state = initial;
  const listeners = new Set<(next: GameState) => void>();
  let batchDepth = 0;
  let batchDirty = false;

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

  // Every publishing write funnels through here so `batch` can defer it.
  const requestPublish = (): void => {
    if (batchDepth > 0) { batchDirty = true; return; }
    publish();
  };

  return {
    getState: () => state,
    commit(next) { state = next; requestPublish(); },
    update(fn) { state = fn(state); requestPublish(); },
    batch<T>(fn: () => T): T {
      batchDepth++;
      try {
        return fn();
      } finally {
        batchDepth--;
        // Publish the FINAL state once, even if `fn` threw after a write: the
        // state did change and a stale view is worse than a late one.
        if (batchDepth === 0 && batchDirty) {
          batchDirty = false;
          publish();
        }
      }
    },
    unpublished: {
      adopt(next, _reason) { state = next; },
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
