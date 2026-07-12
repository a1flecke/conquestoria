import { vi } from 'vitest';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import type { GameState } from '@/core/types';

export function makeState(overrides: Partial<GameState> = {}): GameState {
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

export function make(state: GameState, suppressed = false) {
  const toast = vi.fn();
  const delivery = createNotificationDelivery({
    getState: () => state,
    toast,
    isSuppressed: () => suppressed,
  });
  return { delivery, toast };
}
