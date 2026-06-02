import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { resolveFriendlyUnitStackTap } from '@/input/unit-stack-selection';

function unit(id: string, owner: string, q: number, r: number): Unit {
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
  };
}

function state(units: Record<string, Unit>): GameState {
  return {
    currentPlayer: 'player',
    units,
    cities: {},
    map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
  } as unknown as GameState;
}

describe('unit stack selection tap resolution', () => {
  it('selects a single friendly unit directly', () => {
    expect(resolveFriendlyUnitStackTap(state({
      warrior: unit('warrior', 'player', 1, 1),
    }), { q: 1, r: 1 }, null)).toEqual({
      kind: 'select-unit',
      unitId: 'warrior',
    });
  });

  it('opens the stack picker for multiple friendly units', () => {
    expect(resolveFriendlyUnitStackTap(state({
      warrior: unit('warrior', 'player', 1, 1),
      worker: unit('worker', 'player', 1, 1),
    }), { q: 1, r: 1 }, null)).toEqual({
      kind: 'open-stack-picker',
      unitIds: ['warrior', 'worker'],
    });
  });

  it('opens the stack picker when the selected unit taps its own stack tile', () => {
    expect(resolveFriendlyUnitStackTap(state({
      warrior: unit('warrior', 'player', 1, 1),
      worker: unit('worker', 'player', 1, 1),
    }), { q: 1, r: 1 }, 'warrior')).toEqual({
      kind: 'open-stack-picker',
      unitIds: ['warrior', 'worker'],
    });
  });

  it('ignores enemy-only units for friendly stack selection', () => {
    expect(resolveFriendlyUnitStackTap(state({
      enemy: unit('enemy', 'ai-1', 1, 1),
    }), { q: 1, r: 1 }, null)).toEqual({ kind: 'none' });
  });

  it('ignores loaded cargo when resolving friendly stack selection', () => {
    const transport = { ...unit('transport', 'player', 1, 1), type: 'transport' as const, cargoUnitIds: ['cargo'] };
    const cargo = { ...unit('cargo', 'player', 1, 1), transportId: 'transport' };

    expect(resolveFriendlyUnitStackTap(state({ transport, cargo }), { q: 1, r: 1 }, null)).toEqual({
      kind: 'select-unit',
      unitId: 'transport',
    });
  });
});
