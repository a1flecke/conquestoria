import { describe, expect, it } from 'vitest';
import type { Unit } from '@/core/types';
import {
  buildUnitOccupancy,
  getUnitIdsAtCoord,
  getStackRelationship,
  sortUnitsForStackPicker,
} from '@/systems/unit-occupancy';

function unit(id: string, owner: string, q: number, r: number, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    owner,
    type: 'warrior',
    position: { q, r },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    ...overrides,
  };
}

describe('unit occupancy', () => {
  it('groups multiple units on the same hex in stable id order', () => {
    const occupancy = buildUnitOccupancy({
      'unit-b': unit('unit-b', 'player', 2, 1),
      'unit-a': unit('unit-a', 'player', 2, 1),
      'unit-c': unit('unit-c', 'player', 3, 1),
    });

    expect(getUnitIdsAtCoord(occupancy, { q: 2, r: 1 })).toEqual(['unit-a', 'unit-b']);
    expect(getUnitIdsAtCoord(occupancy, { q: 3, r: 1 })).toEqual(['unit-c']);
  });

  it('classifies same-owner occupants as stackable for the moving unit', () => {
    const units = {
      mover: unit('mover', 'player', 1, 1),
      friend: unit('friend', 'player', 2, 1),
    };
    const occupancy = buildUnitOccupancy(units);

    expect(getStackRelationship(occupancy, units.mover, { q: 2, r: 1 })).toEqual({
      occupantIds: ['friend'],
      friendlyUnitIds: ['friend'],
      hostileUnitIds: [],
      hasFriendlyStack: true,
      hasHostileBlocker: false,
    });
  });

  it('classifies different-owner occupants as hostile blockers', () => {
    const units = {
      mover: unit('mover', 'player', 1, 1),
      enemy: unit('enemy', 'ai-1', 2, 1),
    };
    const occupancy = buildUnitOccupancy(units);

    expect(getStackRelationship(occupancy, units.mover, { q: 2, r: 1 })).toEqual({
      occupantIds: ['enemy'],
      friendlyUnitIds: [],
      hostileUnitIds: ['enemy'],
      hasFriendlyStack: false,
      hasHostileBlocker: true,
    });
  });

  it('sorts stack picker rows by ready state, current unit, name, then id', () => {
    const units = [
      unit('worker-2', 'player', 0, 0, { type: 'worker', movementPointsLeft: 0 }),
      unit('scout-1', 'player', 0, 0, { type: 'scout', movementPointsLeft: 3 }),
      unit('warrior-1', 'player', 0, 0, { type: 'warrior', movementPointsLeft: 2 }),
    ];

    expect(sortUnitsForStackPicker(units, 'warrior-1').map(u => u.id)).toEqual([
      'warrior-1',
      'scout-1',
      'worker-2',
    ]);
  });
});
