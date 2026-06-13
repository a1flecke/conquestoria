import { describe, expect, it } from 'vitest';
import { appendNotification, createNotificationLog, getNotificationsForPlayer } from '@/core/notification-log';

function stateWithLog() {
  return {
    notificationLog: createNotificationLog(),
    idCounters: { nextNotificationId: 1 },
  } as any;
}

describe('notification log', () => {
  it('appends to the active player only', () => {
    const state = stateWithLog();
    appendNotification(state, 'player', { message: 'P1 trained warrior', type: 'info', turn: 1 });
    appendNotification(state, 'ai-1', { message: 'P2 researched archery', type: 'info', turn: 1 });

    expect(getNotificationsForPlayer(state.notificationLog, 'player').map(e => e.message)).toEqual(['P1 trained warrior']);
    expect(getNotificationsForPlayer(state.notificationLog, 'ai-1').map(e => e.message)).toEqual(['P2 researched archery']);
  });

  it('caps each player log at 50 entries independently', () => {
    const state = stateWithLog();
    for (let i = 0; i < 60; i++) {
      appendNotification(state, 'player', { message: `m${i}`, type: 'info', turn: i });
    }
    appendNotification(state, 'ai-1', { message: 'only-one', type: 'info', turn: 0 });

    const p1 = getNotificationsForPlayer(state.notificationLog, 'player');
    expect(p1.length).toBe(50);
    expect(p1[0].message).toBe('m10');
    expect(p1[49].message).toBe('m59');
    expect(getNotificationsForPlayer(state.notificationLog, 'ai-1').length).toBe(1);
  });

  it('returns an empty array for a civId with no entries', () => {
    const log = createNotificationLog();

    expect(getNotificationsForPlayer(log, 'never-seen')).toEqual([]);
  });

  it('preserves map target metadata on stored entries', () => {
    const state = stateWithLog();

    appendNotification(state, 'player', {
      message: 'Barbarian raiders spotted!',
      type: 'warning',
      turn: 12,
      target: {
        kind: 'map',
        coord: { q: 4, r: 3 },
        label: 'Barbarian raiders',
      },
    });

    expect(getNotificationsForPlayer(state.notificationLog, 'player')).toEqual([
      {
        id: 'notification-1',
        message: 'Barbarian raiders spotted!',
        type: 'warning',
        turn: 12,
        read: false,
        target: {
          kind: 'map',
          coord: { q: 4, r: 3 },
          label: 'Barbarian raiders',
        },
      },
    ]);
  });

  it('persists stable IDs, unread state, and pirate review targets through JSON round trips', () => {
    const state = stateWithLog();
    appendNotification(state, 'player', {
      message: 'Pirate waters sighted',
      type: 'warning',
      turn: 18,
      review: { kind: 'pirate-faction', factionId: 'pirate-3' },
    });

    const roundTripped = JSON.parse(JSON.stringify(state));

    expect(getNotificationsForPlayer(roundTripped.notificationLog, 'player')).toHaveLength(1);
    expect(roundTripped.notificationLog.player[0]).toMatchObject({
      id: 'notification-1',
      read: false,
      review: { kind: 'pirate-faction', factionId: 'pirate-3' },
    });
  });
});
