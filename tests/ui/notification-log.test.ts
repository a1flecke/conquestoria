import { describe, expect, it } from 'vitest';
import {
  appendNotification,
  createNotificationLog,
  getNotificationsForPlayer,
} from '@/ui/notification-log';

describe('notification log hot-seat scoping', () => {
  it('appends to the active player only', () => {
    const log = createNotificationLog();
    appendNotification(log, 'player', { message: 'P1 trained warrior', type: 'info', turn: 1 });
    appendNotification(log, 'ai-1', { message: 'P2 researched archery', type: 'info', turn: 1 });
    expect(getNotificationsForPlayer(log, 'player').map(e => e.message)).toEqual(['P1 trained warrior']);
    expect(getNotificationsForPlayer(log, 'ai-1').map(e => e.message)).toEqual(['P2 researched archery']);
  });

  it('caps each player log at 50 entries independently', () => {
    const log = createNotificationLog();
    for (let i = 0; i < 60; i++) {
      appendNotification(log, 'player', { message: `m${i}`, type: 'info', turn: i });
    }
    appendNotification(log, 'ai-1', { message: 'only-one', type: 'info', turn: 0 });
    const p1 = getNotificationsForPlayer(log, 'player');
    expect(p1.length).toBe(50);
    expect(p1[0].message).toBe('m10');
    expect(p1[49].message).toBe('m59');
    expect(getNotificationsForPlayer(log, 'ai-1').length).toBe(1);
  });

  it('returns an empty array for a civId with no entries', () => {
    const log = createNotificationLog();
    expect(getNotificationsForPlayer(log, 'never-seen')).toEqual([]);
  });
});
