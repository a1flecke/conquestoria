import type { EventBus } from '@/core/event-bus';
import type { GameEvent, GameState } from '@/core/types';
import type { NotificationEntry } from '@/ui/notification-log';
import { collectEvent } from '@/core/hotseat-events';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';

interface MinorCivNotificationListenerOptions {
  showNotification: (message: string, type: NotificationEntry['type']) => void;
}

function queueHotSeatEvent(state: GameState, civId: string, event: GameEvent): void {
  if (state.hotSeat && state.pendingEvents) {
    collectEvent(state.pendingEvents, civId, event);
  }
}

export function registerMinorCivNotificationListeners(
  bus: EventBus,
  getState: () => GameState,
  options: MinorCivNotificationListenerOptions,
): void {
  bus.on('minor-civ:quest-issued', data => {
    const state = getState();
    const notification = getMinorCivNotification(state, data.majorCivId, {
      type: 'minor-civ:quest-issued',
      majorCivId: data.majorCivId,
      minorCivId: data.minorCivId,
      quest: data.quest,
    });
    if (!notification) return;

    queueHotSeatEvent(state, data.majorCivId, { type: 'minor-civ:quest', message: notification.message, turn: state.turn });
    if (data.majorCivId === state.currentPlayer) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:quest-completed', data => {
    const state = getState();
    const notification = getMinorCivNotification(state, data.majorCivId, {
      type: 'minor-civ:quest-completed',
      majorCivId: data.majorCivId,
      minorCivId: data.minorCivId,
      reward: data.reward,
    });
    if (!notification) return;

    queueHotSeatEvent(state, data.majorCivId, { type: 'minor-civ:quest-done', message: notification.message, turn: state.turn });
    if (data.majorCivId === state.currentPlayer) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:evolved', data => {
    const state = getState();
    if (state.hotSeat && state.pendingEvents) {
      for (const civId of Object.keys(state.civilizations)) {
        const notification = getMinorCivNotification(state, civId, {
          type: 'minor-civ:evolved',
          minorCivId: data.minorCivId,
        });
        if (notification) {
          collectEvent(state.pendingEvents, civId, { type: 'minor-civ:evolved', message: notification.message, turn: state.turn });
        }
      }
    }

    const notification = getMinorCivNotification(state, state.currentPlayer, {
      type: 'minor-civ:evolved',
      minorCivId: data.minorCivId,
    });
    if (notification) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:destroyed', data => {
    const state = getState();
    if (state.hotSeat && state.pendingEvents) {
      for (const civId of Object.keys(state.civilizations)) {
        const notification = getMinorCivNotification(state, civId, {
          type: 'minor-civ:destroyed',
          minorCivId: data.minorCivId,
        });
        if (notification) {
          collectEvent(state.pendingEvents, civId, { type: 'minor-civ:destroyed', message: notification.message, turn: state.turn });
        }
      }
    }

    const notification = getMinorCivNotification(state, state.currentPlayer, {
      type: 'minor-civ:destroyed',
      minorCivId: data.minorCivId,
    });
    if (notification) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:allied', data => {
    const state = getState();
    const notification = getMinorCivNotification(state, data.majorCivId, {
      type: 'minor-civ:allied',
      majorCivId: data.majorCivId,
      minorCivId: data.minorCivId,
    });
    if (!notification) return;

    queueHotSeatEvent(state, data.majorCivId, { type: 'minor-civ:allied', message: notification.message, turn: state.turn });
    if (data.majorCivId === state.currentPlayer) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:relationship-threshold', data => {
    const state = getState();
    const notification = getMinorCivNotification(state, data.majorCivId, {
      type: 'minor-civ:relationship-threshold',
      majorCivId: data.majorCivId,
      minorCivId: data.minorCivId,
      newStatus: data.newStatus,
    });
    if (!notification) return;

    queueHotSeatEvent(state, data.majorCivId, { type: 'minor-civ:status', message: notification.message, turn: state.turn });
    if (data.majorCivId === state.currentPlayer) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:guerrilla', data => {
    const state = getState();
    const notification = getMinorCivNotification(state, data.targetCivId, {
      type: 'minor-civ:guerrilla',
      targetCivId: data.targetCivId,
      minorCivId: data.minorCivId,
    });
    if (!notification) return;

    queueHotSeatEvent(state, data.targetCivId, { type: 'minor-civ:guerrilla', message: notification.message, turn: state.turn });
    if (data.targetCivId === state.currentPlayer) {
      options.showNotification(notification.message, notification.type);
    }
  });

  bus.on('minor-civ:quest-expired', data => {
    const state = getState();
    const notification = getMinorCivNotification(state, data.majorCivId, {
      type: 'minor-civ:quest-expired',
      majorCivId: data.majorCivId,
      minorCivId: data.minorCivId,
    });
    if (!notification) return;

    queueHotSeatEvent(state, data.majorCivId, { type: 'minor-civ:quest-expired', message: notification.message, turn: state.turn });
    if (data.majorCivId === state.currentPlayer) {
      options.showNotification(notification.message, notification.type);
    }
  });
}
