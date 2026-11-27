import type { GameMap, HexCoord, HexTile, Unit, UnitType, VisibilityMap } from '@/core/types';
import type { FreightPassage } from '@/core/types/commerce';
import { hexKey } from './hex-utils';
import { isRiverBetween } from './river-system';
import { isTradeUnitTypeInDomain } from './trade-role-targeting';
import { UNIT_DEFINITIONS } from './unit-definitions';

/**
 * Canonical movement-step cost model (#1010 / #1042). "How much does one step
 * cost, and can this terrain be entered at all?" — a pure function of the map
 * and the mover. Never reads `GameState`. Movement range, pathfinding, the
 * route preview and the executor all cost against this one module.
 *
 * Tile and step queries stay in the movement subsystem. Spawn placement and
 * other callers that need base terrain use the terrain-only query.
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
  freightPassageVisibility?: VisibilityMap;
}

export function canHullEnterOcean(unitType: UnitType): boolean {
  return UNIT_DEFINITIONS[unitType]?.waterAccess === 'ocean';
}

export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  _context: UnitMovementContext = {},
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
export interface MovementStepCostParams extends UnitMovementContext {
  /** Movement domain of the mover; drives the water/land/air branch. */
  domain: 'land' | 'naval' | 'air';
  /** Per-terrain cost overrides from the unit definition (land only). */
  terrainCostOverrides?: Partial<Record<string, number>>;
  /** Whether a naval hull may enter open `ocean` (vs `coast` only). */
  canEnterOcean?: boolean;
  /** Owner id for freight access and the GPS Navigation territory discount. */
  owner?: string;
  freightHull?: boolean;
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

const LAND_TERRAINS_FOR_STEP_BOUND = [
  'grassland', 'plains', 'desert', 'tundra', 'forest', 'hills', 'snow',
  'jungle', 'swamp', 'volcanic', 'mountain',
] as const;

/**
 * The most a single finite step can cost this mover (#1837): the dearest enterable terrain plus
 * the unbridged-river surcharge `getMovementStepCostFor` adds. Roads and GPS Navigation only ever
 * lower a step, so they never raise this bound. `findPath`'s `maxSteps` relies on it being an
 * upper bound; `unit-pathfinding-cost.test.ts` checks the bounded search against the unbounded one.
 */
export function maxFiniteMovementStepCost(params: MovementStepCostParams): number {
  if (params.domain !== 'land') return 1;
  let dearest = 1;
  const terrains = [...LAND_TERRAINS_FOR_STEP_BOUND, ...Object.keys(params.terrainCostOverrides ?? {})];
  for (const terrain of terrains) {
    const cost = terrainCostForParams(params, terrain);
    if (cost !== Infinity && cost > dearest) dearest = cost;
  }
  const riverSurcharge = (params.completedTechs ?? []).includes('bridge-building') ? 0 : 1;
  return dearest + riverSurcharge;
}

export function isPassableForParams(params: MovementStepCostParams, terrain: string): boolean {
  return terrainCostForParams(params, terrain) < Infinity;
}

export function getFreightPassageEntryDenial(params: MovementStepCostParams, tile: HexTile): string | undefined {
  const passage = tile.freightPassage;
  if (!passage || params.domain !== 'naval') return undefined;
  const visibility = params.freightPassageVisibility?.tiles[hexKey(tile.coord)];
  if (visibility !== 'visible' && visibility !== 'fog') return 'Naval units cannot move on land.';
  if (!params.freightHull || !params.owner
    || (passage.ownerId !== params.owner && !passage.allowedOperatorIds.includes(params.owner))) {
    return 'Only authorized freight ships can use this passage.';
  }
  return passage.open ? undefined : 'This freight passage is closed.';
}

export function isEnterableMovementTile(params: MovementStepCostParams, tile: HexTile): boolean {
  if (tile.freightPassage && params.domain === 'naval') {
    return getFreightPassageEntryDenial(params, tile) === undefined;
  }
  return isPassableForParams(params, tile.terrain);
}

function isFreightApproach(passage: FreightPassage, coord: HexCoord): boolean {
  return passage.approaches.some(approach => approach.q === coord.q && approach.r === coord.r);
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

  if (params.domain === 'naval') {
    if (tile.freightPassage) {
      return isEnterableMovementTile(params, tile)
        && isFreightApproach(tile.freightPassage, from)
        && isPassableForParams(params, map.tiles[hexKey(from)]?.terrain ?? '') ? 1 : Infinity;
    }
    // A ship already in the channel may sail out after a closure or revoked grant.
    const departure = map.tiles[hexKey(from)]?.freightPassage;
    if (departure && !isFreightApproach(departure, to)) return Infinity;
  }

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
  context: UnitMovementContext & { owner?: string } = {},
): MovementStepCostParams {
  const definition = unitType ? UNIT_DEFINITIONS[unitType] : undefined;
  return {
    ...context,
    domain: definition?.domain ?? domain,
    terrainCostOverrides: definition?.terrainCostOverrides,
    canEnterOcean: unitType ? canHullEnterOcean(unitType) : domain === 'naval',
    freightHull: unitType !== undefined && definition?.domain === 'naval'
      && isTradeUnitTypeInDomain(unitType, 'naval'),
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
      ...context,
      owner: unit.owner,
    }),
    map,
    from,
    to,
  );
}
