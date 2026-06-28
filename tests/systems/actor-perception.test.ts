import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  decayRememberedConfidence,
  getLocallySensedUnits,
} from '@/systems/actor-perception';
import { createUnit } from '@/systems/unit-system';

describe('actor perception', () => {
  it('uses wrapped distance and sorts sensed units by distance then id', () => {
    const state = createNewGame(undefined, 'actor-perception-wrap', 'small');
    state.map.wrapsHorizontally = true;
    state.units = {};

    const edge = createUnit('warrior', 'player', { q: state.map.width - 1, r: 0 }, state.idCounters);
    edge.id = 'unit-b';
    const sameHex = createUnit('warrior', 'player', { q: 0, r: 0 }, state.idCounters);
    sameHex.id = 'unit-a';
    state.units[edge.id] = edge;
    state.units[sameHex.id] = sameHex;

    expect(getLocallySensedUnits(
      state,
      [{ q: 0, r: 0 }],
      1,
      owner => owner === 'player',
    ).map(unit => unit.id)).toEqual(['unit-a', 'unit-b']);
  });

  it('excludes transported cargo from local sensing', () => {
    const state = createNewGame(undefined, 'actor-perception-cargo', 'small');
    state.units = {};
    const cargo = createUnit('warrior', 'player', { q: 0, r: 0 }, state.idCounters);
    cargo.transportId = 'transport-1';
    state.units[cargo.id] = cargo;

    expect(getLocallySensedUnits(state, [{ q: 0, r: 0 }], 2, () => true)).toEqual([]);
  });

  it('decays remembered confidence over six rounds with bounded inputs', () => {
    expect(decayRememberedConfidence(-2)).toBe(1);
    expect(decayRememberedConfidence(0)).toBe(1);
    expect(decayRememberedConfidence(3)).toBe(0.5);
    expect(decayRememberedConfidence(6)).toBe(0);
    expect(decayRememberedConfidence(20)).toBe(0);
    expect(decayRememberedConfidence(Number.NaN)).toBe(0);
  });
});
