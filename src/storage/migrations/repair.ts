import { normalizeVassalage } from '@/storage/vassalage-normalization';
import type { CorruptionRepair } from './types';
import { migrateToEra13Foundation } from './steps/tech-identity';
import { normalizeLegacyTechGrace } from './steps/tech-grace';
import { normalizeGeneratedGenerals, normalizeGeneralCareerLedger } from './steps/generated-generals';
import {
  normalizeLegendaryWonderMilitaryFacts,
  normalizeLegendaryWonderTacticalEffects,
} from './steps/legendary-wonders';
import { normalizeCoastalBatteryCounterfireTurns } from './steps/coastal-battery';
import { normalizeImprovementValues } from './steps/improvements';
import { normalizeBilateralWar } from './steps/bilateral-war';
import { normalizeCargoReciprocity } from './steps/cargo-reciprocity';
import { repairDominationIntel } from './steps/domination-intel';

/**
 * #1023 — corruption repair / defensive sanitation: unconditional, every load.
 *
 * ADMISSION CRITERION: drops or repairs structurally impossible data that the
 * game itself never writes — a hand-edited, truncated, or externally-produced
 * file. This is a robustness concern, not a versioning one.
 *
 * The load-bearing consequence of that criterion: **a repair that actually fires
 * on a save the game wrote is a bug in the writer, not a reason to keep the
 * repair.** If one starts changing real saves, fix the producer.
 *
 * Save files are user-reachable — exported to JSON, shared between machines,
 * hand-edited — so these run on every load regardless of version rather than
 * only for old saves. Several are also numbered steps (the version where the
 * field appeared); `alsoOrderedMigration` records why the unconditional pass is
 * still correct, and `save-migration-registries.test.ts` requires it.
 */
export const CORRUPTION_REPAIRS: readonly CorruptionRepair[] = [
  {
    id: 'missing-game-identity',
    reason: 'A save claiming a schema version but carrying no gameId is externally malformed — every deterministic RNG stream keys off gameId, so a missing one must be re-derived stably rather than left undefined.',
    apply: state => (state.gameId ? state : migrateToEra13Foundation(state)),
    alsoOrderedMigration: {
      version: 1,
      why: 'Schema 1 gives an unversioned save its gameId. The guarded pass here only fires for a save that claims version >= 1 yet has no gameId — a shape the game never writes.',
    },
  },
  {
    id: 'legacy-tech-grace',
    reason: 'Scrubs stale hard-resource retime-grace data down to the units that still legitimately hold it; a hand-edited grace list would otherwise keep an illegal unit buildable forever.',
    apply: normalizeLegacyTechGrace,
  },
  {
    id: 'generated-generals',
    reason: 'Drops structurally malformed generated-officer records (id/key mismatch, missing required fields) so a corrupt file cannot crash identity resolution or resurrect a garbage officer.',
    apply: normalizeGeneratedGenerals,
    alsoOrderedMigration: {
      version: 23,
      why: 'Schema 23 defaults the registry for saves predating #888. The unconditional pass is the scrub half, which applies to any file regardless of version.',
    },
  },
  {
    id: 'general-career-ledger',
    reason: 'Drops malformed career events (not an object, missing/NaN turn, unknown type) without fabricating history for a General that has none.',
    apply: normalizeGeneralCareerLedger,
  },
  {
    id: 'legendary-wonder-military-facts',
    reason: 'Drops persisted quest-evidence facts that fail structural validation, so a hand-edited file cannot satisfy a legendary-wonder quest step it never earned.',
    apply: normalizeLegendaryWonderMilitaryFacts,
    alsoOrderedMigration: {
      version: 21,
      why: 'Schema 21 introduced the facts list. The unconditional pass is the validation half — quest evidence is exactly the thing worth editing a save file to forge.',
    },
  },
  {
    id: 'legendary-wonder-tactical-effects',
    reason: 'Scrubs granted combat roles that are not real roles, so a corrupt file cannot hand a civ a tactical grant the wonder never confers.',
    apply: normalizeLegendaryWonderTacticalEffects,
    alsoOrderedMigration: {
      version: 22,
      why: 'Schema 22 introduced the effect state. The unconditional pass is the validation half, for the same forgery reason as the military facts above.',
    },
  },
  {
    id: 'coastal-battery-counterfire-turns',
    reason: 'Removes non-integer per-city counterfire markers, which would otherwise corrupt counterfire-timing arithmetic.',
    apply: normalizeCoastalBatteryCounterfireTurns,
    alsoOrderedMigration: {
      version: 13,
      why: 'Schema 13 introduced the markers. The unconditional pass is the malformed-value scrub.',
    },
  },
  {
    id: 'improvement-values',
    reason: 'Clamps unknown improvement ids to "none" and caps build timers at their definition maximum, so a hand-edited tile cannot complete an improvement that does not exist.',
    apply: normalizeImprovementValues,
  },
  {
    id: 'bilateral-war',
    reason: 'Repairs one-sided, self-referential and duplicated MAJOR-civ war entries; a one-sided war silently drives war-weariness unrest, AI war-pressure and peace availability off a phantom (#995).',
    apply: normalizeBilateralWar,
  },
  {
    id: 'cargo-reciprocity',
    reason: 'Repairs transport/cargo and carrier-aircraft links the load/unload/rebase helpers never break: a dangling or one-sided transportId, an over-capacity or wrong-owner manifest, a transport listed as cargo, and a based aircraft whose air base is gone (removed, like the game does on air-base loss) (#1000).',
    apply: normalizeCargoReciprocity,
  },
  {
    id: 'vassalage',
    reason: 'Repairs one-sided, self-referential, duplicated and dangling vassalage roles; an impossible role silently breaks protection obligations and independence checks.',
    apply: normalizeVassalage,
    alsoOrderedMigration: {
      version: 27,
      why: 'Schema 27 made vassalage bilateral. The unconditional pass is the impossible-shape repair, which must apply to any file regardless of version.',
    },
  },
  {
    id: 'domination-intel',
    reason: 'Drops malformed earned-Domination records from a current-version external save without reconstructing unearned history.',
    apply: repairDominationIntel,
    alsoOrderedMigration: {
      version: 29,
      why: 'Schema 29 initializes the ledger for old saves, while this unconditional guard repairs a missing field that current writers never emit.',
    },
  },
];
