/**
 * #1042 — unit movement choices must follow roads.
 *
 * These tests pin the contract that `findPath` / `findPathToCity` optimise the
 * SAME movement-cost model the executor (`getMovementStepCost`) and movement
 * range (`getMovementRangeDetails`) use — not a hex-count-first approximation.
 */
import { describe, it, expect } from 'vitest';
import {
  createUnit,
  findPath,
  findPathToCity,
  getMovementStepCost,
  getMovementStepCostFor,
  getMovementRangeDetails,
  movementStepCostParamsForType,
  UNIT_DEFINITIONS,
  type MovementStepCostParams,
} from '@/systems/unit-system';
import { isPassableForParams, hasRoadMovementDiscount } from '@/systems/unit-movement-cost';
import { seededLcg } from '@/systems/seeded-lcg';
import type { GameMap, GameState, HexCoord, HexTile, UnitType } from '@/core/types';
import { hexKey, hexNeighbors, getWrappedHexNeighbors, hexDistance, wrappedHexDistance } from '@/systems/hex-utils';

const mkCtx = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

type TileSpec = {
  terrain?: HexTile['terrain'];
  hasRoad?: boolean;
  owner?: string | null;
};

/** Build a small non-wrapping map from a `{ "q,r": TileSpec }` sketch. */
function buildMap(specs: Record<string, TileSpec>, opts: { rivers?: GameMap['rivers'] } = {}): GameMap {
  const tiles: GameMap['tiles'] = {};
  let maxQ = 0;
  let maxR = 0;
  for (const [key, spec] of Object.entries(specs)) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    maxQ = Math.max(maxQ, q);
    maxR = Math.max(maxR, r);
    tiles[hexKey({ q, r })] = {
      coord: { q, r },
      terrain: spec.terrain ?? 'grassland',
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      owner: spec.owner ?? null,
      improvementTurnsLeft: 0,
      hasRiver: false,
      hasRoad: spec.hasRoad ?? false,
      wonder: null,
    };
  }
  return {
    width: maxQ + 1,
    height: maxR + 1,
    wrapsHorizontally: false,
    tiles,
    rivers: opts.rivers ?? [],
  };
}

/** Sum the canonical per-step cost over a path, exactly as the executor does. */
function pathCost(unitType: UnitType, map: GameMap, path: HexCoord[], completedTechs: string[] = []): number {
  const unit = createUnit(unitType, 'player', path[0]!, mkCtx());
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += getMovementStepCost(unit, map, path[i - 1]!, path[i]!, { completedTechs });
  }
  return total;
}

function keysOf(path: HexCoord[]): string[] {
  return path.map(hexKey);
}

/**
 * Isolates the *road* effect (not terrain): both routes cross the same terrain
 * (hills, base cost 2), so only the road on the r=1 corridor can make a route
 * cheaper.
 *   direct : (0,0)->(1,0)->(2,0)->(3,0)  hills 2 + hills 2 + grass 1 = 5, 3 steps
 *   detour : (0,0)->(0,1)->(1,1)->(2,1)->(3,0)  road 1 x3 + grass 1 = 4, 4 steps
 * A road-BLIND pathfinder scores the detour at 2+2+2+1 = 7 and wrongly takes the
 * shorter direct route; a cost-aware one takes the detour.
 */
function roadDetourMap(): GameMap {
  return buildMap({
    '0,0': { terrain: 'grassland' },
    '1,0': { terrain: 'hills' },
    '2,0': { terrain: 'hills' },
    '3,0': { terrain: 'grassland' },
    '0,1': { terrain: 'hills', hasRoad: true },
    '1,1': { terrain: 'hills', hasRoad: true },
    '2,1': { terrain: 'hills', hasRoad: true },
  });
}

describe('#1042 — findPath optimises true movement cost', () => {
  it('1. chooses a road route that is longer in hexes but cheaper in movement points', () => {
    const map = roadDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());

    const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: warrior });

    expect(path).not.toBeNull();
    // Must NOT walk the two mountains on r=0.
    expect(keysOf(path!)).not.toContain(hexKey({ q: 1, r: 0 }));
    expect(keysOf(path!)).not.toContain(hexKey({ q: 2, r: 0 }));
    // Must ride the r=1 road corridor.
    expect(keysOf(path!)).toContain(hexKey({ q: 1, r: 1 }));
    expect(pathCost('warrior', map, path!)).toBe(4);
  });

  it('2. predicted path cost equals the movement the executor would consume', () => {
    const map = roadDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: warrior })!;

    // Independent recomputation via the executor's per-step function.
    const consumed = pathCost('warrior', map, path);
    // findPath's own internal gScore for the destination (exposed via re-sum).
    expect(consumed).toBe(4);
  });

  it('3. movement range and findPath agree: a cheap road tile is reachable, an', () => {
    // 2-move warrior. Road corridor lets it reach (3,0) via cost 4 > 2 (not this
    // turn) but reach (2,1) at cost 3 -> also not this turn; (1,1) at cost 2 IS.
    const map = roadDetourMap();
    const state = {
      units: {},
      cities: {},
      barbarianCamps: {},
      map,
      civilizations: { player: { techState: { completed: [] }, diplomacy: { atWarWith: [], relationships: {} } } },
    } as unknown as GameState;
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    warrior.movementPointsLeft = 2;
    state.units = { [warrior.id]: warrior };
    (state.civilizations.player as unknown as { units: string[] }).units = [warrior.id];

    const details = getMovementRangeDetails(state, warrior.id);
    const reachKeys = details.reachable.map(hexKey);
    // (1,1) costs 2 on the road -> reachable.
    expect(reachKeys).toContain(hexKey({ q: 1, r: 1 }));
    // (1,0) is a mountain costing 4 -> NOT reachable with 2 moves (and not adjacent-forced beyond 1).
    expect(reachKeys).not.toContain(hexKey({ q: 2, r: 0 }));
  });

  it('4. findPathToCity threads unit context so a road route to a city wins', () => {
    // city sits at (3,0); same detour map.
    const map = roadDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    const path = findPathToCity({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: warrior });
    expect(path).not.toBeNull();
    expect(keysOf(path!)).not.toContain(hexKey({ q: 1, r: 0 }));
    expect(pathCost('warrior', map, path!)).toBe(4);
  });

  it('5. a road-count-blind caller (unitType only, no Unit) is still cost-aware', () => {
    const map = roadDetourMap();
    const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unitType: 'warrior' });
    expect(path).not.toBeNull();
    expect(keysOf(path!)).not.toContain(hexKey({ q: 1, r: 0 }));
  });

  it('6. river-edge surcharge: prefers a longer dry route over an unbridged crossing', () => {
    // (0,0)->(1,0)->(2,0) crosses two rivers (+1 each); dry detour via r=1.
    const map = buildMap(
      {
        '0,0': {}, '1,0': {}, '2,0': {},
        '0,1': {}, '1,1': {}, '2,1': {},
      },
      { rivers: [ { from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }, { from: { q: 1, r: 0 }, to: { q: 2, r: 0 } } ] },
    );
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    const path = findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'land', { unit: warrior })!;
    // dry route cost 3 (1+1+1) beats wet route cost 4 (2+2 with surcharges... actually 1+1+1+1)
    expect(pathCost('warrior', map, path)).toBeLessThanOrEqual(3);
  });

  it('7. terrain parity: a road corridor through forest beats bare forest steps', () => {
    const map = buildMap({
      '0,0': {}, '1,0': { terrain: 'forest' }, '2,0': { terrain: 'forest' }, '3,0': {},
      '0,1': { terrain: 'forest', hasRoad: true },
      '1,1': { terrain: 'forest', hasRoad: true },
      '2,1': { terrain: 'forest', hasRoad: true },
    });
    // direct: forest 2 + forest 2 + grass 1 = 5 ; detour: road 1x3 + grass 1 = 4
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: warrior })!;
    expect(keysOf(path)).toContain(hexKey({ q: 1, r: 1 }));
    expect(pathCost('warrior', map, path)).toBe(4);
  });

  it('8. unit-type parity: two movement profiles both take the cost-optimal route', () => {
    const map = roadDetourMap();
    for (const type of ['warrior', 'scout'] as UnitType[]) {
      const unit = createUnit(type, 'player', { q: 0, r: 0 }, mkCtx());
      const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit })!;
      expect(keysOf(path)).not.toContain(hexKey({ q: 1, r: 0 }));
    }
  });

  it('9. wraparound: equal-cost wrapped routes resolve to a single deterministic path', () => {
    const tiles: GameMap['tiles'] = {};
    for (let q = 0; q < 6; q++) {
      for (let r = 0; r < 3; r++) {
        tiles[hexKey({ q, r })] = {
          coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
          improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
        };
      }
    }
    const map: GameMap = { width: 6, height: 3, wrapsHorizontally: true, tiles, rivers: [] };
    const warrior = createUnit('warrior', 'player', { q: 0, r: 1 }, mkCtx());
    const a = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land', { unit: warrior });
    const b = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land', { unit: warrior });
    expect(a).toEqual(b);
    expect(a!.length).toBe(4); // 3 steps either way around a width-6 wrap
  });

  it('10. named #1042 regression: AI-style call with owner techs follows the road', () => {
    const map = roadDetourMap();
    const completedTechs = ['road-building'];
    const path = findPath(
      { q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land',
      { unitType: 'missionary', completedTechs },
    );
    expect(path).not.toBeNull();
    expect(keysOf(path!)).not.toContain(hexKey({ q: 1, r: 0 }));
  });

  it('11. determinism: identical query and a JSON round-trip yield the identical path', () => {
    const map = roadDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    const first = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: warrior });
    const reloaded = JSON.parse(JSON.stringify(map)) as GameMap;
    const second = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, reloaded, 'land', { unit: warrior });
    expect(second).toEqual(first);
  });

  it('12. road-discount tech: A* stays optimal when road steps cost 0.5', () => {
    // With military-logistics, r=1 road corridor costs 0.5/step. The mountain
    // route is still 9. Heuristic must remain admissible or A* locks in a worse path.
    const map = roadDetourMap();
    const completedTechs = ['military-logistics'];
    const path = findPath(
      { q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land',
      { unitType: 'warrior', completedTechs },
    )!;
    expect(keysOf(path)).not.toContain(hexKey({ q: 1, r: 0 }));
    // (0,1)+(1,1)+(2,1) road @0.5 + (3,0) grassland @1 = 2.5
    expect(pathCost('warrior', map, path, completedTechs)).toBeCloseTo(2.5, 5);
  });
});

/** Brute-force Dijkstra over the canonical step-cost model — the optimal answer. */
function dijkstraCost(
  params: MovementStepCostParams,
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
): number {
  const dist = new Map<string, number>([[hexKey(from), 0]]);
  const done = new Set<string>();
  while (done.size < Object.keys(map.tiles).length) {
    let curKey = '';
    let curDist = Infinity;
    for (const [k, d] of dist) {
      if (!done.has(k) && d < curDist) { curDist = d; curKey = k; }
    }
    if (curKey === '') break;
    done.add(curKey);
    if (curKey === hexKey(to)) return curDist;
    const cur = map.tiles[curKey]!.coord;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(cur, map.width)
      : hexNeighbors(cur);
    for (const n of neighbors) {
      const nKey = hexKey(n);
      if (!map.tiles[nKey] || done.has(nKey)) continue;
      const step = getMovementStepCostFor(params, map, cur, n);
      if (step === Infinity) continue;
      const nd = curDist + step;
      if (nd < (dist.get(nKey) ?? Infinity)) dist.set(nKey, nd);
    }
  }
  return dist.get(hexKey(to)) ?? Infinity;
}

describe('#1042 — findPath route cost equals the Dijkstra optimum (admissible heuristic)', () => {
  const cases: Array<{ name: string; map: GameMap; techs: string[] }> = [
    { name: 'hills detour, no tech', map: roadDetourMap(), techs: [] },
    { name: 'hills detour, military-logistics (0.5 road steps)', map: roadDetourMap(), techs: ['military-logistics'] },
    {
      name: 'road wanders away from the goal before turning back',
      // Expensive mountains straight to the goal; a full-road ring south + east.
      map: buildMap({
        '0,0': {}, '1,0': { terrain: 'mountain' }, '2,0': { terrain: 'mountain' },
        '3,0': { terrain: 'mountain' }, '4,0': {},
        '0,1': { terrain: 'hills', hasRoad: true }, '1,1': { terrain: 'hills', hasRoad: true },
        '2,1': { terrain: 'hills', hasRoad: true }, '3,1': { terrain: 'hills', hasRoad: true },
        '4,1': { terrain: 'hills', hasRoad: true },
      }),
      techs: ['military-logistics'],
    },
    {
      // #1042 MR5 — a size where the O(V^2) scan and the O(V log V) heap actually
      // diverge in work done; the returned route must still be the Dijkstra optimum.
      name: 'large map: mountains straight, long road ring (~54 tiles)',
      map: buildMap((() => {
        const s: Record<string, TileSpec> = {};
        for (let q = 0; q < 9; q++) for (let r = 0; r < 6; r++) {
          s[`${q},${r}`] = r === 5
            ? { terrain: 'hills', hasRoad: true }
            : (q > 0 && q < 8 && r === 0 ? { terrain: 'mountain' } : {});
        }
        return s;
      })()),
      techs: ['military-logistics'],
    },
  ];

  for (const { name, map, techs } of cases) {
    it(name, () => {
      const params = movementStepCostParamsForType('warrior', 'land', { completedTechs: techs, owner: 'player' });
      const start = { q: 0, r: 0 };
      const goal = { q: map.width - 1, r: 0 };
      const path = findPath(start, goal, map, 'land', { unitType: 'warrior', completedTechs: techs });
      expect(path).not.toBeNull();
      let cost = 0;
      for (let i = 1; i < path!.length; i++) cost += getMovementStepCostFor(params, map, path![i - 1]!, path![i]!);
      expect(cost).toBeCloseTo(dijkstraCost(params, map, start, goal), 5);
    });
  }
});

describe('#1042 — getMovementStepCostFor is the canonical no-Unit cost provider', () => {
  it('matches getMovementStepCost for the same terrain/road/tech inputs', () => {
    const map = roadDetourMap();
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, mkCtx());
    const viaUnit = getMovementStepCost(warrior, map, { q: 0, r: 0 }, { q: 0, r: 1 }, { completedTechs: [] });
    const viaParams = getMovementStepCostFor(
      { domain: UNIT_DEFINITIONS.warrior.domain ?? 'land', terrainCostOverrides: UNIT_DEFINITIONS.warrior.terrainCostOverrides, completedTechs: [] },
      map, { q: 0, r: 0 }, { q: 0, r: 1 },
    );
    expect(viaParams).toBe(viaUnit);
  });
});

/**
 * Verbatim port of findPath's PRE-MR5 open-set selection (linear scan, three-tier
 * tie-break: f asc, then g desc, then hexKey asc; EPS = 1e-9). Exists ONLY to pin the
 * MR5 binary-heap refactor: if findPath's selection order is ever deliberately changed,
 * delete this and its assertions rather than updating them.
 */
function referenceFindPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air',
  options: { unitType?: UnitType; completedTechs?: string[]; owner?: string } = {},
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile) return null;
  const costParams = movementStepCostParamsForType(options.unitType, domain, {
    completedTechs: options.completedTechs, owner: options.owner,
  });
  if (!isPassableForParams(costParams, toTile.terrain)) return null;
  const minStepCost = costParams.domain === 'land'
    && hasRoadMovementDiscount(costParams.completedTechs ?? []) ? 0.5 : 1;
  const EPS = 1e-9;

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>([[hexKey(from), 0]]);
  const openSet = new Set<string>([hexKey(from)]);
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>([[hexKey(from), from]]);

  while (openSet.size > 0) {
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
        || (Math.abs(f - lowestF) <= EPS && Math.abs(g - lowestG) <= EPS
            && (currentKey === '' || key < currentKey));
      if (better) { lowestF = f; lowestG = g; currentKey = key; }
    }

    if (currentKey === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = currentKey;
      while (key) { path.unshift(coords.get(key)!); key = parents.get(key) ?? null; }
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

/** Deterministic random land map (wrapping ~30% of the time) from a seed. */
function randomMap(seed: number): GameMap {
  const rng = seededLcg(seed);
  const w = 5 + Math.floor(rng() * 5);   // 5..9
  const h = 4 + Math.floor(rng() * 4);   // 4..7
  const wraps = rng() < 0.3;
  const terrains: HexTile['terrain'][] = ['grassland', 'plains', 'forest', 'hills', 'mountain'];
  const tiles: GameMap['tiles'] = {};
  const rivers: GameMap['rivers'] = [];
  for (let q = 0; q < w; q++) {
    for (let r = 0; r < h; r++) {
      const t = terrains[Math.floor(rng() * terrains.length)]!;
      tiles[hexKey({ q, r })] = {
        coord: { q, r }, terrain: t, elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0,
        hasRiver: false, hasRoad: rng() < 0.25, wonder: null,
      };
      if (rng() < 0.12 && q + 1 < w) rivers.push({ from: { q, r }, to: { q: q + 1, r } });
    }
  }
  return { width: w, height: h, wrapsHorizontally: wraps, tiles, rivers };
}

describe('#1042 MR5 — findPath matches the pre-MR5 linear-scan oracle exactly', () => {
  const techSets: string[][] = [[], ['military-logistics'], ['road-building']];

  it('roadDetourMap fixture across techs and unit types: identical to referenceFindPath', () => {
    const map = roadDetourMap();
    for (const techs of techSets) {
      for (const type of ['warrior', 'scout', 'missionary'] as UnitType[]) {
        const opts = { unitType: type, completedTechs: techs, owner: 'player' };
        expect(findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', opts))
          .toEqual(referenceFindPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', opts));
      }
    }
  });

  it('120 seeded random maps x 4 start/goal pairs: identical to referenceFindPath', () => {
    // Equal or unreachable from/to pairs need no filtering — findPath and referenceFindPath
    // handle them identically ([from] for equal, null for unreachable), so .toEqual holds.
    let compared = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const map = randomMap(seed);
      const keys = Object.keys(map.tiles);
      const pick = seededLcg(seed * 7 + 1);
      for (let p = 0; p < 4; p++) {
        const from = map.tiles[keys[Math.floor(pick() * keys.length)]!]!.coord;
        const to = map.tiles[keys[Math.floor(pick() * keys.length)]!]!.coord;
        const techs = techSets[Math.floor(pick() * techSets.length)]!;
        const opts = { unitType: 'warrior' as UnitType, completedTechs: techs, owner: 'player' };
        expect(
          findPath(from, to, map, 'land', opts),
          `seed ${seed} pair ${p} ${hexKey(from)}->${hexKey(to)}`,
        ).toEqual(referenceFindPath(from, to, map, 'land', opts));
        compared++;
      }
    }
    expect(compared).toBe(480);
  });

  it('naval domain: equal-cost water routes resolve identically to referenceFindPath', () => {
    // Uniform cost 1 -> many equal-f nodes; the tie-break path through the heap must
    // still match the linear scan. trireme is ocean-going so the routes actually resolve.
    const tiles: GameMap['tiles'] = {};
    for (let q = 0; q < 7; q++) for (let r = 0; r < 4; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r }, terrain: r === 0 || r === 3 ? 'coast' : 'ocean',
        elevation: 'lowland', resource: null, improvement: 'none', owner: null,
        improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
      };
    }
    for (const wraps of [false, true]) {
      const map: GameMap = { width: 7, height: 4, wrapsHorizontally: wraps, tiles, rivers: [] };
      for (const [from, to] of [
        [{ q: 0, r: 1 }, { q: 5, r: 2 }], [{ q: 6, r: 0 }, { q: 1, r: 3 }],
        [{ q: 0, r: 0 }, { q: 0, r: 0 }],
      ] as Array<[HexCoord, HexCoord]>) {
        const opts = { unitType: 'trireme' as UnitType, completedTechs: [], owner: 'player' };
        expect(findPath(from, to, map, 'naval', opts))
          .toEqual(referenceFindPath(from, to, map, 'naval', opts));
      }
    }
  });
});
