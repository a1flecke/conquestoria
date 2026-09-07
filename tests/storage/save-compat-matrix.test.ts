import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { normalizeLoadedState } from '@/storage/save-manager';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import type { GameState } from '@/core/types';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { SAVE_COMPAT_MATRIX, type SaveCompatCase } from './fixtures/save-compat/manifest';

/**
 * #1006 — the exhaustive schema-version compatibility matrix.
 *
 *   legacy fixture → migrateSaveToCurrent → normalizeLoadedState
 *     → process one real round → serialize → parse → normalizeLoadedState
 *       → shared invariant validators
 *
 * The "process a round" step is the part that catches real damage: a migration
 * can produce a structurally valid object that the turn pipeline then chokes on
 * or silently corrupts. Assertions are the shared cross-system validators
 * (`tests/helpers/save-state-invariants.ts`), not bespoke per-version checks.
 *
 * SLOW tier (`SLOW_TEST_FILES` in `scripts/run-tests-by-tier.sh`) — it is
 * O(versions) full round-processing runs. The coverage meta-test
 * (`save-compat-coverage.test.ts`) is the fast-tier half.
 */

// Per-case timeout. Each case migrates, normalizes, runs 3 completed rounds on
// a small 3-civ map, then serialize/parse/normalize once — observed ~0.15s solo.
// Generous headroom for multi-worktree contention per #608 (a stalled AI round
// is the realistic worst case, not raw arithmetic).
const MATRIX_TIMEOUT_MS = 60_000;

// The issue's concern is that "the damage compounds over the next hundred
// turns", so run more than one round: a migration bug that produces a valid
// object which drifts only after economy / unrest / diplomacy have ticked a
// few times is exactly what a single round would miss.
const ROUNDS_PER_CASE = 3;

function runOneRound(state: GameState): GameState {
  const result = runCompletedRound(state, new EventBus(), {
    improvements: (current, bus) => processImprovementTurns(current, bus),
    majors: (current, bus) => processNonHumanMajorRound(current, bus).state,
    world: (current, bus) => processTurn(current, bus),
  });
  if (!result.ok) throw result.error;
  return result.state;
}

function reload(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  if (parsed.status !== 'success') throw new Error(`save file did not round-trip: ${parsed.message}`);
  return normalizeLoadedState(parsed.state);
}

function runCase(testCase: SaveCompatCase): void {
  const raw = testCase.build();

  // 1. migrate
  const migrated = migrateSaveToCurrent(raw);
  expect(migrated.saveSchemaVersion, `${testCase.label}: migrateSaveToCurrent must stamp CURRENT`)
    .toBe(CURRENT_SAVE_SCHEMA_VERSION);
  testCase.afterMigrate?.(migrated);
  assertSaveStateInvariants(migrated, `${testCase.label} — after migrate`);

  // 2. real load path
  const loaded = normalizeLoadedState(migrated);
  assertSaveStateInvariants(loaded, `${testCase.label} — after normalizeLoadedState`);

  // 3. process a few meaningful rounds — the step that surfaces silent corruption
  let afterRounds: GameState = loaded;
  for (let round = 0; round < ROUNDS_PER_CASE; round += 1) {
    afterRounds = runOneRound(afterRounds);
    assertSaveStateInvariants(afterRounds, `${testCase.label} — after round ${round + 1}`);
  }
  expect(afterRounds.turn, `${testCase.label}: rounds must advance the turn`).toBeGreaterThan(loaded.turn);

  // 4. re-save and reload — must still be valid
  const reloaded = reload(afterRounds);
  expect(reloaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
  assertSaveStateInvariants(reloaded, `${testCase.label} — after save + reload`);
}

describe('#1006 save-schema compatibility matrix', () => {
  const wellFormed = SAVE_COMPAT_MATRIX.filter(c => c.kind === 'well-formed');
  const malformed = SAVE_COMPAT_MATRIX.filter(c => c.kind === 'malformed-repair');

  it.each(wellFormed.map(c => [c.label, c] as const))(
    'well-formed: %s → migrate → round → save → reload stays valid',
    (_label, testCase) => runCase(testCase),
    MATRIX_TIMEOUT_MS,
  );

  it.each(malformed.map(c => [c.label, c] as const))(
    'malformed-repair: %s',
    (_label, testCase) => runCase(testCase),
    MATRIX_TIMEOUT_MS,
  );
});
