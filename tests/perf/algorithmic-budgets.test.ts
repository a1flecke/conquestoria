import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { UNCONDITIONAL_PASSES } from '@/storage/migrations/pipeline';
import { firstSimulationDivergence } from '../helpers/deterministic-state';
import { buildCrowdedGame } from './fixtures/crowded-state';
import { measureRenderFrame } from './fixtures/render-frame';
import {
  buildPerfFixtures,
  CHEAP_AREAS,
  measureAiRoundCloneSites,
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
        structuredCloneWholeStateBytes: cap(a['turn@e2'].structuredCloneWholeStateBytes!),
        heapPops: cap(a['turn@e2'].heapPops!),
        blockingEntityAtCalls: cap(a['turn@e2'].blockingEntityAtCalls!),
        visibilityPasses: cap(a['turn@e2'].visibilityPasses!),
        civEconomyCalls: cap(a['turn@e2'].civEconomyCalls!),
        projectedGrossGoldCalls: cap(a['turn@e2'].projectedGrossGoldCalls!),
        economyStatusCalls: cap(a['turn@e2'].economyStatusCalls!),
        roadConnectivityCalls: cap(a['turn@e2'].roadConnectivityCalls!),
        ownedRoadConnectivityCalls: cap(a['turn@e2'].ownedRoadConnectivityCalls!),
        ownedRoadTileScans: cap(a['turn@e2'].ownedRoadTileScans!),
      },
      aiRound: {
        pathQueries: cap(a['aiRound@e2'].pathQueries!),
        heapPops: cap(a['aiRound@e2'].heapPops!),
        structuredCloneWholeState: cap(a['aiRound@e2'].structuredCloneWholeState!),
        structuredCloneWholeStateBytes: cap(a['aiRound@e2'].structuredCloneWholeStateBytes!),
        blockingEntityAtCalls: cap(a['aiRound@e2'].blockingEntityAtCalls!),
        cityYieldCalls: cap(a['aiRound@e2'].cityYieldCalls!),
        civEconomyCalls: cap(a['aiRound@e2'].civEconomyCalls!),
        projectedGrossGoldCalls: cap(a['aiRound@e2'].projectedGrossGoldCalls!),
        economyStatusCalls: cap(a['aiRound@e2'].economyStatusCalls!),
        roadConnectivityCalls: cap(a['aiRound@e2'].roadConnectivityCalls!),
        ownedRoadConnectivityCalls: cap(a['aiRound@e2'].ownedRoadConnectivityCalls!),
        ownedRoadTileScans: cap(a['aiRound@e2'].ownedRoadTileScans!),
      },
      findPath: {
        heapPops: cap(a.findPath.heapPops!),
        heapPushes: cap(a.findPath.heapPushes!),
      },
      saveSerialize: {
        bytes: cap(a['saveSerialize@e2'].bytes!),
        entityBytes: cap(a['saveSerialize@e2'].entityBytes!),
      },
      saveLoad: { structuredCloneWholeState: cap(a['saveLoad@e2'].structuredCloneWholeState!) },
      render: {
        renderOps: cap(a['render@expanded'].renderOps!),
        renderDrawImage: cap(a['render@expanded'].renderDrawImage!),
        renderText: cap(a['render@expanded'].renderText!),
      },
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
      aiRoundCityYieldCalls: Number((ratio(a['aiRound@e2'].cityYieldCalls!, a['aiRound@e1'].cityYieldCalls!) * RATIO_SLACK).toFixed(2)),
      // #1235: clone-volume and projection / road-BFS shape guards (main's ratio × slack).
      aiRoundCloneBytes: Number((ratio(a['aiRound@e2'].structuredCloneWholeStateBytes!, a['aiRound@e1'].structuredCloneWholeStateBytes!) * RATIO_SLACK).toFixed(2)),
      aiRoundProjectionCalls: Number((ratio(projectionCalls(a['aiRound@e2']), projectionCalls(a['aiRound@e1'])) * RATIO_SLACK).toFixed(2)),
      aiRoundRoadCalls: Number((ratio(roadCalls(a['aiRound@e2']), roadCalls(a['aiRound@e1'])) * RATIO_SLACK).toFixed(2)),
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

function expectMoveRangeBlockerWork(sample: AreaSample): void {
  expect(sample.blockingEntityAtCalls, 'detailed BFS must not call the linear coordinate lookup').toBe(0);
  expect(sample.blockingMapEntityLookupBuilds, 'detailed query must build one blocker lookup').toBe(1);
}

/** Economy-projection calls (#1235): the three `economy-system` entry points, summed. */
function projectionCalls(sample: AreaSample): number {
  return (sample.civEconomyCalls ?? 0)
    + (sample.projectedGrossGoldCalls ?? 0)
    + (sample.economyStatusCalls ?? 0);
}

/** Road-network/BFS work (#1235): connectivity BFS + owned-road BFS + owned-road tile scan, summed. */
function roadCalls(sample: AreaSample): number {
  return (sample.roadConnectivityCalls ?? 0)
    + (sample.ownedRoadConnectivityCalls ?? 0)
    + (sample.ownedRoadTileScans ?? 0);
}

const AI_ROUND_PROJECTION_KEYS = ['civEconomyCalls', 'projectedGrossGoldCalls', 'economyStatusCalls'] as const;
const ROAD_KEYS = ['roadConnectivityCalls', 'ownedRoadConnectivityCalls', 'ownedRoadTileScans'] as const;

/** Assert each named counter in `sample` is within the matching budget entry. */
function expectCounterBudgets(
  sample: AreaSample,
  budget: Record<string, number>,
  keys: readonly (keyof AreaSample)[],
  label: string,
): void {
  for (const key of keys) {
    const measured = (sample[key] as number | undefined) ?? 0;
    expect(measured, `${label} ${key}`).toBeLessThanOrEqual(budget[key as string]!);
  }
}

/** GUARD 10 shape: AI-round whole-state clone count is entity-independent, and its bytes stay bounded. */
function expectAiRoundCloneWork(e1: AreaSample, e2: AreaSample, base: Baseline): void {
  expect(e2.structuredCloneWholeState, 'AI round whole-state clone count must not scale with entities')
    .toBe(e1.structuredCloneWholeState);
  expect(e2.structuredCloneWholeState!).toBeLessThanOrEqual(base.budgets.aiRound!.structuredCloneWholeState!);
  expect(e2.structuredCloneWholeStateBytes!, 'AI round whole-state clone-byte budget')
    .toBeLessThanOrEqual(base.budgets.aiRound!.structuredCloneWholeStateBytes!);
  const e1Bytes = e1.structuredCloneWholeStateBytes ?? 0;
  if (e1Bytes > 0) {
    const r = e2.structuredCloneWholeStateBytes! / e1Bytes;
    expect(r, `AI round clone-byte ratio ${r.toFixed(2)}`).toBeLessThanOrEqual(base.ratios.aiRoundCloneBytes!);
  }
}

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

  it('GUARD 1 — detailed movement builds one blocker lookup and makes no direct coordinate lookup', () => {
    expectMoveRangeBlockerWork(S('moveRange@e2'));
  });

  it('GUARD 1 sabotage proof — rejects a per-neighbor lookup or rebuilt lookup', () => {
    expect(() => expectMoveRangeBlockerWork({ blockingEntityAtCalls: 1, blockingMapEntityLookupBuilds: 1 })).toThrow();
    expect(() => expectMoveRangeBlockerWork({ blockingEntityAtCalls: 0, blockingMapEntityLookupBuilds: 2 })).toThrow();
  });

  it('GUARD 7 — minor-civ trade-route quest feasibility never calculates an unused route on crowded turns', () => {
    expect(S('turn@e1').pathQueries).toBe(0);
    expect(S('turn@e2').pathQueries).toBe(0);
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

  it('GUARD 8 — #1069: a full AI round\'s city-yield work stays bounded (and no more super-linear)', () => {
    // `getProjectedCityScience`'s ai-production.ts research-scoring caller used to recompute the
    // whole civ's projected science from scratch (twice) per (city, building) candidate pair —
    // O(cities² × buildings). #1069 fixed that; this guard is what stops it from silently
    // regressing back. Same absolute-budget-primary / ratio-secondary shape as GUARD 3.
    //
    // Sabotage: in ai-production.ts's generateWithResidual, drop the `researchBaseline` argument
    // from the getMarginalCivResearchGain call (revert to the un-cached 4-arg call) → e2
    // cityYieldCalls jumps back to ~31,164, well past this tightened budget.
    const e1 = S('aiRound@e1');
    const e2 = S('aiRound@e2');
    expect(e2.cityYieldCalls!, 'AI round city-yield budget').toBeLessThanOrEqual(base.budgets.aiRound!.cityYieldCalls!);
    if (e1.cityYieldCalls! > 0) {
      expect(e2.cityYieldCalls! / e1.cityYieldCalls!, 'AI round city-yield work must not get MORE super-linear')
        .toBeLessThanOrEqual(base.ratios.aiRoundCityYieldCalls!);
    }
  });

  it('GUARD 10 — a full AI round\'s whole-state clone count and volume stay bounded', () => {
    // #1235: GUARD 4 covers a *turn*; this covers a full AI round (the ~8
    // ai-major-turn clones + scheduler/orchestrator clones). The count must be
    // entity-independent; the bytes get an absolute budget and a shape ratio.
    // Sabotage: a per-entity `structuredClone(state)` in an AI helper doubles
    // both — see the sabotage-proof test below.
    const e1 = S('aiRound@e1');
    const e2 = S('aiRound@e2');
    expect(e2.structuredCloneWholeState!, 'the fixture must actually clone whole state').toBeGreaterThan(0);
    expect(e2.structuredCloneWholeStateBytes!, 'the fixture must actually clone state-shaped bytes').toBeGreaterThan(0);
    expectAiRoundCloneWork(e1, e2, base);
  });

  it('GUARD 10 sabotage proof — a doubled clone count or cloned volume fails', () => {
    const e1 = S('aiRound@e1');
    const e2 = S('aiRound@e2');
    expect(() =>
      expectAiRoundCloneWork(e1, { ...e2, structuredCloneWholeState: e2.structuredCloneWholeState! * 2 }, base),
    ).toThrow();
    expect(() =>
      expectAiRoundCloneWork(e1, { ...e2, structuredCloneWholeStateBytes: e2.structuredCloneWholeStateBytes! * 2 }, base),
    ).toThrow();
  });

  it('INFORMATIONAL — attributes AI-round whole-state clones to their call sites', () => {
    // #1235 output for the PR body, plus a real invariant: every counted clone is
    // attributed to exactly one caller. Site labels are NOT a budget (they move
    // when code moves); only the total is pinned elsewhere.
    const sites = measureAiRoundCloneSites(fx);
    const total = Object.values(sites).reduce((a, b) => a + b, 0);
    console.log(`[#1235] AI-round whole-state clone sites:\n${JSON.stringify(sites, null, 2)}`);
    expect(total).toBe(S('aiRound@e2').structuredCloneWholeState);
  }, 120_000);

  it('GUARD 11 — a full AI round\'s whole-empire economy projections stay bounded', () => {
    // #1235: pins the economy-projection entry points #1125/#1126 flagged as
    // redundant. Sabotage: a per-city projection in an AI planning loop doubles
    // the counts — see the sabotage-proof test below.
    const e1 = S('aiRound@e1');
    const e2 = S('aiRound@e2');
    expect(projectionCalls(e2), 'the fixture must actually call the economy projections').toBeGreaterThan(0);
    expectCounterBudgets(e2, base.budgets.aiRound!, AI_ROUND_PROJECTION_KEYS, 'AI round projection');
    if (projectionCalls(e1) > 0) {
      expect(projectionCalls(e2) / projectionCalls(e1), 'AI round projection work must not get MORE super-linear')
        .toBeLessThanOrEqual(base.ratios.aiRoundProjectionCalls!);
    }
  });

  it('GUARD 11 sabotage proof — doubled economy-projection work fails', () => {
    const e2 = S('aiRound@e2');
    for (const key of AI_ROUND_PROJECTION_KEYS) {
      if ((e2[key] ?? 0) > 0) {
        expect(() =>
          expectCounterBudgets(
            { ...e2, [key]: (e2[key] ?? 0) * 2 },
            base.budgets.aiRound!,
            AI_ROUND_PROJECTION_KEYS,
            'AI round projection',
          ),
        ).toThrow();
      }
    }
  });

  it('GUARD 12 — road-network/BFS work per turn and per AI round stays bounded', () => {
    // #1235: the connectivity BFS (`getCitiesConnectedToCapital`), the owned-road
    // connection BFS and the owned-road tile scan are called by unrest relief and
    // AI road building. Sabotage: an extra uncached connectivity call per city
    // doubles a counter — see the sabotage-proof test below.
    const turn = S('turn@e2');
    const ai = S('aiRound@e2');
    expect(roadCalls(turn) + roadCalls(ai), 'the fixtures must actually exercise road/BFS work').toBeGreaterThan(0);
    expectCounterBudgets(turn, base.budgets.turn!, ROAD_KEYS, 'turn road/BFS');
    expectCounterBudgets(ai, base.budgets.aiRound!, ROAD_KEYS, 'AI round road/BFS');
    const e1 = S('aiRound@e1');
    if (roadCalls(e1) > 0) {
      expect(roadCalls(ai) / roadCalls(e1), 'AI round road/BFS work must not get MORE super-linear')
        .toBeLessThanOrEqual(base.ratios.aiRoundRoadCalls!);
    }
  });

  it('GUARD 12 sabotage proof — doubled road/BFS work fails', () => {
    const e2 = S('aiRound@e2');
    for (const key of ROAD_KEYS) {
      if ((e2[key] ?? 0) > 0) {
        expect(() =>
          expectCounterBudgets(
            { ...e2, [key]: (e2[key] ?? 0) * 2 },
            base.budgets.aiRound!,
            ROAD_KEYS,
            'AI round road/BFS',
          ),
        ).toThrow();
      }
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

  it('GUARD 9 — #1072: an ordinary frame does no more draw work when off-screen world state grows', () => {
    // The render fixtures hold the visible scene constant (same camera,
    // viewport, viewer, fog basis, selection, time) while the expanded state
    // adds 24 cities + 160 units strictly outside the viewport. Every base
    // pass culls per item via `camera.isHexVisible`, so recorded canvas work
    // must be EXACTLY equal — proportional off-screen draw work is always a
    // bug to fix, never a number to bump.
    //
    // Sabotage: measure with culling disabled (`cullEverything`) → expanded
    // totalOps jumps ~59× → the equality below fails.
    const b = S('render@base');
    const e = S('render@expanded');
    expect(b.renderOps!, 'the render fixture must perform a non-empty frame').toBeGreaterThan(0);
    expect(e.renderOps, 'frame draw work must not scale with off-screen world state').toBe(b.renderOps);
    expect(e.renderDrawImage).toBe(b.renderDrawImage);
    expect(e.renderText).toBe(b.renderText);
    expect(e.renderOps!).toBeLessThanOrEqual(base.budgets.render!.renderOps!);
    expect(e.renderDrawImage!).toBeLessThanOrEqual(base.budgets.render!.renderDrawImage!);
    expect(e.renderText!).toBeLessThanOrEqual(base.budgets.render!.renderText!);
  });

  it('GUARD 9 sabotage proof — a frame that draws the whole world fails the guard', () => {
    const wide = measureRenderFrame(fx.render.expanded, { cullEverything: true });
    expect(wide.totalOps, 'culling-disabled frame must do far more work (else the guard is vacuous)')
      .toBeGreaterThan(S('render@expanded').renderOps! * 2);
  });

  it('render measurement never mutates game state', () => {
    const before = JSON.stringify(fx.render.expanded.state);
    measureRenderFrame(fx.render.expanded);
    expect(JSON.stringify(fx.render.expanded.state), 'rendering must not mutate save state').toBe(before);
  });
});
