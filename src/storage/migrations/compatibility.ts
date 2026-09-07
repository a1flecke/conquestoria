import type { CompatibilityNormalizer } from './types';
import { migrateAutonomyNetworkPostures } from './steps/autonomy-network';
import { migrateCircularManufacturingChoices } from './steps/circular-manufacturing';
import { normalizeCrisisArchetypes } from './steps/crisis';
import { withReligionDefaults, normalizeCityFaithConversionProgress } from './steps/religion';
import { migrateBarbarianCampPressure } from './steps/barbarian-pressure';
import { normalizeRetimedBiplaneQueues } from './steps/retimed-units';

/**
 * #1023 — compatibility normalization: unconditional, every load.
 *
 * ADMISSION CRITERION: a safe default or an idempotent shape conversion for an
 * optional/additive field, where a save that predates the field is legal at
 * every schema version and every reader already tolerates its absence.
 *
 * This registry is the one an under-pressure change is most tempted to abuse —
 * adding a default here is cheaper than writing an ordered migration, and it
 * works, and nothing complains. That is precisely the substitution #1023 exists
 * to prevent, so:
 *
 *   - every entry states why old saves need no numbered migration, and
 *   - `tests/storage/save-persisted-shape-ratchet.test.ts` fails when a
 *     persisted field appears with no version bump and no written exemption.
 *
 * `alsoOrderedMigration` marks an entry that is deliberately in two registries
 * and says why running it unconditionally as well is correct rather than
 * redundant. `save-migration-registries.test.ts` requires that justification.
 */
export const COMPATIBILITY_NORMALIZERS: readonly CompatibilityNormalizer[] = [
  {
    id: 'autonomy-network-postures',
    reason: 'Posture fields are optional on every autonomy civ state and default to the centralized stance; a save without them is legal at any version.',
    apply: migrateAutonomyNetworkPostures,
    alsoOrderedMigration: {
      version: 6,
      why: 'Schema 6 introduced the fields. It stays unconditional because a civ added mid-game (breakaway, rebellion statehood) is created without them and would otherwise never receive them.',
    },
  },
  {
    id: 'circular-manufacturing-choices',
    reason: 'The choice map is optional and re-derived from actually-built national projects, so an absent or stale map is always recoverable without a version step.',
    apply: migrateCircularManufacturingChoices,
    alsoOrderedMigration: {
      version: 7,
      why: 'Schema 7 first filtered the map. It stays unconditional because a project razed or captured after the save was written invalidates a choice the numbered step already accepted.',
    },
  },
  {
    id: 'crisis-archetypes',
    reason: 'A crisis archetype is derived data, re-read from the flavor definition every load; the persisted value is a cache, never the source of truth.',
    apply: normalizeCrisisArchetypes,
  },
  {
    id: 'religion-defaults',
    reason: '#591 MR4: religions/cityFaith are absent on every save predating religion, and every reader uses `?? {}`. Purely additive.',
    apply: withReligionDefaults,
  },
  {
    id: 'city-faith-conversion-progress',
    reason: '#592 MR5: converts a legacy single-slot conversionProgress into the per-religion map. Idempotent — a ledger already in the new shape is returned untouched — so no version boundary is needed.',
    apply: normalizeCityFaithConversionProgress,
  },
  {
    id: 'barbarian-camp-pressure',
    reason: 'The pressure ledger is coarse, camp-owned, and fully re-derivable; an absent entry means "no observation yet", which is a legal state at any version.',
    apply: migrateBarbarianCampPressure,
    alsoOrderedMigration: {
      version: 14,
      why: 'Schema 14 introduced the ledger. It stays unconditional because camps spawn continuously during play and a camp created after the save has no entry.',
    },
  },
  {
    id: 'retimed-biplane-queues',
    reason: '#678 retimed the Biplane. Grandfathers an already-queued legacy Biplane onto its legal fighter successor exactly once; idempotent, and it never makes a newly-illegal item legal, so no version boundary is needed.',
    apply: normalizeRetimedBiplaneQueues,
  },
];
