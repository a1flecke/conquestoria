import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
import { createDiplomacyState } from '@/systems/diplomacy-state';

function makeStateWithSource(opts: {
  sourceCoord: HexCoord;
  sourceKind: 'city' | 'fort';
  citadelTech?: boolean;
  ownerId?: string;
}): GameState {
  const owner = opts.ownerId ?? 'rome';
  const map: GameMap = { width: 20, height: 20, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 20; q++) {
    for (let r = 0; r < 20; r++) {
      const coord = { q, r };
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const cities: GameState['cities'] = {};
  if (opts.sourceKind === 'city') {
    cities.c1 = { id: 'c1', owner, position: opts.sourceCoord } as City;
  } else {
    map.tiles[hexKey(opts.sourceCoord)] = {
      ...map.tiles[hexKey(opts.sourceCoord)]!,
      improvement: 'fort', improvementTurnsLeft: 0,
    };
  }
  return {
    map, cities, units: {}, turn: 1,
    // #544 MR4: units: [] is required here now that resolveLandSupplyForCiv
    // unconditionally calls getPassiveStabilizationTargets, which reads
    // civ.units (a real, non-optional Civilization field) -- a bare
    // techState-only object satisfied the old code path but not this one.
    civilizations: { [owner]: { techState: { completed: opts.citadelTech ? ['fortification-engineering'] : [] }, units: [] } as any },
  } as unknown as GameState;
}

describe('resolveLandSupplyForCiv (integration)', () => {
  it('a participating land unit sitting in hostile territory with no source starts accumulating overextension', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    state.map.tiles[hexKey({ q: 19, r: 19 })] = { ...state.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.u1!.landSupply).toEqual({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    expect(next).not.toBe(state);
    expect(state.units.u1!.landSupply).toBeUndefined();
  });

  it('a non-participating unit (settler) is left completely untouched', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.units = { s1: { id: 's1', type: 'settler', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit };
    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.s1!.landSupply).toBeUndefined();
  });
});

describe('#544 MR4 — passive command stabilization integration', () => {
  it('a unit within an operational General\'s command range does not advance its overextension stage', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.map.tiles[hexKey({ q: 19, r: 19 })] = { ...state.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    state.map.tiles[hexKey({ q: 18, r: 19 })] = { ...state.map.tiles[hexKey({ q: 18, r: 19 })]!, owner: 'carthage' };
    state.units = {
      u1: {
        id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100,
        movementPointsLeft: 1, hasMoved: false, hasActed: false,
        landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
      } as Unit,
      gen1: {
        id: 'gen1', type: 'great_general', owner: 'rome', position: { q: 18, r: 19 }, health: 100,
        movementPointsLeft: 3, hasMoved: false, hasActed: false,
        generalDefinitionId: 'gen_caesar', // V1 commandRange = 2, distance to u1 = 1
      } as Unit,
    };
    (state.civilizations.rome as any).units = ['u1', 'gen1'];

    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.u1!.landSupply!.state).toBe('degraded'); // not 'severe'
    expect(next.units.u1!.landSupply!.hostileUnsupportedTurns).toBe(3); // frozen
  });
});

describe('difficulty invariance (#544 contract §3.3/§25)', () => {
  it('resolveLandSupplyForCiv produces identical output for two states differing only in opponentChallenge', () => {
    const explorerState = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    explorerState.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    explorerState.map.tiles[hexKey({ q: 19, r: 19 })] = { ...explorerState.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    explorerState.opponentChallenge = 'explorer';

    const veteranState = structuredClone(explorerState);
    veteranState.opponentChallenge = 'veteran';

    const explorerResult = resolveLandSupplyForCiv(explorerState, 'rome');
    const veteranResult = resolveLandSupplyForCiv(veteranState, 'rome');
    expect(explorerResult.units.u1!.landSupply).toEqual(veteranResult.units.u1!.landSupply);
  });
});

// #870 — what a territorial relationship SUPPORTS is a separate question from whether the unit
// may be there (#871). Open Borders is passage, not logistics.
describe('#870 relationship -> logistics (supply system integration)', () => {
  function abroad(relate: (state: GameState) => void): GameState {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    const ids = ['rome', 'carthage'];
    state.civilizations.rome = { ...state.civilizations.rome!, diplomacy: createDiplomacyState(ids, 'rome') } as any;
    state.civilizations.carthage = { techState: { completed: [] }, units: [], cities: [], diplomacy: createDiplomacyState(ids, 'carthage') } as any;
    // The partner also has a city right beside the unit: it must NOT resupply a foreign army.
    state.cities.foreign = { id: 'foreign', owner: 'carthage', position: { q: 18, r: 19 } } as City;
    state.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    state.map.tiles[hexKey({ q: 19, r: 19 })] = { ...state.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    relate(state);
    return state;
  }
  const signBothWays = (state: GameState, type: 'open_borders' | 'alliance') => {
    for (const [a, b] of [['rome', 'carthage'], ['carthage', 'rome']] as const) {
      const civ = state.civilizations[a] as any;
      civ.diplomacy = { ...civ.diplomacy, treaties: [...civ.diplomacy.treaties, { type, civA: a, civB: b, turnsRemaining: -1 }] };
    }
  };
  const turnsUnsupported = (state: GameState, n: number) => {
    let current = state;
    for (let i = 0; i < n; i++) current = resolveLandSupplyForCiv(current, 'rome');
    return current.units.u1!.landSupply!;
  };

  it('Open Borders: passage but no supply -- the partner\'s city does not cover the army, and it attrits like enemy land', () => {
    const open = abroad(s => signBothWays(s, 'open_borders'));
    const hostile = abroad(() => {}); // closed border, unit is an intruder
    expect(turnsUnsupported(open, 1)).toEqual({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    for (const turns of [1, 3, 5, 7]) {
      expect(turnsUnsupported(open, turns), `after ${turns} turns`).toEqual(turnsUnsupported(hostile, turns));
    }
    expect(turnsUnsupported(open, 5).state).toBe('severe');
  });

  it('alliance: stable but unsupported, no attrition (unchanged) -- and still no resupply from the ally\'s city', () => {
    const allied = abroad(s => signBothWays(s, 'alliance'));
    expect(turnsUnsupported(allied, 6)).toEqual({ state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });

  it('an alliance signed on top of Open Borders is what removes attrition; Open Borders alone never does', () => {
    const both = abroad(s => { signBothWays(s, 'open_borders'); signBothWays(s, 'alliance'); });
    expect(turnsUnsupported(both, 4).state).toBe('stable-unsupported');
  });

  it('vassal and overlord stand as allies on each other\'s land: no attrition', () => {
    const vassalage = abroad(s => {
      const rome = s.civilizations.rome as any;
      const carthage = s.civilizations.carthage as any;
      rome.diplomacy = { ...rome.diplomacy, vassalage: { ...rome.diplomacy.vassalage, overlord: 'carthage' } };
      carthage.diplomacy = { ...carthage.diplomacy, vassalage: { ...carthage.diplomacy.vassalage, vassals: ['rome'] } };
    });
    expect(turnsUnsupported(vassalage, 6).state).toBe('stable-unsupported');
  });

  it('Open Borders cancelled while the army is inside: support changes at once and deterministically -- the stage counter resumes as hostile, and graceful egress does not preserve supply', () => {
    const open = abroad(s => signBothWays(s, 'open_borders'));
    const afterOneTurn = resolveLandSupplyForCiv(open, 'rome');
    expect(afterOneTurn.units.u1!.landSupply!.state).toBe('grace');
    // Treaty ends (both records removed), unit still standing there and still free to leave (#871).
    for (const id of ['rome', 'carthage']) {
      const civ = afterOneTurn.civilizations[id] as any;
      civ.diplomacy = { ...civ.diplomacy, treaties: [] };
    }
    const reloaded: GameState = JSON.parse(JSON.stringify(afterOneTurn));
    const next = resolveLandSupplyForCiv(reloaded, 'rome');
    expect(next.units.u1!.landSupply).toEqual({ state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
    // Same outcome without the save/reload boundary.
    expect(resolveLandSupplyForCiv(afterOneTurn, 'rome').units.u1!.landSupply).toEqual(next.units.u1!.landSupply);
  });
});
