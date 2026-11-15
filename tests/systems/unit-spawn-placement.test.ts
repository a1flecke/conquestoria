import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord, TerrainType } from '@/core/types';
import { createUnit } from '@/systems/unit-lifecycle';
import {
  filterLegalSpawnTiles,
  findSpyReturnTile,
  isLegalSpawnTile,
  isUnitOnEnterableTerrain,
  spawnNeighbours,
} from '@/systems/unit-spawn-placement';

function tile(coord: HexCoord, terrain: TerrainType) {
  return {
    coord, terrain, elevation: 'lowland', resource: null, improvement: 'none',
    owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

function makeState(terrain: Record<string, TerrainType>, wraps = false): GameState {
  const tiles: Record<string, ReturnType<typeof tile>> = {};
  for (const [key, kind] of Object.entries(terrain)) {
    const [q, r] = key.split(',').map(Number);
    tiles[key] = tile({ q, r }, kind);
  }
  return {
    map: { width: 10, height: 10, tiles, wrapsHorizontally: wraps, rivers: [] },
    units: {},
    cities: {},
    civilizations: {},
    barbarianCamps: {},
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

const warrior = { ownerId: 'p1', unitType: 'warrior', stacking: 'same-owner' } as const;

describe('unit spawn placement', () => {
  it('follows the movement terrain rules for each domain', () => {
    const state = makeState({ '0,0': 'plains', '1,0': 'mountain', '2,0': 'ocean', '3,0': 'coast' });
    expect(filterLegalSpawnTiles(state, warrior, [0, 1, 2, 3].map(q => ({ q, r: 0 }))))
      .toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    const galley = { ownerId: 'p1', unitType: 'galley', stacking: 'same-owner' } as const;
    const trireme = { ownerId: 'p1', unitType: 'trireme', stacking: 'same-owner' } as const;
    expect(filterLegalSpawnTiles(state, galley, [0, 1, 2, 3].map(q => ({ q, r: 0 })))).toEqual([{ q: 3, r: 0 }]);
    expect(filterLegalSpawnTiles(state, trireme, [0, 1, 2, 3].map(q => ({ q, r: 0 }))))
      .toEqual([{ q: 2, r: 0 }, { q: 3, r: 0 }]);
  });

  it('refuses a missing tile, a camp, a foreign city and a pirate enclave anchor', () => {
    const state = makeState({ '0,0': 'plains', '1,0': 'plains', '2,0': 'plains', '3,0': 'plains' });
    state.barbarianCamps = { c: { id: 'c', position: { q: 1, r: 0 }, strength: 1, spawnCooldown: 1 } };
    state.cities = { x: { id: 'x', owner: 'p2', position: { q: 2, r: 0 } } } as unknown as GameState['cities'];
    state.pirates = {
      factions: { 'pirate-1': { id: 'pirate-1', headquarters: { kind: 'coastal-enclave', position: { q: 3, r: 0 } } } },
    } as unknown as GameState['pirates'];
    const candidates = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 9, r: 9 }];
    expect(filterLegalSpawnTiles(state, warrior, candidates)).toEqual([{ q: 0, r: 0 }]);
    // A barbarian is not blocked by a camp, a city owner not by its own city.
    expect(isLegalSpawnTile(state, { ...warrior, ownerId: 'barbarian' }, { q: 1, r: 0 })).toBe(true);
    expect(isLegalSpawnTile(state, { ...warrior, ownerId: 'p2' }, { q: 2, r: 0 })).toBe(true);
  });

  it('never shares a tile with another owner; friendly stacking depends on the policy', () => {
    const state = makeState({ '0,0': 'plains', '1,0': 'plains' });
    const counters = { ...state.idCounters };
    const own = createUnit('warrior', 'p1', { q: 0, r: 0 }, counters);
    const foreign = createUnit('warrior', 'p2', { q: 1, r: 0 }, counters);
    state.units = { [own.id]: own, [foreign.id]: foreign };
    expect(isLegalSpawnTile(state, warrior, { q: 0, r: 0 })).toBe(true);
    expect(isLegalSpawnTile(state, { ...warrior, stacking: 'empty-only' }, { q: 0, r: 0 })).toBe(false);
    expect(isLegalSpawnTile(state, warrior, { q: 1, r: 0 })).toBe(false);
  });

  it('ignores cargo aboard a ship, which is not a map occupant', () => {
    const state = makeState({ '0,0': 'plains' });
    const cargo = { ...createUnit('warrior', 'p2', { q: 0, r: 0 }, { ...state.idCounters }), transportId: 'ship' };
    state.units = { [cargo.id]: cargo };
    expect(isLegalSpawnTile(state, warrior, { q: 0, r: 0 })).toBe(true);
  });

  it('wraps neighbours across the seam on a wrapping map', () => {
    const state = makeState({ '0,0': 'plains', '9,0': 'plains' }, true);
    expect(spawnNeighbours(state, { q: 0, r: 0 })).toContainEqual({ q: 9, r: 0 });
    expect(filterLegalSpawnTiles(state, warrior, spawnNeighbours(state, { q: 0, r: 0 }))).toEqual([{ q: 9, r: 0 }]);
  });

  it('returns a spy to its own city first, and never onto a city it does not own', () => {
    const state = makeState({ '0,0': 'plains', '1,0': 'plains', '5,5': 'plains', '6,5': 'plains' });
    state.cities = {
      home: { id: 'home', owner: 'p1', position: { q: 0, r: 0 } },
      ally: { id: 'ally', owner: 'p2', position: { q: 5, r: 5 } },
    } as unknown as GameState['cities'];
    expect(findSpyReturnTile(state, 'p1', 'spy_agent', { q: 0, r: 0 })).toEqual({ q: 0, r: 0 });
    // A spy is blocked by every city its owner does not hold, alliance or not.
    expect(findSpyReturnTile(state, 'p1', 'spy_agent', { q: 5, r: 5 })).toEqual({ q: 6, r: 5 });
    expect(isLegalSpawnTile(state, { ownerId: 'p1', unitType: 'warrior', stacking: 'same-owner' }, { q: 5, r: 5 }))
      .toBe(false);
  });

  it('judges a unit on its terrain: land, hull access, ports, and pirate hulls on any water', () => {
    const state = makeState({ '0,0': 'plains', '1,0': 'coast', '2,0': 'ocean' });
    state.cities = { home: { id: 'home', owner: 'p1', position: { q: 0, r: 0 } } } as unknown as GameState['cities'];
    const at = (q: number) => ({ q, r: 0 });
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'warrior', position: at(0) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'warrior', position: at(1) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'galley', position: at(1) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'galley', position: at(2) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'galley', position: at(0) })).toBe(true); // in port
    expect(isUnitOnEnterableTerrain(state, { owner: 'p2', type: 'galley', position: at(0) })).toBe(false); // beached
    expect(isUnitOnEnterableTerrain(state, { owner: 'pirate-1', type: 'pirate_corsair', position: at(2) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'pirate-1', type: 'pirate_corsair', position: at(0) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'warrior', position: { q: 9, r: 9 } })).toBe(false);
  });
});
