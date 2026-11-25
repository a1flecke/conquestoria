import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord, TerrainType } from '@/core/types';
import { createUnit } from '@/systems/unit-lifecycle';
import {
  filterLegalSpawnTiles,
  findCityUnitSpawnTile,
  findSpyReturnTile,
  isLegalSpawnTile,
  isUnitOnEnterableTerrain,
  isUnitStranded,
  settleStrandedUnits,
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
  it('preserves a trader already inside a closed freight passage without allowing spawn there', () => {
    const state = makeState({ '0,0': 'coast', '1,0': 'plains', '2,0': 'coast' });
    const position = { q: 1, r: 0 };
    state.map.tiles['1,0']!.freightPassage = {
      id: 'isthmus',
      ownerId: 'p1',
      open: false,
      allowedOperatorIds: [],
      approaches: [{ q: 0, r: 0 }, { q: 2, r: 0 }],
    };
    const trader = { position, owner: 'p2', type: 'naval_trader' } as const;
    expect(isUnitOnEnterableTerrain(state, trader)).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { ...trader, type: 'destroyer' })).toBe(false);
    expect(isLegalSpawnTile(state, { ownerId: 'p2', unitType: trader.type, stacking: 'empty-only' }, position)).toBe(false);
  });

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

  // #1724: city-generated units prefer the centre, fall back to a legal neighbour when a
  // foreign occupant makes the centre illegal, and keep the port exception for hulls.
  it('places a city unit at the centre, falls back to a neighbour, and preserves the port exception', () => {
    const state = makeState({ '0,0': 'grassland', '1,0': 'grassland', '0,1': 'coast' });
    state.cities = { c: { id: 'c', owner: 'p1', position: { q: 0, r: 0 } } } as unknown as GameState['cities'];
    expect(findCityUnitSpawnTile(state, warrior, { q: 0, r: 0 })).toEqual({ q: 0, r: 0 });

    // Friendly stacking stays legal at the centre.
    const friend = createUnit('warrior', 'p1', { q: 0, r: 0 }, { ...state.idCounters });
    state.units = { [friend.id]: friend };
    expect(findCityUnitSpawnTile(state, warrior, { q: 0, r: 0 })).toEqual({ q: 0, r: 0 });

    // A hull trained in its own port stands on the city centre even when that tile is land.
    expect(findCityUnitSpawnTile(state, { ...warrior, unitType: 'galley' }, { q: 0, r: 0 }))
      .toEqual({ q: 0, r: 0 });

    const foreign = createUnit('warrior', 'p2', { q: 0, r: 0 }, { ...state.idCounters });
    state.units = { [foreign.id]: foreign };
    expect(findCityUnitSpawnTile(state, warrior, { q: 0, r: 0 })).toEqual({ q: 1, r: 0 });

    // No legal centre or neighbour: the caller must report no placement, not force a stack.
    state.map.tiles['1,0'].terrain = 'ocean';
    state.map.tiles['0,1'].terrain = 'ocean';
    expect(findCityUnitSpawnTile(state, warrior, { q: 0, r: 0 })).toBeNull();
    expect(findCityUnitSpawnTile(state, { ...warrior, unitType: 'galley' }, { q: 0, r: 0 })).toBeNull();
  });

  it('does not place a city unit when the named city is not owned by the query owner', () => {
    const state = makeState({ '0,0': 'grassland' });
    state.cities = { c: { id: 'c', owner: 'p2', position: { q: 0, r: 0 } } } as unknown as GameState['cities'];
    expect(findCityUnitSpawnTile(state, warrior, { q: 0, r: 0 })).toBeNull();
  });

  it('judges a unit on its terrain: land, hull access and ports, pirates included', () => {
    const state = makeState({ '0,0': 'plains', '1,0': 'coast', '2,0': 'ocean' });
    state.cities = { home: { id: 'home', owner: 'p1', position: { q: 0, r: 0 } } } as unknown as GameState['cities'];
    const at = (q: number) => ({ q, r: 0 });
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'warrior', position: at(0) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'warrior', position: at(1) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'galley', position: at(1) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'galley', position: at(2) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'galley', position: at(0) })).toBe(true); // in port
    expect(isUnitOnEnterableTerrain(state, { owner: 'p2', type: 'galley', position: at(0) })).toBe(false); // beached
    expect(isUnitOnEnterableTerrain(state, { owner: 'pirate-1', type: 'pirate_corsair', position: at(1) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'pirate-1', type: 'pirate_corsair', position: at(2) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'pirate-1', type: 'pirate_frigate', position: at(2) })).toBe(true);
    expect(isUnitOnEnterableTerrain(state, { owner: 'pirate-1', type: 'pirate_corsair', position: at(0) })).toBe(false);
    expect(isUnitOnEnterableTerrain(state, { owner: 'p1', type: 'warrior', position: { q: 9, r: 9 } })).toBe(false);
  });
});

/**
 * #1698: a unit whose tile became illegal without it moving (ownership changed around it) is "stranded", and the
 * shared settle step moves it to the nearest legal tile.
 */
describe('stranded units (#1698)', () => {
  function plains(): GameState {
    const terrain: Record<string, TerrainType> = {};
    for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) terrain[`${q},${r}`] = 'plains';
    return makeState(terrain);
  }
  function place(state: GameState, owner: string, position: HexCoord): string {
    const unit = createUnit('warrior', owner, position, state.idCounters);
    state.units[unit.id] = unit;
    return unit.id;
  }
  const camp = (position: HexCoord) => ({ 'camp-1': { id: 'camp-1', position, strength: 5, spawnCooldown: 5 } });
  const key = (coord: HexCoord) => `${coord.q},${coord.r}`;

  it('a unit alone on an open tile is not stranded, and settling returns the same state', () => {
    const state = plains();
    const id = place(state, 'mc-a', { q: 0, r: 0 });
    expect(isUnitStranded(state, state.units[id])).toBe(false);
    expect(settleStrandedUnits(state, [id])).toBe(state);
  });

  it('a city-state unit on a barbarian camp is stranded and steps to the nearest open tile', () => {
    const state = plains();
    state.barbarianCamps = camp({ q: 0, r: 0 });
    const id = place(state, 'mc-a', { q: 0, r: 0 });
    expect(isUnitStranded(state, state.units[id])).toBe(true);

    const settled = settleStrandedUnits(state, [id]);

    expect(key(settled.units[id].position)).not.toBe('0,0');
    expect(isUnitStranded(settled, settled.units[id])).toBe(false);
  });

  it('a barbarian on its own camp is not stranded', () => {
    const state = plains();
    state.barbarianCamps = camp({ q: 0, r: 0 });
    const id = place(state, 'barbarian', { q: 0, r: 0 });
    expect(isUnitStranded(state, state.units[id])).toBe(false);
  });

  it('two owners on one tile: the listed unit steps away, the other stays', () => {
    const state = plains();
    const mover = place(state, 'mc-a', { q: 1, r: 1 });
    const stayer = place(state, 'mc-b', { q: 1, r: 1 });
    expect(isUnitStranded(state, state.units[mover])).toBe(true);

    const settled = settleStrandedUnits(state, [mover]);

    expect(settled.units[stayer].position).toEqual({ q: 1, r: 1 });
    expect(key(settled.units[mover].position)).not.toBe('1,1');
    expect(isUnitStranded(settled, settled.units[mover])).toBe(false);
  });

  it('cargo aboard a ship is never stranded', () => {
    const state = plains();
    const id = place(state, 'mc-a', { q: 0, r: 0 });
    place(state, 'mc-b', { q: 0, r: 0 });
    state.units[id] = { ...state.units[id], transportId: 'ship-1' };
    expect(isUnitStranded(state, state.units[id])).toBe(false);
  });

  it('is deterministic: the same input settles to the same tile', () => {
    const settle = () => {
      const state = plains();
      state.barbarianCamps = camp({ q: 0, r: 0 });
      const id = place(state, 'mc-a', { q: 0, r: 0 });
      return settleStrandedUnits(state, [id]).units[id].position;
    };
    expect(settle()).toEqual(settle());
  });
});
