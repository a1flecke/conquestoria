import { describe, expect, it } from 'vitest';
import { getParadropLaunchState, getParadropTargets, canParadrop, executeParadrop } from '@/systems/airborne-system';
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
        diplomacy: { atWarWith: [] },
        visibility: {
          tiles: {
            '0,0': 'visible', '1,1': 'visible', '1,0': 'visible',
            '2,0': 'visible', '-1,2': 'visible',
            // '2,2' deliberately omitted -- defaults to 'unexplored'.
          },
        },
      },
      'civ-b': { diplomacy: { atWarWith: [] }, visibility: { tiles: {} } },
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
