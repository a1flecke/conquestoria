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
  it('shows destroyed notifications only for the current player while queuing per-viewer hot-seat events', () => {
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
    const showNotification = vi.fn();
    registerMinorCivNotificationListeners(bus, () => state, { showNotification });

    bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: 'player-1' });

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]?.[0]).not.toBe('A city-state has fallen!');
    expect(state.pendingEvents?.['player-1']?.[0]?.message).not.toBe('A city-state has fallen!');
    expect(state.pendingEvents?.['player-2']?.[0]?.message).toBe('A city-state has fallen!');
  });

  it('only surfaces targeted quest-complete notifications to the affected player', () => {
    const state = createNewGame(undefined, 'mc-quest-complete-listener', 'small');
    state.pendingEvents = {};
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player', minorCivId);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const bus = new EventBus();
    const showNotification = vi.fn();
    registerMinorCivNotificationListeners(bus, () => state, { showNotification });

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

    expect(showNotification).not.toHaveBeenCalled();
  });
});
