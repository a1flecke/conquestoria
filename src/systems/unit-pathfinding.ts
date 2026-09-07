import type { GameMap, HexCoord, Unit, UnitType } from '@/core/types';
import {
  hexKey,
  hexNeighbors,
  hexDistance,
  getWrappedHexNeighbors,
  wrappedHexDistance,
} from './hex-utils';
import {
  movementStepCostParamsForType,
  getMovementStepCostFor,
  isPassableForParams,
  hasRoadMovementDiscount,
  type UnitMovementContext,
} from './unit-movement-cost';

/**
 * Cost-aware pathfinding (#1010 / #1042). "What is the cheapest route?" — A*
 * over the canonical step-cost model. Imports the cost module; it does NOT need
 * the legality module (a route is map + cost only; blocker legality is applied
 * by `validateUnitMove` / the movement-queries range BFS, not here).
 *
 * Cost-aware A* over the canonical movement-step cost model
 * (`getMovementStepCostFor`). Route selection minimises **movement points**, not
 * hex count, so a longer road detour that is cheaper in movement points wins
 * (#1042). Callers pass a `unit` (preferred) or a bare `unitType` so the same
 * road / terrain-override / tech model the executor consumes is optimised here;
 * a caller with neither still gets a road-aware `domain`-level cost.
 *
 * Heuristic: `minStepCost × hexDistance`. `minStepCost` is `0.5` when a
 * road-movement-discount tech is active (a road step can then cost 0.5) and `1`
 * otherwise — the smallest cost any single step can take. That keeps the
 * heuristic admissible *and* consistent (`h(n) − h(n′) ≤ minStepCost ≤
 * cost(n,n′)` for every edge), so the closed-set never locks in a worse path.
 *
 * Tie-break for equal `f`: prefer the higher `g` (closer to the goal → fewer
 * expansions), then the lexicographically smaller `hexKey`. This is independent
 * of `Set` iteration order, so equal-cost paths resolve identically across runs
 * and across a save/reload.
 */
export function findPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air' = 'land',
  options: UnitMovementContext & { unit?: Unit; unitType?: UnitType } = {},
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile) return null;

  const costParams = movementStepCostParamsForType(
    options.unit?.type ?? options.unitType,
    domain,
    { completedTechs: options.completedTechs, owner: options.unit?.owner },
  );
  if (!isPassableForParams(costParams, toTile.terrain)) return null;

  const minStepCost = costParams.domain === 'land'
    && hasRoadMovementDiscount(costParams.completedTechs ?? [])
    ? 0.5
    : 1;
  const EPS = 1e-9;

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
    // Find the open node with lowest f, breaking ties deterministically.
    let currentKey = '';
    let lowestF = Infinity;
    let lowestG = Infinity;
    for (const key of openSet) {
      const coord = coords.get(key)!;
      const heuristic = map.wrapsHorizontally
        ? wrappedHexDistance(coord, to, map.width)
        : hexDistance(coord, to);
      const g = gScore.get(key) ?? Infinity;
      const f = g + minStepCost * heuristic;
      const better = f < lowestF - EPS
        || (Math.abs(f - lowestF) <= EPS && g > lowestG + EPS)
        || (Math.abs(f - lowestF) <= EPS && Math.abs(g - lowestG) <= EPS && (currentKey === '' || key < currentKey));
      if (better) {
        lowestF = f;
        lowestG = g;
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
      if (!tile) continue;
      const stepCost = getMovementStepCostFor(costParams, map, currentCoord, neighbor);
      if (stepCost === Infinity) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity) - EPS) {
        parents.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        openSet.add(nKey);
      }
    }
  }

  return null;
}

/**
 * Trade Routes Overhaul (#553 MR1/4). Cities are never founded on ocean/coast terrain
 * (see map-generator.ts's start-terrain filter) — they sit on land tiles that are merely
 * *adjacent* to water, matching `isCityCoastal`'s neighbor check in city-system.ts. Plain
 * `findPath(..., 'naval')` requires the destination tile itself to be ocean/coast, so it
 * can never reach a real coastal city's own tile. This wraps `findPath` so naval-domain
 * callers path to the nearest ocean/coast neighbor of the city (docking) and then treat
 * the city tile as one final step, while land/air callers behave exactly like `findPath`.
 *
 * `options` is forwarded verbatim to `findPath`, so a land caravan or unit routed
 * to a city optimises the same road / terrain / tech cost model as a plain
 * `findPath` call (#1042).
 */
export function findPathToCity(
  from: HexCoord,
  cityPosition: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air' = 'land',
  options: UnitMovementContext & { unit?: Unit; unitType?: UnitType } = {},
): HexCoord[] | null {
  const direct = findPath(from, cityPosition, map, domain, options);
  if (direct) return direct;
  if (domain !== 'naval') return null;

  const neighbors = map.wrapsHorizontally
    ? getWrappedHexNeighbors(cityPosition, map.width)
    : hexNeighbors(cityPosition);

  let best: HexCoord[] | null = null;
  for (const neighbor of neighbors) {
    const tile = map.tiles[hexKey(neighbor)];
    if (!tile || (tile.terrain !== 'ocean' && tile.terrain !== 'coast')) continue;
    const path = findPath(from, neighbor, map, 'naval', options);
    // Naval steps are uniform cost 1, so shortest hop count is also cheapest.
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best ? [...best, cityPosition] : null;
}
