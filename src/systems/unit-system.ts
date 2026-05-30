import type { UnitDefinition, UnitType, Unit, HexCoord, GameMap, CivBonusEffect, VisibilityState, IdCounters } from '@/core/types';
import {
  hexKey,
  hexNeighbors,
  hexDistance,
  getWrappedHexNeighbors,
  wrappedHexDistance,
  wrapHexCoord,
} from './hex-utils';

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  settler: {
    type: 'settler', name: 'Settler', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: true,
    canBuildImprovements: false, productionCost: 24,
  },
  worker: {
    type: 'worker', name: 'Worker', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: true, productionCost: 12,
  },
  scout: {
    type: 'scout', name: 'Scout', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 6,
  },
  warrior: {
    type: 'warrior', name: 'Warrior', movementPoints: 2,
    visionRange: 2, strength: 10, canFoundCity: false,
    canBuildImprovements: false, productionCost: 8,
  },
  archer: {
    type: 'archer', name: 'Archer', movementPoints: 2,
    visionRange: 2, strength: 15, canFoundCity: false,
    canBuildImprovements: false, productionCost: 35,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
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
  galley: {
    type: 'galley', name: 'Galley', movementPoints: 3,
    visionRange: 3, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 40,
    domain: 'naval',
  },
  trireme: {
    type: 'trireme', name: 'Trireme', movementPoints: 4,
    visionRange: 3, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
    domain: 'naval',
  },
  spy_scout: {
    type: 'spy_scout', name: 'Scout Agent', movementPoints: 2,
    visionRange: 2, strength: 3, canFoundCity: false,
    canBuildImprovements: false, productionCost: 30,
  },
  spy_informant: {
    type: 'spy_informant', name: 'Informant', movementPoints: 2,
    visionRange: 2, strength: 4, canFoundCity: false,
    canBuildImprovements: false, productionCost: 50,
  },
  spy_agent: {
    type: 'spy_agent', name: 'Field Agent', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
  },
  spy_operative: {
    type: 'spy_operative', name: 'Operative', movementPoints: 3,
    visionRange: 3, strength: 6, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
  },
  spy_hacker: {
    type: 'spy_hacker', name: 'Cyber Operative', movementPoints: 2,
    visionRange: 2, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 110,
  },
  scout_hound: {
    type: 'scout_hound', name: 'Scout Hound', movementPoints: 3,
    visionRange: 3, strength: 8, canFoundCity: false,
    canBuildImprovements: false, productionCost: 36,
    spyDetectionChance: 0.35,
  },
  shadow_warden: {
    type: 'shadow_warden', name: 'Shadow Warden', movementPoints: 3,
    visionRange: 4, strength: 6, canFoundCity: false,
    canBuildImprovements: false, productionCost: 36,
    spyDetectionChance: 0.50,
  },
  war_hound: {
    type: 'war_hound', name: 'War Hound', movementPoints: 4,
    visionRange: 3, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 32,
    spyDetectionChance: 0.30,
  },
  // S4b — new unit definitions
  axeman: {
    type: 'axeman', name: 'Axeman', movementPoints: 2,
    visionRange: 2, strength: 18, canFoundCity: false,
    canBuildImprovements: false, productionCost: 22,
  },
  spearman: {
    type: 'spearman', name: 'Spearman', movementPoints: 2,
    visionRange: 2, strength: 20, canFoundCity: false,
    canBuildImprovements: false, productionCost: 32,
  },
  horseman: {
    type: 'horseman', name: 'Horseman', movementPoints: 3,
    visionRange: 2, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 55,
  },
  cavalry: {
    type: 'cavalry', name: 'Cavalry', movementPoints: 3,
    visionRange: 2, strength: 35, canFoundCity: false,
    canBuildImprovements: false, productionCost: 60,
  },
  knight: {
    type: 'knight', name: 'Knight', movementPoints: 3,
    visionRange: 2, strength: 45, canFoundCity: false,
    canBuildImprovements: false, productionCost: 80,
  },
  crossbowman: {
    type: 'crossbowman', name: 'Crossbowman', movementPoints: 2,
    visionRange: 3, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 75,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
  },
  catapult: {
    type: 'catapult', name: 'Catapult', movementPoints: 1,
    visionRange: 2, strength: 20, canFoundCity: false,
    canBuildImprovements: false, productionCost: 110,
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
  },
  ballista: {
    type: 'ballista', name: 'Ballista', movementPoints: 2,
    visionRange: 3, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 100,
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit'] },
  },
  // S5 — trade unit
  caravan: {
    type: 'caravan', name: 'Caravan', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 60,
    domain: 'land',
  },
  // Resource Accessibility MR 2b — exploration unit
  expedition: {
    type: 'expedition', name: 'Expedition', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 18,
    domain: 'land',
    terrainCostOverrides: { hills: 1, mountain: 1 },
  },
};

const VIKING_MOBILITY_UNITS = new Set<UnitType>(['scout', 'warrior', 'archer', 'swordsman']);

export function createUnit(
  type: UnitType,
  owner: string,
  position: HexCoord,
  counters: IdCounters,
  bonusEffect?: CivBonusEffect,
): Unit {
  const movementBonus =
    bonusEffect?.type === 'naval_raiding' && VIKING_MOBILITY_UNITS.has(type)
      ? bonusEffect.movementBonus
      : 0;
  return {
    id: `unit-${counters.nextUnitId++}`,
    type,
    owner,
    position: { ...position },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints + movementBonus,
    movementBonus: movementBonus || undefined,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    chargesRemaining: type === 'worker' ? 2 : undefined,
    isResting: false,
  };
}

export function moveUnit(unit: Unit, to: HexCoord, cost: number): Unit {
  return {
    ...unit,
    position: { ...to },
    movementPointsLeft: Math.max(0, unit.movementPointsLeft - cost),
    hasMoved: true,
    isFortified: undefined,
  };
}

export function resetUnitTurn(unit: Unit): Unit {
  const { skippedTurn: _skippedTurn, ...rest } = unit;
  const base: Unit = {
    ...rest,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
  if (base.workerTask) {
    return { ...base, movementPointsLeft: 0, hasActed: true };
  }
  return base;
}

// --- Healing constants ---
export const HEAL_PASSIVE = 5;    // HP/turn when idle (didn't move or act)
export const HEAL_RESTING = 15;   // HP/turn when player explicitly rests
export const HEAL_IN_CITY = 20;   // HP/turn when in a friendly city
export const HEAL_IN_TERRITORY = 10; // HP/turn when in friendly territory

export function canHeal(unit: Unit): boolean {
  return unit.health < 100;
}

export function healUnit(
  unit: Unit,
  inFriendlyCity: boolean,
  inFriendlyTerritory: boolean,
): Unit {
  if (unit.health >= 100) return unit;

  let healAmount: number;
  if (inFriendlyCity) {
    healAmount = HEAL_IN_CITY;
  } else if (unit.isResting) {
    healAmount = HEAL_RESTING;
  } else if (inFriendlyTerritory) {
    healAmount = HEAL_IN_TERRITORY;
  } else if (!unit.hasMoved && !unit.hasActed) {
    healAmount = HEAL_PASSIVE;
  } else {
    return unit; // moved or acted without resting — no heal
  }

  return { ...unit, health: Math.min(100, unit.health + healAmount) };
}

export function restUnit(unit: Unit): Unit {
  return {
    ...unit,
    isResting: true,
    hasActed: true,   // resting uses the action for the turn
    movementPointsLeft: 0,
  };
}

export const UNIT_DESCRIPTIONS: Record<UnitType, string> = {
  settler: 'Civilian unit that can found new cities',
  worker: 'Civilian unit that builds tile improvements. Workers have 2 action charges by default and are used up after spending the last charge.',
  scout: 'Fast exploration unit with extended vision',
  warrior: 'Basic melee fighter — your first line of defense',
  archer: 'Ranged unit that attacks from a distance',
  swordsman: 'Stronger melee fighter, requires Bronze Working',
  pikeman: 'Anti-cavalry specialist, requires Fortification',
  musketeer: 'Gunpowder infantry, requires Tactics',
  galley: 'Coastal vessel for transport and exploration',
  trireme: 'Warship with strong naval combat capabilities',
  spy_scout: 'Lightly trained scout agent. Move to an enemy city and attempt to infiltrate. Era 1: infiltration and scouting resolve in one action.',
  spy_informant: 'Experienced informant. Infiltrates cities for multi-turn intelligence operations. Unlocks disguise.',
  spy_agent: 'Skilled field operative. Conducts sabotage, tech theft, and disruption missions.',
  spy_operative: 'Elite spy. Capable of high-stakes operations — assassination, forgery, arms smuggling.',
  spy_hacker: 'Cyber operative. Remote and digital warfare missions; hardest to detect.',
  scout_hound: 'Detection unit. Patrols territory and has a 35% chance per turn to reveal disguised or stealthed spy units within vision range.',
  shadow_warden: 'Elite detection unit. 50% chance per turn to reveal disguised spies within vision range. Favored by intelligence-focused civilizations.',
  war_hound: 'Combat-focused detection unit. Weaker spy detection (30%) but formidable in battle. Tears apart lightly-armored spy units.',
  // S4b — new unit descriptions
  axeman:      'Early copper-armed warrior. Strong for the era but outpaced once iron is mastered.',
  spearman:    'Versatile polearm soldier effective against mounted units. No resources required.',
  horseman:    'Swift light cavalry for raids and flanking. Requires Horses.',
  cavalry:     'Heavy cavalry unit combining speed and striking power. Requires Horses and Iron.',
  knight:      'The apex of mounted warfare — armored and devastating. Requires Horses and Iron.',
  crossbowman: 'Precision-ranged unit with a longer reach than Archers. Requires Copper.',
  catapult:    'Slow but devastating siege engine that bombards units and cities. Requires Stone.',
  ballista:    'Long-range bolt-thrower effective against massed units. Requires Iron.',
  // S5 — trade unit
  caravan:     'Trade unit. Establish a trade route to generate gold each turn. '
             + 'Once committed, cannot move or act until the route ends (8 round trips base). '
             + 'Cannot attack. Raidable by enemy units in transit.',
  // Resource Accessibility MR 2b
  expedition:  'Civilian explorer. Crosses hills and mountains at full speed. '
             + 'When standing on a resource tile (outside city territory), use '
             + '"Establish Outpost" to plant a flag — the unit is consumed '
             + 'immediately and the outpost completes in 2 turns, granting the '
             + 'resource and charging 2 gold/turn upkeep. Requires Foraging tech.',
};

export function getUnmovedUnits(
  units: Record<string, Unit>,
  civId: string,
): Unit[] {
  return Object.values(units).filter(
    u => u.owner === civId && !u.hasMoved && !u.hasActed && !u.skippedTurn && !u.isFortified && !u.committedToRouteId,
  );
}

export function getMovementCost(terrain: string): number {
  const costs: Record<string, number> = {
    grassland: 1, plains: 1, desert: 1, tundra: 1,
    forest: 2, hills: 2, snow: 2,
    jungle: 2, swamp: 2, volcanic: 2,
    mountain: 4, ocean: Infinity, coast: Infinity,
  };
  return costs[terrain] ?? Infinity;
}

export function getMovementCostForUnit(
  terrain: string,
  domain: 'land' | 'naval',
  terrainCostOverrides?: Partial<Record<string, number>>,
): number {
  if (domain === 'naval') {
    return (terrain === 'ocean' || terrain === 'coast') ? 1 : Infinity;
  }
  if (terrainCostOverrides && terrain in terrainCostOverrides) {
    return terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

function isPassableForUnit(
  terrain: string,
  domain: 'land' | 'naval',
  terrainCostOverrides?: Partial<Record<string, number>>,
): boolean {
  return getMovementCostForUnit(terrain, domain, terrainCostOverrides) < Infinity;
}

export interface MovementBlockerReason {
  code:
    | 'unexplored'
    | 'unknown-tile'
    | 'impassable-water'
    | 'impassable-terrain'
    | 'unreachable'
    | 'insufficient-movement';
  message: string;
}

export function getMovementBlockerReason(
  unit: Unit,
  to: HexCoord,
  map: GameMap,
  options: { visibilityState?: VisibilityState } = {},
): MovementBlockerReason | null {
  if (options.visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }

  const target = map.wrapsHorizontally ? wrapHexCoord(to, map.width) : to;
  const tile = map.tiles[hexKey(target)];
  if (!tile) {
    return { code: 'unknown-tile', message: 'Too far away to spot.' };
  }

  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const overrides = UNIT_DEFINITIONS[unit.type]?.terrainCostOverrides;
  if (!isPassableForUnit(tile.terrain, domain, overrides)) {
    if (domain === 'naval') {
      return { code: 'impassable-terrain', message: 'Naval units cannot move on land.' };
    }
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
      return { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    }
    return { code: 'impassable-terrain', message: 'This terrain cannot be entered.' };
  }

  const path = findPath(unit.position, target, map, domain);
  if (!path) {
    return { code: 'unreachable', message: 'No passable route to that tile.' };
  }

  const pathCost = path.slice(1).reduce((total, coord) => {
    const stepTile = map.tiles[hexKey(coord)];
    return total + (stepTile ? getMovementCostForUnit(stepTile.terrain, domain, overrides) : Infinity);
  }, 0);

  // Forced march: a unit can always move to an adjacent passable tile with ≥1 move remaining.
  const isAdjacentMove = path.length === 2;
  if (isAdjacentMove && unit.movementPointsLeft >= 1) {
    return null;
  }

  if (pathCost > unit.movementPointsLeft) {
    return { code: 'insufficient-movement', message: 'Not enough movement left this turn.' };
  }

  return null;
}

function normalizeOccupants(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string | string[]>,
  unitOwners?: Record<string, string>,
  hostileOwners?: Set<string>,
): HexCoord[] {
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const moveOverrides = UNIT_DEFINITIONS[unit.type]?.terrainCostOverrides;
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>();
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];

  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(current.coord, map.width)
      : hexNeighbors(current.coord);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = map.tiles[key];
      if (!tile || !isPassableForUnit(tile.terrain, domain, moveOverrides)) continue;

      const cost = getMovementCostForUnit(tile.terrain, domain, moveOverrides);
      const remaining = current.remaining - cost;

      // Forced march: if this is a direct neighbor of the start position and the unit
      // has ≥1 movement remaining, allow entry even when the tile cost exceeds remaining points.
      const isFromStartPosition = hexKey(current.coord) === hexKey(unit.position);
      const forcedMarch = isFromStartPosition && current.remaining >= 1 && remaining < 0;

      if (remaining < 0 && !forcedMarch) continue;

      const effectiveRemaining = forcedMarch ? 0 : remaining;

      const occupants = normalizeOccupants(unitPositions[key]).filter(id => id !== unit.id);
      if (occupants.length > 0) {
        const isNeutralOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          return Boolean(owner) && owner !== unit.owner
            && hostileOwners !== undefined && !hostileOwners.has(owner!);
        };
        const isHostileOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          if (!owner || owner === unit.owner) return false;
          return hostileOwners !== undefined ? hostileOwners.has(owner) : true;
        };

        if (occupants.some(isNeutralOccupant)) continue;

        if (occupants.some(isHostileOccupant)) {
          const prevRemaining = visited.get(key) ?? -1;
          if (effectiveRemaining > prevRemaining) {
            visited.set(key, effectiveRemaining);
            reachable.push(neighbor);
          }
          continue;
        }
      }

      const prevRemaining = visited.get(key) ?? -1;
      if (effectiveRemaining > prevRemaining) {
        visited.set(key, effectiveRemaining);
        reachable.push(neighbor);
        if (effectiveRemaining > 0) {
          queue.push({ coord: neighbor, remaining: effectiveRemaining });
        }
      }
    }
  }

  return reachable;
}

export function findPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' = 'land',
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile || !isPassableForUnit(toTile.terrain, domain)) return null;

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
      const heuristic = map.wrapsHorizontally
        ? wrappedHexDistance(coord, to, map.width)
        : hexDistance(coord, to);
      const f = (gScore.get(key) ?? Infinity) + heuristic;
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

    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(currentCoord, map.width)
      : hexNeighbors(currentCoord);
    for (const neighbor of neighbors) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;

      const tile = map.tiles[nKey];
      if (!tile || !isPassableForUnit(tile.terrain, domain)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + getMovementCostForUnit(tile.terrain, domain);
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
