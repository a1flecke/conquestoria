import type { GameMap, HexCoord, Unit, UnitType } from '@/core/types';
import { hexKey } from './hex-utils';
import { isRiverBetween } from './river-system';
import { UNIT_DEFINITIONS } from './unit-definitions';

/**
 * Canonical movement-step cost model (#1010 / #1042). "How much does one step
 * cost, and can this terrain be entered at all?" — a pure function of the map
 * and the mover. Never reads `GameState`. Movement range, pathfinding, the
 * route preview and the executor all cost against this one module.
 *
 * `terrainCostForParams` stays private; `isPassableForParams`,
 * `hasRoadMovementDiscount` and `isPassableForUnitInContext` are exported for
 * the sibling movement modules only and are deliberately NOT re-exported from
 * the `unit-system` barrel.
 */
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
  domain: 'land' | 'naval' | 'air',
  terrainCostOverrides?: Partial<Record<string, number>>,
): number {
  if (domain === 'air') return 1;
  if (domain === 'naval') {
    return (terrain === 'ocean' || terrain === 'coast') ? 1 : Infinity;
  }
  if (terrainCostOverrides && terrain in terrainCostOverrides) {
    return terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

export interface UnitMovementContext {
  completedTechs?: string[];
}

export function canHullEnterOcean(unitType: UnitType): boolean {
  return UNIT_DEFINITIONS[unitType]?.waterAccess === 'ocean';
}

export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  const domain = definition?.domain ?? 'land';

  if (domain === 'air') return 1;

  if (domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (terrain === 'ocean' && !canHullEnterOcean(unit.type)) return Infinity;
    return 1;
  }

  if (definition?.terrainCostOverrides && terrain in definition.terrainCostOverrides) {
    return definition.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

/**
 * Everything the canonical movement-step cost model needs about a mover, with no
 * dependency on a live `Unit` record. This is the one shape that movement range,
 * pathfinding, route preview and the executor all cost against, so a caller that
 * only knows a `UnitType` (or just a domain) still optimises the *same* model the
 * executor consumes — see #1042, where road-blind `findPath` callers took a
 * shorter-but-more-expensive route because the fallback ignored `tile.hasRoad`.
 */
export interface MovementStepCostParams {
  /** Movement domain of the mover; drives the water/land/air branch. */
  domain: 'land' | 'naval' | 'air';
  /** Per-terrain cost overrides from the unit definition (land only). */
  terrainCostOverrides?: Partial<Record<string, number>>;
  /** Whether a naval hull may enter open `ocean` (vs `coast` only). */
  canEnterOcean?: boolean;
  /** Owning civ's completed techs — road discount, bridge-building, gps-navigation. */
  completedTechs?: string[];
  /** Owner id of the mover — only the gps-navigation "own territory" clause reads it. */
  owner?: string;
}

function terrainCostForParams(params: MovementStepCostParams, terrain: string): number {
  if (params.domain === 'air') return 1;
  if (params.domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (terrain === 'ocean' && !params.canEnterOcean) return Infinity;
    return 1;
  }
  if (params.terrainCostOverrides && terrain in params.terrainCostOverrides) {
    return params.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

export function isPassableForParams(params: MovementStepCostParams, terrain: string): boolean {
  return terrainCostForParams(params, terrain) < Infinity;
}

/** True when a land mover with these techs pays the halved (0.5) road step cost. */
export function hasRoadMovementDiscount(completedTechs: readonly string[]): boolean {
  return completedTechs.includes('military-logistics')
    || completedTechs.includes('railway-expansion');
}

/**
 * Canonical per-step movement cost, keyed off a `MovementStepCostParams` rather
 * than a `Unit`. `getMovementStepCost` below is the thin `Unit` adapter; both
 * return the identical number for the same terrain / road / river / tech inputs.
 */
export function getMovementStepCostFor(
  params: MovementStepCostParams,
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
): number {
  const tile = map.tiles[hexKey(to)];
  if (!tile) return Infinity;

  const completedTechs = params.completedTechs ?? [];
  let terrainCost: number;

  if (params.domain === 'land' && tile.hasRoad) {
    // Roads cost 1 movement regardless of terrain; Military Logistics OR Railway
    // Expansion halves that to 0.5 — the two do not stack (see game-balance.md).
    terrainCost = hasRoadMovementDiscount(completedTechs) ? 0.5 : 1;
  } else {
    terrainCost = terrainCostForParams(params, tile.terrain);
    if (terrainCost === Infinity) return Infinity;

    if (
      params.domain === 'land'
      && params.owner !== undefined
      && tile.owner === params.owner
      && completedTechs.includes('gps-navigation')
    ) {
      terrainCost = 1;
    }
  }

  const crossesUnbridgedRiver = params.domain !== 'naval' && params.domain !== 'air'
    && !completedTechs.includes('bridge-building')
    && isRiverBetween(map, from, to);
  return terrainCost + (crossesUnbridgedRiver ? 1 : 0);
}

/** Build the canonical cost params from a `UnitType` (or a bare domain fallback). */
export function movementStepCostParamsForType(
  unitType: UnitType | undefined,
  domain: 'land' | 'naval' | 'air' = 'land',
  context: { completedTechs?: string[]; owner?: string } = {},
): MovementStepCostParams {
  const definition = unitType ? UNIT_DEFINITIONS[unitType] : undefined;
  return {
    domain: definition?.domain ?? domain,
    terrainCostOverrides: definition?.terrainCostOverrides,
    canEnterOcean: unitType ? canHullEnterOcean(unitType) : domain === 'naval',
    completedTechs: context.completedTechs,
    owner: context.owner,
  };
}

export function getMovementStepCost(
  unit: Unit,
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
  context: UnitMovementContext = {},
): number {
  return getMovementStepCostFor(
    movementStepCostParamsForType(unit.type, 'land', {
      completedTechs: context.completedTechs,
      owner: unit.owner,
    }),
    map,
    from,
    to,
  );
}

export function isPassableForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): boolean {
  return getMovementCostForUnitInContext(unit, terrain, context) < Infinity;
}
