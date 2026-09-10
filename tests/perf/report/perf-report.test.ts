import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { buildPerfFixtures, measurePerfArea, PERF_AREAS } from '../perf-areas';
import { largeMapGenerationInput } from '../fixtures/crowded-state';

/**
 * #1007 — LOCAL wall-clock performance reporter. `yarn perf:report` only —
 * excluded from `yarn test` / CI by `vite.config.ts` and guarded by
 * `tests/scripts/perf-isolation.test.ts`.
 *
 * Runs EXACTLY the operations the slow-tier gate measures (`perf-areas.ts`), so
 * `report.json`'s counts are the same numbers `algorithmic-budgets.test.ts`
 * asserts on — plus wall-clock and one-time map generation.
 *
 *  - `.verification/perf/report.json`  — deterministic: the per-area `PerfCounts`,
 *    sorted keys, NO wall-clock. Diffable commit-to-commit.
 *  - `.verification/perf/report.timings.json` — machine-specific: `performance.now()`
 *    deltas, node version, cpu count. NEVER asserted on anywhere.
 */

const OUT_DIR = resolve(process.cwd(), '.verification/perf');

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

describe('#1007 perf report (local wall-clock)', () => {
  it('measures every area and writes .verification/perf/', () => {
    const fx = buildPerfFixtures();
    const counts: Record<string, unknown> = {};
    const timingsMs: Record<string, number> = {};

    // one-time map generation — wall-clock only, no algorithmic gate
    const mapStart = performance.now();
    createNewGame(largeMapGenerationInput());
    timingsMs['mapGeneration@large'] = Math.round(performance.now() - mapStart);

    for (const area of PERF_AREAS) {
      const start = performance.now();
      counts[area] = measurePerfArea(area, fx);
      timingsMs[area] = Math.round(performance.now() - start);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      resolve(OUT_DIR, 'report.json'),
      JSON.stringify(sortDeep({ auditedAgainst: '#1007', counts }), null, 2) + '\n',
    );
    writeFileSync(
      resolve(OUT_DIR, 'report.timings.json'),
      JSON.stringify({ node: process.version, cpuCount: cpus().length, timingsMs }, null, 2) + '\n',
    );

    expect(new Set(Object.keys(counts))).toEqual(new Set(PERF_AREAS));
  }, 900_000);
});
