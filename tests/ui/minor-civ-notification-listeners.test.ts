import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';

function getFirstMinorCivId(state: GameState): string {
  return Object.keys(state.minorCivs)[0]!;
}

function discoverMinorCiv(state: GameState, viewerCivId: string, minorCivId: string): void {
  const city = state.cities[state.minorCivs[minorCivId].cityId];
  state.civilizations[viewerCivId].visibility.tiles[hexKey(city.position)] = 'fog';
}

describe('minor-civ notification listeners', () => {
  it('routes destroyed notifications to every civ with viewer-specific redaction', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mc-destroyed-listener');
    state.currentPlayer = 'player-1';
    state.pendingEvents = {};
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player-1', minorCivId);

    const bus = new EventBus();
    const appendToCivLog = vi.fn();
    registerMinorCivNotificationListeners(bus, () => state, { appendToCivLog });

    bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: 'player-1' });

    const calls = appendToCivLog.mock.calls as Array<[string, string, string]>;
    const byCiv = Object.fromEntries(calls.map(([civId, msg]) => [civId, msg]));
    expect(byCiv['player-1']).toBeDefined();
    expect(byCiv['player-1']).not.toBe('A city-state has fallen!');
    expect(byCiv['player-2']).toBe('A city-state has fallen!');
    expect(state.pendingEvents?.['player-1']?.[0]?.message).not.toBe('A city-state has fallen!');
    expect(state.pendingEvents?.['player-2']?.[0]?.message).toBe('A city-state has fallen!');
  });

  it('routes quest-completed notifications to the affected major civ only, even when that civ is not current player', () => {
    const state = createNewGame(undefined, 'mc-quest-complete-listener', 'small');
    state.pendingEvents = {};
    const minorCivId = getFirstMinorCivId(state);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    discoverMinorCiv(state, otherMajorId, minorCivId);

    const bus = new EventBus();
    const appendToCivLog = vi.fn();
    registerMinorCivNotificationListeners(bus, () => state, { appendToCivLog });

    bus.emit('minor-civ:quest-completed', {
      majorCivId: otherMajorId,
      minorCivId,
      quest: {
        id: 'quest-gold',
        type: 'gift_gold',
        description: 'Gift 25 gold',
        target: { type: 'gift_gold', amount: 25 },
        reward: { relationshipBonus: 20 },
        progress: 25,
        status: 'completed',
        turnIssued: 1,
        expiresOnTurn: 21,
      },
      reward: { relationshipBonus: 20, gold: 50, science: 10 },
    });

    const calls = appendToCivLog.mock.calls as Array<[string, string, string]>;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(otherMajorId);
  });
});
