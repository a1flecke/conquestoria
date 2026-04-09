import { describe, it, expect } from 'vitest';
import {
  collectEvent,
  collectCouncilInterrupt,
  getEventsForPlayer,
  clearEventsForPlayer,
  generateSummary,
} from '@/core/hotseat-events';
import { createNewGame } from '@/core/game-state';
import type { GameEvent } from '@/core/types';

describe('hotseat-events', () => {
  it('collectEvent adds event to pending for a player', () => {
    const pending: Record<string, GameEvent[]> = {};
    collectEvent(pending, 'player-1', { type: 'city:grew', message: 'City grew', turn: 5 });
    expect(pending['player-1']).toHaveLength(1);
  });

  it('getEventsForPlayer returns empty array when no events', () => {
    expect(getEventsForPlayer({}, 'player-1')).toEqual([]);
  });

  it('clearEventsForPlayer removes events for that player only', () => {
    const pending: Record<string, GameEvent[]> = {
      'player-1': [{ type: 'test', message: 'hi', turn: 1 }],
      'player-2': [{ type: 'test', message: 'yo', turn: 1 }],
    };
    clearEventsForPlayer(pending, 'player-1');
    expect(pending['player-1']).toHaveLength(0);
    expect(pending['player-2']).toHaveLength(1);
  });

  it('generateSummary produces summary from game state', () => {
    const state = createNewGame(undefined, 'summary-test');
    const summary = generateSummary(state, 'player');
    expect(summary.turn).toBe(1);
    expect(summary.era).toBe(1);
    expect(typeof summary.gold).toBe('number');
    expect(typeof summary.cities).toBe('number');
    expect(typeof summary.units).toBe('number');
  });

  it('collects council interrupts for the intended viewer only', () => {
    const pending: Record<string, GameEvent[]> = {};

    collectCouncilInterrupt(pending, 'player-2', {
      civId: 'player-2',
      advisor: 'treasurer',
      summary: 'We are running low on food.',
      sourceCardId: 'food-warning',
    }, 6);

    expect(pending['player-2']).toEqual([
      { type: 'council:interrupt', message: 'We are running low on food.', turn: 6 },
    ]);
    expect(pending['player-1']).toBeUndefined();
  });
});
