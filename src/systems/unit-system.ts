import type { UnitDefinition, UnitType, Unit, HexCoord, GameMap } from '@/core/types';
import { hexKey, hexNeighbors, hexDistance } from './hex-utils';

let nextUnitId = 1;

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  settler: {
    type: 'settler', name: 'Settler', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: true,
    canBuildImprovements: false, productionCost: 50,
  },
  worker: {
    type: 'worker', name: 'Worker', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: true, productionCost: 30,
  },
  scout: {
    type: 'scout', name: 'Scout', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 20,
  },
  warrior: {
    type: 'warrior', name: 'Warrior', movementPoints: 2,
    visionRange: 2, strength: 10, canFoundCity: false,
    canBuildImprovements: false, productionCost: 25,
  },
  archer: {
    type: 'archer', name: 'Archer', movementPoints: 2,
    visionRange: 2, strength: 15, canFoundCity: false,
    canBuildImprovements: false, productionCost: 35,
  },
  swordsman: {
    type: 'swordsman', name: 'Swordsman', movementPoints: 2,
    visionRange: 2, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 50,
  },
  pikeman: {
    type: 'pikeman', name: 'Pikeman', movementPoints: 2,
    visionRange: 2, strength: 35, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
  },
  musketeer: {
    type: 'musketeer', name: 'Musketeer', movementPoints: 2,
    visionRange: 2, strength: 50, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
  },
};

export function createUnit(type: UnitType, owner: string, position: HexCoord): Unit {
  return {
    id: `unit-${nextUnitId++}`,
    type,
    owner,
    position: { ...position },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
  };
}

export function resetUnitId(): void {
  nextUnitId = 1;
}

export function moveUnit(unit: Unit, to: HexCoord, cost: number): Unit {
  return {
    ...unit,
    position: { ...to },
    movementPointsLeft: unit.movementPointsLeft - cost,
    hasMoved: true,
  };
}

export function resetUnitTurn(unit: Unit): Unit {
  return {
    ...unit,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints,
    hasMoved: false,
    hasActed: false,
  };
}

function getMovementCost(terrain: string): number {
  const costs: Record<string, number> = {
    grassland: 1, plains: 1, desert: 1, tundra: 1,
    forest: 2, hills: 2, snow: 2,
    jungle: 2, swamp: 2, volcanic: 2,
    mountain: Infinity, ocean: Infinity, coast: Infinity,
  };
  return costs[terrain] ?? Infinity;
}

function isPassable(terrain: string): boolean {
  return getMovementCost(terrain) < Infinity;
}

export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string>, // hexKey -> unitId (for blocking)
  unitOwners?: Record<string, string>, // unitId -> owner (to distinguish friend/foe)
): HexCoord[] {
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>(); // hexKey -> remaining movement
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];

  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = hexNeighbors(current.coord);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = map.tiles[key];
      if (!tile || !isPassable(tile.terrain)) continue;

      const cost = getMovementCost(tile.terrain);
      const remaining = current.remaining - cost;
      if (remaining < 0) continue;

      // Check for unit blocking
      const occupant = unitPositions[key];
      if (occupant && occupant !== unit.id) {
        const occupantOwner = unitOwners?.[occupant];
        if (!occupantOwner || occupantOwner === unit.owner) continue; // block friendlies
        // Enemy tile is reachable (for attack) but can't pathfind through
        const prevRemaining = visited.get(key) ?? -1;
        if (remaining > prevRemaining) {
          visited.set(key, remaining);
          reachable.push(neighbor);
          // Don't add to queue — can't move through enemies
        }
        continue;
      }

      const prevRemaining = visited.get(key) ?? -1;
      if (remaining > prevRemaining) {
        visited.set(key, remaining);
        reachable.push(neighbor);
        queue.push({ coord: neighbor, remaining });
      }
    }
  }

  return reachable;
}

export function findPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile || !isPassable(toTile.terrain)) return null;

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>();
  const openSet = new Set<string>();
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>();

  const startKey = hexKey(from);
  gScore.set(startKey, 0);
  openSet.add(startKey);
  coords.set(startKey, from);

  while (openSet.size > 0) {
    // Find node with lowest f score
    let currentKey = '';
    let lowestF = Infinity;
    for (const key of openSet) {
      const coord = coords.get(key)!;
      const f = (gScore.get(key) ?? Infinity) + hexDistance(coord, to);
      if (f < lowestF) {
        lowestF = f;
        currentKey = key;
      }
    }

    // Reached destination — reconstruct path
    if (currentKey === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = currentKey;
      while (key) {
        path.unshift(coords.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    const currentCoord = coords.get(currentKey)!;

    for (const neighbor of hexNeighbors(currentCoord)) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;

      const tile = map.tiles[nKey];
      if (!tile || !isPassable(tile.terrain)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + getMovementCost(tile.terrain);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        parents.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        openSet.add(nKey);
      }
    }
  }

  return null;
}
