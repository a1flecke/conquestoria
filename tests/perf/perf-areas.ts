/**
 * #1007 — the ONE definition of each measured operation.
 *
 * Both the gate (`algorithmic-budgets.test.ts`, machine-independent counts) and
 * the local reporter (`report/perf-report.test.ts`, wall-clock) run these, so
 * `report.json` genuinely carries "the same counts the budgets assert on".
 */
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { findPath } from '@/systems/unit-pathfinding';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { withPerfProbe, type PerfCounts } from './perf-probe';
import { buildCrowdedGame, pathfindingFixture, type PathfindingFixture } from './fixtures/crowded-state';

export const PERF_AREAS = [
  'turn@e1', 'turn@e2',
  'aiRound@e1', 'aiRound@e2',
  'findPath',
  'moveRange@e1', 'moveRange@e2',
  'saveSerialize@e1', 'saveSerialize@e2',
  'saveLoad@e1', 'saveLoad@e2',
] as const;
export type PerfArea = (typeof PERF_AREAS)[number];

/** Areas cheap enough to re-measure 3× for the stability gate; the rest 2×. */
export const CHEAP_AREAS = new Set<PerfArea>([
  'turn@e1', 'turn@e2', 'findPath',
  'moveRange@e1', 'moveRange@e2', 'saveSerialize@e1', 'saveSerialize@e2',
  'saveLoad@e1', 'saveLoad@e2',
]);

export interface PerfFixtures {
  e1: GameState;
  e2: GameState;
  pf: PathfindingFixture;
}

export function buildPerfFixtures(): PerfFixtures {
  return {
    e1: buildCrowdedGame({ entityScale: 1 }),
    e2: buildCrowdedGame({ entityScale: 2 }),
    pf: pathfindingFixture(),
  };
}

export interface AreaSample extends Partial<PerfCounts> {
  bytes?: number;
  entityBytes?: number;
  cityCount?: number;
  derivedInnerBound?: number;
  routeLength?: number;
}

/**
 * A stable owned unit for the move-range measure: the FIRST unit of `player-1`
 * (a deterministic slot). Both `moveRange@e1` and `moveRange@e2` measure the
 * *same civ's* unit so the reachable-tile count (and therefore the blocker
 * call count) is comparable across scales, not two unrelated units.
 */
function moveRangeUnitId(state: GameState): string {
  const civ = state.civilizations['player-1'];
  const id = civ?.units.find(u => state.units[u]?.owner === 'player-1');
  if (id) return id;
  for (const c of Object.values(state.civilizations)) {
    for (const u of c.units) if (state.units[u]?.owner === c.id) return u;
  }
  throw new Error('perf fixture has no owned unit');
}

function entityPayloadBytes(state: GameState): number {
  return JSON.stringify({
    cities: state.cities,
    units: state.units,
    civilizations: state.civilizations,
    minorCivs: state.minorCivs,
    opponentAI: state.opponentAI,
  }).length;
}

/** Measure one area under the perf probe. Pure w.r.t. the fixtures (all ops are immutable-in). */
export function measurePerfArea(area: PerfArea, fx: PerfFixtures): AreaSample {
  switch (area) {
    case 'turn@e1':
    case 'turn@e2': {
      const state = area === 'turn@e1' ? fx.e1 : fx.e2;
      const { counts } = withPerfProbe(() => processTurn(state, new EventBus()));
      return {
        structuredCloneWholeState: counts.structuredCloneWholeState,
        heapPops: counts.heapPops,
        blockingEntityAtCalls: counts.blockingEntityAtCalls,
        visibilityPasses: counts.visibilityPasses,
        cityYieldCalls: counts.cityYieldCalls,
      };
    }
    case 'aiRound@e1':
    case 'aiRound@e2': {
      const state = area === 'aiRound@e1' ? fx.e1 : fx.e2;
      const { result, counts } = withPerfProbe(() => processNonHumanMajorRound(state, new EventBus()));
      if (result.planningErrors.length > 0) {
        throw new Error(
          `perf fixture ${area}: AI round produced planning errors, so the measurement `
          + `reflects a degenerate (bailed) path — fix the fixture:\n  `
          + result.planningErrors.map(e => `${e.actorId}: ${e.message}`).join('\n  '),
        );
      }
      return {
        pathQueries: counts.pathQueries,
        heapPops: counts.heapPops,
        structuredCloneWholeState: counts.structuredCloneWholeState,
        blockingEntityAtCalls: counts.blockingEntityAtCalls,
      };
    }
    case 'findPath': {
      const { map, from, to } = fx.pf;
      const { result, counts } = withPerfProbe(() => findPath(from, to, map, 'land'));
      if (result === null) {
        throw new Error('perf fixture findPath: the cross-map route is unroutable — the map shape changed, re-pick');
      }
      return {
        heapPops: counts.heapPops,
        heapPushes: counts.heapPushes,
        pathQueries: counts.pathQueries,
        routeLength: result.length,
      };
    }
    case 'moveRange@e1':
    case 'moveRange@e2': {
      const state = area === 'moveRange@e1' ? fx.e1 : fx.e2;
      const cityCount = Object.keys(state.cities).length;
      const { counts } = withPerfProbe(() => getMovementRangeDetails(state, moveRangeUnitId(state)));
      return {
        blockingEntityAtCalls: counts.blockingEntityAtCalls,
        cityCount,
        derivedInnerBound: counts.blockingEntityAtCalls * cityCount,
      };
    }
    case 'saveSerialize@e1':
    case 'saveSerialize@e2': {
      const state = area === 'saveSerialize@e1' ? fx.e1 : fx.e2;
      return { bytes: serializeSaveFile(state).length, entityBytes: entityPayloadBytes(state) };
    }
    case 'saveLoad@e1':
    case 'saveLoad@e2': {
      const state = area === 'saveLoad@e1' ? fx.e1 : fx.e2;
      const raw = serializeSaveFile(state);
      const { counts } = withPerfProbe(() => {
        const parsed = parseSaveFile(raw);
        if (parsed.status !== 'success') throw new Error(parsed.message);
        return normalizeLoadedState(parsed.state);
      });
      return { structuredCloneWholeState: counts.structuredCloneWholeState };
    }
  }
}
