import type { BarbarianCamp, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { hexKey, hexDistance, hexNeighbors } from './hex-utils';

// Seeded LCG — avoids Math.random() per project rules
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

let nextCampId = 1;

export function spawnBarbarianCamp(
  map: GameMap,
  cityPositions: HexCoord[],
  existingCamps: BarbarianCamp[],
  seed: number,
): BarbarianCamp | null {
  const rng = lcg(seed);
  const existingPositions = new Set(existingCamps.map(c => hexKey(c.position)));

  const candidates = Object.values(map.tiles).filter(tile => {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' ||
        tile.terrain === 'mountain' || tile.terrain === 'snow') return false;
    if (existingPositions.has(hexKey(tile.coord))) return false;

    // Must be far from cities
    for (const cityPos of cityPositions) {
      if (hexDistance(tile.coord, cityPos) < 6) return false;
    }

    // Must be far from other camps
    for (const camp of existingCamps) {
      if (hexDistance(tile.coord, camp.position) < 4) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(rng() * candidates.length)];

  return {
    id: `camp-${nextCampId++}`,
    position: { ...chosen.coord },
    strength: 5 + Math.floor(rng() * 5),
    spawnCooldown: 5,
  };
}

export function resetCampId(): void {
  nextCampId = 1;
}

export function destroyCamp(camp: BarbarianCamp): number {
  return 15 + camp.strength * 2;
}

export function applyCampDestruction(
  state: GameState,
  civId: string,
  campId: string,
  turn: number,
): { state: GameState; reward: number } {
  const camp = state.barbarianCamps[campId];
  if (!camp) {
    return { state, reward: 0 };
  }

  const reward = destroyCamp(camp);
  const nextState = structuredClone(state);
  delete nextState.barbarianCamps[campId];
  nextState.legendaryWonderHistory = {
    destroyedStrongholds: [
      ...(nextState.legendaryWonderHistory?.destroyedStrongholds ?? []),
      { civId, campId, position: camp.position, turn },
    ],
  };
  nextState.civilizations[civId].gold += reward;

  return { state: nextState, reward };
}

export function applyCampDestructionAtTarget(
  state: GameState,
  civId: string,
  target: HexCoord,
  turn: number,
): { state: GameState; reward: number; campId: string | null } {
  const campEntry = Object.entries(state.barbarianCamps).find(([, camp]) =>
    hexKey(camp.position) === hexKey(target),
  );
  if (!campEntry) {
    return { state, reward: 0, campId: null };
  }

  const [campId] = campEntry;
  const destroyed = applyCampDestruction(state, civId, campId, turn);
  return {
    state: destroyed.state,
    reward: destroyed.reward,
    campId,
  };
}

export interface BarbarianMoveOrder {
  unitId: string;
  toCoord: HexCoord;
}

export interface BarbarianAttackOrder {
  attackerUnitId: string;
  defenderUnitId: string;
}

export interface BarbarianProcessResult {
  updatedCamps: BarbarianCamp[];
  spawnedUnits: Array<{ campId: string; position: HexCoord }>;
  moveOrders: BarbarianMoveOrder[];
  attackOrders: BarbarianAttackOrder[];
}

const BARBARIAN_CHASE_RANGE = 5;

export function processBarbarians(
  camps: BarbarianCamp[],
  map: GameMap,
  playerUnits: Unit[],
  seed: number,
  barbarianUnits?: Unit[],
): BarbarianProcessResult {
  const rng = lcg(seed ^ 0xdeadbeef);
  const updatedCamps: BarbarianCamp[] = [];
  const spawnedUnits: Array<{ campId: string; position: HexCoord }> = [];
  const moveOrders: BarbarianMoveOrder[] = [];
  const attackOrders: BarbarianAttackOrder[] = [];

  // --- Camp processing: cooldowns and spawning ---
  for (const camp of camps) {
    const newCooldown = camp.spawnCooldown - 1;

    if (newCooldown <= 0) {
      spawnedUnits.push({ campId: camp.id, position: { ...camp.position } });
      updatedCamps.push({
        ...camp,
        spawnCooldown: 4 + Math.floor(rng() * 3),
        strength: camp.strength + 1,
      });
    } else {
      updatedCamps.push({ ...camp, spawnCooldown: newCooldown });
    }
  }

  // --- Barbarian unit movement and attack ---
  if (!barbarianUnits || barbarianUnits.length === 0) {
    return { updatedCamps, spawnedUnits, moveOrders, attackOrders };
  }

  // Build a set of all occupied positions (for collision avoidance)
  const occupiedByUnit: Map<string, string> = new Map(); // hexKey → unitId
  for (const u of barbarianUnits) {
    occupiedByUnit.set(hexKey(u.position), u.id);
  }
  for (const u of playerUnits) {
    occupiedByUnit.set(hexKey(u.position), u.id);
  }

  for (const barbUnit of barbarianUnits) {
    if (barbUnit.movementPointsLeft <= 0) continue;

    // Find the nearest player unit within chase range
    let nearestTarget: Unit | null = null;
    let nearestDist = BARBARIAN_CHASE_RANGE + 1;
    for (const playerUnit of playerUnits) {
      const dist = hexDistance(barbUnit.position, playerUnit.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = playerUnit;
      }
    }

    if (!nearestTarget) continue;

    // If adjacent to target, issue an attack order
    if (nearestDist === 1) {
      attackOrders.push({ attackerUnitId: barbUnit.id, defenderUnitId: nearestTarget.id });
      continue;
    }

    // Otherwise, move one step toward the target
    const neighbors = hexNeighbors(barbUnit.position);
    // Filter to passable, unoccupied tiles
    const passable = neighbors.filter(coord => {
      const tile = map.tiles[hexKey(coord)];
      if (!tile) return false;
      if (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.terrain === 'mountain') return false;
      const key = hexKey(coord);
      // Allow moving onto player unit tiles (will become an attack next turn)
      const occupant = occupiedByUnit.get(key);
      return !occupant || occupant === nearestTarget.id;
    });

    if (passable.length === 0) continue;

    // Pick the neighbor closest to the target
    let bestCoord = passable[0];
    let bestDist = hexDistance(passable[0], nearestTarget.position);
    for (const coord of passable) {
      const d = hexDistance(coord, nearestTarget.position);
      if (d < bestDist) {
        bestDist = d;
        bestCoord = coord;
      }
    }

    // If the best step is onto the target tile, issue attack instead
    if (hexKey(bestCoord) === hexKey(nearestTarget.position)) {
      attackOrders.push({ attackerUnitId: barbUnit.id, defenderUnitId: nearestTarget.id });
    } else {
      moveOrders.push({ unitId: barbUnit.id, toCoord: bestCoord });
      // Update occupancy map so later units in this loop don't collide
      occupiedByUnit.delete(hexKey(barbUnit.position));
      occupiedByUnit.set(hexKey(bestCoord), barbUnit.id);
    }
  }

  return { updatedCamps, spawnedUnits, moveOrders, attackOrders };
}
