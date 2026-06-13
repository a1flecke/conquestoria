import {
  createUnit,
  getMovementRange,
  moveUnit,
  findPath,
  resetUnitTurn,
  UNIT_DEFINITIONS,
  getUnmovedUnits,
  healUnit,
  getMovementBlockerReason,
  getMovementCostForUnit,
} from '@/systems/unit-system';
import type { GameMap } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

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

  it('permits only explicit beast and pirate zero-cost units outside city training', () => {
    const trainableTypes = new Set(TRAINABLE_UNITS.map(unit => unit.type));
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

  it('uses distinct Transport tech blocker reasons for coast and ocean', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.tiles['0,0'] = { ...map.tiles['0,0'], terrain: 'coast' };
    map.tiles['1,0'] = { ...map.tiles['1,0'], terrain: 'coast' };
    map.tiles['2,0'] = { ...map.tiles['2,0'], terrain: 'ocean' };
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkC());

    expect(getMovementBlockerReason(transport, { q: 1, r: 0 }, map)?.code).toBe('requires-galleys');
    expect(getMovementBlockerReason(transport, { q: 2, r: 0 }, map, { completedTechs: ['galleys'] })?.code)
      .toBe('requires-celestial-navigation');
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
    expect(UNIT_DEFINITIONS.musketeer.strength).toBe(50);
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
