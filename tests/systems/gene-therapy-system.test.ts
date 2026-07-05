import { describe, it, expect } from 'vitest';
import {
  chargeUnitsOnGeneTherapyResearch,
  applyGeneTherapyRecharge,
} from '@/systems/gene-therapy-system';
import type { GameState, Unit } from '@/core/types';

function makeUnit(overrides: Partial<Unit> & { id: string; type: Unit['type']; owner: string }): Unit {
  return {
    position: { q: 0, r: 0 },
    health: 100,
    movementPointsLeft: 2,
    hasMoved: false,
    hasActed: false,
    experience: 0,
    isResting: false,
    ...overrides,
  } as Unit;
}

function makeState(units: Record<string, Unit>, civUnitIds: string[]): GameState {
  return {
    turn: 5, era: 12, currentPlayer: 'p1',
    units,
    cities: {
      'city-p1': {
        id: 'city-p1', owner: 'p1', position: { q: 0, r: 0 },
        buildings: [],
      },
    },
    civilizations: {
      p1: {
        id: 'p1', name: 'Alpha', color: '#fff', isHuman: true, civType: 'generic',
        units: civUnitIds, cities: ['city-p1'], gold: 0,
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} } as any,
      },
    },
    map: {
      tiles: {
        '0,0': { terrain: 'plains', owner: 'p1' },
      },
      width: 10, height: 10, wrapsHorizontally: false,
    },
  } as unknown as GameState;
}

describe('chargeUnitsOnGeneTherapyResearch', () => {
  it('sets geneTherapyReady:true on every combat unit (strength > 0) owned by the civ', () => {
    const state = makeState(
      {
        warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1' }),
      },
      ['warrior1'],
    );

    const result = chargeUnitsOnGeneTherapyResearch(state, 'p1');

    expect(result.units.warrior1.geneTherapyReady).toBe(true);
  });

  it('skips strength-0 civilian units (settler, cyber_unit) — leaves geneTherapyReady undefined', () => {
    const state = makeState(
      {
        settler1: makeUnit({ id: 'settler1', type: 'settler', owner: 'p1' }),
        cyber1: makeUnit({ id: 'cyber1', type: 'cyber_unit', owner: 'p1' }),
      },
      ['settler1', 'cyber1'],
    );

    const result = chargeUnitsOnGeneTherapyResearch(state, 'p1');

    expect(result.units.settler1.geneTherapyReady).toBeUndefined();
    expect(result.units.cyber1.geneTherapyReady).toBeUndefined();
  });

  it('does not charge units owned by other civs', () => {
    const state = makeState(
      {
        enemyWarrior: makeUnit({ id: 'enemyWarrior', type: 'warrior', owner: 'p2' }),
      },
      [],
    );

    const result = chargeUnitsOnGeneTherapyResearch(state, 'p1');

    expect(result.units.enemyWarrior.geneTherapyReady).toBeUndefined();
  });

  it('does not mutate the input state', () => {
    const state = makeState(
      { warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1' }) },
      ['warrior1'],
    );
    const before = structuredClone(state);

    chargeUnitsOnGeneTherapyResearch(state, 'p1');

    expect(state).toEqual(before);
  });
});

describe('applyGeneTherapyRecharge', () => {
  it('recharges an idle unit at geneTherapyReady:false resting in a friendly city', () => {
    const state = makeState(
      { warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1', geneTherapyReady: false }) },
      ['warrior1'],
    );

    const result = applyGeneTherapyRecharge(state, 'p1');

    expect(result.units.warrior1.geneTherapyReady).toBe(true);
  });

  it('does not recharge a unit that moved this turn', () => {
    const state = makeState(
      { warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1', geneTherapyReady: false, hasMoved: true }) },
      ['warrior1'],
    );

    const result = applyGeneTherapyRecharge(state, 'p1');

    expect(result.units.warrior1.geneTherapyReady).toBe(false);
  });

  it('does not recharge a unit outside a friendly city', () => {
    const state = makeState(
      { warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1', geneTherapyReady: false, position: { q: 9, r: 9 } }) },
      ['warrior1'],
    );

    const result = applyGeneTherapyRecharge(state, 'p1');

    expect(result.units.warrior1.geneTherapyReady).toBe(false);
  });

  it('does not affect a unit with geneTherapyReady:undefined', () => {
    const state = makeState(
      { warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1' }) },
      ['warrior1'],
    );

    const result = applyGeneTherapyRecharge(state, 'p1');

    expect(result.units.warrior1.geneTherapyReady).toBeUndefined();
  });

  it('does not mutate the input state', () => {
    const state = makeState(
      { warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1', geneTherapyReady: false }) },
      ['warrior1'],
    );
    const before = structuredClone(state);

    applyGeneTherapyRecharge(state, 'p1');

    expect(state).toEqual(before);
  });

  it('only considers units in the optional unitIds allowlist — excludes units freshly trained this same turn', () => {
    // warrior1 pre-existed the turn (in allowlist); warrior2 was just trained this turn
    // (present in civ.units / state.units but NOT in the pre-turn allowlist) and must not be swept up.
    const state = makeState(
      {
        warrior1: makeUnit({ id: 'warrior1', type: 'warrior', owner: 'p1', geneTherapyReady: false }),
        warrior2: makeUnit({ id: 'warrior2', type: 'warrior', owner: 'p1', geneTherapyReady: false }),
      },
      ['warrior1', 'warrior2'],
    );

    const result = applyGeneTherapyRecharge(state, 'p1', ['warrior1']);

    expect(result.units.warrior1.geneTherapyReady).toBe(true);
    expect(result.units.warrior2.geneTherapyReady).toBe(false);
  });
});
