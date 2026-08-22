import { describe, expect, it } from 'vitest';
import { getParadropLaunchState, getParadropTargets, canParadrop, executeParadrop, getAirAssaultLaunchState, getAirAssaultTargets, canAirAssault, executeAirAssault } from '@/systems/airborne-system';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameState, Unit } from '@/core/types';

function tile(terrain: string) {
  return { terrain };
}

/**
 * A minimal deterministic fixture: civ-a's Paratrooper stands on city-1
 * (an Airfield city at the origin). Range is 4. Legal target at (1,1);
 * unexplored-but-in-range at (2,2); occupied-by-a-friendly-unit at (1,0);
 * a foreign, unallied city at (2,0); impassable ocean at (-1,2).
 */
function makeParadropFixture(): { state: GameState; unitId: string; cityId: string } {
  const paratrooper: Unit = {
    id: 'para-1', type: 'paratrooper', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false,
  };
  const friendlyBlocker: Unit = {
    id: 'blocker-1', type: 'warrior', owner: 'civ-a', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false,
  };
  const state = {
    units: { 'para-1': paratrooper, 'blocker-1': friendlyBlocker },
    cities: {
      'city-1': { id: 'city-1', owner: 'civ-a', position: { q: 0, r: 0 }, buildings: ['airfield'] },
      'city-2': { id: 'city-2', owner: 'civ-b', position: { q: 2, r: 0 }, buildings: [] },
    },
    civilizations: {
      'civ-a': {
        diplomacy: { atWarWith: [], events: [] },
        units: ['para-1', 'blocker-1'],
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: {
          tiles: {
            '0,0': 'visible', '1,1': 'visible', '1,0': 'visible',
            '2,0': 'visible', '-1,2': 'visible',
            // '2,2' deliberately omitted -- defaults to 'unexplored'.
          },
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
        '2,0': tile('grassland'), '2,2': tile('grassland'), '-1,2': tile('ocean'),
      },
    },
  } as unknown as GameState;

  return { state, unitId: 'para-1', cityId: 'city-1' };
}

/**
 * A minimal deterministic fixture for Air Assault: civ-a's infantry stands
 * on city-1 (a Helicopter Base city at the origin), with an attack_helicopter
 * ('heli-1') and a combat_drone ('drone-1', which shares the same roster but
 * has no airAssault capability) both based there. Same map geometry as
 * makeParadropFixture: legal target at (1,1); occupied-by-a-friendly-unit at
 * (1,0); a foreign, unallied city at (2,0); impassable ocean at (-1,2).
 */
function makeAirAssaultFixture(): { state: GameState; unitId: string; cityId: string; helicopterId: string } {
  const passenger: Unit = {
    id: 'inf-1', type: 'infantry', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false,
  };
  const helicopter: Unit = {
    id: 'heli-1', type: 'attack_helicopter', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
  };
  const drone: Unit = {
    id: 'drone-1', type: 'combat_drone', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 6, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
  };
  const friendlyBlocker: Unit = {
    id: 'blocker-1', type: 'warrior', owner: 'civ-a', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false,
  };
  const state = {
    units: { 'inf-1': passenger, 'heli-1': helicopter, 'drone-1': drone, 'blocker-1': friendlyBlocker },
    cities: {
      'city-1': { id: 'city-1', owner: 'civ-a', position: { q: 0, r: 0 }, buildings: ['helicopter_base'] },
      'city-2': { id: 'city-2', owner: 'civ-b', position: { q: 2, r: 0 }, buildings: [] },
    },
    civilizations: {
      'civ-a': {
        diplomacy: { atWarWith: [], events: [] },
        units: ['inf-1', 'heli-1', 'drone-1', 'blocker-1'],
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: {
          tiles: {
            '0,0': 'visible', '1,1': 'visible', '1,0': 'visible',
            '2,0': 'visible', '-1,2': 'visible',
          },
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
        '2,0': tile('grassland'), '2,2': tile('grassland'), '-1,2': tile('ocean'),
      },
    },
  } as unknown as GameState;

  return { state, unitId: 'inf-1', cityId: 'city-1', helicopterId: 'heli-1' };
}

describe('getParadropLaunchState', () => {
  it('rejects a unit with no paradrop capability', () => {
    const { state, unitId } = makeParadropFixture();
    const infantryState = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, type: 'infantry' } } } as unknown as GameState;
    expect(getParadropLaunchState(infantryState, unitId)).toEqual({ ok: false, reason: 'not-airborne-unit' });
  });

  it('rejects a paratrooper not standing on an airfield city', () => {
    const { state, unitId } = makeParadropFixture();
    const moved = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, position: { q: 9, r: 9 } } } };
    expect(getParadropLaunchState(moved, unitId)).toEqual({ ok: false, reason: 'no-launch-base' });
  });

  it('rejects a paratrooper that already acted this turn', () => {
    const { state, unitId } = makeParadropFixture();
    const acted = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, hasActed: true } } };
    expect(getParadropLaunchState(acted, unitId)).toEqual({ ok: false, reason: 'already-acted' });
  });

  it('accepts an eligible paratrooper on an airfield city', () => {
    const { state, unitId } = makeParadropFixture();
    expect(getParadropLaunchState(state, unitId)).toEqual({ ok: true });
  });
});

describe('getParadropTargets', () => {
  it('excludes tiles beyond paradrop range', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    for (const target of targets) {
      const distance = (Math.abs(target.q) + Math.abs(target.r) + Math.abs(target.q + target.r)) / 2;
      expect(distance).toBeLessThanOrEqual(4);
    }
  });

  it('excludes an unexplored tile even if within range', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 2 && t.r === 2)).toBe(false);
  });

  it('excludes an occupied tile', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 0)).toBe(false);
  });

  it('excludes a foreign unallied city tile even though it is visible and in range', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 2 && t.r === 0)).toBe(false);
  });

  it('excludes impassable terrain (ocean) for a land unit', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === -1 && t.r === 2)).toBe(false);
  });

  it('includes a plain visible, passable, unoccupied in-range tile', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 1)).toBe(true);
  });

  it('produces the exact same target set before and after the isLegalAirborneLandingTile extraction (regression)', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId).map(hexKey).sort();
    expect(targets).toEqual(['1,1']);
  });
});

describe('canParadrop', () => {
  it('rejects a tile outside getParadropTargets with the correct reason', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 99, r: 99 })).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('accepts a tile inside getParadropTargets', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 1, r: 1 })).toEqual({ ok: true });
  });

  it('rejects the unexplored tile with the unexplored reason specifically', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 2, r: 2 })).toEqual({ ok: false, reason: 'unexplored' });
  });

  it('rejects the occupied tile with the destination-occupied reason specifically', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 1, r: 0 })).toEqual({ ok: false, reason: 'destination-occupied' });
  });

  it('rejects the foreign city tile with the foreign-city reason specifically', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 2, r: 0 })).toEqual({ ok: false, reason: 'foreign-city' });
  });

  it('rejects the ocean tile with the impassable-terrain reason specifically', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: -1, r: 2 })).toEqual({ ok: false, reason: 'impassable-terrain' });
  });
});

describe('getAirAssaultLaunchState', () => {
  it('rejects a unit with no airAssaultPassengerEligible flag', () => {
    const { state } = makeAirAssaultFixture();
    const tankState = { ...state, units: { ...state.units, 'inf-1': { ...state.units['inf-1']!, type: 'tank' } } } as unknown as GameState;
    expect(getAirAssaultLaunchState(tankState, 'inf-1')).toEqual({ ok: false, reason: 'not-eligible-passenger' });
  });

  it('rejects a passenger not standing on a helicopter_base city', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const moved = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, position: { q: 9, r: 9 } } } };
    expect(getAirAssaultLaunchState(moved, unitId)).toEqual({ ok: false, reason: 'no-launch-base' });
  });

  it('rejects when the base has no airAssault-capable roster unit (both roster members are Combat Drones)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    // City is still a valid helicopter_base -- the failure here is
    // capability absence, not the base itself, so the expected reason is
    // 'no-launch-helicopter', not 'no-launch-base'.
    const noHeli = { ...state, units: { ...state.units, [helicopterId]: { ...state.units[helicopterId]!, type: 'combat_drone' } } } as unknown as GameState;
    expect(getAirAssaultLaunchState(noHeli, unitId)).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('rejects when the only airAssault-capable roster helicopter has already acted, even though the Combat Drone sharing the roster has not (never falls back to picking it)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    // 'drone-1' from the fixture remains hasActed: false throughout --
    // this asserts the picker doesn't fall back to it.
    const acted = { ...state, units: { ...state.units, [helicopterId]: { ...state.units[helicopterId]!, hasActed: true } } };
    expect(getAirAssaultLaunchState(acted, unitId)).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('excludes an intercept-stance helicopter from the picker (already hasActed via startIntercept)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    const intercepting = { ...state, units: { ...state.units, [helicopterId]: { ...state.units[helicopterId]!, airMission: 'intercept' as const, hasActed: true, movementPointsLeft: 0, hasMoved: true } } };
    expect(getAirAssaultLaunchState(intercepting, unitId)).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('accepts an eligible passenger with an available roster helicopter, returning its id', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    expect(getAirAssaultLaunchState(state, unitId)).toEqual({ ok: true, helicopterId });
  });

  it('picks the lowest-id available helicopter when two are based at the city', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const secondHeli: Unit = { id: 'heli-0', type: 'attack_helicopter', owner: 'civ-a', position: { q: 0, r: 0 }, movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false, airBase: { kind: 'city', cityId: 'city-1' } };
    const twoHeli = { ...state, units: { ...state.units, 'heli-0': secondHeli } };
    expect(getAirAssaultLaunchState(twoHeli, unitId)).toEqual({ ok: true, helicopterId: 'heli-0' });
  });
});

describe('getAirAssaultTargets / canAirAssault', () => {
  it('includes a plain visible, passable, unoccupied in-range tile', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const targets = getAirAssaultTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 1)).toBe(true);
  });

  it('excludes an occupied tile, matching Paradrop\'s legality rules via the shared helper', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const targets = getAirAssaultTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 0)).toBe(false);
  });

  it('excludes a foreign unallied city tile', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const targets = getAirAssaultTargets(state, unitId);
    expect(targets.some(t => t.q === 2 && t.r === 0)).toBe(false);
  });

  it('canAirAssault accepts a legal tile and returns the picked helicopterId', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    expect(canAirAssault(state, unitId, { q: 1, r: 1 })).toEqual({ ok: true, helicopterId });
  });

  it('canAirAssault rejects a tile outside getAirAssaultTargets', () => {
    const { state, unitId } = makeAirAssaultFixture();
    expect(canAirAssault(state, unitId, { q: 99, r: 99 })).toEqual({ ok: false, reason: 'out-of-range' });
  });
});

describe('executeParadrop', () => {
  it('rejects an illegal destination without mutating state', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 99, r: 99 });
    expect(result).toEqual({ ok: false, state, reason: 'out-of-range' });
  });

  it('relocates the unit and applies the landing lockout on success', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const landed = result.state.units[unitId]!;
    expect(landed.position).toEqual({ q: 1, r: 1 });
    expect(landed.movementPointsLeft).toBe(0);
    expect(landed.hasMoved).toBe(true);
    expect(landed.hasActed).toBe(true);
  });

  it('does not mutate the input state object', () => {
    const { state, unitId } = makeParadropFixture();
    const before = JSON.stringify(state);
    executeParadrop(state, unitId, { q: 1, r: 1 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('produces byte-identical outcomes before and after the resolveAirborneLanding extraction (regression)', () => {
    const { state, unitId } = makeParadropFixture();
    const before = executeParadrop(state, unitId, { q: 1, r: 1 });
    expect(before).toEqual({
      ok: true,
      state: expect.objectContaining({
        units: expect.objectContaining({
          [unitId]: expect.objectContaining({ position: { q: 1, r: 1 }, movementPointsLeft: 0, hasMoved: true, hasActed: true }),
        }),
      }),
    });
  });

  it('landing lockout clears via real next-turn processing, not a hand-set flag', () => {
    let state = createNewGame('rome', 'paradrop-lockout-reset');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    const city = foundCity('player', startingPosition, state.map, state.idCounters);
    city.buildings = [...city.buildings, 'airfield'];
    state.cities[city.id] = city;
    playerCiv.cities = [city.id];
    state.map.tiles[hexKey(city.position)]!.owner = 'player';
    playerCiv.techState.completed = [...playerCiv.techState.completed, 'aviation'];

    const paratrooperId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[paratrooperId] = {
      id: paratrooperId, type: 'paratrooper', owner: 'player', position: { ...city.position },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, paratrooperId];

    const destination = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(destination)] = { ...state.map.tiles[hexKey(city.position)]!, coord: destination };
    state.civilizations.player!.visibility.tiles[hexKey(destination)] = 'visible';

    const dropped = executeParadrop(state, paratrooperId, destination);
    if (!dropped.ok) throw new Error(`expected ok, got reason: ${(dropped as { reason?: string }).reason}`);
    const landedUnit = dropped.state.units[paratrooperId]!;
    expect(landedUnit.hasActed).toBe(true);
    expect(landedUnit.movementPointsLeft).toBe(0);

    const nextTurnState = processTurn(dropped.state, new EventBus());
    const resetUnit = nextTurnState.units[paratrooperId]!;
    expect(resetUnit.hasActed).toBe(false);
    expect(resetUnit.movementPointsLeft).toBeGreaterThan(0);
  });
});

/** civ-a/civ-b at war, so isHostileOwnerTo(civ-a, civ-b) is true for flak/interception. */
function makeHostileParadropFixture() {
  const base = makeParadropFixture();
  return {
    ...base,
    state: {
      ...base.state,
      civilizations: {
        ...base.state.civilizations,
        'civ-a': { ...base.state.civilizations['civ-a'], diplomacy: { atWarWith: ['civ-b'], events: [] } },
        'civ-b': { ...base.state.civilizations['civ-b'], diplomacy: { atWarWith: ['civ-a'], events: [] } },
      },
    } as unknown as GameState,
  };
}

describe('executeParadrop — flak', () => {
  it('applies deterministic flak damage from a hostile Mobile AA covering the landing tile', () => {
    const { state, unitId } = makeHostileParadropFixture();
    // Mobile AA (radius 1, defenseModifier 8) at (2,1) covers the (1,1) landing tile (distance 1).
    const withAA = {
      ...state,
      units: { ...state.units, 'aa-1': { id: 'aa-1', type: 'mobile_aa', owner: 'civ-b', position: { q: 2, r: 1 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } },
      map: { ...state.map, tiles: { ...state.map.tiles, '2,1': tile('grassland') } },
    } as unknown as GameState;

    const before = withAA.units[unitId]!.health;
    const result = executeParadrop(withAA, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak).toEqual({ damage: 8, providerId: expect.any(String), providerLabel: expect.any(String) });
    expect(result.state.units[unitId]!.health).toBe(before - 8);
  });

  it('applies no flak when the landing tile has no hostile coverage', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak).toBeUndefined();
  });

  it('applies flak from hostile AA the dropping civ has NOT discovered (real effect despite no preview)', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const withUndiscoveredAA = {
      ...state,
      units: { ...state.units, 'aa-1': { id: 'aa-1', type: 'mobile_aa', owner: 'civ-b', position: { q: 2, r: 1 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } },
      map: { ...state.map, tiles: { ...state.map.tiles, '2,1': tile('grassland') } },
      civilizations: {
        ...state.civilizations,
        'civ-a': { ...(state.civilizations as any)['civ-a'], visibility: { tiles: { '0,0': 'visible', '1,1': 'visible' } } }, // (2,1) not visible -- AA undiscovered
      },
    } as unknown as GameState;

    const result = executeParadrop(withUndiscoveredAA, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak?.damage).toBe(8);
  });

  it('destroys the paratrooper if flak damage alone reduces health to zero or below', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const withAA = {
      ...state,
      units: {
        ...state.units,
        [unitId]: { ...state.units[unitId]!, health: 5 },
        'aa-1': { id: 'aa-1', type: 'mobile_aa', owner: 'civ-b', position: { q: 2, r: 1 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
      },
      map: { ...state.map, tiles: { ...state.map.tiles, '2,1': tile('grassland') } },
    } as unknown as GameState;

    const result = executeParadrop(withAA, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.units[unitId]).toBeUndefined();
    expect(result.flak?.damage).toBe(8);
  });
});

describe('executeParadrop — interception', () => {
  function withInterceptor(state: GameState, health = 20) {
    return {
      ...state,
      cities: {
        ...state.cities,
        'city-2': { ...(state.cities as any)['city-2'], buildings: ['airfield'] },
      },
      units: {
        ...state.units,
        'interceptor-1': {
          id: 'interceptor-1', type: 'jet_fighter', owner: 'civ-b', position: { q: 2, r: 0 },
          movementPointsLeft: 6, health, experience: 0, hasMoved: false, hasActed: false, isResting: false,
          airBase: { kind: 'city', cityId: 'city-2' }, airMission: 'intercept',
        },
      },
    } as unknown as GameState;
  }

  it('resolves combat against a known enemy interceptor in range of the landing tile', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const result = executeParadrop(withInterceptor(state), unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.interception).toBeDefined();
    expect(result.interception!.interceptorId).toBe('interceptor-1');
  });

  it('resolves combat against a HIDDEN enemy interceptor too (no visibility filter, matches #539)', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const hidden = {
      ...withInterceptor(state),
      civilizations: { ...state.civilizations, 'civ-a': { ...(state.civilizations as any)['civ-a'], visibility: { tiles: { '0,0': 'visible', '1,1': 'visible' } } } },
    } as unknown as GameState;
    const result = executeParadrop(hidden, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.interception).toBeDefined();
  });

  it('is deterministic under a fixed seed (same inputs, same outcome, run twice)', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const fixture = withInterceptor(state);
    const first = executeParadrop(fixture, unitId, { q: 1, r: 1 });
    const second = executeParadrop(fixture, unitId, { q: 1, r: 1 });
    expect(first.ok ? first.state.units[unitId]?.health : 'destroyed')
      .toEqual(second.ok ? second.state.units[unitId]?.health : 'destroyed');
  });

  it('positions the unit at the destination (not the stale launch tile) before interception combat resolves', () => {
    // Weak interceptor (20 HP) is heavily favored to lose against a
    // full-health Paratrooper, so this reliably exercises the surviving
    // path -- proving the unit's recorded position is the destination
    // throughout, not the launch city it started at. This is the
    // observable half of the fix described in executeParadrop's comment:
    // combat-context.ts looks up "is the defender on a city tile" purely
    // by defender.position, so if that were still the launch tile when
    // interception resolves, the paratrooper would be incorrectly treated
    // as defending inside its own friendly city.
    const { state, unitId } = makeHostileParadropFixture();
    const result = executeParadrop(withInterceptor(state, 20), unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    const survivor = result.state.units[unitId];
    expect(survivor).toBeDefined();
    expect(survivor!.position).toEqual({ q: 1, r: 1 });
  });
});

describe('executeParadrop — notifications', () => {
  it('always logs an outcome notification for the dropping civ', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    const unit = state.units[unitId]!;
    expect(result.state.notificationLog?.[unit.owner]?.some(n => /landed/i.test(n.message))).toBe(true);
  });

  it('notifies a hostile civ that can see the landing tile', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const withVisibility = {
      ...state,
      civilizations: { ...state.civilizations, 'civ-b': { ...(state.civilizations as any)['civ-b'], visibility: { tiles: { '1,1': 'visible' } } } },
    } as unknown as GameState;
    const result = executeParadrop(withVisibility, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-b']?.some(n => /paratrooper/i.test(n.message))).toBe(true);
  });

  it('does NOT notify a hostile civ that cannot see the landing tile', () => {
    const { state, unitId } = makeHostileParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 }); // civ-b's visibility.tiles is {} in the base fixture
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-b'] ?? []).toEqual([]);
  });
});

describe('executeAirAssault', () => {
  it('rejects an illegal destination without mutating state', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 99, r: 99 });
    expect(result).toEqual({ ok: false, state, reason: 'out-of-range' });
  });

  it('relocates the passenger, applies its landing lockout, and locks out the helicopter, on success', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 1, r: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.helicopterId).toBe(helicopterId);
    const passenger = result.state.units[unitId]!;
    expect(passenger.position).toEqual({ q: 1, r: 1 });
    expect(passenger.movementPointsLeft).toBe(0);
    expect(passenger.hasMoved).toBe(true);
    expect(passenger.hasActed).toBe(true);
    const helicopter = result.state.units[helicopterId]!;
    expect(helicopter.position).toEqual({ q: 0, r: 0 }); // stays at base
    expect(helicopter.hasActed).toBe(true);
    expect(helicopter.movementPointsLeft).toBe(0);
  });

  it('locks out the helicopter even if the passenger is destroyed on landing (flak)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    // isHostileOwnerTo requires an explicit bilateral atWarWith entry --
    // civ-b is not hostile to civ-a by default just by being a different
    // civilization. Mobile AA (radius 1, defenseModifier 8) is placed at
    // (2,1) -- ADJACENT to, not ON, the (1,1) landing tile -- an AA unit
    // standing directly on the destination would instead be rejected as
    // 'destination-occupied' by the occupancy check, matching the real
    // fixture pattern already proven in the executeParadrop — flak block
    // above.
    const withHostileAA = {
      ...state,
      units: { ...state.units, [unitId]: { ...state.units[unitId]!, health: 5 }, 'aa-1': { id: 'aa-1', type: 'mobile_aa', owner: 'civ-b', position: { q: 2, r: 1 }, movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } },
      map: { ...state.map, tiles: { ...state.map.tiles, '2,1': tile('grassland') } },
      civilizations: {
        ...state.civilizations,
        'civ-a': { ...state.civilizations['civ-a']!, diplomacy: { atWarWith: ['civ-b'], events: [] } },
        'civ-b': { ...state.civilizations['civ-b']!, diplomacy: { atWarWith: ['civ-a'], events: [] } },
      },
    } as unknown as GameState;
    const result = executeAirAssault(withHostileAA, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.units[unitId]).toBeUndefined();
    expect(result.state.units[helicopterId]!.hasActed).toBe(true);
  });

  it('cannot air-assault twice from the same helicopter in the same turn', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const first = executeAirAssault(state, unitId, { q: 1, r: 1 });
    if (!first.ok) throw new Error('expected ok');
    const secondPassenger: Unit = { id: 'inf-2', type: 'infantry', owner: 'civ-a', position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false };
    const withSecondPassenger = { ...first.state, units: { ...first.state.units, 'inf-2': secondPassenger }, civilizations: { ...first.state.civilizations, 'civ-a': { ...first.state.civilizations['civ-a']!, units: [...first.state.civilizations['civ-a']!.units, 'inf-2'] } } };
    expect(canAirAssault(withSecondPassenger, 'inf-2', { q: 2, r: 2 })).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('always logs an outcome notification for the acting civ, worded for a helicopter mission', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-a']?.some(n => /helicopter/i.test(n.message))).toBe(true);
  });

  it('both the passenger landing lockout and the helicopter lockout clear via real next-turn processing', () => {
    let state = createNewGame('rome', 'air-assault-lockout-reset');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    const city = foundCity('player', startingPosition, state.map, state.idCounters);
    city.buildings = [...city.buildings, 'helicopter_base'];
    state.cities[city.id] = city;
    playerCiv.cities = [city.id];
    state.map.tiles[hexKey(city.position)]!.owner = 'player';
    playerCiv.techState.completed = [...playerCiv.techState.completed, 'helicopter-warfare'];

    const passengerId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[passengerId] = {
      id: passengerId, type: 'infantry', owner: 'player', position: { ...city.position },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, passengerId];
    const heliId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[heliId] = {
      id: heliId, type: 'attack_helicopter', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      airBase: { kind: 'city', cityId: city.id },
    };
    playerCiv.units = [...playerCiv.units, heliId];

    const destination = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(destination)] = { ...state.map.tiles[hexKey(city.position)]!, coord: destination };
    state.civilizations.player!.visibility.tiles[hexKey(destination)] = 'visible';

    const dropped = executeAirAssault(state, passengerId, destination);
    if (!dropped.ok) throw new Error(`expected ok, got reason: ${(dropped as { reason?: string }).reason}`);
    const landedPassenger = dropped.state.units[passengerId]!;
    expect(landedPassenger.hasActed).toBe(true);
    const landedHelicopter = dropped.state.units[heliId]!;
    expect(landedHelicopter.hasActed).toBe(true);

    const nextTurnState = processTurn(dropped.state, new EventBus());
    const passenger = nextTurnState.units[passengerId]!;
    const helicopter = nextTurnState.units[heliId]!;
    expect(passenger.hasActed).toBe(false);
    expect(passenger.movementPointsLeft).toBeGreaterThan(0);
    expect(helicopter.hasActed).toBe(false);
    expect(helicopter.movementPointsLeft).toBeGreaterThan(0);
  });
});

describe('executeParadrop — unaffected by the notifyAirborneOutcome generalization (regression)', () => {
  it('still logs the Paratrooper-specific landing message', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-a']?.some(n => /landed/i.test(n.message))).toBe(true);
  });
});

describe('Paratrooper dual-eligibility (Paradrop and Air Assault both legal, no special-case code)', () => {
  it('a Paratrooper in a city with both an Airfield and a Helicopter Base can Paradrop OR Air Assault, and using either disables the other via the shared hasActed flag', () => {
    const { state, unitId, cityId } = makeAirAssaultFixture();
    const dualCity = { ...state, cities: { ...state.cities, [cityId]: { ...state.cities[cityId]!, buildings: ['helicopter_base', 'airfield'] } } };
    const paratrooperState = { ...dualCity, units: { ...dualCity.units, [unitId]: { ...dualCity.units[unitId]!, type: 'paratrooper' } } } as unknown as GameState;

    expect(getParadropLaunchState(paratrooperState, unitId)).toEqual({ ok: true });
    expect(getAirAssaultLaunchState(paratrooperState, unitId).ok).toBe(true);

    const afterParadrop = executeParadrop(paratrooperState, unitId, { q: 1, r: 1 });
    if (!afterParadrop.ok) throw new Error('expected ok');
    expect(getAirAssaultLaunchState(afterParadrop.state, unitId)).toEqual({ ok: false, reason: 'already-acted' });
  });
});

describe('Air Assault solo-play parity (AI-triggered vs. human-triggered call the same function)', () => {
  it('an AI-style call to executeAirAssault produces the identical result shape a human-triggered call does', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 1, r: 1 });
    expect(result.ok).toBe(true);
  });
});
