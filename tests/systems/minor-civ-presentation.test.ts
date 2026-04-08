import { describe, expect, it } from 'vitest';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { hexKey } from '@/systems/hex-utils';
import {
  formatMinorCivEventMessageForPlayer,
  getMinorCivPresentationForPlayer,
} from '@/systems/minor-civ-presentation';

describe('minor-civ-presentation', () => {
  it('uses a generic name for an undiscovered city-state', () => {
    const state = createNewGame(undefined, 'mc-present-undiscovered', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(getMinorCivPresentationForPlayer(state, 'player', mcId)).toMatchObject({
      known: false,
      name: 'City-State',
    });
  });

  it('uses the real name after the city tile is discovered', () => {
    const state = createNewGame(undefined, 'mc-present-discovered', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

    const presentation = getMinorCivPresentationForPlayer(state, 'player', mcId);
    expect(presentation.known).toBe(true);
    expect(presentation.name).not.toBe('City-State');
  });

  it('formats evolved notifications generically for undiscovered viewers', () => {
    const state = createNewGame(undefined, 'mc-present-evolved', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(formatMinorCivEventMessageForPlayer(state, 'player', mcId, 'evolved'))
      .toBe('A barbarian tribe formed a new city-state!');
  });

  it('formats destroyed notifications generically for undiscovered viewers', () => {
    const state = createNewGame(undefined, 'mc-present-destroyed', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(formatMinorCivEventMessageForPlayer(state, 'player', mcId, 'destroyed'))
      .toBe('A city-state has fallen!');
  });

  it('formats guerrilla messages per viewer when one hot-seat player discovered the city-state and another did not', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mc-hotseat-privacy');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations['player-1'].visibility.tiles[hexKey(city.position)] = 'fog';

    const discoveredMsg = formatMinorCivEventMessageForPlayer(state, 'player-1', mcId, 'guerrilla');
    const hiddenMsg = formatMinorCivEventMessageForPlayer(state, 'player-2', mcId, 'guerrilla');

    expect(discoveredMsg).not.toBe('City-state guerrilla fighters attack!');
    expect(hiddenMsg).toBe('City-state guerrilla fighters attack!');
  });
});
