import type { GameSession } from '@/app/ports';
import { autoSave } from '@/storage/save-manager';

type RouteFeedback = 'info' | 'success' | 'warning';

/** Save a committed route change before telling the active player it is durable. */
export function saveTradeRouteChange(
  deps: {
    session: GameSession;
    showNotification: (message: string, kind: RouteFeedback) => void;
  },
  state: ReturnType<GameSession['getState']>,
  message: string,
  kind: 'info' | 'success',
): void {
  const notifyIfCurrent = (feedback: string, feedbackKind: RouteFeedback) => {
    const current = deps.session.getState();
    if (current.playthroughId === state.playthroughId && current.currentPlayer === state.currentPlayer) {
      deps.showNotification(feedback, feedbackKind);
    }
  };
  // Save writes are serialized with subsequent route changes and turn-end saves.
  void autoSave(state).then(
    () => notifyIfCurrent(`${message} Progress saved.`, kind),
    () => notifyIfCurrent('Route changed, but saving failed. Save your game before leaving.', 'warning'),
  );
}
