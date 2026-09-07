import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { migrateSaveToCurrent } from '@/storage/save-migrations';
import type { GameState } from '@/core/types';
import { SAVE_COMPAT_MATRIX } from './fixtures/save-compat/manifest';
import {
  digestMigratedState,
  describeDigestDrift,
  type MigrationDigest,
} from './fixtures/save-compat/migration-digest';

/**
 * #1023 — the behaviour-preservation gate for the save-architecture refactor.
 *
 * The issue's hard constraint: "A save that loads today must load identically
 * after the refactor... tested with real fixtures before and after." These
 * goldens were generated from the PRE-refactor implementation and committed
 * first, on purpose — an equivalence test authored *after* a refactor proves
 * nothing about what the refactor changed.
 *
 * Coverage is every case in the #1006 compatibility matrix (source schema
 * 0..CURRENT, the real archived turn-42 save, a hot-seat save, and the four
 * malformed-repair fixtures). The digest is per-top-level-key so a failure
 * names the divergent subtree rather than just "hash mismatch" — see
 * `migration-digest.ts` for why key order is deliberately not pinned.
 *
 * To regenerate after an INTENTIONAL behaviour change (a new migration, a
 * deliberate fix), run:
 *
 *   UPDATE_MIGRATION_GOLDEN=1 yarn vitest run tests/storage/save-migration-equivalence.test.ts
 *
 * and justify every changed line in the PR body. A refactor must never need it.
 */

const GOLDEN_PATH = resolve(process.cwd(), 'tests/storage/fixtures/save-compat/golden-migration-digests.json');
const UPDATING = process.env.UPDATE_MIGRATION_GOLDEN === '1';

type GoldenFile = Record<string, MigrationDigest>;

function migrateFixture(build: () => Record<string, unknown>): GameState {
  return migrateSaveToCurrent(build());
}

describe('#1023 save-migration behaviour equivalence', () => {
  const actual: GoldenFile = {};
  for (const testCase of SAVE_COMPAT_MATRIX) {
    actual[testCase.label] = digestMigratedState(migrateFixture(testCase.build));
  }

  if (UPDATING) {
    it('regenerates the golden digests (UPDATE_MIGRATION_GOLDEN=1)', () => {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, null, 2)}\n`);
      expect(existsSync(GOLDEN_PATH)).toBe(true);
    });
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenFile;

  it('covers every compatibility-matrix fixture (goldens cannot silently shrink)', () => {
    expect(Object.keys(golden).sort()).toEqual(SAVE_COMPAT_MATRIX.map(c => c.label).sort());
  });

  it.each(SAVE_COMPAT_MATRIX.map(c => [c.label] as const))(
    'migrating %s produces the same state as before the refactor',
    label => {
      const expectedDigest = golden[label];
      expect(expectedDigest, `no golden digest recorded for "${label}"`).toBeDefined();

      const actualDigest = actual[label];
      if (actualDigest.__whole === expectedDigest.__whole) return;

      const drift = describeDigestDrift(expectedDigest, actualDigest);
      throw new Error(
        `migrateSaveToCurrent changed for "${label}".\n`
          + `This test exists to catch exactly that during a behaviour-preserving refactor.\n`
          + `Divergent top-level keys:\n  ${drift.length > 0 ? drift.join('\n  ') : '(none — whole-state digest moved without a top-level key changing; check for a removed undefined-valued key)'}\n\n`
          + 'If the change is intentional, regenerate with UPDATE_MIGRATION_GOLDEN=1 and justify it in the PR.',
      );
    },
  );
});
