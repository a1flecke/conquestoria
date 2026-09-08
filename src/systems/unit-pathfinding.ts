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
import { BinaryHeap } from './binary-heap';

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
 * Open set: a `BinaryHeap` (`./binary-heap`) with lazy deletion — a `g` improvement
 * pushes a fresh entry and the superseded one is skipped on pop. The heap comparator is
 * the total order `f` ascending, then `g` descending (higher `g` → closer to the goal →
 * fewer expansions), then `hexKey` ascending. This reproduces the pre-#1042-MR5
 * linear-scan selection **byte-for-byte** — same nodes expanded in the same order, same
 * `parents` chain — while dropping the O(V²) per-iteration scan. `referenceFindPath` in
 * `tests/systems/unit-pathfinding-cost.test.ts` pins the equivalence over a seeded
 * randomized battery; routes resolve identically across runs and a save/reload because
 * the order depends only on `(f, g, hexKey)`, never on iteration or object identity.
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

  interface OpenNode { key: string; g: number; f: number; }

  // Ordered on the EXACT pre-MR5 tie-break: f ascending, then g descending (higher g ⇒
  // closer to the goal ⇒ fewer expansions), then hexKey ascending. EPS is identical to the
  // incumbent; every genuine cost here is a 0.5-multiple, so the EPS band never spans two
  // distinct values and this is a well-defined total order.
  const heap = new BinaryHeap<OpenNode>((a, b) => {
    if (a.f < b.f - EPS) return -1;
    if (b.f < a.f - EPS) return 1;
    if (a.g > b.g + EPS) return -1;
    if (b.g > a.g + EPS) return 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>();
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>();

  const heuristicFrom = (coord: HexCoord): number => (map.wrapsHorizontally
    ? wrappedHexDistance(coord, to, map.width)
    : hexDistance(coord, to));

  const startKey = hexKey(from);
  gScore.set(startKey, 0);
  coords.set(startKey, from);
  heap.push({ key: startKey, g: 0, f: minStepCost * heuristicFrom(from) });

  while (heap.size > 0) {
    const current = heap.pop()!;

    // Lazy deletion: when a node's g improves we push a fresh entry and leave the old one.
    // A stale entry for a key always has strictly higher f than its replacement (h is fixed,
    // g only decreases), so the fresh entry always pops first; this skip only ever discards
    // an already-superseded entry.
    if (current.g > (gScore.get(current.key) ?? Infinity) + EPS) continue;
    // Redundant given the strict-improvement relaxation gate below (a second entry for a
    // closed key is always caught by the stale-g skip), kept as a locally-obvious
    // "a closed node is never expanded twice" guard.
    if (closedSet.has(current.key)) continue;

    // Goal check strictly AFTER the stale-g skip: a fresh toKey pop is the global (f, g, key)
    // minimum, so for the consistent heuristic the goal is settled and `parents` is final.
    if (current.key === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = current.key;
      while (key) {
        path.unshift(coords.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path;
    }

    closedSet.add(current.key);
    const currentCoord = coords.get(current.key)!;

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

      const tentativeG = current.g + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity) - EPS) {
        parents.set(nKey, current.key);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        heap.push({ key: nKey, g: tentativeG, f: tentativeG + minStepCost * heuristicFrom(neighbor) });
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
