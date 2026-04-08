import { describe, expect, it } from 'vitest';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import type { GameState, Quest } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';

function getFirstMinorCivId(state: GameState): string {
  return Object.keys(state.minorCivs)[0]!;
}

function discoverMinorCiv(state: GameState, viewerCivId: string, minorCivId: string): void {
  const city = state.cities[state.minorCivs[minorCivId].cityId];
  state.civilizations[viewerCivId].visibility.tiles[hexKey(city.position)] = 'fog';
}

describe('minor-civ-notifications', () => {
  it('hides quest-issued notifications until the city-state is discovered', () => {
    const state = createNewGame(undefined, 'mc-quest-issued-hidden', 'small');
    const minorCivId = getFirstMinorCivId(state);
    const quest: Quest = {
      id: 'quest-gold',
      type: 'gift_gold',
      description: 'Gift 25 gold',
      target: { type: 'gift_gold', amount: 25 },
      reward: { relationshipBonus: 20 },
      progress: 0,
      status: 'active',
      turnIssued: 1,
      expiresOnTurn: 21,
    };

    const notification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:quest-issued',
      majorCivId: 'player',
      minorCivId,
      quest,
    });

    expect(notification).toBeNull();
  });

  it('keeps undiscovered foreign city targets generic in quest-issued notifications', () => {
    const state = createNewGame(undefined, 'mc-quest-issued-generic-city', 'small');
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player', minorCivId);
    state.cities.rome = {
      ...state.cities[state.minorCivs[minorCivId].cityId],
      id: 'rome',
      owner: Object.keys(state.civilizations).find(id => id !== 'player') ?? 'ai-1',
      name: 'Rome',
      position: { q: 7, r: 0 },
      ownedTiles: [{ q: 7, r: 0 }],
    };
    const quest: Quest = {
      id: 'quest-city',
      type: 'defeat_units',
      description: 'Clear 2 units from Rome',
      target: { type: 'defeat_units', count: 2, nearPosition: { q: 7, r: 0 }, radius: 8, cityId: 'rome' } as any,
      reward: { relationshipBonus: 20 },
      progress: 0,
      status: 'active',
      turnIssued: 1,
      expiresOnTurn: 21,
    };

    const notification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:quest-issued',
      majorCivId: 'player',
      minorCivId,
      quest,
    });

    expect(notification?.message).toContain('foreign city');
    expect(notification?.message).not.toContain('Rome');
  });

  it('returns quest-completed rewards only to the affected major civ', () => {
    const state = createNewGame(undefined, 'mc-quest-completed-targeted', 'small');
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player', minorCivId);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const ownerNotification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:quest-completed',
      majorCivId: 'player',
      minorCivId,
      reward: { gold: 50, science: 10 },
    });
    const otherNotification = getMinorCivNotification(state, otherMajorId, {
      type: 'minor-civ:quest-completed',
      majorCivId: 'player',
      minorCivId,
      reward: { gold: 50, science: 10 },
    });

    expect(ownerNotification?.message).toContain('+50 gold');
    expect(ownerNotification?.message).toContain('+10 science');
    expect(otherNotification).toBeNull();
  });

  it('formats evolved notifications per viewer in hot-seat play', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mc-evolved-hotseat');
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player-1', minorCivId);

    const visible = getMinorCivNotification(state, 'player-1', {
      type: 'minor-civ:evolved',
      minorCivId,
    });
    const hidden = getMinorCivNotification(state, 'player-2', {
      type: 'minor-civ:evolved',
      minorCivId,
    });

    expect(visible?.message).not.toBe('A barbarian tribe formed a new city-state!');
    expect(hidden?.message).toBe('A barbarian tribe formed a new city-state!');
  });

  it('only returns allied notifications for the affected major civ', () => {
    const state = createNewGame(undefined, 'mc-allied-targeted', 'small');
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player', minorCivId);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const ownerNotification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:allied',
      majorCivId: 'player',
      minorCivId,
    });
    const otherNotification = getMinorCivNotification(state, otherMajorId, {
      type: 'minor-civ:allied',
      majorCivId: 'player',
      minorCivId,
    });

    expect(ownerNotification?.message).toMatch(/ally/i);
    expect(otherNotification).toBeNull();
  });

  it('only returns relationship-threshold notifications for the affected major civ', () => {
    const state = createNewGame(undefined, 'mc-status-targeted', 'small');
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player', minorCivId);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const ownerNotification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:relationship-threshold',
      majorCivId: 'player',
      minorCivId,
      newStatus: 'friendly',
    });
    const otherNotification = getMinorCivNotification(state, otherMajorId, {
      type: 'minor-civ:relationship-threshold',
      majorCivId: 'player',
      minorCivId,
      newStatus: 'friendly',
    });

    expect(ownerNotification?.message).toContain('friendly');
    expect(otherNotification).toBeNull();
  });

  it('keeps guerrilla warnings generic for undiscovered targets and hidden from others', () => {
    const state = createNewGame(undefined, 'mc-guerrilla-generic', 'small');
    const minorCivId = getFirstMinorCivId(state);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const targetNotification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:guerrilla',
      targetCivId: 'player',
      minorCivId,
    });
    const otherNotification = getMinorCivNotification(state, otherMajorId, {
      type: 'minor-civ:guerrilla',
      targetCivId: 'player',
      minorCivId,
    });

    expect(targetNotification?.message).toBe('City-state guerrilla fighters attack!');
    expect(otherNotification).toBeNull();
  });

  it('only returns quest-expired notifications for the affected major civ', () => {
    const state = createNewGame(undefined, 'mc-quest-expired-targeted', 'small');
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player', minorCivId);
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const ownerNotification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:quest-expired',
      majorCivId: 'player',
      minorCivId,
    });
    const otherNotification = getMinorCivNotification(state, otherMajorId, {
      type: 'minor-civ:quest-expired',
      majorCivId: 'player',
      minorCivId,
    });

    expect(ownerNotification?.message).toMatch(/expired/i);
    expect(otherNotification).toBeNull();
  });
});
