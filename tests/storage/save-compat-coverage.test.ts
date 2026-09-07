import { describe, it, expect } from 'vitest';
import { CURRENT_SAVE_SCHEMA_VERSION, SAVE_MIGRATIONS } from '@/storage/save-migrations';
import { SAVE_COMPAT_MATRIX, COVERED_WELL_FORMED_VERSIONS } from './fixtures/save-compat/manifest';

/**
 * #1006 — the cheap half of the save-compatibility work: make "forgot to add
 * migration coverage" a red test, not a player's crash. Fast tier. The
 * expensive per-version turn-processing matrix is `save-compat-matrix.test.ts`
 * (slow tier).
 */

describe('#1006 save-compat coverage meta-test', () => {
  it('has a well-formed case for every schema version 0..CURRENT with no gaps', () => {
    const expected = Array.from({ length: CURRENT_SAVE_SCHEMA_VERSION + 1 }, (_, v) => v);
    expect([...COVERED_WELL_FORMED_VERSIONS].sort((a, b) => a - b)).toEqual(expected);
  });

  it('fails loudly when CURRENT_SAVE_SCHEMA_VERSION advances past the manifest', () => {
    // This is the whole point of the file: the manifest must be extended in the
    // same change that bumps the constant.
    expect(COVERED_WELL_FORMED_VERSIONS.has(CURRENT_SAVE_SCHEMA_VERSION)).toBe(true);
    expect(Math.max(...COVERED_WELL_FORMED_VERSIONS)).toBe(CURRENT_SAVE_SCHEMA_VERSION);
  });

  it('every SAVE_MIGRATIONS key is actually exercised by at least one case whose span includes it', () => {
    const migrationVersions = Object.keys(SAVE_MIGRATIONS).map(Number).sort((a, b) => a - b);
    for (const migrationVersion of migrationVersions) {
      // A case with sourceVersion < N runs migrations sourceVersion+1..CURRENT,
      // so it runs migration N iff sourceVersion < N.
      const runsThisMigration = SAVE_COMPAT_MATRIX.some(c => c.sourceVersion < migrationVersion);
      expect(runsThisMigration, `no manifest case runs migration ${migrationVersion}`).toBe(true);
    }
  });

  it('the migration registry has no gaps between 1 and CURRENT', () => {
    // migrateSaveToCurrent throws `Missing save migration for schema version N`
    // at runtime on a gap — a test failure is cheaper than a player crash.
    const versions = Object.keys(SAVE_MIGRATIONS).map(Number).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: CURRENT_SAVE_SCHEMA_VERSION }, (_, i) => i + 1));
  });

  it('every corruption-repair migration (23, 25, 26, 27) has a malformed-input case', () => {
    const repairMigrations = [23, 25, 26, 27];
    for (const migrationVersion of repairMigrations) {
      const covered = SAVE_COMPAT_MATRIX.some(
        c => c.kind === 'malformed-repair' && c.sourceVersion === migrationVersion - 1,
      );
      expect(covered, `migration ${migrationVersion} (corruption repair) has no malformed-input case`).toBe(true);
    }
  });

  it('every case declares a non-empty focus and a build function', () => {
    for (const testCase of SAVE_COMPAT_MATRIX) {
      expect(testCase.focus.length, testCase.label).toBeGreaterThan(0);
      expect(typeof testCase.build, testCase.label).toBe('function');
    }
  });
});
