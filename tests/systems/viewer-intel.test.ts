import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import {
  canInspectTileOwnerForViewer,
  canInspectCityForViewer,
  canInspectUnitForViewer,
  shouldListMajorCivForViewer,
} from '@/systems/viewer-intel';

function makeState(): GameState {
  return {
    currentPlayer: 'player',
    turn: 1,
    map: {
      width: 8,
      height: 8,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '2,2': {
          coord: { q: 2, r: 2 },
          terrain: 'grassland',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'rival',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
        '3,3': {
          coord: { q: 3, r: 3 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: null,
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
      },
    },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#fff',
        isHuman: true,
        civType: 'generic',
        cities: [],
        units: [],
        techState: { completed: [], currentResearch: null, progress: {} },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, atWarWith: [], treaties: [] },
      },
      rival: {
        id: 'rival',
        name: 'Rival',
        color: '#f00',
        isHuman: false,
        civType: 'generic',
        cities: ['rival-city'],
        units: ['rival-unit'],
        techState: { completed: [], currentResearch: null, progress: {} },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, atWarWith: [], treaties: [] },
      },
    },
    cities: {
      'rival-city': {
        id: 'rival-city',
        name: 'Rival City',
        owner: 'rival',
        position: { q: 2, r: 2 },
        population: 1,
        production: 0,
        food: 0,
        buildings: [],
        currentProduction: null,
        productionQueue: [],
        workedTiles: [],
        ownedTiles: [{ q: 2, r: 2 }],
        foundedTurn: 1,
      },
    },
    units: {
      'rival-unit': {
        id: 'rival-unit',
        type: 'warrior',
        owner: 'rival',
        position: { q: 3, r: 3 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
      },
    },
  } as unknown as GameState;
}

describe('viewer intel', () => {
  it('does not list or inspect rivals known only through stale fogged ownership', () => {
    const state = makeState();
    state.civilizations.player.visibility.tiles['2,2'] = 'fog';

    expect(shouldListMajorCivForViewer(state, 'player', 'rival')).toBe(false);
    expect(canInspectCityForViewer(state, 'player', 'rival-city')).toBe(false);
    expect(canInspectUnitForViewer(state, 'player', 'rival-unit')).toBe(false);
  });

  it('lists rivals preserved in contact memory after first contact', () => {
    const state = makeState();
    state.civilizations.player.knownCivilizations = ['rival'];

    expect(shouldListMajorCivForViewer(state, 'player', 'rival')).toBe(true);
    expect(canInspectCityForViewer(state, 'player', 'rival-city')).toBe(false);
    expect(canInspectUnitForViewer(state, 'player', 'rival-unit')).toBe(false);
    expect(canInspectTileOwnerForViewer(state, 'player', { q: 2, r: 2 })).toBe(false);
  });

  it('allows current visible foreign evidence to list and inspect', () => {
    const state = makeState();
    state.civilizations.player.visibility.tiles['2,2'] = 'visible';
    state.civilizations.player.visibility.tiles['3,3'] = 'visible';

    expect(shouldListMajorCivForViewer(state, 'player', 'rival')).toBe(true);
    expect(canInspectCityForViewer(state, 'player', 'rival-city')).toBe(true);
    expect(canInspectUnitForViewer(state, 'player', 'rival-unit')).toBe(true);
    expect(canInspectTileOwnerForViewer(state, 'player', { q: 2, r: 2 })).toBe(true);
  });
});
