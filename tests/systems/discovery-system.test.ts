import { describe, it, expect } from 'vitest';
import { updateVisibility } from '@/systems/fog-of-war';
import {
  hasDiscoveredCity,
  hasDiscoveredMinorCiv,
  hasMetCivilization,
  recordCivilizationContact,
  syncCivilizationContactsFromVisibility,
} from '@/systems/discovery-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';

describe('discovery-system', () => {
  it('treats a civ as met after one of its city tiles has been explored', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 10, includeThirdCiv: true });
    state.civilizations.player.visibility.tiles['4,0'] = 'fog';

    expect(hasMetCivilization(state, 'player', breakawayId)).toBe(true);
  });

  it('does not treat an unseen rival as met when relationship data exists but no contact exists', () => {
    const { state } = makeBreakawayFixture({ breakawayStartedTurn: 10, includeThirdCiv: true });

    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(false);
  });

  it('treats a minor civ as discovered only after its city tile is visible or fogged', () => {
    const { state } = makeBreakawayFixture({ breakawayStartedTurn: 10 });
    state.minorCivs = {
      'mc-sparta': {
        id: 'mc-sparta',
        definitionId: 'sparta',
        cityId: 'mc-city',
        units: [],
        diplomacy: state.civilizations.player.diplomacy,
        activeQuests: {},
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 0,
      },
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'],
      id: 'mc-city',
      owner: 'mc-sparta',
      position: { q: 6, r: 0 },
      ownedTiles: [{ q: 6, r: 0 }],
    };

    expect(hasDiscoveredMinorCiv(state, 'player', 'mc-sparta')).toBe(false);

    state.civilizations.player.visibility.tiles['6,0'] = 'fog';
    expect(hasDiscoveredMinorCiv(state, 'player', 'mc-sparta')).toBe(true);
  });

  it('keeps a civilization known after first visible unit contact even after visibility is lost', () => {
    const { state } = makeBreakawayFixture({ includeThirdCiv: true });
    state.units['unit-outsider'] = {
      id: 'unit-outsider',
      type: 'warrior',
      owner: 'outsider',
      position: { q: 2, r: 0 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.civilizations.outsider.units = ['unit-outsider'];
    state.civilizations.player.visibility.tiles['2,0'] = 'visible';

    recordCivilizationContact(state, 'player', 'outsider');
    delete state.civilizations.player.visibility.tiles['2,0'];

    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(true);
  });

  it('persists contact immediately after a visibility refresh reveals a foreign unit', () => {
    const { state } = makeBreakawayFixture({ includeThirdCiv: true });
    state.map.tiles['1,0'] = {
      ...state.map.tiles['0,0'],
      coord: { q: 1, r: 0 },
      owner: null,
    };
    state.map.tiles['2,0'] = {
      ...state.map.tiles['0,0'],
      coord: { q: 2, r: 0 },
      owner: 'outsider',
    };
    state.units['unit-outsider'] = {
      id: 'unit-outsider',
      type: 'warrior',
      owner: 'outsider',
      position: { q: 2, r: 0 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.civilizations.outsider.units = ['unit-outsider'];
    state.civilizations.player.units = [];

    const spottingScout = {
      id: 'unit-player-scout',
      type: 'scout' as const,
      owner: 'player',
      position: { q: 1, r: 0 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };

    updateVisibility(state.civilizations.player.visibility, [spottingScout], state.map);

    expect(state.civilizations.player.knownCivilizations ?? []).not.toContain('outsider');

    syncCivilizationContactsFromVisibility(state, 'player');

    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(true);
    expect(state.civilizations.player.knownCivilizations).toContain('outsider');
  });

  it('does not lose first contact when visibility changes again before end turn', () => {
    const { state } = makeBreakawayFixture({ includeThirdCiv: true });
    state.map.tiles['0,0'] = {
      ...state.map.tiles['0,0'],
      owner: null,
    };
    state.map.tiles['1,0'] = {
      ...state.map.tiles['0,0'],
      coord: { q: 1, r: 0 },
      owner: null,
    };
    state.map.tiles['2,0'] = {
      ...state.map.tiles['0,0'],
      coord: { q: 2, r: 0 },
      owner: 'outsider',
    };
    state.units['unit-outsider'] = {
      id: 'unit-outsider',
      type: 'warrior',
      owner: 'outsider',
      position: { q: 2, r: 0 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.civilizations.outsider.units = ['unit-outsider'];
    state.civilizations.player.units = [];

    const spottingScout = {
      id: 'unit-player-scout',
      type: 'scout' as const,
      owner: 'player',
      position: { q: 1, r: 0 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    const retreatingScout = {
      ...spottingScout,
      position: { q: 0, r: 0 },
    };

    updateVisibility(state.civilizations.player.visibility, [spottingScout], state.map);
    syncCivilizationContactsFromVisibility(state, 'player');
    updateVisibility(state.civilizations.player.visibility, [retreatingScout], state.map);

    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(true);
  });

  it('does not treat city discovery as implied by civilization contact', () => {
    const { state, cityId } = makeBreakawayFixture({ includeThirdCiv: true });
    state.civilizations.player.knownCivilizations = ['outsider'];

    state.cities['outsider-city'] = {
      ...state.cities[cityId],
      id: 'outsider-city',
      owner: 'outsider',
      name: 'Rome',
      position: { q: 6, r: 0 },
      ownedTiles: [{ q: 6, r: 0 }],
    };
    state.civilizations.outsider.cities = ['outsider-city'];
    state.map.tiles['6,0'] = {
      ...state.map.tiles['4,0'],
      coord: { q: 6, r: 0 },
      owner: 'outsider',
    };

    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(true);
    expect(hasDiscoveredCity(state, 'player', 'outsider-city')).toBe(false);
  });
});
