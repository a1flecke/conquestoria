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

  it('queues turn-time quest events into the authoritative immutable next state', () => {
    const stale = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mc-authoritative-listener');
    stale.pendingEvents = {};
    const next = structuredClone(stale);
    const minorCivId = getFirstMinorCivId(next);
    discoverMinorCiv(next, 'player-1', minorCivId);
    const bus = new EventBus();
    registerMinorCivNotificationListeners(bus, () => stale, { appendToCivLog: vi.fn() });

    bus.emit('minor-civ:quest-issued', {
      majorCivId: 'player-1', minorCivId, state: next,
      quest: {
        id: 'quest-next-state', type: 'gift_gold', description: 'Gift 25 gold',
        target: { type: 'gift_gold', amount: 25 }, reward: { relationshipBonus: 20 },
        progress: 0, status: 'active', turnIssued: next.turn, expiresOnTurn: next.turn + 20,
      },
    });

    expect(stale.pendingEvents?.['player-1']).toBeUndefined();
    expect(next.pendingEvents?.['player-1']).toHaveLength(1);
  });

  it('routes city-state economy production to eligible hot-seat viewers only', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'A', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'B', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'minor-economy-hotseat-notify');
    state.pendingEvents = {};
    const minorCivId = getFirstMinorCivId(state);
    const minorCiv = state.minorCivs[minorCivId];
    const city = state.cities[minorCiv.cityId];
    state.civilizations['player-1'].visibility.tiles[hexKey(city.position)] = 'fog';
    const bus = new EventBus();
    const log: string[] = [];

    registerMinorCivNotificationListeners(bus, () => state, {
      appendToCivLog: (civId, message) => { log.push(`${civId}:${message}`); },
    });

    bus.emit('minor-civ:production-completed', {
      minorCivId: minorCiv.id,
      cityId: city.id,
      itemId: 'warrior',
      itemClass: 'unit',
      state,
    });

    expect(state.pendingEvents?.['player-1']).toHaveLength(1);
    expect(state.pendingEvents?.['player-2']).toBeUndefined();
    expect(log.some(entry => entry.startsWith('player-1:'))).toBe(true);
    expect(log.some(entry => entry.startsWith('player-2:'))).toBe(false);
  });
});
