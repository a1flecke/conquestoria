import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState } from '@/core/pirate-state';
import {
  markNotificationRead,
  resolvePirateNotificationReview,
} from '@/ui/pirate-notification-listeners';

describe('pirate notification listeners', () => {
  it('marks only the viewers matching notification read without mutating input', () => {
    const state = createNewGame(undefined, 'pirate-read', 'small');
    state.notificationLog = {
      player: [{ id: 'notification-1', message: 'Pirates', type: 'warning', turn: 3, read: false }],
      'ai-1': [{ id: 'notification-2', message: 'Private', type: 'info', turn: 3, read: false }],
    };
    const next = markNotificationRead(state, 'player', 'notification-1');
    expect(next).not.toBe(state);
    expect(next.notificationLog!.player[0].read).toBe(true);
    expect(next.notificationLog!['ai-1'][0].read).toBe(false);
    expect(state.notificationLog.player[0].read).toBe(false);
  });

  it('resolves active and historical review references only when reachable by that viewer', () => {
    const state = createNewGame(undefined, 'pirate-review', 'small');
    state.pirates = createEmptyPirateState();
    state.pirates.intelByCiv.player = {
      'pirate-1': { factionId: 'pirate-1', level: 'rumor', discoveredRound: 1, lastUpdatedRound: 1 },
    };
    state.pirates.history.push({
      id: 'history-1', kind: 'destroyed', factionId: 'pirate-2', factionName: 'Old Wake', round: 4,
      headquartersKind: 'coastal-enclave', destroyedByOwnerId: 'player', bountyAwarded: 20, reason: 'combat',
    });
    expect(resolvePirateNotificationReview(state, 'player', { kind: 'pirate-faction', factionId: 'pirate-1' }))
      .toEqual({ kind: 'active', factionId: 'pirate-1' });
    expect(resolvePirateNotificationReview(state, 'player', { kind: 'pirate-history', historyId: 'history-1' }))
      .toEqual({ kind: 'history', historyId: 'history-1' });
    expect(resolvePirateNotificationReview(state, 'ai-1', { kind: 'pirate-faction', factionId: 'pirate-1' })).toBeNull();
  });
});
