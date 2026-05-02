import {
  createUnit,
  getMovementRange,
  moveUnit,
  findPath,
  resetUnitTurn,
  UNIT_DEFINITIONS,
} from '@/systems/unit-system';
import type { GameMap } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

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

describe('createUnit', () => {
  it('creates a unit with full movement points', () => {
    const unit = createUnit('warrior', 'p1', { q: 5, r: 5 });
    expect(unit.type).toBe('warrior');
    expect(unit.owner).toBe('p1');
    expect(unit.position).toEqual({ q: 5, r: 5 });
    expect(unit.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(unit.health).toBe(100);
  });

  it('applies a persistent viking movement bonus', () => {
    const unit = createUnit(
      'warrior',
      'p1',
      { q: 5, r: 5 },
      { type: 'naval_raiding', movementBonus: 1, coastalVisionBonus: 1 },
    );
    expect(unit.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints + 1);
    expect(resetUnitTurn(unit).movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints + 1);
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
    const unit = createUnit('scout', 'p1', landTile.coord);
    const range = getMovementRange(unit, map, {});
    expect(range.length).toBeGreaterThan(0);
    expect(range.length).toBeGreaterThanOrEqual(1);
  });

  it('includes enemy-occupied tiles in range for attack', () => {
    const landTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' || t.terrain === 'plains'
    )!;
    const unit = createUnit('warrior', 'p1', landTile.coord);
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
    const unit = createUnit('warrior', 'p1', { q: 1, r: 1 });
    const friendly = createUnit('worker', 'p1', { q: 2, r: 1 });
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
    const unit = createUnit('scout', 'p1', { q: 1, r: 1 });

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
    const unit = createUnit('warrior', 'p1', landTile.coord);
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

describe('moveUnit', () => {
  it('updates unit position and deducts movement', () => {
    const unit = createUnit('scout', 'p1', { q: 5, r: 5 });
    const moved = moveUnit(unit, { q: 6, r: 5 }, 1);
    expect(moved.position).toEqual({ q: 6, r: 5 });
    expect(moved.movementPointsLeft).toBe(unit.movementPointsLeft - 1);
    expect(moved.hasMoved).toBe(true);
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
});

describe('wrapped movement', () => {
  it('includes horizontally wrapped neighbors in movement range', () => {
    const wrappedMap = createWrappedGrasslandMap(5, 3);
    const unit = createUnit('warrior', 'p1', { q: 0, r: 1 });
    const range = getMovementRange(unit, wrappedMap, {});
    expect(range).toContainEqual({ q: 4, r: 1 });
  });
});

describe('resetUnitTurn', () => {
  it('restores movement points and clears flags', () => {
    let unit = createUnit('warrior', 'p1', { q: 5, r: 5 });
    unit = moveUnit(unit, { q: 6, r: 5 }, 1);
    expect(unit.hasMoved).toBe(true);

    const reset = resetUnitTurn(unit);
    expect(reset.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(reset.hasMoved).toBe(false);
    expect(reset.hasActed).toBe(false);
  });
});

describe('new unit types', () => {
  it('swordsman has correct stats', () => {
    const unit = createUnit('swordsman', 'player', { q: 0, r: 0 });
    expect(unit.type).toBe('swordsman');
    expect(UNIT_DEFINITIONS.swordsman.strength).toBe(25);
    expect(UNIT_DEFINITIONS.swordsman.movementPoints).toBe(2);
    expect(UNIT_DEFINITIONS.swordsman.visionRange).toBe(2);
    expect(UNIT_DEFINITIONS.swordsman.productionCost).toBe(50);
  });

  it('pikeman has correct stats', () => {
    const unit = createUnit('pikeman', 'player', { q: 0, r: 0 });
    expect(unit.type).toBe('pikeman');
    expect(UNIT_DEFINITIONS.pikeman.strength).toBe(35);
    expect(UNIT_DEFINITIONS.pikeman.productionCost).toBe(70);
  });

  it('musketeer has correct stats', () => {
    const unit = createUnit('musketeer', 'player', { q: 0, r: 0 });
    expect(unit.type).toBe('musketeer');
    expect(UNIT_DEFINITIONS.musketeer.strength).toBe(50);
    expect(UNIT_DEFINITIONS.musketeer.productionCost).toBe(90);
  });
});
