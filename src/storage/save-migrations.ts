import type { GameState } from '@/core/types';
import { CURRENT_SAVE_SCHEMA_VERSION } from './save-schema-version';
import { ORDERED_MIGRATIONS_BY_VERSION } from './migrations/ordered';
import { UNCONDITIONAL_PASSES } from './migrations/pipeline';
import type { SaveMigration } from './migrations/types';

/**
 * Save compatibility — composition only (#1023).
 *
 * This module used to be 1130 lines mixing three mechanisms that were
 * indistinguishable at the call site, so a normalizer in the unconditional tail
 * could silently paper over a migration that was never written. They now live in
 * three registries, each with a written admission criterion:
 *
 *   `migrations/ordered.ts`       versioned N-1 -> N steps; run once, in order,
 *                                 only for saves below the current version
 *   `migrations/compatibility.ts` safe defaulting of additive/optional fields
 *   `migrations/repair.ts`        defensive sanitation of malformed external data
 *
 * `migrations/pipeline.ts` fixes the order the unconditional two run in (the
 * legacy tail order, verbatim). Individual step implementations live under
 * `migrations/steps/`, split by family.
 *
 * Guards on this seam:
 *   - `save-migration-equivalence.test.ts`   byte-equivalent output for every
 *                                            compatibility-matrix fixture
 *   - `save-persisted-shape-ratchet.test.ts` a persisted field cannot appear
 *                                            without a version bump or a written
 *                                            additive exemption
 *   - `save-migration-registries.test.ts`    registry hygiene + generated docs
 *   - `save-compat-matrix.test.ts` (#1006)   migrate -> play -> save -> reload
 */

// Re-exported so every existing `import { CURRENT_SAVE_SCHEMA_VERSION } from
// '@/storage/save-migrations'` keeps working. The canonical definition lives
// in the dependency-free leaf module `./save-schema-version` (#1004) so
// `createNewGame` can stamp it without importing this whole migration graph.
export { CURRENT_SAVE_SCHEMA_VERSION };

export type { SaveMigration };

export class UnsupportedSaveSchemaVersionError extends Error {
  constructor(readonly saveVersion: number) {
    super(`Save schema version ${saveVersion} is newer than this build supports (${CURRENT_SAVE_SCHEMA_VERSION}).`);
    this.name = 'UnsupportedSaveSchemaVersionError';
  }
}

/**
 * Version-keyed ordered migrations. Kept in this shape and under this name
 * because tests and tooling read it as the registry of record; the authored
 * list (with each step's admission reason) is `ORDERED_MIGRATIONS`.
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = Object.fromEntries(
  Object.entries(ORDERED_MIGRATIONS_BY_VERSION).map(([version, migration]) => [version, migration.apply]),
);

// Step implementations that callers outside migration legitimately need.
export { remapPersistedTechId } from './migrations/steps/tech-identity';
export { normalizeGeneratedGenerals, normalizeGeneralCareerLedger } from './migrations/steps/generated-generals';
export {
  normalizeLegendaryWonderMilitaryFacts,
  normalizeLegendaryWonderTacticalEffects,
} from './migrations/steps/legendary-wonders';
export { normalizeImprovementValues } from './migrations/steps/improvements';
export { normalizeCoastalBatteryCounterfireTurns } from './migrations/steps/coastal-battery';

function readSchemaVersion(raw: Record<string, unknown>): number {
  const version = raw.saveSchemaVersion;
  if (version === undefined) return 0;
  if (!Number.isInteger(version) || Number(version) < 0) {
    throw new TypeError('Save schema version must be a non-negative integer.');
  }
  return Number(version);
}

export function migrateSaveToCurrent(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Save data must be an object.');
  }

  const sourceVersion = readSchemaVersion(raw as Record<string, unknown>);
  if (sourceVersion > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new UnsupportedSaveSchemaVersionError(sourceVersion);
  }

  // 1. Ordered versioned migrations — once each, in order, only below current.
  let state = structuredClone(raw) as GameState;
  for (let version = sourceVersion + 1; version <= CURRENT_SAVE_SCHEMA_VERSION; version += 1) {
    const migration = ORDERED_MIGRATIONS_BY_VERSION[version];
    if (!migration) {
      // Also asserted at test time by save-migrations.test.ts's registry
      // integrity block, which is where you want to find a gap.
      throw new Error(`Missing save migration for schema version ${version}.`);
    }
    state = { ...migration.apply(state), saveSchemaVersion: version };
  }

  // 2 + 3. Compatibility normalization and corruption repair, unconditionally,
  // in the legacy tail order (see migrations/pipeline.ts for why that order is
  // preserved verbatim rather than regrouped by registry).
  for (const pass of UNCONDITIONAL_PASSES) {
    state = pass.apply(state);
  }
  return state;
}
