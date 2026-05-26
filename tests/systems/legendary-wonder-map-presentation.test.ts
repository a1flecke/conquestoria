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
});
