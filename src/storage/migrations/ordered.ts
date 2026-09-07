import { normalizeVassalage } from '@/storage/vassalage-normalization';
import { normalizeMinorCivLeagueState } from '@/storage/minor-civ-league-normalization';
import type { OrderedMigration } from './types';
import { migrateToEra13Foundation } from './steps/tech-identity';
import { migrateLateResources } from './steps/late-resources';
import { migrateAutonomyNetwork, migrateAutonomyNetworkPostures } from './steps/autonomy-network';
import { migrateLegacyBasedAircraft } from './steps/legacy-aircraft';
import { migrateDualEraWorldAge } from './steps/world-age';
import { migrateCircularManufacturingChoices } from './steps/circular-manufacturing';
import { migrateCombatNotificationDetails } from './steps/combat-notifications';
import { migrateCoastalHullsOffOcean } from './steps/coastal-hulls';
import { migrateRetimedCavalry, migrateRetimedKnight } from './steps/retimed-units';
import { migrateLegacyMainFixups } from './steps/legacy-main-fixups';
import { normalizeCoastalBatteryCounterfireTurns } from './steps/coastal-battery';
import { migrateBarbarianCampPressure } from './steps/barbarian-pressure';
import {
  migrateCrisisForceContainer,
  migrateCrisisForceRecords,
  migrateStampedeContainer,
  migrateRogueElephantHostContainer,
  migrateRogueElephantHostRecords,
} from './steps/crisis';
import { migrateStrategicStrikeLedger } from './steps/strategic-strikes';
import {
  normalizeLegendaryWonderMilitaryFacts,
  normalizeLegendaryWonderTacticalEffects,
} from './steps/legendary-wonders';
import { normalizeGeneratedGenerals } from './steps/generated-generals';
import { migrateResearchCostsV24 } from './steps/research-costs';
import { repairFederalismFields } from './steps/federalism';
import { repairCityBombardmentTallies } from './steps/bombardment';

/**
 * #1023 — the ordered versioned migrations, one per schema step.
 *
 * ADMISSION CRITERION: the persisted shape changed at schema N, and a save
 * written below N cannot be read correctly without this transformation. Runs
 * exactly once, in ascending order, only for saves below the current version.
 *
 * The registry must be dense from 1 to `CURRENT_SAVE_SCHEMA_VERSION` — a gap is
 * a hard load failure for every older save. `migrateSaveToCurrent` still throws
 * on one at runtime, and `save-migrations.test.ts` ("save migration registry
 * integrity") fails on one at test time, which is where you want to find it.
 *
 * Adding an entry here means bumping `CURRENT_SAVE_SCHEMA_VERSION` in the same
 * change (see `.claude/rules/game-systems.md`).
 */
export const ORDERED_MIGRATIONS: readonly OrderedMigration[] = [
  {
    version: 1,
    id: 'era-13-foundation',
    reason: 'Legacy saves had no stable gameId and used technology ids renamed at the era-13 boundary; every deterministic RNG stream keys off gameId.',
    apply: migrateToEra13Foundation,
  },
  {
    version: 2,
    id: 'late-resources',
    reason: 'Late-era resource deposits did not exist when the save was written and must be placed reproducibly from its own gameId.',
    apply: migrateLateResources,
  },
  {
    version: 3,
    id: 'autonomy-network',
    reason: 'The autonomy/network subsystem added required containers plus cyber-unit plans that readers cannot synthesize.',
    apply: migrateAutonomyNetwork,
  },
  {
    version: 4,
    id: 'legacy-based-aircraft',
    reason: 'Aircraft persisted without a valid air base must be re-homed or removed; leaving them strands units the movement system cannot resolve.',
    apply: migrateLegacyBasedAircraft,
  },
  {
    version: 5,
    id: 'dual-era-world-age',
    reason: 'World Age became a derived majority of per-civ personal eras, replacing the single persisted era field.',
    apply: migrateDualEraWorldAge,
  },
  {
    version: 6,
    id: 'autonomy-network-postures',
    reason: 'Posture fields were added to every autonomy civ state after the container itself shipped.',
    apply: migrateAutonomyNetworkPostures,
  },
  {
    version: 7,
    id: 'circular-manufacturing-choices',
    reason: 'Circular Manufacturing choices had to be re-derived against actually-built projects; a stale choice grants a material the empire never earned.',
    apply: migrateCircularManufacturingChoices,
  },
  {
    version: 8,
    id: 'combat-notification-details',
    reason: 'Combat notifications gained structured detail; entries written before it render as half-populated log rows.',
    apply: migrateCombatNotificationDetails,
  },
  {
    version: 9,
    id: 'coastal-hulls-off-ocean',
    reason: '#751 made coastal-only hulls illegal on open ocean; a save with one has a unit no movement rule can legally move.',
    apply: migrateCoastalHullsOffOcean,
  },
  {
    version: 10,
    id: 'retimed-cavalry',
    reason: 'Cavalry moved era; an already-queued one is grandfathered exactly once without making new early Cavalry legal.',
    apply: migrateRetimedCavalry,
  },
  {
    version: 11,
    id: 'retimed-knight',
    reason: 'Knight moved era after the Cuirassier retime; same one-time grandfathering contract as Cavalry.',
    apply: migrateRetimedKnight,
  },
  {
    version: 12,
    id: 'legacy-main-fixups',
    reason: '#787 absorbed eighteen fixups that previously ran only on the hot-seat campaign-entry path, so solo saves never received them.',
    apply: migrateLegacyMainFixups,
  },
  {
    version: 13,
    id: 'coastal-battery-counterfire-turns',
    reason: 'Per-city Coastal Battery counterfire markers were added; a malformed or absent marker corrupts counterfire timing.',
    apply: normalizeCoastalBatteryCounterfireTurns,
  },
  {
    version: 14,
    id: 'barbarian-camp-pressure',
    reason: 'The coarse per-camp pressure ledger was added and is read without a fallback by the threat-pressure system.',
    apply: migrateBarbarianCampPressure,
  },
  {
    version: 15,
    id: 'crisis-force-container',
    reason: 'Crisis forces became persisted world actors; the container must exist before any crisis can be resolved on load.',
    apply: migrateCrisisForceContainer,
  },
  {
    version: 16,
    id: 'crisis-force-records',
    reason: 'The crisis-force record shape changed after the container shipped.',
    apply: migrateCrisisForceRecords,
  },
  {
    version: 17,
    id: 'stampede-container',
    reason: 'Beast Stampede state became persisted and target-scoped.',
    apply: migrateStampedeContainer,
  },
  {
    version: 18,
    id: 'rogue-elephant-host-container',
    reason: 'Rogue Elephant Host state became persisted and target-scoped.',
    apply: migrateRogueElephantHostContainer,
  },
  {
    version: 19,
    id: 'rogue-elephant-host-records',
    reason: 'The host and crisis-force record shapes changed after their containers shipped.',
    apply: migrateRogueElephantHostRecords,
  },
  {
    version: 20,
    id: 'strategic-strike-ledger',
    reason: '#545 MR4 made strategicStrikesReceivedFrom a DiplomacyState field; retaliation classification reads it as an append-only history.',
    apply: migrateStrategicStrikeLedger,
  },
  {
    version: 21,
    id: 'legendary-wonder-military-facts',
    reason: 'Legendary-wonder military facts became persisted quest evidence rather than being recomputed from later state.',
    apply: normalizeLegendaryWonderMilitaryFacts,
  },
  {
    version: 22,
    id: 'legendary-wonder-tactical-effects',
    reason: 'Owner-scoped tactical effect state became persisted; without it a completed wonder silently grants nothing.',
    apply: normalizeLegendaryWonderTacticalEffects,
  },
  {
    version: 23,
    id: 'generated-generals',
    reason: '#888 made the fallback-generated officer registry authoritative for identity; without it a generated General is renamed by a later name-pool edit.',
    apply: normalizeGeneratedGenerals,
  },
  {
    version: 24,
    id: 'research-costs-v24',
    reason: '#917 retuned technology costs; in-flight research must keep its invested percentage rather than its absolute progress.',
    apply: migrateResearchCostsV24,
  },
  {
    version: 25,
    id: 'federalism-fields',
    reason: 'Federal Autonomy added two optional Civilization fields. See the corruption-repair registry: this step is scrub-only and takes a number solely so the repair has a version boundary.',
    apply: repairFederalismFields,
  },
  {
    version: 26,
    id: 'city-bombardment-tallies',
    reason: 'City.bombardment added the per-turn cap tally. Like 25, scrub-only — the number exists to give the repair a version boundary.',
    apply: repairCityBombardmentTallies,
  },
  {
    version: 27,
    id: 'vassalage',
    reason: '#910 made vassalage bilateral; a one-sided or dangling role silently breaks protection obligations and independence checks.',
    apply: normalizeVassalage,
  },
  {
    version: 28,
    id: 'minor-civ-leagues',
    reason: '#496 added the regional-compact container. Additive persistent container only; formation stays a world-turn action.',
    apply: normalizeMinorCivLeagueState,
  },
];

/** Version-keyed view, for the ordered loop and the gap check. */
export const ORDERED_MIGRATIONS_BY_VERSION: Readonly<Record<number, OrderedMigration>> =
  Object.fromEntries(ORDERED_MIGRATIONS.map(migration => [migration.version, migration]));
