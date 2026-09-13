import { describe, expect, it } from 'vitest';
import { BinaryHeap } from '@/systems/binary-heap';
import { findPath } from '@/systems/unit-pathfinding';
import { createNewGame } from '@/core/game-state';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { withPerfProbe, type PathfindingAttributionCounts } from './perf-probe';

/**
 * #1007 — the probe itself. Fast tier. Proves the counters count, an empty op
 * counts nothing, the spies always restore (even on throw), and nesting is
 * rejected.
 */

function tinyMap() {
  return createNewGame({
    civType: 'rome',
    seed: 'perf-probe-unit',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'probe',
    opponentChallenge: 'standard',
  }).map;
}

function routeEndpoints(map: ReturnType<typeof tinyMap>) {
  const keys = Object.keys(map.tiles).sort();
  const [aq, ar] = keys[0]!.split(',').map(Number);
  const [bq, br] = keys[keys.length - 1]!.split(',').map(Number);
  return [{ q: aq!, r: ar! }, { q: bq!, r: br! }] as const;
}

describe('withPerfProbe', () => {
  it('counts heap ops from a real findPath', () => {
    const map = tinyMap();
    const keys = Object.keys(map.tiles).sort();
    const [aq, ar] = keys[0]!.split(',').map(Number);
    const [bq, br] = keys[keys.length - 1]!.split(',').map(Number);

    const { counts } = withPerfProbe(() =>
      findPath({ q: aq!, r: ar! }, { q: bq!, r: br! }, map, 'land'));

    expect(counts.heapPops).toBeGreaterThan(0);
    expect(counts.heapPushes).toBeGreaterThan(0);
    expect(counts.pathQueries).toBe(1);
  });

  it('counts nothing for an empty operation', () => {
    const { counts } = withPerfProbe(() => 42);
    expect(counts).toEqual({
      structuredCloneWholeState: 0,
      heapPops: 0,
      heapPushes: 0,
      blockingEntityAtCalls: 0,
      blockingMapEntityLookupBuilds: 0,
      pathQueries: 0,
      visibilityPasses: 0,
      cityYieldCalls: 0,
    });
  });

  it('counts one canonical blocker lookup and no direct coordinate lookup for a detailed movement query', () => {
    const state = createNewGame({
      civType: 'rome',
      seed: 'perf-probe-movement-lookup',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'probe-movement',
      opponentChallenge: 'standard',
    });
    const unitId = Object.keys(state.units)[0];
    if (!unitId) throw new Error('fixture must create a unit');

    const { counts } = withPerfProbe(() => getMovementRangeDetails(state, unitId));

    expect(counts.blockingMapEntityLookupBuilds).toBe(1);
    expect(counts.blockingEntityAtCalls).toBe(0);
  });

  it('restores every spy even when the operation throws', () => {
    const popBefore = BinaryHeap.prototype.pop;
    expect(() => withPerfProbe(() => { throw new Error('boom'); })).toThrow('boom');
    expect(BinaryHeap.prototype.pop).toBe(popBefore);
    // and a plain findPath afterwards is unaffected
    const map = tinyMap();
    const keys = Object.keys(map.tiles).sort();
    const [aq, ar] = keys[0]!.split(',').map(Number);
    const [bq, br] = keys[keys.length - 1]!.split(',').map(Number);
    expect(() => findPath({ q: aq!, r: ar! }, { q: bq!, r: br! }, map, 'land')).not.toThrow();
  });

  it('rejects nesting', () => {
    expect(() =>
      withPerfProbe(() => withPerfProbe(() => 1)),
    ).toThrow(/does not support nesting/);
  });

  it('is deterministic — identical counts across repeated runs', () => {
    const map = tinyMap();
    const keys = Object.keys(map.tiles).sort();
    const [aq, ar] = keys[0]!.split(',').map(Number);
    const [bq, br] = keys[keys.length - 1]!.split(',').map(Number);
    const run = () => withPerfProbe(() =>
      findPath({ q: aq!, r: ar! }, { q: bq!, r: br! }, map, 'land')).counts;
    expect(run()).toEqual(run());
    expect(run()).toEqual(run());
  });

  it('attributes every pathfinding counter to the active scope and reconciles aggregates', () => {
    const map = tinyMap();
    const [from, to] = routeEndpoints(map);

    const { counts, attribution } = withPerfProbe(
      scope => {
        scope.run('turn:pirates', () => findPath(from, to, map, 'land'));
        return scope.run('turn:route-runners', () => findPath(to, from, map, 'land'));
      },
      { attribution: { defaultScope: 'turn:unattributed-pathfinding' } },
    );

    const sums = Object.values(attribution!).reduce<PathfindingAttributionCounts>(
      (total, value) => ({
        pathQueries: total.pathQueries + value.pathQueries,
        heapPops: total.heapPops + value.heapPops,
        heapPushes: total.heapPushes + value.heapPushes,
      }),
      { pathQueries: 0, heapPops: 0, heapPushes: 0 },
    );

    expect(attribution?.['turn:pirates']?.pathQueries).toBe(1);
    expect(attribution?.['turn:route-runners']?.pathQueries).toBe(1);
    expect(sums).toEqual({
      pathQueries: counts.pathQueries,
      heapPops: counts.heapPops,
      heapPushes: counts.heapPushes,
    });
  });

  it('restores the prior scope after a scoped callback throws', () => {
    const map = tinyMap();
    const [from, to] = routeEndpoints(map);

    const { attribution } = withPerfProbe(
      scope => {
        expect(() => scope.run('turn:pirates', () => { throw new Error('boom'); })).toThrow('boom');
        findPath(from, to, map, 'land');
      },
      { attribution: { defaultScope: 'turn:unattributed-pathfinding' } },
    );

    expect(attribution?.['turn:unattributed-pathfinding']?.pathQueries).toBe(1);
    expect(attribution?.['turn:pirates']).toBeUndefined();
  });
});
