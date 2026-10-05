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
import * as economySystem from '@/systems/economy-system';
import * as roadNetwork from '@/systems/road-network';

export interface PerfCounts {
  /** whole-`GameState` `structuredClone(...)` calls (arg has `.civilizations`, `.units`, `.map`) */
  structuredCloneWholeState: number;
  /** approximate serialized volume (`JSON.stringify(arg).length`) of those whole-state clones (#1235) */
  structuredCloneWholeStateBytes: number;
  /** those whole-state clones attributed to their first caller outside this probe (#1235, informational) */
  structuredCloneWholeStateBySite: Record<string, number>;
  /** approximate serialized volume of those clones attributed to each caller (#1330, informational) */
  structuredCloneWholeStateBytesBySite: Record<string, number>;
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
  /** `calculateCivEconomy` calls — whole-empire economy projection (#1235) */
  civEconomyCalls: number;
  /** those `calculateCivEconomy` calls attributed to their caller frame (#1320, informational) */
  civEconomyCallsBySite: Record<string, number>;
  /** `projectCivGrossGold` calls — whole-empire gross-gold projection (#1235) */
  projectedGrossGoldCalls: number;
  /** `getEconomyStatusForCiv` calls — whole-empire economy-status projection (#1235) */
  economyStatusCalls: number;
  /** `getCitiesConnectedToCapital` calls — capital connectivity BFS (#1235) */
  roadConnectivityCalls: number;
  /** `canConnectCityToCapitalByOwnedRoad` calls — owned-road connection BFS (#1235) */
  ownedRoadConnectivityCalls: number;
  /** `getOwnedRoadTileCount` calls — full-map owned-road tile scan (#1235) */
  ownedRoadTileScans: number;
}

function emptyCounts(): PerfCounts {
  return {
    structuredCloneWholeState: 0,
    structuredCloneWholeStateBytes: 0,
    structuredCloneWholeStateBySite: {},
    structuredCloneWholeStateBytesBySite: {},
    heapPops: 0,
    heapPushes: 0,
    blockingEntityAtCalls: 0,
    blockingMapEntityLookupBuilds: 0,
    pathQueries: 0,
    visibilityPasses: 0,
    cityYieldCalls: 0,
    civEconomyCalls: 0,
    civEconomyCallsBySite: {},
    projectedGrossGoldCalls: 0,
    economyStatusCalls: 0,
    roadConnectivityCalls: 0,
    ownedRoadConnectivityCalls: 0,
    ownedRoadTileScans: 0,
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

/**
 * #1235 — deterministic approximate serialized volume of a whole-state clone.
 * `JSON.stringify(...).length` (the issue's suggested proxy), guarded so an
 * unserializable argument can never make the instrumentation change behaviour.
 */
function approximateStateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * #1235/#1320 — the first caller frame outside this probe, normalized to a
 * repo-ish path, for the informational "where the work is" attribution. Used
 * for whole-state clones and `calculateCivEconomy` calls. Never part of a
 * budget; only labels the measured total.
 */
function callSiteFromStack(): string {
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n').slice(1)) {
    const match = line.match(/([^\s()]+\.(?:ts|tsx|js|mjs)):\d+:\d+/);
    if (!match) continue;
    const file = match[1]!;
    // Skip this probe module itself (but NOT `perf-probe.test.ts`), plus vitest's
    // own frames, so the first remaining frame is the real caller.
    if (/(?:^|\/)perf-probe\.(?:ts|tsx|js|mjs)$/.test(file)) continue;
    if (file.includes('node_modules') || file.includes('vitest')) continue;
    const repoPath = file.match(/((?:src|tests|scripts)\/.*)$/);
    return repoPath ? repoPath[1]! : file;
  }
  return 'unknown';
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
      if (isWholeState(value)) {
        const bytes = approximateStateBytes(value);
        counts.structuredCloneWholeState += 1;
        counts.structuredCloneWholeStateBytes += bytes;
        const site = callSiteFromStack();
        counts.structuredCloneWholeStateBySite[site] = (counts.structuredCloneWholeStateBySite[site] ?? 0) + 1;
        counts.structuredCloneWholeStateBytesBySite[site] = (counts.structuredCloneWholeStateBytesBySite[site] ?? 0) + bytes;
      }
      return (structuredCloneOrig as (v: unknown, o?: unknown) => unknown)(value, options);
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

  // #1235 — whole-empire economy projections.
  const civEconomyOrig = economySystem.calculateCivEconomy;
  spies.push(
    vi.spyOn(economySystem, 'calculateCivEconomy').mockImplementation((...args: Parameters<typeof civEconomyOrig>) => {
      counts.civEconomyCalls += 1;
      // #1320: attribute each call to its first caller frame outside this probe.
      const site = callSiteFromStack();
      counts.civEconomyCallsBySite[site] = (counts.civEconomyCallsBySite[site] ?? 0) + 1;
      return civEconomyOrig(...args);
    }),
  );

  const projectedGrossGoldOrig = economySystem.projectCivGrossGold;
  spies.push(
    vi.spyOn(economySystem, 'projectCivGrossGold').mockImplementation((...args: Parameters<typeof projectedGrossGoldOrig>) => {
      counts.projectedGrossGoldCalls += 1;
      return projectedGrossGoldOrig(...args);
    }),
  );

  const economyStatusOrig = economySystem.getEconomyStatusForCiv;
  spies.push(
    vi.spyOn(economySystem, 'getEconomyStatusForCiv').mockImplementation((...args: Parameters<typeof economyStatusOrig>) => {
      counts.economyStatusCalls += 1;
      return economyStatusOrig(...args);
    }),
  );

  // #1235 — road-network / BFS work.
  const roadConnectivityOrig = roadNetwork.getCitiesConnectedToCapital;
  spies.push(
    vi.spyOn(roadNetwork, 'getCitiesConnectedToCapital').mockImplementation((...args: Parameters<typeof roadConnectivityOrig>) => {
      counts.roadConnectivityCalls += 1;
      return roadConnectivityOrig(...args);
    }),
  );

  const ownedRoadConnectivityOrig = roadNetwork.canConnectCityToCapitalByOwnedRoad;
  spies.push(
    vi.spyOn(roadNetwork, 'canConnectCityToCapitalByOwnedRoad').mockImplementation((...args: Parameters<typeof ownedRoadConnectivityOrig>) => {
      counts.ownedRoadConnectivityCalls += 1;
      return ownedRoadConnectivityOrig(...args);
    }),
  );

  const ownedRoadTileCountOrig = roadNetwork.getOwnedRoadTileCount;
  spies.push(
    vi.spyOn(roadNetwork, 'getOwnedRoadTileCount').mockImplementation((...args: Parameters<typeof ownedRoadTileCountOrig>) => {
      counts.ownedRoadTileScans += 1;
      return ownedRoadTileCountOrig(...args);
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
