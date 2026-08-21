import {
  createUnit,
  getMovementRange,
  getMovementRangeDetails,
  getBlockingMapEntityAt,
  getBlockingMapEntityKeys,
  moveUnit,
  findPath,
  findPathToCity,
  resetUnitTurn,
  UNIT_DEFINITIONS,
  getUnmovedUnits,
  healUnit,
  getMovementBlockerReason,
  getMovementCostForUnit,
  isBlockingCityFor,
} from '@/systems/unit-system';
import type { GameMap, GameState } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';
import { TRAINABLE_UNITS, foundCity } from '@/systems/city-system';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';
import { createNewGame } from '@/core/game-state';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('isBlockingCityFor (#543 export for paradrop reuse)', () => {
  it('blocks a foreign, unallied city', () => {
    const state = {
      civilizations: { 'civ-a': { diplomacy: {} }, 'civ-b': { diplomacy: {} } },
    } as unknown as GameState;
    const unit = { owner: 'civ-a' } as unknown as import('@/core/types').Unit;
    const foreignCity = { owner: 'civ-b' } as unknown as import('@/core/types').City;
    expect(isBlockingCityFor(state, unit, foreignCity)).toBe(true);
  });

  it('does not block the unit\'s own city', () => {
    const state = { civilizations: { 'civ-a': { diplomacy: {} } } } as unknown as GameState;
    const unit = { owner: 'civ-a' } as unknown as import('@/core/types').Unit;
    const ownCity = { owner: 'civ-a' } as unknown as import('@/core/types').City;
    expect(isBlockingCityFor(state, unit, ownCity)).toBe(false);
  });

  it('does not block a foreign city with an active alliance treaty', () => {
    const state = {
      civilizations: {
        'civ-a': { diplomacy: { treaties: [{ type: 'alliance', civA: 'civ-a', civB: 'civ-b' }] } },
        'civ-b': { diplomacy: {} },
      },
    } as unknown as GameState;
    const unit = { owner: 'civ-a' } as unknown as import('@/core/types').Unit;
    const alliedCity = { owner: 'civ-b' } as unknown as import('@/core/types').City;
    expect(isBlockingCityFor(state, unit, alliedCity)).toBe(false);
  });
});

describe('Trebuchet catalog contract (#684)', () => {
  it('defines the slow city-focused Era-4 bombard unit', () => {
    expect(UNIT_DEFINITIONS.trebuchet).toMatchObject({
      strength: 27,
      movementPoints: 1,
      productionCost: 125,
      attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
    });
    expect(TRAINABLE_UNITS.find(unit => unit.type === 'trebuchet')).toMatchObject({
      techRequired: 'siege-warfare',
      requiredTechs: ['fortresses'],
      upgradesTo: 'cannon',
    });
  });
});

describe('Rocket Artillery catalog contract (#686)', () => {
  it('defines the Rocketry-gated range-three siege successor with bounded saturation capability', () => {
    expect(UNIT_DEFINITIONS.rocket_artillery).toMatchObject({
      strength: 57,
      movementPoints: 2,
      productionCost: 260,
      attackProfile: { kind: 'bombard', range: 3, targets: ['unit', 'city'] },
      splash: { damageFraction: 0.25, maxTargets: 2 },
    });
    expect(TRAINABLE_UNITS.find(unit => unit.type === 'rocket_artillery')).toMatchObject({
      techRequired: 'rocketry',
    });
  });
});

describe('Missile Cruiser catalog contract (#689)', () => {
  it('defines the three-tech-gated fleet air-defense successor', () => {
    const type = 'missile_cruiser' as import('@/core/types').UnitType;
    expect(UNIT_DEFINITIONS[type]).toMatchObject({
      strength: 70, movementPoints: 5, visionRange: 3, productionCost: 285,
      domain: 'naval', waterAccess: 'ocean',
      attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
      airDefenseProvider: { radius: 1, defenseModifier: 10, stackingGroup: 'ground-air-defense', protectedDomains: ['naval'] },
    });
    expect(TRAINABLE_UNITS.find(unit => unit.type === type)).toMatchObject({
      techRequired: 'carrier-warfare', requiredTechs: ['radar-systems', 'rocketry'], coastalRequired: true,
    });
  });
});

function zocRangeState(): GameState {
  const state = createNewGame(undefined, 'zoc-range', 'small');
  const mover = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'mover', movementPointsLeft: 2 };
  const enemy = { ...createUnit('warrior', 'ai-1', { q: 2, r: -1 }, mkC()), id: 'enemy' };
  state.units = { mover, enemy };
  state.civilizations.player.units = ['mover'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  for (const key of ['0,0', '1,0', '2,0', '2,-1']) {
    state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
  }
  return state;
}

describe('getMovementRangeDetails zone of control', () => {
  it('keeps the legal entry but does not extend movement beyond it', () => {
    const state = zocRangeState();
    const range = getMovementRangeDetails(state, 'mover');

    expect(range.reachable.map(hexKey)).toContain('1,0');
    expect(range.zocLimited.map(hexKey)).toContain('1,0');
    expect(range.reachable.map(hexKey)).not.toContain('2,0');
  });
});

// #843: an undefended (no garrison unit) foreign city radiates no Zone of Control,
// unlike a hostile unit -- these tests prove the BFS treats it as a blocking obstacle
// anyway, via getBlockingMapEntityAt/getBlockingMapEntityKeys, instead of ordinary
// walkable terrain. The city always sits at (2,0); `moverPosition` controls whether the
// mover starts already adjacent to it (1,0) or 2+ hexes away (0,0).
//
// IMPORTANT (found during implementation, see #843 plan Task 6 correction): a blocking
// entity's own tile must behave EXACTLY like a hostile unit's tile under Zone of Control --
// reachable ONLY when the mover is already directly adjacent to it *before* this action,
// never via "I have enough movement points to get within striking distance." An earlier
// version of this fix added the city to `reachable` whenever the BFS visited it regardless
// of hop count (matching only "don't walk past it", not "don't treat it as reachable from
// far away"), which left the original bug half-fixed: a mover 2 hexes away with 3 movement
// points still saw the city highlighted as reachable, and tapping it still produced the
// "Move adjacent, then use the city assault action" rejection instead of a plain move --
// the exact symptom from the original report. The regression tests below assert the
// corrected, adjacency-gated behavior; a prior version of this file asserted the opposite
// (that the city stays reachable from 2+ hexes away) and that assertion was itself the bug.
function undefendedCityRangeState(
  moverPosition: { q: number; r: number } = { q: 0, r: 0 },
  movementPointsLeft = 3,
): GameState {
  const state = createNewGame(undefined, 'undefended-city-range', 'small');
  const mover = { ...createUnit('scout', 'player', moverPosition, mkC()), id: 'mover', movementPointsLeft };
  state.units = { mover };
  state.civilizations.player.units = ['mover'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  for (const key of ['0,0', '1,0', '2,0', '3,0']) {
    state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
  }
  const city = foundCity('ai-1', { q: 2, r: 0 }, state.map, state.idCounters);
  city.id = 'undefended-city';
  state.cities = { [city.id]: city };
  state.civilizations['ai-1'].cities = [city.id];
  return state;
}

describe('#843 getMovementRangeDetails vs undefended foreign city', () => {
  it('marks an already-adjacent undefended enemy city reachable but does not walk past it', () => {
    // Exactly 1 movement point -- just enough to step onto the city, with no budget left
    // over to reach (3,0) by some unrelated route that never touches the city. This isolates
    // "walked through the city" from "took a legal detour with leftover movement."
    const state = undefendedCityRangeState({ q: 1, r: 0 }, 1); // adjacent to the city at (2,0)
    const range = getMovementRangeDetails(state, 'mover');
    const keys = range.reachable.map(hexKey);

    expect(keys).toContain('2,0'); // the city itself, reachable for assault
    expect(keys).not.toContain('3,0'); // BFS must not walk through the city
  });

  it('does NOT mark a 2+-hexes-away undefended city reachable, even with enough movement to approach it', () => {
    // This is the exact reported scenario: 2 hexes from the city with 3 movement points --
    // enough to reach adjacency this turn, but the city must not be shown/treated as
    // reachable until the mover is actually standing next to it.
    const state = undefendedCityRangeState({ q: 0, r: 0 });
    const range = getMovementRangeDetails(state, 'mover');
    const keys = range.reachable.map(hexKey);

    expect(keys).toContain('1,0'); // the ordinary approach tile remains a normal move
    expect(keys).not.toContain('2,0'); // the city itself must not be "reachable" yet
    expect(keys).not.toContain('3,0'); // and definitely not anything beyond it
  });

  it('does not mark the city zoc-limited (it is blocked by the city, not ZOC)', () => {
    const state = undefendedCityRangeState({ q: 1, r: 0 });
    const range = getMovementRangeDetails(state, 'mover');
    expect(range.zocLimited.map(hexKey)).not.toContain('2,0');
  });

  it('leaves an allied foreign city fully passable, matching validateUnitMove', () => {
    const state = undefendedCityRangeState({ q: 0, r: 0 });
    state.civilizations.player.diplomacy.treaties.push({
      type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: 5,
    });
    const range = getMovementRangeDetails(state, 'mover');
    const keys = range.reachable.map(hexKey);

    expect(keys).toContain('2,0');
    expect(keys).toContain('3,0'); // BFS walks straight through an allied city
  });
});

describe('#843 getMovementRange vs undefended foreign city (blockingKeys param)', () => {
  it('remains unfixed for callers that omit blockingKeys entirely (back-compat)', () => {
    // Existing callers that never pass blockingKeys keep their old (buggy) behavior --
    // this documents that omitting the param is a structural no-op, not a silent fix, so a
    // future caller of getMovementRange must opt in via blockingKeys to get the #843 fix.
    const state = undefendedCityRangeState({ q: 0, r: 0 });
    const unit = state.units.mover;
    const occupancy = { unitIdsByHex: {}, ownersByUnitId: {} };
    const range = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId, undefined, {});
    expect(range.map(hexKey)).toContain('3,0');
  });

  it('includes the city only when the mover starts directly adjacent to it', () => {
    const state = undefendedCityRangeState({ q: 1, r: 0 }, 1);
    const unit = state.units.mover;
    const occupancy = { unitIdsByHex: {}, ownersByUnitId: {} };
    const blockingKeys = getBlockingMapEntityKeys(state, unit);
    expect(blockingKeys.has('2,0')).toBe(true);

    const range = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId, undefined, {}, blockingKeys);
    const keys = range.map(hexKey);
    expect(keys).toContain('2,0');
    expect(keys).not.toContain('3,0');
  });

  it('excludes the city entirely when the mover is 2+ hexes away, even with blockingKeys supplied', () => {
    const state = undefendedCityRangeState({ q: 0, r: 0 });
    const unit = state.units.mover;
    const occupancy = { unitIdsByHex: {}, ownersByUnitId: {} };
    const blockingKeys = getBlockingMapEntityKeys(state, unit);

    const range = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId, undefined, {}, blockingKeys);
    const keys = range.map(hexKey);
    expect(keys).not.toContain('2,0');
    expect(keys).not.toContain('3,0');
  });
});

describe('#843 getBlockingMapEntityAt', () => {
  it('reports the foreign city at its own coordinate regardless of the mover\'s distance from it', () => {
    // getBlockingMapEntityAt itself is a pure "is this coordinate blocking" lookup with no
    // adjacency concept -- the distance gate lives in the BFS callers (getMovementRange/
    // getMovementRangeDetails), not here, so this must return the same result regardless of
    // where the mover currently stands.
    const state = undefendedCityRangeState({ q: 0, r: 0 });
    const unit = state.units.mover;
    expect(getBlockingMapEntityAt(state, unit, { q: 2, r: 0 })).toEqual({
      reason: 'foreign-city', entityId: 'undefended-city',
    });
  });

  it('returns null for a coordinate with no city', () => {
    const state = undefendedCityRangeState();
    const unit = state.units.mover;
    expect(getBlockingMapEntityAt(state, unit, { q: 1, r: 0 })).toBeNull();
  });

  it('returns null for an allied foreign city', () => {
    const state = undefendedCityRangeState();
    state.civilizations.player.diplomacy.treaties.push({
      type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: 5,
    });
    const unit = state.units.mover;
    expect(getBlockingMapEntityAt(state, unit, { q: 2, r: 0 })).toBeNull();
  });

  it('returns null for the unit\'s own city', () => {
    const state = undefendedCityRangeState();
    state.cities['undefended-city']!.owner = 'player';
    const unit = state.units.mover;
    expect(getBlockingMapEntityAt(state, unit, { q: 2, r: 0 })).toBeNull();
  });

  // #843 root-cause review: the bug applies identically to minor-civ (city-state) cities, not
  // just major-civ ones -- resolveSelectedUnitTapIntent's cityAtTarget lookup is generic across
  // state.cities regardless of owner kind, and so is getBlockingMapEntityAt. This was asserted
  // in the root-cause writeup but never had its own automated proof; this closes that gap.
  it('blocks an undefended minor-civ (city-state) city the same as a major-civ one', () => {
    const state = undefendedCityRangeState({ q: 0, r: 0 });
    state.cities['undefended-city']!.owner = 'mc-warriors';
    const unit = state.units.mover;

    expect(getBlockingMapEntityAt(state, unit, { q: 2, r: 0 })).toEqual({
      reason: 'foreign-city', entityId: 'undefended-city',
    });
    expect(getMovementRangeDetails(state, 'mover').reachable.map(hexKey)).not.toContain('2,0');
  });
});

// #843 hot-seat regression: blocking must key off the ACTING unit's owner, never
// state.currentPlayer (CLAUDE.md's Hot Seat rule -- "NEVER hardcode ownership checks,
// always use the acting unit's owner"). Two human-controlled civs share the device and
// take turns; state.currentPlayer flips between their turns. Civ B's undefended city must
// block civ A's unit identically regardless of which civ's seat happens to be active when
// the check runs.
function hotSeatCityBlockState(activePlayer: 'civ-a' | 'civ-b'): GameState {
  const state = createNewGame(undefined, 'hot-seat-city-block', 'small');
  state.hotSeat = {
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Player One', slotId: 'civ-a', civType: 'rome', isHuman: true },
      { name: 'Player Two', slotId: 'civ-b', civType: 'egypt', isHuman: true },
    ],
  };
  state.currentPlayer = activePlayer;
  for (const key of ['0,0', '1,0', '2,0']) {
    state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
  }
  const mover = { ...createUnit('scout', 'civ-a', { q: 0, r: 0 }, mkC()), id: 'mover', movementPointsLeft: 1 };
  state.units = { mover };
  state.civilizations['civ-a'] = {
    ...state.civilizations.player, id: 'civ-a', name: 'Civ A', isHuman: true, units: ['mover'], cities: [],
  };
  state.civilizations['civ-b'] = {
    ...state.civilizations['ai-1'], id: 'civ-b', name: 'Civ B', isHuman: true, units: [], cities: [],
  };
  delete state.civilizations.player;
  delete state.civilizations['ai-1'];
  state.civilizations['civ-a'].diplomacy.atWarWith = ['civ-b'];
  state.civilizations['civ-b'].diplomacy.atWarWith = ['civ-a'];
  const city = foundCity('civ-b', { q: 1, r: 0 }, state.map, state.idCounters);
  city.id = 'civ-b-city';
  state.cities = { [city.id]: city };
  state.civilizations['civ-b'].cities = [city.id];
  return state;
}

describe('#843 hot-seat: blocking follows the acting unit\'s owner, not state.currentPlayer', () => {
  it('blocks civ A\'s unit from civ B\'s undefended city while civ A\'s seat is active', () => {
    const state = hotSeatCityBlockState('civ-a');
    const unit = state.units.mover;
    expect(getBlockingMapEntityAt(state, unit, { q: 1, r: 0 })).toEqual({
      reason: 'foreign-city', entityId: 'civ-b-city',
    });
    expect(getMovementRangeDetails(state, 'mover').reachable.map(hexKey)).toContain('1,0');
  });

  it('gives the identical result once civ B\'s seat becomes active, for the same civ-A unit', () => {
    // Only state.currentPlayer changes between these two states -- the acting unit (civ A's
    // scout) and its owner are identical. A currentPlayer-keyed implementation would (wrongly)
    // change its answer here; an owner-keyed one must not.
    const stillCivAsTurn = hotSeatCityBlockState('civ-a');
    const nowCivBsTurn = hotSeatCityBlockState('civ-b');
    const unitDuringA = stillCivAsTurn.units.mover;
    const unitDuringB = nowCivBsTurn.units.mover;

    expect(getBlockingMapEntityAt(nowCivBsTurn, unitDuringB, { q: 1, r: 0 }))
      .toEqual(getBlockingMapEntityAt(stillCivAsTurn, unitDuringA, { q: 1, r: 0 }));
    expect(getMovementRangeDetails(nowCivBsTurn, 'mover').reachable.map(hexKey))
      .toEqual(getMovementRangeDetails(stillCivAsTurn, 'mover').reachable.map(hexKey));
  });
});

// #845: the same hot-seat requirement, but for barbarian camps -- both hot-seat civs
// (neither of which is 'barbarian') must be blocked identically by the same undefended camp
// regardless of which civ's seat is currently active.
function hotSeatCampBlockState(activePlayer: 'civ-a' | 'civ-b'): GameState {
  const state = createNewGame(undefined, 'hot-seat-camp-block', 'small');
  state.hotSeat = {
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Player One', slotId: 'civ-a', civType: 'rome', isHuman: true },
      { name: 'Player Two', slotId: 'civ-b', civType: 'egypt', isHuman: true },
    ],
  };
  state.currentPlayer = activePlayer;
  for (const key of ['0,0', '1,0', '2,0']) {
    state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
  }
  const mover = { ...createUnit('scout', 'civ-a', { q: 0, r: 0 }, mkC()), id: 'mover', movementPointsLeft: 1 };
  state.units = { mover };
  state.civilizations['civ-a'] = {
    ...state.civilizations.player, id: 'civ-a', name: 'Civ A', isHuman: true, units: ['mover'], cities: [],
  };
  state.civilizations['civ-b'] = {
    ...state.civilizations['ai-1'], id: 'civ-b', name: 'Civ B', isHuman: true, units: [], cities: [],
  };
  delete state.civilizations.player;
  delete state.civilizations['ai-1'];
  // Clear the procedurally-generated cities from createNewGame's default 'player'/'ai-1'
  // civs -- otherwise one may sit at/near (1,0) and shadow the camp this test cares about.
  state.cities = {};
  state.barbarianCamps = {
    'camp-1': { id: 'camp-1', position: { q: 1, r: 0 }, strength: 10, spawnCooldown: 3 },
  };
  return state;
}

describe('#845 hot-seat: camp blocking follows the acting unit\'s owner, not state.currentPlayer', () => {
  it('blocks civ A\'s unit from an undefended camp while civ A\'s seat is active', () => {
    const state = hotSeatCampBlockState('civ-a');
    const unit = state.units.mover;
    expect(getBlockingMapEntityAt(state, unit, { q: 1, r: 0 })).toEqual({
      reason: 'barbarian-camp', entityId: 'camp-1',
    });
  });

  it('gives the identical result once civ B\'s seat becomes active, for the same civ-A unit', () => {
    const stillCivAsTurn = hotSeatCampBlockState('civ-a');
    const nowCivBsTurn = hotSeatCampBlockState('civ-b');
    const unitDuringA = stillCivAsTurn.units.mover;
    const unitDuringB = nowCivBsTurn.units.mover;

    expect(getBlockingMapEntityAt(nowCivBsTurn, unitDuringB, { q: 1, r: 0 }))
      .toEqual(getBlockingMapEntityAt(stillCivAsTurn, unitDuringA, { q: 1, r: 0 }));
    expect(getMovementRangeDetails(nowCivBsTurn, 'mover').reachable.map(hexKey))
      .toEqual(getMovementRangeDetails(stillCivAsTurn, 'mover').reachable.map(hexKey));
  });
});

function createWrappedGrasslandMap(width: number, height: number): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r },
        terrain: 'grassland',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }

  return {
    width,
    height,
    wrapsHorizontally: true,
    tiles,
    rivers: [],
  };
}

function createStackCorridorMap(): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 5; q++) {
    for (let r = 0; r < 3; r++) {
      const isCorridor = r === 1 && q >= 1 && q <= 3;
      tiles[hexKey({ q, r })] = {
        coord: { q, r },
        terrain: isCorridor ? 'grassland' : 'mountain',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }

  return {
    width: 5,
    height: 3,
    wrapsHorizontally: false,
    tiles,
    rivers: [],
  };
}

function createRiverDetourMap(): GameMap {
  const coords = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 0, r: 1 },
    { q: 1, r: 1 },
  ];
  const tiles = Object.fromEntries(coords.map(coord => [hexKey(coord), {
    coord,
    terrain: 'grassland' as const,
    elevation: 'lowland' as const,
    resource: null,
    improvement: 'none' as const,
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  }]));

  return {
    width: 3,
    height: 2,
    wrapsHorizontally: false,
    tiles,
    rivers: [
      { from: { q: 0, r: 0 }, to: { q: 1, r: 0 } },
      { from: { q: 1, r: 0 }, to: { q: 2, r: 0 } },
    ],
  };
}

describe('createUnit', () => {
  it('creates a unit with full movement points', () => {
    const unit = createUnit('warrior', 'p1', { q: 5, r: 5 }, mkC());
    expect(unit.type).toBe('warrior');
    expect(unit.owner).toBe('p1');
    expect(unit.position).toEqual({ q: 5, r: 5 });
    expect(unit.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(unit.health).toBe(100);
  });

  it('creates workers with two default charges', () => {
    const worker = createUnit('worker', 'player', { q: 0, r: 0 }, mkC());

    expect(worker.chargesRemaining).toBe(2);
  });

  it('applies a persistent viking movement bonus', () => {
    const unit = createUnit(
      'warrior',
      'p1',
      { q: 5, r: 5 },
      mkC(),
      { type: 'naval_raiding', movementBonus: 1, coastalVisionBonus: 1 },
    );
    expect(unit.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints + 1);
    expect(resetUnitTurn(unit).movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints + 1);
  });
});

describe('resetUnitTurn (#542 revealedThisTurn clearing)', () => {
  it('clears revealedThisTurn, matching how skippedTurn and interceptedTurn already clear', () => {
    const unit = { ...createUnit('submarine', 'p1', { q: 0, r: 0 }, mkC()), revealedThisTurn: true as const };

    expect(resetUnitTurn(unit).revealedThisTurn).toBeUndefined();
  });

  it('leaves a submarine with no revealedThisTurn set unaffected', () => {
    const unit = createUnit('submarine', 'p1', { q: 0, r: 0 }, mkC());

    expect(resetUnitTurn(unit).revealedThisTurn).toBeUndefined();
  });
});

describe('hostile-only unit definitions', () => {
  function unexpectedUntrainableTypes(
    definitions: Record<string, { productionCost: number }>,
    trainableTypes: Set<string>,
  ): string[] {
    return Object.entries(definitions)
      .filter(([type]) => !trainableTypes.has(type))
      .filter(([type, definition]) =>
        definition.productionCost !== 0 || (!type.startsWith('beast_') && !type.startsWith('pirate_')),
      )
      .map(([type]) => type)
      .sort();
  }

  // era-12 units: both cyber_unit and stealth_bomber are now in TRAINABLE_UNITS (Task 3)
  const ERA_12_PENDING_TRAINABLE: Set<string> = new Set([]);

  it('permits only explicit beast and pirate zero-cost units outside city training', () => {
    const trainableTypes = new Set([
      ...TRAINABLE_UNITS.map(unit => unit.type),
      ...ERA_12_PENDING_TRAINABLE,
    ]);
    expect(unexpectedUntrainableTypes(UNIT_DEFINITIONS, trainableTypes)).toEqual([]);
    for (const type of PIRATE_HULL_TYPES) expect(trainableTypes.has(type)).toBe(false);
  });

  it('still rejects an ordinary zero-cost unit omitted from the trainable catalog', () => {
    const trainableTypes = new Set(TRAINABLE_UNITS.map(unit => unit.type));
    expect(unexpectedUntrainableTypes({
      ...UNIT_DEFINITIONS,
      forgotten_patrol_boat: { productionCost: 0 },
    }, trainableTypes)).toContain('forgotten_patrol_boat');
  });
});

describe('getUnmovedUnits', () => {
  it('excludes loaded cargo and busy workers from units needing orders', () => {
    const idleWarrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    idleWarrior.id = 'idle-warrior';
    const busyWorker = createUnit('worker', 'player', { q: 1, r: 0 }, mkC());
    busyWorker.id = 'busy-worker';
    busyWorker.workerTask = { action: 'farm', coord: { q: 1, r: 0 } };
    const loadedWarrior = createUnit('warrior', 'player', { q: 2, r: 0 }, mkC());
    loadedWarrior.id = 'loaded-warrior';
    loadedWarrior.transportId = 'transport-1';

    expect(getUnmovedUnits({
      [idleWarrior.id]: idleWarrior,
      [busyWorker.id]: busyWorker,
      [loadedWarrior.id]: loadedWarrior,
    }, 'player').map(unit => unit.id)).toEqual(['idle-warrior']);
  });

  it('excludes aircraft that are assigned to an air base from units needing orders', () => {
    const basedBiplane = createUnit('biplane', 'player', { q: 0, r: 0 }, mkC());
    basedBiplane.id = 'based-biplane';
    basedBiplane.airBase = { kind: 'city', cityId: 'airfield' };

    expect(getUnmovedUnits({ [basedBiplane.id]: basedBiplane }, 'player')).toEqual([]);
  });
});

describe('getMovementRange', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'move-test');
  });

  it('returns reachable hexes for a unit', () => {
    const landTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' || t.terrain === 'plains'
    )!;
    const unit = createUnit('scout', 'p1', landTile.coord, mkC());
    const range = getMovementRange(unit, map, {});
    expect(range.length).toBeGreaterThan(0);
    expect(range.length).toBeGreaterThanOrEqual(1);
  });

  it('includes enemy-occupied tiles in range for attack', () => {
    const landTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' || t.terrain === 'plains'
    )!;
    const unit = createUnit('warrior', 'p1', landTile.coord, mkC());
    // Find a neighbor tile that's also passable
    const neighborTiles = Object.values(map.tiles).filter(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Math.abs(t.coord.q - landTile.coord.q) + Math.abs(t.coord.r - landTile.coord.r) <= 2
    );
    const enemyTile = neighborTiles.find(t => hexKey(t.coord) !== hexKey(landTile.coord));
    if (!enemyTile) return;

    const enemyKey = hexKey(enemyTile.coord);
    const unitPositions: Record<string, string> = {
      [hexKey(landTile.coord)]: unit.id,
      [enemyKey]: 'enemy1',
    };
    const unitOwners: Record<string, string> = {
      [unit.id]: 'p1',
      'enemy1': 'barbarian',
    };
    const range = getMovementRange(unit, map, unitPositions, unitOwners);
    const keys = range.map(h => hexKey(h));
    expect(keys).toContain(enemyKey);
  });

  it('includes same-owner occupied tiles as stackable movement destinations', () => {
    const map = createWrappedGrasslandMap(5, 3);
    const unit = createUnit('warrior', 'p1', { q: 1, r: 1 }, mkC());
    const friendly = createUnit('worker', 'p1', { q: 2, r: 1 }, mkC());
    friendly.id = 'friendly-worker';

    const range = getMovementRange(unit, map, {
      [hexKey(unit.position)]: [unit.id],
      [hexKey(friendly.position)]: [friendly.id],
    }, {
      [unit.id]: 'p1',
      [friendly.id]: 'p1',
    });

    expect(range.map(hexKey)).toContain('2,1');
  });

  it('can path through same-owner stacks but not through hostile stacks', () => {
    const map = createStackCorridorMap();
    const unit = createUnit('scout', 'p1', { q: 1, r: 1 }, mkC());

    const friendlyRange = getMovementRange(unit, map, {
      [hexKey(unit.position)]: [unit.id],
      '2,1': ['friendly-warrior'],
    }, {
      [unit.id]: 'p1',
      'friendly-warrior': 'p1',
    });

    const hostileRange = getMovementRange(unit, map, {
      [hexKey(unit.position)]: [unit.id],
      '2,1': ['enemy-warrior'],
    }, {
      [unit.id]: 'p1',
      'enemy-warrior': 'ai-1',
    });

    expect(friendlyRange.map(hexKey)).toContain('3,1');
    expect(hostileRange.map(hexKey)).toContain('2,1');
    expect(hostileRange.map(hexKey)).not.toContain('3,1');
  });

  it('does not include impassable tiles', () => {
    const landTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland'
    )!;
    const unit = createUnit('warrior', 'p1', landTile.coord, mkC());
    const range = getMovementRange(unit, map, {});
    for (const hex of range) {
      const tile = map.tiles[hexKey(hex)];
      if (tile) {
        expect(tile.terrain).not.toBe('ocean');
        expect(tile.terrain).not.toBe('mountain');
      }
    }
  });
});

describe('getMovementRange river awareness', () => {
  it('excludes a tile 2 steps away when a river crossing consumes all remaining MP', () => {
    // Warrior has 2 MP. Plains-plains path with river between step 0 and step 1:
    //   {0,0}→{1,0}: terrain 1 + river 1 = 2 MP → 0 remaining
    // Then {1,0}→{2,0}: needs 1 more MP but none left → {2,0} must NOT be highlighted
    const map = createWrappedGrasslandMap(5, 5);
    map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const range = getMovementRange(warrior, map, {});
    const keys = range.map(hexKey);
    expect(keys).toContain('1,0'); // adjacent river step still reachable (uses all 2 MP)
    expect(keys).not.toContain('2,0'); // 3 MP needed (terrain 1 + river 1 + terrain 1) > 2 available
  });

  it('includes the 2-step tile when bridge-building removes the river crossing penalty', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    // With bridge-building: step 1 costs 1 (no river penalty) + step 2 costs 1 = 2 total = reachable
    const range = getMovementRange(warrior, map, {}, undefined, undefined, { completedTechs: ['bridge-building'] });
    const keys = range.map(hexKey);
    expect(keys).toContain('2,0');
  });

  it('naval units are never penalised for river crossings', () => {
    // Galley is a naval unit — it never pays the +1 river crossing cost
    const map = createWrappedGrasslandMap(5, 5);
    // Make all tiles coast so the galley can enter them
    for (const key of Object.keys(map.tiles)) {
      map.tiles[key] = { ...map.tiles[key]!, terrain: 'coast' };
    }
    map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];
    const galley = createUnit('galley', 'p1', { q: 0, r: 0 }, mkC());
    const range = getMovementRange(galley, map, {});
    const keys = range.map(hexKey);
    // Galley has multiple MP; regardless, crossing the river edge should not cost extra
    expect(keys).toContain('1,0');
    expect(keys).toContain('2,0'); // reachable because no river penalty for naval
  });
});

describe('moveUnit', () => {
  it('updates unit position and deducts movement', () => {
    const unit = createUnit('scout', 'p1', { q: 5, r: 5 }, mkC());
    const moved = moveUnit(unit, { q: 6, r: 5 }, 1);
    expect(moved.position).toEqual({ q: 6, r: 5 });
    expect(moved.movementPointsLeft).toBe(unit.movementPointsLeft - 1);
    expect(moved.hasMoved).toBe(true);
  });
});

describe('getMovementBlockerReason', () => {
  it('scout can enter an adjacent mountain tile via forced march (mountains now passable)', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.tiles['2,2'] = { ...map.tiles['2,2'], terrain: 'mountain' };
    const scout = createUnit('scout', 'player', { q: 2, r: 1 }, mkC());

    // Mountain cost is 4 but scout is adjacent with ≥1 movement — forced march allows it
    expect(getMovementBlockerReason(scout, { q: 2, r: 2 }, map)).toBeNull();
  });

  it('uses a distinct reason for land units tapping water', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.tiles['2,2'] = { ...map.tiles['2,2'], terrain: 'coast' };
    const scout = createUnit('scout', 'player', { q: 2, r: 1 }, mkC());

    expect(getMovementBlockerReason(scout, { q: 2, r: 2 }, map)?.code).toBe('impassable-water');
  });

  it('explains a passable destination that costs more movement than remains', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const scout = createUnit('scout', 'player', { q: 0, r: 0 }, mkC());
    scout.movementPointsLeft = 1;

    expect(getMovementBlockerReason(scout, { q: 2, r: 0 }, map)?.code).toBe('insufficient-movement');
  });

  it('explains when a river crossing makes a multi-step move too expensive', () => {
    const map = createStackCorridorMap();
    const warrior = createUnit('warrior', 'player', { q: 1, r: 1 }, mkC());
    map.rivers = [{ from: { q: 1, r: 1 }, to: { q: 2, r: 1 } }];

    expect(getMovementBlockerReason(warrior, { q: 3, r: 1 }, map)?.code)
      .toBe('insufficient-movement');
  });

  it('uses the scouting message for an unexplored tapped tile', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const scout = createUnit('scout', 'player', { q: 2, r: 1 }, mkC());

    expect(getMovementBlockerReason(scout, { q: 2, r: 2 }, map, { visibilityState: 'unexplored' })).toEqual({
      code: 'unexplored',
      message: 'Too far away to spot.',
    });
  });

  it('blocks a coastal-only Transport from ocean regardless of completed techs', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.tiles['0,0'] = { ...map.tiles['0,0'], terrain: 'coast' };
    map.tiles['1,0'] = { ...map.tiles['1,0'], terrain: 'coast' };
    map.tiles['2,0'] = { ...map.tiles['2,0'], terrain: 'ocean' };
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkC());

    expect(getMovementBlockerReason(transport, { q: 1, r: 0 }, map)).toBeNull();
    expect(
      getMovementBlockerReason(transport, { q: 2, r: 0 }, map, { completedTechs: ['galleys', 'celestial-navigation'] })?.code,
    ).toBe('requires-ocean-hull');
  });

  // #843: before this, getMovementBlockerReason had no 'foreign-city' code at all, even
  // though UnitMoveValidationResult's reason type did -- masked because canMove was
  // wrongly true for these tiles pre-fix, so this branch was never reached. Now that Task 1
  // correctly excludes far-away city tiles from movementRange, a tap on one falls into the
  // blocked-movement path and must get the same message validateUnitMove would give.
  it('reports the foreign-city reason when the caller supplies a blocking entity', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const scout = createUnit('scout', 'player', { q: 0, r: 0 }, mkC());

    expect(getMovementBlockerReason(scout, { q: 2, r: 0 }, map, {
      blockingEntity: { reason: 'foreign-city', entityId: 'some-city' },
    })).toEqual({
      code: 'foreign-city',
      message: 'Move adjacent, then use the city assault action.',
    });
  });

  it('takes the blocking-entity reason over an otherwise-passable tile', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const scout = createUnit('scout', 'player', { q: 0, r: 0 }, mkC());
    // Adjacent + passable would otherwise return null (forced march) -- the blocking entity
    // must still win.
    expect(getMovementBlockerReason(scout, { q: 1, r: 0 }, map, {
      blockingEntity: { reason: 'foreign-city', entityId: 'some-city' },
    })?.code).toBe('foreign-city');
  });

  it('falls through to normal terrain logic when no blocking entity is supplied', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const scout = createUnit('scout', 'player', { q: 0, r: 0 }, mkC());
    expect(getMovementBlockerReason(scout, { q: 1, r: 0 }, map, { blockingEntity: null })).toBeNull();
  });
});

describe('findPath', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'path-test');
  });

  it('finds path between adjacent land tiles', () => {
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain === 'grassland' || t.terrain === 'plains'
    );
    if (landTiles.length < 2) return;

    const path = findPath(landTiles[0].coord, landTiles[1].coord, map);
    if (path) {
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(landTiles[0].coord);
      expect(path[path.length - 1]).toEqual(landTiles[1].coord);
    }
  });

  it('returns null for unreachable destination', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const oceanTile = Object.values(map.tiles).find(t => t.terrain === 'ocean')!;
    if (landTile && oceanTile) {
      const path = findPath(landTile.coord, oceanTile.coord, map);
      expect(path).toBeNull();
    }
  });

  it('finds the shortest wrapped path across the map edge', () => {
    const wrappedMap = createWrappedGrasslandMap(5, 3);
    const path = findPath({ q: 0, r: 1 }, { q: 4, r: 1 }, wrappedMap);
    expect(path).toEqual([{ q: 0, r: 1 }, { q: 4, r: 1 }]);
  });

  it('prefers a longer route when it avoids more expensive river crossings', () => {
    const riverMap = createRiverDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());

    const path = findPath(warrior.position, { q: 2, r: 0 }, riverMap, 'land', { unit: warrior });

    expect(path).toEqual([
      { q: 0, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 0 },
    ]);
  });

  it('takes the shorter river route after Bridge Building removes the surcharge', () => {
    const riverMap = createRiverDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());

    const path = findPath(warrior.position, { q: 2, r: 0 }, riverMap, 'land', {
      unit: warrior,
      completedTechs: ['bridge-building'],
    });

    expect(path).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });
});

describe('wrapped movement', () => {
  it('includes horizontally wrapped neighbors in movement range', () => {
    const wrappedMap = createWrappedGrasslandMap(5, 3);
    const unit = createUnit('warrior', 'p1', { q: 0, r: 1 }, mkC());
    const range = getMovementRange(unit, wrappedMap, {});
    expect(range).toContainEqual({ q: 4, r: 1 });
  });
});

describe('resetUnitTurn', () => {
  it('restores movement points and clears flags', () => {
    let unit = createUnit('warrior', 'p1', { q: 5, r: 5 }, mkC());
    unit = moveUnit(unit, { q: 6, r: 5 }, 1);
    expect(unit.hasMoved).toBe(true);

    const reset = resetUnitTurn(unit);
    expect(reset.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(reset.hasMoved).toBe(false);
    expect(reset.hasActed).toBe(false);
  });

  it('keeps worker acted and immobile when it has an active workerTask', () => {
    const worker = createUnit('worker', 'p1', { q: 0, r: 0 }, mkC());
    const workerWithTask = {
      ...worker,
      workerTask: { action: 'farm' as const, coord: { q: 0, r: 0 } },
    };

    const reset = resetUnitTurn(workerWithTask);

    expect(reset.hasActed).toBe(true);
    expect(reset.movementPointsLeft).toBe(0);
    expect(reset.workerTask).toBeDefined();
  });

  it('restores worker movement once workerTask is cleared', () => {
    const worker = createUnit('worker', 'p1', { q: 0, r: 0 }, mkC());
    const workerNoTask = { ...worker, workerTask: undefined };

    const reset = resetUnitTurn(workerNoTask);

    expect(reset.hasActed).toBe(false);
    expect(reset.movementPointsLeft).toBe(UNIT_DEFINITIONS.worker.movementPoints);
  });
});

describe('skippedTurn cycling flag', () => {
  it('excludes skipped units from unmoved cycling without treating skip as movement or action', () => {
    const skipped = {
      ...createUnit('scout', 'player', { q: 2, r: 2 }, mkC()),
      id: 'unit-skipped',
      skippedTurn: true,
      movementPointsLeft: 0,
    };
    const fresh = {
      ...createUnit('warrior', 'player', { q: 3, r: 2 }, mkC()),
      id: 'unit-fresh',
    };

    const unmoved = getUnmovedUnits({ [skipped.id]: skipped, [fresh.id]: fresh }, 'player');

    expect(unmoved.map(unit => unit.id)).toEqual(['unit-fresh']);
    expect(skipped.hasMoved).toBe(false);
    expect(skipped.hasActed).toBe(false);
  });

  it('still allows passive healing for a skipped unit that did not move or act', () => {
    const skipped = {
      ...createUnit('scout', 'player', { q: 2, r: 2 }, mkC()),
      health: 50,
      skippedTurn: true,
      movementPointsLeft: 0,
    };

    const healed = healUnit(skipped, false, false);

    expect(healed.health).toBe(55);
  });

  it('clears skippedTurn during turn reset', () => {
    const skipped = {
      ...createUnit('scout', 'player', { q: 2, r: 2 }, mkC()),
      skippedTurn: true,
      movementPointsLeft: 0,
    };

    const reset = resetUnitTurn(skipped);

    expect(reset.skippedTurn).toBeUndefined();
    expect(reset.movementPointsLeft).toBe(UNIT_DEFINITIONS.scout.movementPoints);
  });
});

describe('new unit types', () => {
  it('swordsman has correct stats', () => {
    const unit = createUnit('swordsman', 'player', { q: 0, r: 0 }, mkC());
    expect(unit.type).toBe('swordsman');
    expect(UNIT_DEFINITIONS.swordsman.strength).toBe(25);
    expect(UNIT_DEFINITIONS.swordsman.movementPoints).toBe(2);
    expect(UNIT_DEFINITIONS.swordsman.visionRange).toBe(2);
    expect(UNIT_DEFINITIONS.swordsman.productionCost).toBe(50);
  });

  it('pikeman has correct stats', () => {
    const unit = createUnit('pikeman', 'player', { q: 0, r: 0 }, mkC());
    expect(unit.type).toBe('pikeman');
    expect(UNIT_DEFINITIONS.pikeman.strength).toBe(35);
    expect(UNIT_DEFINITIONS.pikeman.productionCost).toBe(70);
  });

  it('musketeer has correct stats', () => {
    const unit = createUnit('musketeer', 'player', { q: 0, r: 0 }, mkC());
    expect(unit.type).toBe('musketeer');
    expect(UNIT_DEFINITIONS.musketeer.strength).toBe(34);
    expect(UNIT_DEFINITIONS.musketeer.productionCost).toBe(90);
  });
});

describe('Expedition terrain movement (terrainCostOverrides)', () => {
  it('expedition has movement cost 1 on hills (override, default is 2)', () => {
    const def = UNIT_DEFINITIONS['expedition'];
    const cost = getMovementCostForUnit('hills', 'land', def.terrainCostOverrides);
    expect(cost).toBe(1);
  });

  it('expedition has movement cost 1 on mountains (override, default is 4)', () => {
    const def = UNIT_DEFINITIONS['expedition'];
    const cost = getMovementCostForUnit('mountain', 'land', def.terrainCostOverrides);
    expect(cost).toBe(1);
  });

  it('warriors pay the standard cost 4 for mountains (no override)', () => {
    const def = UNIT_DEFINITIONS['warrior'];
    const cost = getMovementCostForUnit('mountain', 'land', def.terrainCostOverrides);
    expect(cost).toBe(4);
  });

  it('warriors pay cost 2 for hills (no override)', () => {
    const def = UNIT_DEFINITIONS['warrior'];
    const cost = getMovementCostForUnit('hills', 'land', def.terrainCostOverrides);
    expect(cost).toBe(2);
  });
});

describe('findPathToCity (#553 MR1/4 — Trade Routes Overhaul)', () => {
  // Real cities are never founded on ocean/coast terrain (see map-generator.ts's
  // start-terrain filter) — they sit on land tiles merely adjacent to water. Plain
  // findPath(..., 'naval') can never reach a city's own land tile; findPathToCity must
  // dock at an adjacent ocean/coast neighbor and treat the city as one final step.
  function makeCoastalMap(): GameMap {
    const map = createWrappedGrasslandMap(5, 5);
    map.wrapsHorizontally = false;
    for (let r = 0; r < 5; r++) {
      map.tiles[hexKey({ q: 1, r })] = { ...map.tiles[hexKey({ q: 1, r })]!, terrain: 'ocean' };
    }
    return map;
  }

  it('land domain behaves exactly like findPath (delegates when direct path exists)', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const via = findPathToCity({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'land');
    const direct = findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'land');
    expect(via).toEqual(direct);
  });

  it('naval domain returns null when the destination city is not coastal (no adjacent water)', () => {
    const map = createWrappedGrasslandMap(5, 5); // no ocean anywhere
    const path = findPathToCity({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'naval');
    expect(path).toBeNull();
  });

  it('naval domain reaches a coastal city by docking at its nearest ocean/coast neighbor', () => {
    const map = makeCoastalMap();
    const path = findPathToCity({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'naval');
    expect(path).not.toBeNull();
    // Final step must be the city's own tile, even though that tile is grassland.
    expect(path![path!.length - 1]).toEqual({ q: 2, r: 0 });
  });

  it('naval domain still works when the destination city tile is itself coast/ocean (direct path short-circuit)', () => {
    const map = makeCoastalMap();
    map.tiles[hexKey({ q: 2, r: 0 })] = { ...map.tiles[hexKey({ q: 2, r: 0 })]!, terrain: 'coast' };
    const path = findPathToCity({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'naval');
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ q: 2, r: 0 });
  });

  it('air domain behaves exactly like findPath (delegates unconditionally)', () => {
    const map = createWrappedGrasslandMap(5, 5);
    const via = findPathToCity({ q: 0, r: 0 }, { q: 4, r: 4 }, map, 'air');
    const direct = findPath({ q: 0, r: 0 }, { q: 4, r: 4 }, map, 'air');
    expect(via).toEqual(direct);
  });
});
