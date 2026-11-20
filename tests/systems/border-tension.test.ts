import { describe, expect, it } from 'vitest';
import type { City, GameState, HexTile, Unit, UnitType } from '@/core/types';
import { BORDER_TENSION_RADIUS, hasBorderTension } from '@/systems/border-tension';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { driftCivDiplomacy } from '@/core/round-phases/per-civ/diplomacy-drift';
import type { CivTurn } from '@/core/round-phases/per-civ/types';

const WIDTH = 20;

/** A host city at the left edge and one intruding unit, on a 20-wide map that wraps unless told otherwise. */
function world(opts: { unitAt: { q: number; r: number }; unitType?: UnitType; wraps?: boolean }): GameState {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 5; r++) {
    for (let q = 0; q < WIDTH; q++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none',
        owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      } as HexTile;
    }
  }
  const ids = ['host', 'rival'];
  const civ = (id: string, cities: string[], units: string[]) => ({
    id, name: id, cities, units, diplomacy: { ...createDiplomacyState(ids, id), relationships: { [ids.find(o => o !== id)!]: 0 } },
  });
  return {
    turn: 10,
    map: { width: WIDTH, height: 5, tiles, wrapsHorizontally: opts.wraps ?? true, rivers: [] },
    civilizations: { host: civ('host', ['c1'], []), rival: civ('rival', [], ['u1']) },
    cities: { c1: { id: 'c1', owner: 'host', position: { q: 0, r: 2 } } as City },
    units: { u1: { id: 'u1', owner: 'rival', type: opts.unitType ?? 'warrior', position: opts.unitAt } as Unit },
  } as unknown as GameState;
}

function sign(state: GameState, type: 'alliance' | 'open_borders'): void {
  const treaty = { type, civA: 'host', civB: 'rival', turnsRemaining: -1 };
  state.civilizations.host.diplomacy.treaties.push(treaty as never);
  state.civilizations.rival.diplomacy.treaties.push(treaty as never);
}

describe('border tension', () => {
  it('counts troops across the map seam on a wrapping map, not on a flat one', () => {
    expect(hasBorderTension(world({ unitAt: { q: WIDTH - 1, r: 2 } }), 'host', 'rival')).toBe(true);
    expect(hasBorderTension(world({ unitAt: { q: WIDTH - 1, r: 2 }, wraps: false }), 'host', 'rival')).toBe(false);
  });

  it('uses real hex distance with a radius of 3', () => {
    expect(hasBorderTension(world({ unitAt: { q: BORDER_TENSION_RADIUS, r: 2 } }), 'host', 'rival')).toBe(true);
    expect(hasBorderTension(world({ unitAt: { q: BORDER_TENSION_RADIUS + 1, r: 2 } }), 'host', 'rival')).toBe(false);
    // The old |dq| + |dr| measure called this 4 hexes away and missed it; on the hex grid it is 2.
    expect(hasBorderTension(world({ unitAt: { q: 2, r: 0 } }), 'host', 'rival')).toBe(true);
  });

  it('ignores unarmed units', () => {
    expect(hasBorderTension(world({ unitAt: { q: 1, r: 2 }, unitType: 'settler' }), 'host', 'rival')).toBe(false);
  });

  it('exempts allies and Open Borders partners', () => {
    for (const type of ['alliance', 'open_borders'] as const) {
      const state = world({ unitAt: { q: 1, r: 2 } });
      sign(state, type);
      expect(hasBorderTension(state, 'host', 'rival'), type).toBe(false);
    }
  });

  it('counts only what a viewer is allowed to know', () => {
    const state = world({ unitAt: { q: 1, r: 2 } });
    expect(hasBorderTension(state, 'host', 'rival', { unitKnown: () => false })).toBe(false);
    expect(hasBorderTension(state, 'host', 'rival', { cityKnown: () => false })).toBe(false);
  });
});

describe('relationship drift from border tension', () => {
  const turn = (state: GameState, civId: string) => ({ civId, civ: state.civilizations[civId] }) as unknown as CivTurn;

  it('the approached civ loses opinion of the intruder; the intruder does not resent its victim', () => {
    const state = world({ unitAt: { q: 1, r: 2 } });
    driftCivDiplomacy(state, turn(state, 'host'), {});
    driftCivDiplomacy(state, turn(state, 'rival'), {});
    expect(state.civilizations.host.diplomacy.relationships.rival).toBe(-2);
    expect(state.civilizations.rival.diplomacy.relationships.host).toBe(1);
  });

  it('troops far away let opinion recover on both sides', () => {
    const state = world({ unitAt: { q: 10, r: 2 } });
    driftCivDiplomacy(state, turn(state, 'host'), {});
    expect(state.civilizations.host.diplomacy.relationships.rival).toBe(1);
  });
});
