import { describe, it, expect } from 'vitest';
import type { Civilization, GameState, MinorCivState, Unit } from '@/core/types';
import {
  getOwnedUnits,
  getOwnedUnitCount,
  getFreeStandingOwnedUnits,
} from '@/systems/unit-ownership';

function unitFixture(id: string, owner: string, extra: Partial<Unit> = {}): Unit {
  return {
    id,
    type: 'warrior',
    owner,
    position: { q: 0, r: 0 },
    health: 100,
    movementPointsLeft: 2,
    maxMovementPoints: 2,
    ...extra,
  } as Unit;
}

function stateFixture(partial: Partial<GameState> = {}): GameState {
  return {
    units: {},
    civilizations: {},
    minorCivs: {},
    cities: {},
    ...partial,
  } as GameState;
}

describe('unit-ownership', () => {
  describe('getOwnedUnits / getOwnedUnitCount', () => {
    it('returns live units whose authoritative owner matches, filtering other owners', () => {
      const state = stateFixture({
        units: {
          'unit-a': unitFixture('unit-a', 'civ-1'),
          'unit-b': unitFixture('unit-b', 'civ-2'),
          'unit-c': unitFixture('unit-c', 'civ-1'),
        },
      });

      expect(getOwnedUnits(state, 'civ-1').map(u => u.id).sort()).toEqual(['unit-a', 'unit-c']);
      expect(getOwnedUnitCount(state, 'civ-1')).toBe(2);
      expect(getOwnedUnitCount(state, 'civ-2')).toBe(1);
    });

    it('returns empty for an owner that owns no units', () => {
      const state = stateFixture({ units: { 'unit-a': unitFixture('unit-a', 'civ-2') } });

      expect(getOwnedUnits(state, 'civ-1')).toEqual([]);
      expect(getOwnedUnitCount(state, 'civ-1')).toBe(0);
    });

    it('handles an empty / missing unit map', () => {
      expect(getOwnedUnits(stateFixture(), 'civ-1')).toEqual([]);
      expect(getOwnedUnitCount({ units: {} } as GameState, 'civ-1')).toBe(0);
    });
  });

  describe('owner kinds', () => {
    it('resolves units for a rosterless world actor without requiring a civ record', () => {
      const state = stateFixture({
        units: {
          'unit-barb': unitFixture('unit-barb', 'barbarian'),
          'unit-pirate': unitFixture('unit-pirate', 'pirate-1'),
          'unit-beast': unitFixture('unit-beast', 'beasts'),
          'unit-rebel': unitFixture('unit-rebel', 'rebels'),
          'unit-crisis': unitFixture('unit-crisis', 'crisis-force'),
        },
      });

      for (const ownerId of ['barbarian', 'pirate-1', 'beasts', 'rebels', 'crisis-force']) {
        expect(getOwnedUnitCount(state, ownerId)).toBe(1);
      }
      // No roster exists for any of them, and none was manufactured.
      expect(state.civilizations).toEqual({});
    });

    it('resolves units for a minor civ without requiring a major-civ record', () => {
      const state = stateFixture({
        units: { 'unit-mc': unitFixture('unit-mc', 'mc-1') },
        minorCivs: { 'mc-1': { id: 'mc-1', cityId: 'city-1' } as unknown as MinorCivState },
      });

      expect(getOwnedUnits(state, 'mc-1').map(u => u.id)).toEqual(['unit-mc']);
      expect(getOwnedUnitCount(state, 'mc-1')).toBe(1);
    });
  });

  describe('cargo semantics', () => {
    it('counts a loaded cargo unit as owned', () => {
      const state = stateFixture({
        units: {
          'unit-ship': unitFixture('unit-ship', 'civ-1', { type: 'transport' }),
          'unit-cargo': unitFixture('unit-cargo', 'civ-1', { transportId: 'unit-ship' }),
        },
      });

      expect(getOwnedUnits(state, 'civ-1').map(u => u.id).sort()).toEqual(['unit-cargo', 'unit-ship']);
      expect(getOwnedUnitCount(state, 'civ-1')).toBe(2);
    });

    it('excludes cargo from free-standing owned units but keeps the hull', () => {
      const state = stateFixture({
        units: {
          'unit-ship': unitFixture('unit-ship', 'civ-1', { type: 'transport' }),
          'unit-cargo': unitFixture('unit-cargo', 'civ-1', { transportId: 'unit-ship' }),
          'unit-free': unitFixture('unit-free', 'civ-1'),
        },
      });

      expect(getFreeStandingOwnedUnits(state, 'civ-1').map(u => u.id).sort()).toEqual(['unit-free', 'unit-ship']);
    });

    it('returns cargo to free-standing after unloading, with ownership unchanged', () => {
      const state = stateFixture({
        units: {
          'unit-ship': unitFixture('unit-ship', 'civ-1', { type: 'transport' }),
          'unit-cargo': unitFixture('unit-cargo', 'civ-1', { transportId: 'unit-ship' }),
        },
      });

      // simulate unload: back-pointer cleared, owner untouched
      state.units['unit-cargo'] = { ...state.units['unit-cargo'], transportId: undefined };

      expect(getOwnedUnitCount(state, 'civ-1')).toBe(2);
      expect(getFreeStandingOwnedUnits(state, 'civ-1').map(u => u.id).sort()).toEqual(['unit-cargo', 'unit-ship']);
    });
  });

  describe('corruption semantics (authoritative owner wins)', () => {
    it('a ghost roster id does not become an owned unit', () => {
      const state = stateFixture({
        civilizations: {
          'civ-1': { id: 'civ-1', units: ['unit-ghost'] } as unknown as Civilization,
        },
      });

      expect(getOwnedUnits(state, 'civ-1')).toEqual([]);
      expect(getOwnedUnitCount(state, 'civ-1')).toBe(0);
    });

    it('a unit listed in the wrong owner roster is resolved by unit.owner, not the roster', () => {
      const state = stateFixture({
        units: { 'unit-1': unitFixture('unit-1', 'civ-2') },
        civilizations: {
          'civ-1': { id: 'civ-1', units: ['unit-1'] } as unknown as Civilization,
          'civ-2': { id: 'civ-2', units: [] } as unknown as Civilization,
        },
      });

      expect(getOwnedUnits(state, 'civ-1')).toEqual([]);
      expect(getOwnedUnits(state, 'civ-2').map(u => u.id)).toEqual(['unit-1']);
    });

    it('a unit missing from its owner roster is still returned', () => {
      const state = stateFixture({
        units: { 'unit-1': unitFixture('unit-1', 'civ-1') },
        civilizations: { 'civ-1': { id: 'civ-1', units: [] } as unknown as Civilization },
      });

      expect(getOwnedUnits(state, 'civ-1').map(u => u.id)).toEqual(['unit-1']);
      expect(getOwnedUnitCount(state, 'civ-1')).toBe(1);
    });

    it('does not double-count duplicate roster ids', () => {
      const state = stateFixture({
        units: { 'unit-1': unitFixture('unit-1', 'civ-1') },
        civilizations: { 'civ-1': { id: 'civ-1', units: ['unit-1', 'unit-1'] } as unknown as Civilization },
      });

      expect(getOwnedUnitCount(state, 'civ-1')).toBe(1);
    });
  });
});
