import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { getNavalShoreSupplyAssignments } from '@/systems/supply-naval';

describe('getNavalShoreSupplyAssignments', () => {
  function makeUnit(id: string, overrides: Partial<Unit> = {}): Unit {
    return { id, type: 'warrior', owner: 'rome', position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false, ...overrides } as Unit;
  }

  it('a compatible unit within range and capacity is supplied', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 5, r: 5 } });
    const soldier = makeUnit('u1', { position: { q: 5, r: 6 } }); // adjacent, in range 1
    const state = { units: { s1: ship, u1: soldier }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(true);
  });

  it('an incompatible unit type (naval) is never assigned shore supply', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 5, r: 5 } });
    const otherShip = makeUnit('u1', { type: 'trireme', position: { q: 5, r: 6 } });
    const state = { units: { s1: ship, u1: otherShip }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(false);
  });

  it('a unit outside projectsLandSupplyRange is skipped even if capacity remains', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const farUnit = makeUnit('u1', { position: { q: 10, r: 10 } });
    const state = { units: { s1: ship, u1: farUnit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(false);
  });

  it('closest-first, skip-and-continue: a Transport (capacity 2) supplies both of two cost-1 units at the same distance', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } }); // capacity 2
    const first = makeUnit('u1', { position: { q: 0, r: 1 } }); // cost 1
    const second = makeUnit('u2', { position: { q: 0, r: 1 } }); // cost 1, same tile/distance
    const state = { units: { s1: ship, u1: first, u2: second }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(true);
    expect(result.has('u2')).toBe(true);
  });

  it('multiple ships do not pool capacity; closest ship wins for a given unit', () => {
    const near = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const far = makeUnit('s2', { type: 'transport', position: { q: 5, r: 5 } });
    const unit = makeUnit('u1', { position: { q: 0, r: 1 } });
    const state = { units: { s1: near, s2: far, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(true);
  });

  it('embarked units (transportId set) never consume shore-supply capacity', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const embarked = makeUnit('u1', { position: { q: 0, r: 1 }, transportId: 's1' });
    const state = { units: { s1: ship, u1: embarked }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(false);
  });
});
