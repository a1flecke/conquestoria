import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-schema-version';
import { ORDERED_MIGRATIONS } from '@/storage/migrations/ordered';
import { COMPATIBILITY_NORMALIZERS } from '@/storage/migrations/compatibility';
import { CORRUPTION_REPAIRS } from '@/storage/migrations/repair';
import { UNCONDITIONAL_PASSES } from '@/storage/migrations/pipeline';
import { renderSaveCompatibilityDoc } from './fixtures/save-compat/render-migration-doc';

/**
 * #1023 — registry hygiene, and the generated documentation that cannot drift.
 *
 * The issue's acceptance criteria this file enforces:
 *   - three registries with documented admission criteria
 *   - "no function appears in more than one without a stated reason"
 *   - the 1..CURRENT gap check is a test, not only a runtime surprise
 *   - migration documentation generated from code
 */

const DOC_PATH = resolve(process.cwd(), 'docs/save-compatibility.md');
const UPDATING = process.env.UPDATE_SAVE_COMPAT_DOC === '1';

describe('#1023 ordered migration registry', () => {
  it('is dense from 1 to CURRENT_SAVE_SCHEMA_VERSION', () => {
    // migrateSaveToCurrent throws `Missing save migration for schema version N`
    // at load time on a gap. Finding it here is much cheaper.
    const versions = ORDERED_MIGRATIONS.map(m => m.version).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: CURRENT_SAVE_SCHEMA_VERSION }, (_, i) => i + 1));
  });

  it('has unique versions and unique ids', () => {
    expect(new Set(ORDERED_MIGRATIONS.map(m => m.version)).size).toBe(ORDERED_MIGRATIONS.length);
    expect(new Set(ORDERED_MIGRATIONS.map(m => m.id)).size).toBe(ORDERED_MIGRATIONS.length);
  });

  it('states an admission reason for every step', () => {
    for (const migration of ORDERED_MIGRATIONS) {
      expect(migration.reason.trim().length, `migration ${migration.version} (${migration.id})`)
        .toBeGreaterThan(20);
    }
  });
});

describe('#1023 unconditional registries', () => {
  const unconditional = [...COMPATIBILITY_NORMALIZERS, ...CORRUPTION_REPAIRS];

  it('every entry states its admission reason', () => {
    for (const entry of unconditional) {
      expect(entry.reason.trim().length, entry.id).toBeGreaterThan(20);
    }
  });

  it('ids are unique across both unconditional registries', () => {
    const ids = unconditional.map(entry => entry.id);
    expect(new Set(ids).size, `duplicate id across registries: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('no function is in two registries without a stated reason', () => {
    // The acceptance criterion, checked by function identity rather than by id:
    // an entry can only claim NOT to be dual-registered if its `apply` really
    // is absent from the ordered registry.
    const orderedByApply = new Map(ORDERED_MIGRATIONS.map(m => [m.apply, m]));

    const orderedVersions = new Set(ORDERED_MIGRATIONS.map(m => m.version));

    for (const entry of unconditional) {
      const ordered = orderedByApply.get(entry.apply);
      if (!ordered) {
        // Not literally the same function. A declaration is still allowed here —
        // `missing-game-identity` is a *guarded* variant of ordered step 1 rather
        // than step 1 itself — but the step it names must exist.
        if (entry.alsoOrderedMigration) {
          expect(
            orderedVersions.has(entry.alsoOrderedMigration.version),
            `${entry.id} names ordered migration ${entry.alsoOrderedMigration.version}, which does not exist`,
          ).toBe(true);
          expect(entry.alsoOrderedMigration.why.trim().length, `${entry.id} dual-registration reason`)
            .toBeGreaterThan(20);
        }
        continue;
      }
      expect(
        entry.alsoOrderedMigration,
        `"${entry.id}" runs unconditionally AND is ordered migration ${ordered.version}, `
          + 'but does not declare alsoOrderedMigration. Every dual registration needs a stated reason '
          + '— an undeclared one is exactly how a normalizer starts substituting for a migration.',
      ).toBeDefined();
      expect(entry.alsoOrderedMigration!.version, `${entry.id} names the wrong ordered version`)
        .toBe(ordered.version);
      expect(entry.alsoOrderedMigration!.why.trim().length, `${entry.id} dual-registration reason`)
        .toBeGreaterThan(20);
    }
  });

  it('the pipeline runs each unconditional entry exactly once', () => {
    const pipelineIds = UNCONDITIONAL_PASSES.map(pass => pass.id);
    expect(new Set(pipelineIds).size, 'an entry is listed twice in the pipeline').toBe(pipelineIds.length);
    expect([...pipelineIds].sort()).toEqual(unconditional.map(entry => entry.id).sort());
  });

  it('classifies every pipeline pass as compatibility or repair', () => {
    const compatibilityIds = new Set(COMPATIBILITY_NORMALIZERS.map(e => e.id));
    for (const pass of UNCONDITIONAL_PASSES) {
      expect(pass.kind, pass.id).toBe(compatibilityIds.has(pass.id) ? 'compatibility' : 'repair');
    }
  });
});

describe('#1023 generated migration documentation', () => {
  it('docs/save-compatibility.md matches the registries', () => {
    const rendered = renderSaveCompatibilityDoc();

    if (UPDATING) {
      writeFileSync(DOC_PATH, rendered);
      return;
    }

    const onDisk = readFileSync(DOC_PATH, 'utf8');
    expect(
      onDisk === rendered
        ? true
        : `docs/save-compatibility.md is out of date with the registries.\n`
          + 'It is generated, not hand-maintained — regenerate with:\n'
          + '  UPDATE_SAVE_COMPAT_DOC=1 yarn vitest run tests/storage/save-migration-registries.test.ts',
    ).toBe(true);
  });
});
