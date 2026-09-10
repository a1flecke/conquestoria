import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { UNCONDITIONAL_PASSES } from '@/storage/migrations/pipeline';
import { serializeSaveFile } from '@/storage/save-file-transfer';
import { firstSimulationDivergence } from '../helpers/deterministic-state';
import { buildCrowdedGame } from './fixtures/crowded-state';
import {
  buildPerfFixtures,
  CHEAP_AREAS,
  measurePerfArea,
  PERF_AREAS,
  type AreaSample,
  type PerfArea,
  type PerfFixtures,
} from './perf-areas';

/**
 * #1007 — machine-independent algorithmic regression budgets. SLOW tier
 * (`SLOW_TEST_FILES`), so it runs in `yarn test` / the CI slow lane /
 * `yarn test:durable` — every assertion is an integer count on a deterministic
 * fixture, never a wall-clock. Wall-clock is `yarn perf:report` only.
 *
 * Regenerate the checked-in baselines + budgets (after a DELIBERATE algorithmic
 * change, with a per-number justification in the PR body — see
 * `.claude/rules/performance-budgets.md`):
 *
 *   UPDATE_PERF_BASELINE=1 yarn vitest run tests/perf/algorithmic-budgets.test.ts
 */

const BASELINE_PATH = resolve(process.cwd(), 'tests/perf/baselines/algorithmic-baseline.json');
const REGEN = process.env.UPDATE_PERF_BASELINE === '1';
const BUDGET_MULTIPLIER = 1.5;
const RATIO_SLACK = 1.3;
/** Extra unconditional-pass headroom over today's count. */
const PASS_HEADROOM = 3;
const HOOK_TIMEOUT_MS = 900_000;

interface Baseline {
  __doc__?: string;
  auditedCommit: string;
  areas: Record<string, AreaSample>;
  budgets: Record<string, Record<string, number>>;
  ratios: Record<string, number>;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map(k => [k, sortDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

const cap = (v: number) => Math.ceil(v * BUDGET_MULTIPLIER);
const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);

function computeBaseline(runs: Record<PerfArea, AreaSample[]>, priorAuditedCommit: string): Baseline {
  const a = Object.fromEntries(PERF_AREAS.map(k => [k, runs[k][0]!])) as Record<PerfArea, AreaSample>;
  return {
    __doc__: (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline).__doc__,
    // Preserved from the file — bump it deliberately when re-baselining on a new commit.
    auditedCommit: priorAuditedCommit,
    areas: a,
    budgets: {
      turn: {
        structuredCloneWholeState: cap(a['turn@e2'].structuredCloneWholeState!),
        heapPops: cap(a['turn@e2'].heapPops!),
        blockingEntityAtCalls: cap(a['turn@e2'].blockingEntityAtCalls!),
        visibilityPasses: cap(a['turn@e2'].visibilityPasses!),
      },
      aiRound: {
        pathQueries: cap(a['aiRound@e2'].pathQueries!),
        heapPops: cap(a['aiRound@e2'].heapPops!),
        structuredCloneWholeState: cap(a['aiRound@e2'].structuredCloneWholeState!),
        blockingEntityAtCalls: cap(a['aiRound@e2'].blockingEntityAtCalls!),
      },
      findPath: {
        heapPops: cap(a.findPath.heapPops!),
        heapPushes: cap(a.findPath.heapPushes!),
      },
      moveRange: {
        blockingEntityAtCalls: cap(a['moveRange@e2'].blockingEntityAtCalls!),
        derivedInnerBound: cap(a['moveRange@e2'].derivedInnerBound!),
      },
      saveSerialize: {
        bytes: cap(a['saveSerialize@e2'].bytes!),
        entityBytes: cap(a['saveSerialize@e2'].entityBytes!),
      },
      saveLoad: { structuredCloneWholeState: cap(a['saveLoad@e2'].structuredCloneWholeState!) },
      unconditionalPasses: { count: UNCONDITIONAL_PASSES.length + PASS_HEADROOM },
    },
    ratios: {
      // GUARDs 4 & 6 assert whole-state clone counts stay EXACTLY equal across
      // scales via `.toBe()` (no ratio needed). The ratios below are shape
      // guards — set to `main`'s CURRENT ratio × slack (guard against WORSENING).
      // A value > ~2 for a ~1.9× entity increase is a known super-linearity → see
      // the #1007 follow-ups; the guard's job here is only "do not get worse".
      turnHeapPops: Number((ratio(a['turn@e2'].heapPops!, a['turn@e1'].heapPops!) * RATIO_SLACK).toFixed(2)),
      aiRoundPathQueries: Number((ratio(a['aiRound@e2'].pathQueries!, a['aiRound@e1'].pathQueries!) * RATIO_SLACK).toFixed(2)),
      aiRoundHeapPops: Number((ratio(a['aiRound@e2'].heapPops!, a['aiRound@e1'].heapPops!) * RATIO_SLACK).toFixed(2)),
      saveBytes: Number((ratio(a['saveSerialize@e2'].bytes!, a['saveSerialize@e1'].bytes!) * RATIO_SLACK).toFixed(2)),
      saveEntityBytes: Number((ratio(a['saveSerialize@e2'].entityBytes!, a['saveSerialize@e1'].entityBytes!) * RATIO_SLACK).toFixed(2)),
      // findPath: a directed A* pops at most a constant factor more nodes than
      // the route it returns — NOT ~O(map area). This ratio catches a heuristic
      // collapse (Dijkstra pops the whole map) even if the absolute budget were
      // ever loosened. Measured `pops / routeLength` on main × slack.
      findPathPopsPerRouteStep: Number((ratio(a.findPath.heapPops!, a.findPath.routeLength!) * RATIO_SLACK).toFixed(2)),
    },
  };
}

/** ── suite ──────────────────────────────────────────────────────────────── */

let fx: PerfFixtures;
const runs = Object.fromEntries(PERF_AREAS.map(k => [k, [] as AreaSample[]])) as Record<PerfArea, AreaSample[]>;
const S = (area: PerfArea): AreaSample => runs[area][0]!;

describe('#1007 algorithmic budgets', () => {
  beforeAll(() => {
    fx = buildPerfFixtures();
    for (const area of PERF_AREAS) {
      const times = CHEAP_AREAS.has(area) ? 3 : 2;
      for (let i = 0; i < times; i += 1) runs[area].push(measurePerfArea(area, fx));
    }
  }, HOOK_TIMEOUT_MS);

  it('the crowded fixtures are simulation-equivalent across rebuilds', () => {
    expect(firstSimulationDivergence(buildCrowdedGame({ entityScale: 1 }), fx.e1)).toBeNull();
    expect(firstSimulationDivergence(buildCrowdedGame({ entityScale: 2 }), fx.e2)).toBeNull();
  }, 120_000);

  it('every gated metric is bit-stable across repeated runs', () => {
    for (const area of PERF_AREAS) {
      for (const sample of runs[area]) {
        expect(sample, `${area} not deterministic across runs`).toEqual(runs[area][0]);
      }
    }
  });

  if (REGEN) {
    it('REGEN — writes measured baselines + budgets', () => {
      const prior = (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline).auditedCommit;
      writeFileSync(BASELINE_PATH, JSON.stringify(sortDeep(computeBaseline(runs, prior)), null, 2) + '\n');
    });
    return;
  }

  const base: Baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  it('the baseline file is populated (run UPDATE_PERF_BASELINE=1 once)', () => {
    expect(Object.keys(base.areas).length).toBeGreaterThan(0);
    expect(Object.keys(base.budgets).length).toBeGreaterThan(0);
  });

  it('the baseline file carries no wall-clock / machine data', () => {
    const walk = (v: unknown, path: string): void => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (v && typeof v === 'object') {
        for (const [k, child] of Object.entries(v)) {
          expect(/(ms|Ms)$|elapsed|duration|timestamp|date|cwd|node|cpu/i.test(k), `key "${k}" at ${path}`).toBe(false);
          walk(child, `${path}.${k}`);
        }
      }
    };
    walk(base, '$');
    expect(readFileSync(BASELINE_PATH, 'utf8')).not.toMatch(/\/(Users|home)\//);
  });

  it('turn processing stays within its algorithmic budget', () => {
    const s = S('turn@e2');
    expect(s.structuredCloneWholeState!).toBeLessThanOrEqual(base.budgets.turn!.structuredCloneWholeState!);
    expect(s.heapPops!).toBeLessThanOrEqual(base.budgets.turn!.heapPops!);
    expect(s.blockingEntityAtCalls!).toBeLessThanOrEqual(base.budgets.turn!.blockingEntityAtCalls!);
    expect(s.visibilityPasses!).toBeLessThanOrEqual(base.budgets.turn!.visibilityPasses!);
  });

  it('a full AI round stays within its algorithmic budget', () => {
    const s = S('aiRound@e2');
    expect(s.pathQueries!).toBeLessThanOrEqual(base.budgets.aiRound!.pathQueries!);
    expect(s.heapPops!).toBeLessThanOrEqual(base.budgets.aiRound!.heapPops!);
    expect(s.structuredCloneWholeState!).toBeLessThanOrEqual(base.budgets.aiRound!.structuredCloneWholeState!);
    expect(s.blockingEntityAtCalls!).toBeLessThanOrEqual(base.budgets.aiRound!.blockingEntityAtCalls!);
  });

  it('save serialization size stays within its budget', () => {
    expect(S('saveSerialize@e2').bytes!).toBeLessThanOrEqual(base.budgets.saveSerialize!.bytes!);
    expect(S('saveSerialize@e2').entityBytes!).toBeLessThanOrEqual(base.budgets.saveSerialize!.entityBytes!);
  });

  it('the unconditional load pass count stays bounded', () => {
    expect(UNCONDITIONAL_PASSES.length).toBeLessThanOrEqual(base.budgets.unconditionalPasses!.count!);
  });

  /** ── the 5 proven guards ────────────────────────────────────────────── */

  it('GUARD 1 — move-range blocker work does not multiply by city count', () => {
    // `getMovementRangeDetails` calls `getBlockingMapEntityAt` per BFS neighbour
    // (each `.find`s over all cities+camps). The CALL COUNT tracks reachable-tile
    // count, not city count, so it must stay under an absolute budget as cities
    // grow — and the derived O(reachable×cities) inner work must too.
    // Sabotage: add a 2nd `getBlockingMapEntityAt(state, unit, neighbor)` call
    // inside that BFS loop (unit-movement-queries.ts ~:213) → blockingEntityAtCalls
    // and derivedInnerBound both double → both assertions fail.
    const e2 = S('moveRange@e2');
    expect(e2.blockingEntityAtCalls!, 'blocker call count must not scale with cities')
      .toBeLessThanOrEqual(base.budgets.moveRange!.blockingEntityAtCalls!);
    expect(e2.derivedInnerBound!, 'O(reachable × cities) inner blocker work')
      .toBeLessThanOrEqual(base.budgets.moveRange!.derivedInnerBound!);
  });

  it('GUARD 2 — findPath expands a bounded set of nodes proportional to the route, not the map', () => {
    // A directed A* over a long cross-map route should pop ~O(route length),
    // NOT ~O(map area). Two checks:
    //  (a) ABSOLUTE pop budget — the real catch: any regression that makes
    //      findPath explore the whole map (goal check missing, heuristic → 0 /
    //      Dijkstra) blows it.
    //      Sabotage: `heuristicFrom = () => 0` in unit-pathfinding.ts → heapPops
    //      jumps well over the budget → fails.
    //  (b) pops-per-route-step — pops must stay a bounded multiple of the route
    //      the search actually returns (map-area-independent).
    const s = S('findPath');
    expect(s.heapPops!, 'findPath must use the BinaryHeap').toBeGreaterThan(0);
    expect(s.routeLength!, 'the perf route must be a real path').toBeGreaterThan(10);
    expect(s.heapPops!, 'findPath explored far more than its route warrants')
      .toBeLessThanOrEqual(base.budgets.findPath!.heapPops!);
    expect(s.heapPushes!).toBeLessThanOrEqual(base.budgets.findPath!.heapPushes!);
    const popsPerStep = s.heapPops! / s.routeLength!;
    expect(popsPerStep, `pops/route-step ${popsPerStep.toFixed(1)}`)
      .toBeLessThanOrEqual(base.ratios.findPathPopsPerRouteStep!);
  });

  it('GUARD 3 — a full AI round\'s path work stays bounded (and no more super-linear)', () => {
    // `main`'s AI-round path work is ALREADY ~O(units^1.8) (~3.4x for ~1.9x
    // units) — see the #1007 follow-up. So the PRIMARY catch is the ABSOLUTE
    // budget on the e2 fixture; the ratio is a secondary "don't get even worse"
    // signal (a fresh quadratic term on a fixture that only doubles units ~1.9x
    // cannot by itself exceed main-ratio×1.3 — the absolute budget stops that).
    //
    // Sabotage: add a bounded `civ.units.slice(0,3).flatMap(u => cities.map(c =>
    // findPath(u.position, c.position, map)))` to a hot per-civ AI helper (e.g.
    // basic-ai.ts processAITurnInternal) → e2 pathQueries jumps past its budget.
    const e1 = S('aiRound@e1');
    const e2 = S('aiRound@e2');
    expect(e2.pathQueries!, 'AI round path-query budget').toBeLessThanOrEqual(base.budgets.aiRound!.pathQueries!);
    expect(e2.heapPops!, 'AI round heap-pop budget').toBeLessThanOrEqual(base.budgets.aiRound!.heapPops!);
    if (e1.pathQueries! > 0) {
      expect(e2.pathQueries! / e1.pathQueries!, 'AI round path work must not get MORE super-linear')
        .toBeLessThanOrEqual(base.ratios.aiRoundPathQueries!);
    }
    if (e1.heapPops! > 0) {
      expect(e2.heapPops! / e1.heapPops!).toBeLessThanOrEqual(base.ratios.aiRoundHeapPops!);
    }
  });

  it('GUARD 4 — a turn does an entity-count-independent number of whole-state clones', () => {
    // Sabotage: add `structuredClone(newState)` inside the
    // `Object.entries(newState.civilizations)` loop in turn-manager.ts (~:225)
    // → clone count scales with civ count → the equality fails.
    const e1 = S('turn@e1');
    const e2 = S('turn@e2');
    expect(e2.structuredCloneWholeState, 'whole-state clone count must not scale with entities')
      .toBe(e1.structuredCloneWholeState);
    expect(e2.structuredCloneWholeState!).toBeLessThanOrEqual(base.budgets.turn!.structuredCloneWholeState!);
  });

  it('GUARD 5 — the save ENTITY payload is near-linear in entity count', () => {
    // The whole-file byte count is map-dominated on this fixture (a fixed 80x80
    // map), so it would mask a per-entity O(n^2) bloat. The entity payload
    // (cities + units + civs + opponentAI) is what must stay near-linear.
    // Sabotage: attach a per-city `Record<peerCityId, 'x'.repeat(2000)>`
    // (O(cities^2)) in `scenario-steps/city-step.ts` → entityBytes ratio blows
    // past budget.
    const e1 = S('saveSerialize@e1');
    const e2 = S('saveSerialize@e2');
    const wholeRatio = e2.bytes! / e1.bytes!;
    expect(wholeRatio, `whole-file byte ratio ${wholeRatio.toFixed(2)}`)
      .toBeLessThanOrEqual(base.ratios.saveBytes!);
    const entityRatio = e2.entityBytes! / e1.entityBytes!;
    expect(entityRatio, `entity-payload byte ratio ${entityRatio.toFixed(2)}`)
      .toBeLessThanOrEqual(base.ratios.saveEntityBytes!);
  });

  it('GUARD 6 — save normalization does not clone the whole state per entity', () => {
    // Sabotage: add `structuredClone(state)` to a per-city loop in a load-time
    // normalizer (src/storage/migrations/*) → saveLoad clone count scales with
    // city count → both the flat-equality and the absolute budget fail.
    const e1 = S('saveLoad@e1');
    const e2 = S('saveLoad@e2');
    expect(e2.structuredCloneWholeState, 'save-load clone count must not scale with entities')
      .toBe(e1.structuredCloneWholeState);
    expect(e2.structuredCloneWholeState!).toBeLessThanOrEqual(base.budgets.saveLoad!.structuredCloneWholeState!);
  });
});
