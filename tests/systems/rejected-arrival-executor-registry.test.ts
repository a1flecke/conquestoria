/**
 * #999 — "arrival on a tile" is the family with the most historical bypasses (#843, #845, #965,
 * #970), each fixed independently, one executor at a time. This is the single, explicit,
 * parameterized-executor-list proof the issue's own "Proposed approach" asks for: ONE denied
 * destination (a foreign, unallied city — the exact #970 bypass shape), attempted through every
 * executor in this family, asserting all refuse. Adding a new executor here without adding it to
 * the `attempts` list is a silent gap; the point of this file is to make that visible.
 *
 * #994 already proved no such bypass survives in long-running simulation (the final-state
 * invariant), and #970 already fixed transport/airborne specifically. This file is the
 * consolidated, direct regression that pins all of them together in one place, rather than each
 * living only inside its own family's test file.
 */
import { describe, it, expect } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { resolveUnitMoveIntent } from '@/systems/unit-movement-system';
import { canParadrop } from '@/systems/airborne-system';
import { canAirAssault } from '@/systems/airborne-system';
import { canUnloadUnitFromTransport } from '@/systems/transport-system';
import { assertRejectedByEveryExecutor } from '../helpers/rejected-action-bypass';

function tile(terrain: string) {
  return { terrain };
}

/**
 * Shared geometry, matching `airborne-system.test.ts`'s own fixtures: civ-a's home city-1 at
 * (0,0), a foreign unallied civ-b city-2 at (2,0) — the denied destination every executor below
 * attempts. Extended with an ocean tile at (3,0) (a neighbour of (2,0)) so a transport can also
 * attempt to unload there, and a plain ground mover at (1,1) one hex from the target.
 */
function sharedFixture(): { state: GameState } {
  const mover: Unit = {
    id: 'mover-1', type: 'warrior', owner: 'civ-a', position: { q: 1, r: 1 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const paratrooper: Unit = {
    id: 'para-1', type: 'paratrooper', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const passenger: Unit = {
    id: 'inf-1', type: 'infantry', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const helicopter: Unit = {
    id: 'heli-1', type: 'attack_helicopter', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    airBase: { kind: 'city', cityId: 'city-1' },
  };
  const cargo: Unit = {
    id: 'cargo-1', type: 'warrior', owner: 'civ-a', position: { q: 3, r: 0 }, transportId: 'transport-1',
    movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const transport: Unit = {
    id: 'transport-1', type: 'transport', owner: 'civ-a', position: { q: 3, r: 0 }, cargoUnitIds: ['cargo-1'],
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };

  const state = {
    units: {
      'mover-1': mover, 'para-1': paratrooper, 'inf-1': passenger, 'heli-1': helicopter,
      'cargo-1': cargo, 'transport-1': transport,
    },
    cities: {
      'city-1': { id: 'city-1', owner: 'civ-a', position: { q: 0, r: 0 }, buildings: ['airfield', 'helicopter_base'] },
      'city-2': { id: 'city-2', owner: 'civ-b', position: { q: 2, r: 0 }, buildings: [] },
    },
    civilizations: {
      'civ-a': {
        diplomacy: { atWarWith: [], events: [] },
        units: ['mover-1', 'para-1', 'inf-1', 'heli-1', 'cargo-1', 'transport-1'],
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: {
          tiles: { '0,0': 'visible', '1,1': 'visible', '1,0': 'visible', '2,0': 'visible', '3,0': 'visible' },
        },
      },
      'civ-b': {
        diplomacy: { atWarWith: [], events: [] }, units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: { tiles: {} },
      },
    },
    map: {
      width: 20, height: 20, wrapsHorizontally: false,
      tiles: {
        '0,0': tile('grassland'), '1,1': tile('grassland'), '1,0': tile('grassland'),
        '2,0': tile('grassland'), '3,0': tile('ocean'),
      },
    },
  } as unknown as GameState;

  return { state };
}

describe('#999 arrival-on-a-tile: a foreign unallied city is refused by every executor', () => {
  it('refuses the same denied destination through movement, paradrop, air assault, and transport unload', () => {
    const { state } = sharedFixture();
    const destination = { q: 2, r: 0 };

    // Sanity: every rejection must actually be the blocking-city reason, not some unrelated
    // earlier-triggering refusal (out of range, occupied, etc.) that would make this test pass
    // vacuously without ever exercising the blocking-entity check this file exists to pin.
    expect(resolveUnitMoveIntent(state, 'mover-1', destination, { actor: 'player', civId: 'civ-a' }))
      .toMatchObject({ ok: false, reason: 'foreign-city' });
    expect(canParadrop(state, 'para-1', destination)).toEqual({ ok: false, reason: 'foreign-city' });
    expect(canAirAssault(state, 'inf-1', destination)).toEqual({ ok: false, reason: 'foreign-city' });
    expect(canUnloadUnitFromTransport(state, 'transport-1', 'cargo-1', destination))
      .toMatchObject({ ok: false, reason: 'foreign-city' });

    assertRejectedByEveryExecutor('arrival on a foreign, unallied city tile', [
      {
        executor: 'resolveUnitMoveIntent (ordinary movement)',
        attempt: () => {
          const result = resolveUnitMoveIntent(state, 'mover-1', destination, { actor: 'player', civId: 'civ-a' });
          return result.ok ? { ok: true } : { ok: false, reason: result.reason };
        },
      },
      {
        executor: 'canParadrop',
        attempt: () => {
          const result = canParadrop(state, 'para-1', destination);
          return result.ok ? { ok: true } : { ok: false, reason: result.reason };
        },
      },
      {
        executor: 'canAirAssault',
        attempt: () => {
          const result = canAirAssault(state, 'inf-1', destination);
          return result.ok ? { ok: true } : { ok: false, reason: result.reason };
        },
      },
      {
        executor: 'canUnloadUnitFromTransport',
        attempt: () => {
          const result = canUnloadUnitFromTransport(state, 'transport-1', 'cargo-1', destination);
          return result.ok ? { ok: true } : { ok: false, reason: result.reason };
        },
      },
    ]);
  });
});
