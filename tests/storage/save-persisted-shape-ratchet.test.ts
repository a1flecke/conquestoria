import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import type { GameState } from '@/core/types';
import { SAVE_COMPAT_MATRIX } from './fixtures/save-compat/manifest';
import { unionPersistedShape } from './fixtures/save-compat/persisted-shape';

/**
 * #1023 — the persisted-save-shape ratchet.
 *
 * #1006's coverage meta-test fires when `CURRENT_SAVE_SCHEMA_VERSION` is bumped
 * without a compatibility-matrix case. It is blind to the opposite failure, and
 * that opposite failure is the whole reason #1023 exists:
 *
 *   A developer adds a persisted `GameState` field, does NOT bump the schema
 *   version, and instead quietly defaults it in the unconditional normalizer
 *   tail. The save loads, nothing throws, and the fact that a versioned
 *   migration was never written is invisible.
 *
 * This test makes that visible. The set of persisted field paths is snapshotted;
 * changing it fails until you do one of:
 *
 *   1. Bump `CURRENT_SAVE_SCHEMA_VERSION` and add the ordered migration —
 *      `save-compat-coverage.test.ts` then forces a matrix fixture too; or
 *   2. Add the path to `ADDITIVE_WITHOUT_MIGRATION` below **with a written
 *      reason** explaining why old saves need no migration for it.
 *
 * Regenerate the snapshot (only alongside one of the two above) with:
 *
 *   UPDATE_PERSISTED_SHAPE=1 yarn vitest run tests/storage/save-persisted-shape-ratchet.test.ts
 */

const SHAPE_PATH = resolve(process.cwd(), 'tests/storage/fixtures/save-compat/persisted-shape-snapshot.json');
const UPDATING = process.env.UPDATE_PERSISTED_SHAPE === '1';

/**
 * Paths deliberately introduced without a numbered migration, each with the
 * reason old saves need none. Adding an entry here is a review checkpoint, not
 * a formality: it is a claim that every reader tolerates the field's absence.
 *
 * Empty today — every persisted field currently in the snapshot predates this
 * ratchet. The first entry will be added by whoever first ships an additive
 * field under rule (2) of `.claude/rules/game-systems.md` → "A persistent
 * GameState shape change needs a migration or a proof it does not (#1006)".
 */
const ADDITIVE_WITHOUT_MIGRATION: Readonly<Record<string, string>> = {
  // Long-pre-existing optional `Unit` fields (the naval transport ⇔ land cargo
  // dual reference). They predate this ratchet; no matrix fixture had a loaded
  // transport until #1000's `cargo-reciprocity` malformed-repair case, which is
  // the first to populate them. A save with no loaded transport simply has
  // neither key, and every reader guards with `?? []` / `!unit.transportId`
  // (~80 sites) — so an old save needs no migration for them.
  'units.*.cargoUnitIds': '#1000 — pre-existing optional Unit field; absent on any save with no loaded transport; all readers tolerate absence.',
  'units.*.transportId': '#1000 — pre-existing optional Unit field; absent on any save with no embarked land unit; all readers tolerate absence.',
  // #1098 — createNewGame/createHotSeatGame now stamp five previously-absent
  // fields at `{}` directly, matching what their own unconditional load-time
  // normalizers already defaulted them to (normalizeThreatPressureDefaults,
  // normalizeGeneratedGenerals, migrateCircularManufacturingChoices), so a fresh
  // game's first autosave-then-reload is no longer a real state change. Three of
  // the five (nationalProjectChoices, generatedGenerals,
  // resurgentCampCooldownByCivLandmass) were already present in the checked-in
  // snapshot from an existing matrix fixture that reaches a non-empty value, so
  // only these two are genuinely new paths here. Every reader already tolerates
  // absence via `?? {}` optional chaining (unchanged by this fix) — old saves
  // need no migration, since the existing unconditional normalizers keep
  // defaulting them exactly as before.
  'pirateFleets': '#1098 — now stamped at {} by both creation functions; every reader already tolerates absence via `?? {}`.',
  'pirateFleetCooldownByCivLandmass': '#1098 — now stamped at {} by both creation functions; every reader already tolerates absence via `?? {}`.',
  // #1086 — a new sibling map on OpponentAIState (`nationalIntentByCiv`), added the
  // identical way `pressureByCiv`/`majorCivs` themselves were: `createEmptyOpponentAIState`
  // defaults it to `{}`, `normalizeOpponentAIState` (which already runs unconditionally on
  // every load, per game-state.ts's own doc comment) rebuilds it entry-by-entry with full
  // validation, and every downstream reader already goes through optional chaining
  // (`state.opponentAI?.nationalIntentByCiv[civId]?.current ?? 'develop'` in
  // ai-production.ts; `state.opponentAI?.nationalIntentByCiv[civId] ?? null` in
  // ai-prepared-turn.ts). A pre-#1086 save has no key at all, normalizes to `{}`, and the
  // very next AI round populates every living AI major's entry exactly like `majorCivs`
  // already does for a civ with no portfolio yet — old saves need no migration for it.
  'opponentAI.nationalIntentByCiv': '#1086 — new OpponentAIState sibling map, self-normalizing exactly like majorCivs/pressureByCiv; every reader tolerates absence via optional chaining and a sensible default.',
};

describe('#1023 persisted-save-shape ratchet', () => {
  // Union across every matrix fixture: one save never exercises every optional
  // branch (a game with no crises contributes no `activeCrises.*` paths).
  const migrated: GameState[] = SAVE_COMPAT_MATRIX.map(testCase => migrateSaveToCurrent(testCase.build()));
  const actual = unionPersistedShape(migrated);

  if (UPDATING) {
    it('regenerates the persisted-shape snapshot (UPDATE_PERSISTED_SHAPE=1)', () => {
      writeFileSync(SHAPE_PATH, `${JSON.stringify({ schemaVersion: CURRENT_SAVE_SCHEMA_VERSION, paths: actual }, null, 2)}\n`);
      expect(existsSync(SHAPE_PATH)).toBe(true);
    });
    return;
  }

  const snapshot = JSON.parse(readFileSync(SHAPE_PATH, 'utf8')) as { schemaVersion: number; paths: string[] };

  it('the snapshot was taken at the current schema version', () => {
    // If these diverge, the schema moved without the shape being re-checked.
    expect(snapshot.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
  });

  it('no persisted field appeared without a migration or a written additive exemption', () => {
    const known = new Set([...snapshot.paths, ...Object.keys(ADDITIVE_WITHOUT_MIGRATION)]);
    const added = actual.filter(path => !known.has(path));

    expect(added, added.length === 0 ? '' : [
      'New persisted GameState field(s) with no ordered migration and no written exemption:',
      ...added.map(path => `  + ${path}`),
      '',
      'Do ONE of:',
      `  1. Add the ordered migration and bump CURRENT_SAVE_SCHEMA_VERSION (currently ${CURRENT_SAVE_SCHEMA_VERSION}),`,
      '     then regenerate with UPDATE_PERSISTED_SHAPE=1. save-compat-coverage.test.ts will',
      '     then require a matrix fixture for the new version too.',
      '  2. If old saves genuinely need no migration, add each path to',
      '     ADDITIVE_WITHOUT_MIGRATION in this file with the reason, and regenerate.',
      '',
      'Defaulting the field in the unconditional normalizer tail INSTEAD of doing one of',
      'those is the exact substitution #1023 exists to prevent.',
    ].join('\n')).toEqual([]);
  });

  it('no persisted field vanished without the snapshot being updated', () => {
    const present = new Set(actual);
    const removed = snapshot.paths.filter(path => !present.has(path));

    expect(removed, removed.length === 0 ? '' : [
      'Persisted GameState field(s) disappeared from every fixture:',
      ...removed.map(path => `  - ${path}`),
      '',
      'Removing a persisted field is also a save-compatibility change. Either it is',
      'a fixture-coverage regression (the field still exists but nothing exercises it',
      'any more — fix the fixture), or it is a real removal that needs a migration and',
      'a regenerated snapshot.',
    ].join('\n')).toEqual([]);
  });
});
