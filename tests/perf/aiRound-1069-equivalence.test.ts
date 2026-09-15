/**
 * #1069 — golden-reference behavioral equivalence for a full AI round.
 *
 * Captures a compact digest of `processNonHumanMajorRound`'s complete output (resulting state +
 * traces) on the crowded perf fixture, BEFORE any of #1069's optimizations land, and pins it.
 * Every later #1069 commit must leave this test green, unmodified — a divergence here means an
 * "optimization" changed an AI decision, which is a regression, not a speedup.
 *
 * Per-top-level-key digests, not a raw state dump: an `aiRound@e2` state is tens of MB of JSON,
 * and this repo's established convention for exactly this problem is `tests/storage/fixtures/
 * save-compat/migration-digest.ts` (#1023) — reused directly here for the `state` half, with a
 * matching digest added locally for `traces` (not itself a `GameState`, so `digestMigratedState`
 * doesn't apply to it). A digest failure names the divergent top-level key instead of just
 * "hash mismatch".
 *
 * Regenerate ONLY when intentionally re-baselining after the reference itself needs to change for
 * a reason unrelated to #1069 (never to paper over a #1069-optimization divergence):
 *
 *   UPDATE_1069_REFERENCE=1 bash scripts/run-with-mise.sh yarn vitest run tests/perf/aiRound-1069-equivalence.test.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { digestMigratedState, describeDigestDrift, type MigrationDigest } from '../storage/fixtures/save-compat/migration-digest';
import { buildCrowdedGame } from './fixtures/crowded-state';

const REGEN = process.env.UPDATE_1069_REFERENCE === '1';
const GOLDEN_PATH = resolve(process.cwd(), 'tests/perf/fixtures/aiRound-1069-golden-digests.json');

interface RoundDigest {
  state: MigrationDigest;
  traces: string;
}

type GoldenFile = Record<'e1' | 'e2', RoundDigest>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    out[key] = canonicalize(record[key]);
  }
  return out;
}

function shortHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value) ?? null)).digest('hex').slice(0, 12);
}

function runRound(scale: 1 | 2): RoundDigest {
  const state = buildCrowdedGame({ entityScale: scale });
  const result = processNonHumanMajorRound(state, new EventBus());
  if (result.planningErrors.length > 0) {
    throw new Error(
      `aiRound e${scale}: planning errors: `
      + result.planningErrors.map(e => `${e.actorId}: ${e.message}`).join('; '),
    );
  }
  return { state: digestMigratedState(result.state), traces: shortHash(result.traces) };
}

describe('#1069 — aiRound whole-round behavioral equivalence', () => {
  if (REGEN) {
    it('REGEN — writes the golden digest file', () => {
      const golden: GoldenFile = { e1: runRound(1), e2: runRound(2) };
      writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n');
    }, 120_000);
    return;
  }

  const golden: GoldenFile = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  for (const scale of [1, 2] as const) {
    it(`aiRound@e${scale} matches the committed pre-fix reference digest`, () => {
      const actual = runRound(scale);
      const expected = golden[`e${scale}`];
      const drift = describeDigestDrift(expected.state, actual.state);
      expect(
        actual.state.__whole,
        drift.length > 0
          ? `Divergent top-level state keys:\n  ${drift.join('\n  ')}`
          : 'whole-state digest moved without a top-level key changing -- check for a removed undefined-valued key',
      ).toBe(expected.state.__whole);
      expect(actual.traces, 'AI decision traces diverged').toBe(expected.traces);
    }, 120_000);
  }
});
