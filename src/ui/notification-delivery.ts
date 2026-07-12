import type { GameState } from '@/core/types';
import { appendNotification, type NotificationEntry } from '@/core/notification-log';
import { collectEvent } from '@/core/hotseat-events';
import type { NotificationSink } from '@/ui/notification-routing';

export interface NotificationDeliveryDeps {
  getState: () => GameState;
  toast: (message: string, type: NotificationEntry['type'], target?: NotificationEntry['target']) => void;
  isSuppressed: () => boolean;
}

export interface NotificationDelivery {
  deliver: NotificationSink;
  withHappenedTurn<T>(turn: number, fn: () => T): T;
}

// The single delivery contract for game-consequence notifications (#551):
// log always; toast only when the recipient is the active, unsuppressed
// viewer; queue to pendingEvents (hot seat only) otherwise, where the
// turn-handoff summary already drains it. Solo never queues -- its single
// human is always the viewer, so deferred delivery would mean "never".
export function createNotificationDelivery(deps: NotificationDeliveryDeps): NotificationDelivery {
  let happenedTurn: number | null = null;

  const deliver: NotificationSink = (civId, message, type, target) => {
    const state = deps.getState();
    const turn = happenedTurn ?? state.turn;
    appendNotification(state, civId, { message, type, turn, target });

    const civ = state.civilizations[civId];
    if (!civ?.isHuman) return;

    const isActiveViewer = civId === state.currentPlayer && !deps.isSuppressed();
    if (isActiveViewer || !state.hotSeat) {
      deps.toast(message, type, target);
      return;
    }
    state.pendingEvents ??= {};
    collectEvent(state.pendingEvents, civId, {
      type: 'info',
      message,
      turn,
      ...(target ? { target } : {}),
    });
  };

  return {
    deliver,
    withHappenedTurn<T>(turn: number, fn: () => T): T {
      happenedTurn = turn;
      try {
        return fn();
      } finally {
        happenedTurn = null;
      }
    },
  };
}
