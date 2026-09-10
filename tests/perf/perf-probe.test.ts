import { describe, expect, it } from 'vitest';
import { BinaryHeap } from '@/systems/binary-heap';
import { findPath } from '@/systems/unit-pathfinding';
import { createNewGame } from '@/core/game-state';
import { withPerfProbe } from './perf-probe';

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
      pathQueries: 0,
      visibilityPasses: 0,
      cityYieldCalls: 0,
    });
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
});
