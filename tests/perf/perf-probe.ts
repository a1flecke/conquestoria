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
  /** `getBlockingMapEntitiesByHex` calls — canonical per-unit blocker-map builds */
  blockingMapEntityLookupBuilds: number;
  /** `findPath` calls (cross-module; internal `findPathToCity`→`findPath` is only in `heapPops`) */
  pathQueries: number;
  /** `updateVisibility` calls — full fog recomputations */
  visibilityPasses: number;
  /** `calculateCityYields` calls — per-city economic recompute */
  cityYieldCalls: number;
}

export type PathfindingAttributionCounts = Pick<PerfCounts, 'heapPops' | 'heapPushes' | 'pathQueries'>;

export interface PerfProbeScope {
  run<T>(key: string, fn: () => T): T;
}

export interface PerfProbeOptions {
  attribution?: { defaultScope: string };
}

export interface PerfProbeResult<T> {
  result: T;
  counts: PerfCounts;
  attribution?: Readonly<Record<string, PathfindingAttributionCounts>>;
}

function emptyCounts(): PerfCounts {
  return {
    structuredCloneWholeState: 0,
    heapPops: 0,
    heapPushes: 0,
    blockingEntityAtCalls: 0,
    blockingMapEntityLookupBuilds: 0,
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

function emptyPathfindingAttributionCounts(): PathfindingAttributionCounts {
  return { heapPops: 0, heapPushes: 0, pathQueries: 0 };
}

function assertScopeKey(key: string): void {
  if (!key.trim()) throw new Error('Perf attribution scope key must be non-empty.');
}

export function withPerfProbe<T>(
  fn: (scope: PerfProbeScope) => T,
  options: PerfProbeOptions = {},
): PerfProbeResult<T> {
  if (active) {
    throw new Error('withPerfProbe does not support nesting — flatten the measured operation.');
  }
  active = true;

  const counts = emptyCounts();
  const spies: MockInstance[] = [];
  const attributionByScope = new Map<string, PathfindingAttributionCounts>();
  let currentScope = options.attribution?.defaultScope;
  if (currentScope) assertScopeKey(currentScope);

  const countAttributed = (field: keyof PathfindingAttributionCounts): void => {
    if (!options.attribution || !currentScope) return;
    const scopeCounts = attributionByScope.get(currentScope) ?? emptyPathfindingAttributionCounts();
    scopeCounts[field] += 1;
    attributionByScope.set(currentScope, scopeCounts);
  };

  const scope: PerfProbeScope = {
    run<T>(key: string, operation: () => T): T {
      assertScopeKey(key);
      const previousScope = currentScope;
      currentScope = key;
      try {
        return operation();
      } finally {
        currentScope = previousScope;
      }
    },
  };

  try {
    // --- prototype methods: preserve `this` ---
    const heapPopOrig = BinaryHeap.prototype.pop;
    spies.push(
      vi.spyOn(BinaryHeap.prototype, 'pop').mockImplementation(function (this: BinaryHeap<unknown>) {
        counts.heapPops += 1;
        countAttributed('heapPops');
        return heapPopOrig.call(this);
      }),
    );
    const heapPushOrig = BinaryHeap.prototype.push;
    spies.push(
      vi.spyOn(BinaryHeap.prototype, 'push').mockImplementation(function (this: BinaryHeap<unknown>, value: unknown) {
        counts.heapPushes += 1;
        countAttributed('heapPushes');
        return heapPushOrig.call(this, value);
      }),
    );

    // --- global: bare `structuredClone(state)` in src ---
    const structuredCloneOrig = globalThis.structuredClone;
    spies.push(
      vi.spyOn(globalThis, 'structuredClone').mockImplementation((value: unknown, cloneOptions?: unknown) => {
        if (isWholeState(value)) counts.structuredCloneWholeState += 1;
        return (structuredCloneOrig as (v: unknown, o?: unknown) => unknown)(value, cloneOptions);
      }),
    );

    // --- cross-module namespace spies: capture original before spying ---
    const blockingLookupOrig = legality.getBlockingMapEntitiesByHex;
    spies.push(
      vi.spyOn(legality, 'getBlockingMapEntitiesByHex').mockImplementation((...args: Parameters<typeof blockingLookupOrig>) => {
        counts.blockingMapEntityLookupBuilds += 1;
        return blockingLookupOrig(...args);
      }),
    );

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
        countAttributed('pathQueries');
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

    const result = fn(scope);
    if (result instanceof Promise) {
      throw new Error(
        'withPerfProbe only measures SYNCHRONOUS operations — the spies restore before an '
        + 'async op resolves, so its counts would be garbage. Await the op outside the probe '
        + 'and measure a sync slice, or add async support here deliberately.',
      );
    }
    if (!options.attribution) return { result, counts };
    return {
      result,
      counts,
      attribution: Object.fromEntries(
        [...attributionByScope.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, { ...value }]),
      ),
    };
  } finally {
    for (const spy of spies.reverse()) spy.mockRestore();
    active = false;
  }
}
