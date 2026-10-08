import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import type { AiGameState } from '@/core/types/ai';
import type { CouncilGameState } from '@/core/types/council';
import type { NotificationLogState } from '@/core/notification-log';
import { appendNotification } from '@/core/notification-log';
import { createNewGame } from '@/core/game-state';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';

/**
 * #1361 — `GameState` is composed from domain-owned slices. Every field keeps its name, optionality and type, so a
 * slice is exactly `Pick<GameState, keyof Slice>` and a `GameState` is assignable wherever a slice is expected.
 */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

describe('GameState slices (#1361)', () => {
  it('each slice is exactly the corresponding Pick of GameState (names, optionality and types unchanged)', () => {
    const checks: [
      Same<Pick<GameState, keyof AiGameState>, AiGameState>,
      Same<Pick<GameState, keyof CouncilGameState>, CouncilGameState>,
      Same<Pick<GameState, keyof NotificationLogState>, NotificationLogState>,
    ] = [true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });

  it('the slices own the expected persisted field names', () => {
    const ai: Array<keyof AiGameState> = ['opponentChallenge', 'pendingOpponentChallenge', 'opponentAI', 'autonomyByCiv', 'networkCivicPressureByCity'];
    const council: Array<keyof CouncilGameState> = ['councilMemory', 'assessmentDigestByCiv'];
    const notification: Array<keyof NotificationLogState> = ['notificationLog', 'idCounters'];
    expect(ai.length + council.length + notification.length).toBe(9);
  });

  it('slice-typed consumers accept a real GameState and need nothing else', () => {
    const state = createNewGame({ civType: 'egypt', mapSize: 'small', opponentCount: 1, gameTitle: 't', opponentChallenge: 'veteran', seed: 'slice-seed' });
    const ai: Pick<AiGameState, 'opponentChallenge'> = state;
    expect(resolveOpponentChallenge(ai)).toBe('veteran');
    expect(resolveOpponentChallenge({})).toBe('standard');
    const notification: NotificationLogState = state;
    const entry = appendNotification(notification, state.currentPlayer, { type: 'test', message: 'hello', turn: 1 } as never);
    expect(entry.id).toBeDefined();
  });
});
