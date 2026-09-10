/**
 * #1007 — machine-independent work counters, ZERO production instrumentation.
 *
 * `withPerfProbe(fn)` installs `vi.spyOn` wrappers on a curated set of already-
 * exported functions / prototype methods, runs `fn`, restores every spy it made,
 * and returns integer counts. Each spy *calls through* to the real implementation
 * (`this` preserved), so it changes wall-clock only — never behaviour.
 *
 * These counts are the algorithmic-regression signal: same seed ⇒ same
 * operations ⇒ identical counts. A count that varies run-to-run is a
 * non-deterministic operation and is disqualified as a gate.
 *
 * NOT under `src/`. `tests/scripts/perf-isolation.test.ts` asserts production
 * code never imports vitest, uses `vi.*`, or references `tests/perf`.
 */
import { vi, type MockInstance } from 'vitest';
import { BinaryHeap } from '@/systems/binary-heap';
import * as pathfinding from '@/systems/unit-pathfinding';
import * as legality from '@/systems/unit-movement-legality';
import * as fogOfWar from '@/systems/fog-of-war';
import * as resourceSystem from '@/systems/resource-system';

export interface PerfCounts {
  /** whole-`GameState` `structuredClone(...)` calls (arg has `.civilizations`, `.units`, `.map`) */
  structuredCloneWholeState: number;
  /** `BinaryHeap.prototype.pop` calls — A* node examinations across every `findPath` */
  heapPops: number;
  /** `BinaryHeap.prototype.push` calls — A* node relaxations */
  heapPushes: number;
  /** `getBlockingMapEntityAt` calls — per-coordinate `Object.values(state.cities).find(...)` scans */
  blockingEntityAtCalls: number;
  /** `findPath` calls (cross-module; internal `findPathToCity`→`findPath` is only in `heapPops`) */
  pathQueries: number;
  /** `updateVisibility` calls — full fog recomputations */
  visibilityPasses: number;
  /** `calculateCityYields` calls — per-city economic recompute */
  cityYieldCalls: number;
}

function emptyCounts(): PerfCounts {
  return {
    structuredCloneWholeState: 0,
    heapPops: 0,
    heapPushes: 0,
    blockingEntityAtCalls: 0,
    pathQueries: 0,
    visibilityPasses: 0,
    cityYieldCalls: 0,
  };
}

function isWholeState(value: unknown): boolean {
  return (
    !!value
    && typeof value === 'object'
    && 'civilizations' in value
    && 'units' in value
    && 'map' in value
  );
}

let active = false;

export function withPerfProbe<T>(fn: () => T): { result: T; counts: PerfCounts } {
  if (active) {
    throw new Error('withPerfProbe does not support nesting — flatten the measured operation.');
  }
  active = true;

  const counts = emptyCounts();
  const spies: MockInstance[] = [];

  // --- prototype methods: preserve `this` ---
  const heapPopOrig = BinaryHeap.prototype.pop;
  spies.push(
    vi.spyOn(BinaryHeap.prototype, 'pop').mockImplementation(function (this: BinaryHeap<unknown>) {
      counts.heapPops += 1;
      return heapPopOrig.call(this);
    }),
  );
  const heapPushOrig = BinaryHeap.prototype.push;
  spies.push(
    vi.spyOn(BinaryHeap.prototype, 'push').mockImplementation(function (this: BinaryHeap<unknown>, value: unknown) {
      counts.heapPushes += 1;
      return heapPushOrig.call(this, value);
    }),
  );

  // --- global: bare `structuredClone(state)` in src ---
  const structuredCloneOrig = globalThis.structuredClone;
  spies.push(
    vi.spyOn(globalThis, 'structuredClone').mockImplementation((value: unknown, options?: unknown) => {
      if (isWholeState(value)) counts.structuredCloneWholeState += 1;
      return (structuredCloneOrig as (v: unknown, o?: unknown) => unknown)(value, options);
    }),
  );

  // --- cross-module namespace spies: capture original before spying ---
  const blockingOrig = legality.getBlockingMapEntityAt;
  spies.push(
    vi.spyOn(legality, 'getBlockingMapEntityAt').mockImplementation((...args: Parameters<typeof blockingOrig>) => {
      counts.blockingEntityAtCalls += 1;
      return blockingOrig(...args);
    }),
  );

  const findPathOrig = pathfinding.findPath;
  spies.push(
    vi.spyOn(pathfinding, 'findPath').mockImplementation((...args: Parameters<typeof findPathOrig>) => {
      counts.pathQueries += 1;
      return findPathOrig(...args);
    }),
  );

  const updateVisibilityOrig = fogOfWar.updateVisibility;
  spies.push(
    vi.spyOn(fogOfWar, 'updateVisibility').mockImplementation((...args: Parameters<typeof updateVisibilityOrig>) => {
      counts.visibilityPasses += 1;
      return updateVisibilityOrig(...args);
    }),
  );

  const cityYieldsOrig = resourceSystem.calculateCityYields;
  spies.push(
    vi.spyOn(resourceSystem, 'calculateCityYields').mockImplementation((...args: Parameters<typeof cityYieldsOrig>) => {
      counts.cityYieldCalls += 1;
      return cityYieldsOrig(...args);
    }),
  );

  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error(
        'withPerfProbe only measures SYNCHRONOUS operations — the spies restore before an '
        + 'async op resolves, so its counts would be garbage. Await the op outside the probe '
        + 'and measure a sync slice, or add async support here deliberately.',
      );
    }
    return { result, counts };
  } finally {
    for (const spy of spies) spy.mockRestore();
    active = false;
  }
}
