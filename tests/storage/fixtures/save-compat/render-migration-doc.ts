import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-schema-version';
import { ORDERED_MIGRATIONS } from '@/storage/migrations/ordered';
import { COMPATIBILITY_NORMALIZERS } from '@/storage/migrations/compatibility';
import { CORRUPTION_REPAIRS } from '@/storage/migrations/repair';
import { UNCONDITIONAL_PASSES } from '@/storage/migrations/pipeline';

/**
 * #1023 — render `docs/save-compatibility.md` from the three registries.
 *
 * The issue asks for "migration documentation generated from code where
 * practical, so the list cannot drift from reality". This is that generator;
 * `save-migration-registries.test.ts` fails when the committed doc and the
 * registries disagree.
 */

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderSaveCompatibilityDoc(): string {
  const lines: string[] = [];

  lines.push('# Save compatibility');
  lines.push('');
  lines.push('<!-- GENERATED FILE — do not edit by hand.');
  lines.push('     Source: src/storage/migrations/{ordered,compatibility,repair}.ts');
  lines.push('     Regenerate: UPDATE_SAVE_COMPAT_DOC=1 yarn vitest run tests/storage/save-migration-registries.test.ts');
  lines.push('     Enforced by: tests/storage/save-migration-registries.test.ts -->');
  lines.push('');
  lines.push(`Current schema version: **${CURRENT_SAVE_SCHEMA_VERSION}**`);
  lines.push('');
  lines.push('Save compatibility is three separate mechanisms (#1023). They are deliberately');
  lines.push('not interchangeable: a normalizer silently standing in for a migration that was');
  lines.push('never written is the failure this separation exists to prevent.');
  lines.push('');

  lines.push('## 1. Ordered versioned migrations');
  lines.push('');
  lines.push('**Admission criterion:** the persisted shape changed at schema N, and a save written');
  lines.push('below N cannot be read correctly without this transformation.');
  lines.push('');
  lines.push('Run exactly once, in ascending order, only for saves below the current version.');
  lines.push('Never on an already-current save.');
  lines.push('');
  lines.push('| Schema | Step | Why it needed a version bump |');
  lines.push('|---:|---|---|');
  for (const migration of [...ORDERED_MIGRATIONS].sort((a, b) => a.version - b.version)) {
    lines.push(`| ${migration.version} | \`${migration.id}\` | ${cell(migration.reason)} |`);
  }
  lines.push('');

  lines.push('## 2. Compatibility normalization');
  lines.push('');
  lines.push('**Admission criterion:** a safe default or an idempotent shape conversion for an');
  lines.push('optional/additive field, where a save that predates the field is legal at every');
  lines.push('schema version and every reader already tolerates its absence.');
  lines.push('');
  lines.push('Run unconditionally on every load.');
  lines.push('');
  lines.push('| Pass | Why old saves need no migration | Also schema step |');
  lines.push('|---|---|---:|');
  for (const entry of COMPATIBILITY_NORMALIZERS) {
    const dual = entry.alsoOrderedMigration ? String(entry.alsoOrderedMigration.version) : '—';
    lines.push(`| \`${entry.id}\` | ${cell(entry.reason)} | ${dual} |`);
  }
  lines.push('');

  lines.push('## 3. Corruption repair / defensive sanitation');
  lines.push('');
  lines.push('**Admission criterion:** drops or repairs structurally impossible data that the game');
  lines.push('itself never writes — a hand-edited, truncated, or externally-produced file.');
  lines.push('');
  lines.push('Run unconditionally on every load. **A repair that actually fires on a save the game');
  lines.push('wrote is a bug in the writer, not a reason to keep the repair.**');
  lines.push('');
  lines.push('| Pass | What malformed input it defends against | Also schema step |');
  lines.push('|---|---|---:|');
  for (const entry of CORRUPTION_REPAIRS) {
    const dual = entry.alsoOrderedMigration ? String(entry.alsoOrderedMigration.version) : '—';
    lines.push(`| \`${entry.id}\` | ${cell(entry.reason)} | ${dual} |`);
  }
  lines.push('');

  const dual = [...COMPATIBILITY_NORMALIZERS, ...CORRUPTION_REPAIRS].filter(e => e.alsoOrderedMigration);
  lines.push('## Dual registrations');
  lines.push('');
  lines.push('A pass may be both a numbered step and an unconditional one, but only with a stated');
  lines.push('reason — an undeclared dual registration is how a normalizer starts substituting for');
  lines.push('a migration. Enforced by function identity, not by id.');
  lines.push('');
  lines.push('| Pass | Schema step | Why it also runs unconditionally |');
  lines.push('|---|---:|---|');
  for (const entry of dual) {
    lines.push(`| \`${entry.id}\` | ${entry.alsoOrderedMigration!.version} | ${cell(entry.alsoOrderedMigration!.why)} |`);
  }
  lines.push('');

  lines.push('## Unconditional pass order');
  lines.push('');
  lines.push('The legacy tail order, preserved verbatim by #1023 — several passes read fields an');
  lines.push('earlier pass defaults, so regrouping by registry would be a behaviour change dressed');
  lines.push('as a refactor.');
  lines.push('');
  UNCONDITIONAL_PASSES.forEach((pass, index) => {
    lines.push(`${index + 1}. \`${pass.id}\` (${pass.kind})`);
  });
  lines.push('');

  return `${lines.join('\n')}`;
}
