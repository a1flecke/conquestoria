import { describe, expect, it } from 'vitest';
import { getLegendaryWonderMapEntries } from '@/systems/legendary-wonder-map-presentation';
import { hexKey } from '@/systems/hex-utils';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-map-presentation', () => {
  it('returns owner-safe completed landmark entries for visible owned host cities', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 20 },
    };
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';

    const entries = getLegendaryWonderMapEntries(state, 'player');

    expect(entries).toEqual([
      expect.objectContaining({
        wonderId: 'oracle-of-delphi',
        cityId: 'city-river',
        coord: state.cities['city-river'].position,
        turnCompleted: 20,
      }),
    ]);
  });

  it('does not expose rival completed landmarks without earned visibility', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: 'rival-city', turnCompleted: 20 },
    };

    expect(getLegendaryWonderMapEntries(state, 'player')).toEqual([]);
  });

  it('adds owned active construction ghosts only at final-works progress on visible owned cities', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 72;
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';
    state.legendaryWonderProjects = {
      'oracle-of-delphi:player:city-river': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'building',
        investedProduction: 72,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const entries = getLegendaryWonderMapEntries(state, 'player');

    expect(entries).toContainEqual(expect.objectContaining({
      wonderId: 'oracle-of-delphi',
      relationship: 'owned',
      state: 'under-construction',
      progressRatio: 0.6,
    }));
  });

  it('does not add map ghosts below final-works progress', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 71;
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';
    state.legendaryWonderProjects = {
      'oracle-of-delphi:player:city-river': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'building',
        investedProduction: 71,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    expect(getLegendaryWonderMapEntries(state, 'player')
      .some(entry => entry.state === 'under-construction')).toBe(false);
  });

  it('uses live active city production for construction ghost progress when project investment lags', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 72;
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';
    state.legendaryWonderProjects = {
      'oracle-of-delphi:player:city-river': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'building',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    expect(getLegendaryWonderMapEntries(state, 'player')).toContainEqual(expect.objectContaining({
      wonderId: 'oracle-of-delphi',
      state: 'under-construction',
      progressRatio: 0.6,
    }));
  });

  it('does not render rival landmarks from completed rival intel alone', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 20 },
    };
    state.legendaryWonderIntel = {
      player: [{
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:rival:20',
        wonderId: 'oracle-of-delphi',
        civId: 'rival',
        civName: 'Rival',
        completionTurn: 20,
        learnedTurn: 20,
      }],
    };
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-rival'].position)] = 'visible';

    expect(getLegendaryWonderMapEntries(state, 'player')).toEqual([]);
  });

  it('returns known-rival map entries from paired completed and host-location intel at visible or fog coordinates', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const coord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:rival:70',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    expect(getLegendaryWonderMapEntries(state, 'player')).toContainEqual(expect.objectContaining({
      wonderId: 'oracle-of-delphi',
      relationship: 'known-rival',
      state: 'completed',
      coord,
      label: 'Oracle of Delphi',
      progressRatio: undefined,
    }));

    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'fog';
    expect(getLegendaryWonderMapEntries(state, 'player')).toContainEqual(expect.objectContaining({
      wonderId: 'oracle-of-delphi',
      relationship: 'known-rival',
      coord,
    }));
  });

  it('does not return known-rival map entries for unexplored, host-location-only, or completed-only intel', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const coord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:rival:city-rival:41',
          projectKey: 'oracle-of-delphi:rival:city-rival',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:grand-canal:rival:70',
          wonderId: 'grand-canal',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    expect(getLegendaryWonderMapEntries(state, 'player').some(entry => entry.relationship === 'known-rival')).toBe(false);

    state.legendaryWonderIntel.player.push({
      kind: 'completed',
      eventId: 'completed:oracle-of-delphi:rival:70',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      completionTurn: 70,
      learnedTurn: 70,
    });
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'unexplored';
    expect(getLegendaryWonderMapEntries(state, 'player').some(entry => entry.relationship === 'known-rival')).toBe(false);
  });
});
