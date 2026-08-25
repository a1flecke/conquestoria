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

  it('a unit whose landSupplyCost is 2 consumes 2 capacity, not 1 (#544 MR7 item 21)', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } }); // capacity 2
    const cavalry = makeUnit('u1', { type: 'cavalry', position: { q: 0, r: 1 } }); // landSupplyCost 2
    const second = makeUnit('u2', { position: { q: 0, r: 1 } }); // cost 1, same distance
    const state = { units: { s1: ship, u1: cavalry, u2: second }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(true);
    // Cavalry alone consumed all 2 capacity -- if landSupplyCost were
    // ignored (flat cost 1 assumed), the second unit would also fit and
    // this assertion would wrongly pass either way. Cavalry's cost being
    // correctly deducted is what makes u2 miss out.
    expect(result.has('u2')).toBe(false);
  });

  it('a too-expensive unit is skipped (not stopped-on), and a cheaper unit at the same distance is still supplied (#544 MR7 item 22)', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } }); // capacity 2
    const expensive = makeUnit('u1', { type: 'catapult', position: { q: 0, r: 1 } }); // landSupplyCost 3 -- exceeds capacity 2 entirely
    const cheap = makeUnit('u2', { position: { q: 0, r: 1 } }); // cost 1, same distance
    const state = { units: { s1: ship, u1: expensive, u2: cheap }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(false); // costs 3, only 2 capacity -- skipped
    expect(result.has('u2')).toBe(true); // cheaper unit still gets supplied despite the expensive one coming first in sort order (skip, don't stop)
  });

  it('recomputes assignments from scratch each call -- a ship that moves out of range stops supplying without any stored/carried state (#544 MR7 item 26)', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const unit = makeUnit('u1', { position: { q: 0, r: 1 } });
    const inRangeState = { units: { s1: ship, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(inRangeState, 'rome').has('u1')).toBe(true);

    const movedShip = { ...ship, position: { q: 10, r: 10 } };
    const outOfRangeState = { units: { s1: movedShip, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(outOfRangeState, 'rome').has('u1')).toBe(false);
  });

  it('a ship that moves closer still supplies from its new position (#544 MR7 item 27)', () => {
    const farShip = makeUnit('s1', { type: 'transport', position: { q: 10, r: 10 } });
    const unit = makeUnit('u1', { position: { q: 0, r: 1 } });
    const farState = { units: { s1: farShip, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(farState, 'rome').has('u1')).toBe(false);

    const nearShip = { ...farShip, position: { q: 0, r: 0 } };
    const nearState = { units: { s1: nearShip, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(nearState, 'rome').has('u1')).toBe(true);
  });
});
