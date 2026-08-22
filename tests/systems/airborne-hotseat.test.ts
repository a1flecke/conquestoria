import { describe, expect, it } from 'vitest';
import { getKnownHostileAirDefenseThreat } from '@/systems/air-defense-system';
import { getParadropTargets, getAirAssaultTargets } from '@/systems/airborne-system';
import type { GameState, Unit } from '@/core/types';

function tile(terrain: string) {
  return { terrain };
}

/**
 * Two humans sharing a device (hot-seat): civ-a and civ-b are both hostile
 * to civ-c, which owns a SAM Site. Only civ-a has scouted the SAM Site's
 * tile; civ-b has not. Both have their own paratrooper on their own
 * airfield city, each targeting the same contested tile at (5,0), which
 * the SAM Site (radius 2, at (5,0) itself is the covered destination;
 * the SAM Site sits at (4,0)) covers.
 */
function makeHotSeatFixture(): GameState {
  const paratrooperA: Unit = {
    id: 'para-a', type: 'paratrooper', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const paratrooperB: Unit = {
    id: 'para-b', type: 'paratrooper', owner: 'civ-b', position: { q: 8, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };

  return {
    turn: 5,
    units: { 'para-a': paratrooperA, 'para-b': paratrooperB },
    cities: {
      'city-a': { id: 'city-a', owner: 'civ-a', position: { q: 0, r: 0 }, buildings: ['airfield'] },
      'city-b': { id: 'city-b', owner: 'civ-b', position: { q: 8, r: 0 }, buildings: ['airfield'] },
      'city-c': { id: 'city-c', owner: 'civ-c', position: { q: 4, r: 0 }, buildings: ['anti_air_battery', 'radar_station', 'sam_site'] },
    },
    civilizations: {
      'civ-a': {
        diplomacy: { atWarWith: ['civ-c'], events: [] },
        visibility: {
          // civ-a HAS scouted the SAM city's tile (4,0), and can see the contested (5,0) tile.
          tiles: { '0,0': 'visible', '4,0': 'visible', '5,0': 'visible', '1,0': 'visible', '2,0': 'visible', '3,0': 'visible' },
        },
      },
      'civ-b': {
        diplomacy: { atWarWith: ['civ-c'], events: [] },
        visibility: {
          // civ-b has NOT scouted (4,0) -- only the contested (5,0) tile itself and its own approach.
          tiles: { '8,0': 'visible', '5,0': 'visible', '6,0': 'visible', '7,0': 'visible' },
        },
      },
      'civ-c': { diplomacy: { atWarWith: ['civ-a', 'civ-b'], events: [] }, visibility: { tiles: {} } },
    },
    map: {
      width: 20, height: 20, wrapsHorizontally: false,
      tiles: {
        '0,0': tile('grassland'), '1,0': tile('grassland'), '2,0': tile('grassland'),
        '3,0': tile('grassland'), '4,0': tile('grassland'), '5,0': tile('grassland'),
        '6,0': tile('grassland'), '7,0': tile('grassland'), '8,0': tile('grassland'),
      },
    },
  } as unknown as GameState;
}

describe('hot-seat isolation — paradrop preview data (#543)', () => {
  it('civ A (who has discovered a hostile SAM Site) sees flak risk; civ B (who has not) sees none for the same tile', () => {
    const state = makeHotSeatFixture();
    const contestedTile = { q: 5, r: 0 };

    const knownToA = getKnownHostileAirDefenseThreat(state, state.units['para-a']!, contestedTile, 'civ-a');
    const knownToB = getKnownHostileAirDefenseThreat(state, state.units['para-b']!, contestedTile, 'civ-b');

    expect(knownToA.flatDefenseModifier).toBe(12);
    expect(knownToB.flatDefenseModifier).toBe(0);
    expect(knownToB.providers).toHaveLength(0);
  });

  it('paradrop target sets are independently correct per civ under the same map state (different fog)', () => {
    const state = makeHotSeatFixture();

    const targetsA = getParadropTargets(state, 'para-a');
    const targetsB = getParadropTargets(state, 'para-b');

    // civ-a's paratrooper (range 4 from (0,0)) can legally reach (1,0)-(4,0)
    // area but not the far side; civ-b's (range 4 from (8,0)) reaches the
    // opposite direction. Neither set is empty, and they are not identical
    // -- proving each civ's targets are computed from its own unit/position/
    // fog rather than a shared or leaked computation.
    expect(targetsA.length).toBeGreaterThan(0);
    expect(targetsB.length).toBeGreaterThan(0);
    expect(targetsA).not.toEqual(targetsB);
  });
});

/**
 * Same shape as makeHotSeatFixture, but for Air Assault: civ-a and civ-b
 * each have a Helicopter Base city with an available Attack Helicopter and
 * an eligible infantry passenger. Both are hostile to civ-c, which owns a
 * SAM Site at (4,0) covering the contested (5,0) tile. Only civ-a has
 * scouted (4,0).
 */
function makeAirAssaultHotSeatFixture(): GameState {
  const infantryA: Unit = {
    id: 'inf-a', type: 'infantry', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const helicopterA: Unit = {
    id: 'heli-a', type: 'attack_helicopter', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    airBase: { kind: 'city', cityId: 'city-a' },
  };
  const infantryB: Unit = {
    id: 'inf-b', type: 'infantry', owner: 'civ-b', position: { q: 8, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  const helicopterB: Unit = {
    id: 'heli-b', type: 'attack_helicopter', owner: 'civ-b', position: { q: 8, r: 0 },
    movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    airBase: { kind: 'city', cityId: 'city-b' },
  };

  return {
    turn: 5,
    units: { 'inf-a': infantryA, 'heli-a': helicopterA, 'inf-b': infantryB, 'heli-b': helicopterB },
    cities: {
      'city-a': { id: 'city-a', owner: 'civ-a', position: { q: 0, r: 0 }, buildings: ['helicopter_base'] },
      'city-b': { id: 'city-b', owner: 'civ-b', position: { q: 8, r: 0 }, buildings: ['helicopter_base'] },
      'city-c': { id: 'city-c', owner: 'civ-c', position: { q: 4, r: 0 }, buildings: ['anti_air_battery', 'radar_station', 'sam_site'] },
    },
    civilizations: {
      'civ-a': {
        diplomacy: { atWarWith: ['civ-c'], events: [] },
        visibility: {
          tiles: { '0,0': 'visible', '4,0': 'visible', '5,0': 'visible', '1,0': 'visible', '2,0': 'visible', '3,0': 'visible' },
        },
      },
      'civ-b': {
        diplomacy: { atWarWith: ['civ-c'], events: [] },
        visibility: {
          tiles: { '8,0': 'visible', '5,0': 'visible', '6,0': 'visible', '7,0': 'visible' },
        },
      },
      'civ-c': { diplomacy: { atWarWith: ['civ-a', 'civ-b'], events: [] }, visibility: { tiles: {} } },
    },
    map: {
      width: 20, height: 20, wrapsHorizontally: false,
      tiles: {
        '0,0': tile('grassland'), '1,0': tile('grassland'), '2,0': tile('grassland'),
        '3,0': tile('grassland'), '4,0': tile('grassland'), '5,0': tile('grassland'),
        '6,0': tile('grassland'), '7,0': tile('grassland'), '8,0': tile('grassland'),
      },
    },
  } as unknown as GameState;
}

describe('hot-seat isolation — air assault preview data (#543 Phase 2)', () => {
  it('civ A (who has discovered a hostile SAM Site) sees flak risk; civ B (who has not) sees none for the same tile', () => {
    const state = makeAirAssaultHotSeatFixture();
    const contestedTile = { q: 5, r: 0 };

    const knownToA = getKnownHostileAirDefenseThreat(state, state.units['inf-a']!, contestedTile, 'civ-a');
    const knownToB = getKnownHostileAirDefenseThreat(state, state.units['inf-b']!, contestedTile, 'civ-b');

    expect(knownToA.flatDefenseModifier).toBe(12);
    expect(knownToB.flatDefenseModifier).toBe(0);
    expect(knownToB.providers).toHaveLength(0);
  });

  it('air assault target sets are independently correct per civ under the same map state (different fog)', () => {
    const state = makeAirAssaultHotSeatFixture();

    const targetsA = getAirAssaultTargets(state, 'inf-a');
    const targetsB = getAirAssaultTargets(state, 'inf-b');

    expect(targetsA.length).toBeGreaterThan(0);
    expect(targetsB.length).toBeGreaterThan(0);
    expect(targetsA).not.toEqual(targetsB);
  });
});
