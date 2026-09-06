import { describe, expect, it } from 'vitest';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import {
  formatMinorCivEventMessageForPlayer,
  getMinorCivEconomyPresentationForPlayer,
  getMinorCivPresentationForPlayer,
} from '@/systems/minor-civ-presentation';
import {
  collectMinorCivLeagueNotices,
  getMinorCivLeaguePresentationForPlayer,
} from '@/systems/minor-civ-league-presentation';

describe('minor-civ-presentation', () => {
  it('uses a generic name for an undiscovered city-state', () => {
    const state = createNewGame(undefined, 'mc-present-undiscovered', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(getMinorCivPresentationForPlayer(state, 'player', mcId)).toMatchObject({
      known: false,
      name: 'City-State',
    });
  });

  it('masks city-state color until the viewer has discovered it', () => {
    const state = createNewGame(undefined, 'mc-present-color-privacy', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const hiddenPresentation = getMinorCivPresentationForPlayer(state, 'player', mcId);
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';
    const discoveredPresentation = getMinorCivPresentationForPlayer(state, 'player', mcId);

    expect(hiddenPresentation).toMatchObject({
      known: false,
      color: '#888',
    });
    expect(discoveredPresentation.known).toBe(true);
    expect(discoveredPresentation.color).not.toBe('#888');
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

  it('shows a compact only through a discovered member and masks undiscovered peers', () => {
    const state = createNewGame(undefined, 'mc-compact-presentation', 'small');
    const [first, second] = Object.keys(state.minorCivs);
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first, second].sort(), formedTurn: 20, readiness: { kind: 'quiet' },
      },
    };

    expect(getMinorCivLeaguePresentationForPlayer(state, 'player', first)).toBeNull();
    state.civilizations.player.visibility.tiles[hexKey(state.cities[state.minorCivs[first].cityId].position)] = 'fog';
    const presentation = getMinorCivLeaguePresentationForPlayer(state, 'player', first);

    expect(presentation).toMatchObject({
      name: 'Amber Compact', charterLabel: 'Commerce charter', hasUnknownMembers: true,
    });
    expect(presentation!.knownMembers).toHaveLength(1);
    expect(presentation!.knownMembers[0]!.minorCivId).toBe(first);
    state.minorCivLeagues!.leagues['minor-compact-1']!.readiness = { kind: 'cooling', sinceTurn: state.turn };
    expect(getMinorCivLeaguePresentationForPlayer(state, 'player', first)!.readinessLabel)
      .toBe('Tensions easing');
  });

  it('grants member-scoped compact guidance for a valid viewer-owned route only', () => {
    const state = createNewGame(undefined, 'mc-compact-route-guidance', 'small');
    const [first, second] = Object.keys(state.minorCivs);
    const playerCity = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[playerCity.id] = playerCity;
    state.civilizations.player.cities.push(playerCity.id);
    const memberCity = state.cities[state.minorCivs[first].cityId];
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first, second].sort(), formedTurn: 20, readiness: { kind: 'quiet' },
      },
    };
    state.civilizations.player.visibility.tiles[hexKey(memberCity.position)] = 'fog';
    state.civilizations.player.visibility.tiles[hexKey(state.cities[state.minorCivs[second].cityId].position)] = 'fog';
    state.marketplace!.tradeRoutes.push({
      id: 'route-compact', fromCityId: playerCity.id, toCityId: memberCity.id,
      foreignCivId: first, goldPerTrip: 3, turnsPerTrip: 2,
    });

    const presentation = getMinorCivLeaguePresentationForPlayer(state, 'player', first)!;
    expect(presentation.knownMembers.find(member => member.minorCivId === first)?.connectedDetail)
      .toBe('Local priority: trade buildings');
    expect(presentation.knownMembers.find(member => member.minorCivId === second)?.connectedDetail)
      .toBeNull();

    state.minorCivs[first].diplomacy.relationships.player = -26;
    expect(getMinorCivLeaguePresentationForPlayer(state, 'player', first)!.knownMembers[0]?.connectedDetail)
      .toBeNull();
  });

  it('emits one safe concern notice when public compact readiness changes', () => {
    const before = createNewGame(undefined, 'mc-compact-notice', 'small');
    const [first, second] = Object.keys(before.minorCivs);
    before.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first, second].sort(), formedTurn: 20, readiness: { kind: 'quiet' },
      },
    };
    before.civilizations.player.visibility.tiles[hexKey(before.cities[before.minorCivs[first].cityId].position)] = 'fog';
    const after = structuredClone(before);
    after.minorCivLeagues!.leagues['minor-compact-1']!.readiness = { kind: 'concern', sinceTurn: after.turn };

    expect(collectMinorCivLeagueNotices(before, after)).toEqual([{
      recipientCivId: 'player',
      message: 'Amber Compact: a member reports regional tension.',
      type: 'info',
    }]);
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

  it('masks hidden city-state economy presentation from undiscovered viewers', () => {
    const state = createNewGame(undefined, 'minor-economy-presentation-hidden', 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    minorCiv.economy = {
      policy: 'defense',
      posture: 'mobilizing',
      lastProcessedTurn: state.turn,
      recentProductionSummary: { itemId: 'warrior', itemClass: 'unit', completedTurn: state.turn },
    };

    const presentation = getMinorCivEconomyPresentationForPlayer(state, 'player', minorCiv.id);

    expect(presentation.known).toBe(false);
    expect(presentation.postureLabel).toBeNull();
    expect(presentation.hint).toBeNull();
  });

  it('shows only broad city-state economy posture to discovered viewers', () => {
    const state = createNewGame(undefined, 'minor-economy-presentation-known', 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    const city = state.cities[minorCiv.cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';
    minorCiv.economy = {
      policy: 'defense',
      posture: 'mobilizing',
      lastProcessedTurn: state.turn,
      recentProductionSummary: { itemId: 'warrior', itemClass: 'unit', completedTurn: state.turn },
    };

    const presentation = getMinorCivEconomyPresentationForPlayer(state, 'player', minorCiv.id);

    expect(presentation).toMatchObject({
      known: true,
      postureLabel: 'Mobilizing',
      hint: 'training defenders',
    });
    expect(JSON.stringify(presentation)).not.toContain('warrior');
  });

  it('recomputes effective posture from cooled grievance state for immediate UI refresh', () => {
    const state = createNewGame(undefined, 'minor-economy-presentation-cooled', 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    const city = state.cities[minorCiv.cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 5,
        status: 'wary',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    minorCiv.economy = {
      policy: 'defense',
      posture: 'mobilizing',
      lastProcessedTurn: state.turn,
    };

    const presentation = getMinorCivEconomyPresentationForPlayer(state, 'player', minorCiv.id);

    expect(presentation.postureLabel).toBe('Quiet');
  });
});
