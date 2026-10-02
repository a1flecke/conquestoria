import { vi } from 'vitest';
import type { GameState } from '@/core/types';

/**
 * Subscribes a recording renderer + HUD to a session exactly as `bootstrap.ts`
 * does (#1199). Controller tests use this so a handler that forgets to publish
 * fails: the recorder only fires on a real `commit`/`update`/`batch`, never on a
 * controller's manual `renderLoop.setGameState(...)` push.
 */
export function subscribeRecordingViews(session: {
  subscribe: (listener: (state: GameState) => void) => () => void;
}) {
  const renderer = { setGameState: vi.fn() };
  const hud = { update: vi.fn() };
  const offRenderer = session.subscribe(next => renderer.setGameState(next));
  const offHud = session.subscribe(() => hud.update());
  return {
    renderer,
    hud,
    unsubscribe: () => {
      offRenderer();
      offHud();
    },
  };
}
