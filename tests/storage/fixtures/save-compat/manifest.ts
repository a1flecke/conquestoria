import type { GameState } from '@/core/types';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-schema-version';
import { buildBaselineSave } from './baseline';

/**
 * #1006 — the save-compatibility matrix manifest.
 *
 * One `well-formed` case per source schema version 0..CURRENT: a save written
 * at that version, migrated forward, run for a turn, re-saved and reloaded,
 * then checked against the shared invariant validators. Plus `malformed-repair`
 * cases for the migrations that exist ONLY to scrub hand-edited corruption
 * (23, 25, 26, 27) — a well-formed fixture would exercise nothing there.
 *
 * The coverage meta-test (`save-compat-coverage.test.ts`, fast tier) fails if
 * `CURRENT_SAVE_SCHEMA_VERSION` advances without a matching well-formed case,
 * or if `SAVE_MIGRATIONS` has a key with no case whose migration span covers
 * it. The matrix itself (`save-compat-matrix.test.ts`) is slow tier.
 */

export type SaveCompatKind = 'well-formed' | 'malformed-repair';

export interface SaveCompatCase {
  /** The save was written at this schema version; migrations sourceVersion+1..CURRENT run. */
  sourceVersion: number;
  label: string;
  kind: SaveCompatKind;
  /** High-risk state categories this case is meant to exercise (documentation + coverage reporting). */
  focus: string[];
  /** Produce the raw pre-migration save object. */
  build: () => Record<string, unknown>;
  /** Optional assertions to run on the migrated state before the turn is processed. */
  afterMigrate?: (migrated: GameState) => void;
}

type RawState = Record<string, any>;

/**
 * Optional containers / fields added over the project's history. A save written
 * at version `v` would not carry anything whose `introducedAt` is greater than
 * `v`; `downgradeToVersion` strips those so each migration has real work.
 * Deliberately conservative — only fields whose absence is a faithful "old
 * save" shape and whose rehydration path is a migration or the unconditional
 * normalizer tail.
 */
const HISTORICAL_FIELDS: ReadonlyArray<{ introducedAt: number; strip: (raw: RawState) => void }> = [
  { introducedAt: 1, strip: raw => { delete raw.gameId; } },
  { introducedAt: 3, strip: raw => { delete raw.autonomyByCiv; delete raw.networkCivicPressureByCity; if (raw.idCounters) delete raw.idCounters.nextNetworkPlanId; } },
  { introducedAt: 7, strip: raw => { delete raw.nationalProjectChoices; } },
  { introducedAt: 14, strip: raw => { delete raw.barbarianCampPressure; } },
  { introducedAt: 15, strip: raw => { delete raw.crisisForces; } },
  { introducedAt: 17, strip: raw => { delete raw.stampedes; } },
  { introducedAt: 18, strip: raw => { delete raw.rogueElephantHosts; } },
  {
    introducedAt: 20,
    strip: raw => {
      for (const civ of Object.values(raw.civilizations ?? {}) as RawState[]) {
        if (civ.diplomacy) delete civ.diplomacy.strategicStrikesReceivedFrom;
      }
    },
  },
  { introducedAt: 21, strip: raw => { if (raw.legendaryWonderHistory) delete raw.legendaryWonderHistory.militaryFacts; } },
  { introducedAt: 22, strip: raw => { delete raw.legendaryWonderTacticalEffects; } },
  { introducedAt: 23, strip: raw => { delete raw.generatedGenerals; } },
  {
    introducedAt: 25,
    strip: raw => {
      for (const civ of Object.values(raw.civilizations ?? {}) as RawState[]) {
        delete civ.federalismEnabled;
        delete civ.federalismChangedTurn;
      }
    },
  },
  {
    introducedAt: 26,
    strip: raw => {
      for (const city of Object.values(raw.cities ?? {}) as RawState[]) delete city.bombardment;
    },
  },
  { introducedAt: 28, strip: raw => { delete raw.minorCivLeagues; } },
  // Rehydrated by the unconditional normalizer tail on every load regardless of
  // version — strip for any pre-CURRENT source so the "old save had none" path runs.
  {
    introducedAt: CURRENT_SAVE_SCHEMA_VERSION,
    strip: raw => {
      delete raw.religions;
      delete raw.cityFaith;
      delete raw.pirateFleets;
      delete raw.pirateFleetCooldownByCivLandmass;
      delete raw.resurgentCampCooldownByCivLandmass;
    },
  },
];

/** Deep-clone the baseline, strip everything introduced after `version`, and stamp the schema. */
export function downgradeToVersion(baseState: GameState, version: number): RawState {
  const raw = structuredClone(baseState) as RawState;
  for (const field of HISTORICAL_FIELDS) {
    if (field.introducedAt > version) field.strip(raw);
  }
  if (version <= 0) {
    delete raw.saveSchemaVersion;
  } else {
    raw.saveSchemaVersion = version;
  }
  return raw;
}

function wellFormedCase(sourceVersion: number): SaveCompatCase {
  return {
    sourceVersion,
    label: sourceVersion === 0 ? 'unversioned legacy save (schema 0)' : `save written at schema ${sourceVersion}`,
    kind: 'well-formed',
    focus: ['city+unit rosters', 'bilateral war', 'trade route', 'eliminated civ'],
    build: () => downgradeToVersion(buildBaselineSave(`save-compat-v${sourceVersion}`).state, sourceVersion),
  };
}

/** Corruption-repair migrations: source version = (migration number - 1). */
const MALFORMED_CASES: SaveCompatCase[] = [
  {
    sourceVersion: 22,
    label: 'migration 23 — scrubs a malformed generated-officer registry entry',
    kind: 'malformed-repair',
    focus: ['great generals', 'generatedGenerals'],
    build: () => {
      const raw = downgradeToVersion(buildBaselineSave('save-compat-malformed-23').state, 22);
      // Structurally broken: id/key mismatch, missing required GeneralDefinition fields.
      raw.generatedGenerals = {
        'gen-bogus': { origin: 'generated', id: 'gen-DIFFERENT', name: 42 },
        'gen-ok-but-empty': { origin: 'generated' },
      };
      return raw;
    },
    afterMigrate: migrated => {
      if (Object.keys(migrated.generatedGenerals ?? {}).length !== 0) {
        throw new Error(`migration 23 should have scrubbed all malformed entries, got: ${JSON.stringify(migrated.generatedGenerals)}`);
      }
    },
  },
  {
    sourceVersion: 24,
    label: 'migration 25 — scrubs a malformed federalismChangedTurn',
    kind: 'malformed-repair',
    focus: ['federal autonomy', 'unrest ladder'],
    build: () => {
      const raw = downgradeToVersion(buildBaselineSave('save-compat-malformed-25').state, 24);
      const civ = (raw.civilizations as RawState).player;
      civ.federalismEnabled = 'yes-please';       // wrong type
      civ.federalismChangedTurn = -7;             // negative
      return raw;
    },
    afterMigrate: migrated => {
      const civ = migrated.civilizations.player;
      if (civ.federalismEnabled !== undefined || civ.federalismChangedTurn !== undefined) {
        throw new Error(`migration 25 should have scrubbed the hand-edited federalism fields, got enabled=${JSON.stringify(civ.federalismEnabled)} changedTurn=${JSON.stringify(civ.federalismChangedTurn)}`);
      }
    },
  },
  {
    sourceVersion: 25,
    label: 'migration 26 — scrubs a malformed city.bombardment tally',
    kind: 'malformed-repair',
    focus: ['city bombardment cap'],
    build: () => {
      const raw = downgradeToVersion(buildBaselineSave('save-compat-malformed-26').state, 25);
      const cities = Object.values(raw.cities as RawState) as RawState[];
      cities[0].bombardment = { turn: -1, hpLostThisTurn: 999999 };
      return raw;
    },
    afterMigrate: migrated => {
      for (const city of Object.values(migrated.cities)) {
        if (city.bombardment !== undefined) {
          throw new Error(`migration 26 should have scrubbed the malformed bombardment tally on ${city.id}, got ${JSON.stringify(city.bombardment)}`);
        }
      }
    },
  },
  {
    sourceVersion: 26,
    label: 'migration 27 — normalizes malformed vassalage state',
    kind: 'malformed-repair',
    focus: ['vassalage', 'diplomacy'],
    build: () => {
      const raw = downgradeToVersion(buildBaselineSave('save-compat-malformed-27').state, 26);
      const civ = (raw.civilizations as RawState).player;
      // Dangling / self-referential vassalage that normalizeVassalage must repair.
      civ.diplomacy.vassalage = {
        overlord: 'player',            // self-overlord
        vassals: ['ai-1', 'ai-1', 'ai-ghost'], // dupe + dangling
        protectionScore: Number.NaN,
        protectionTimers: [{ attackerCivId: 'ai-ghost', turnsRemaining: -3 }],
        peakCities: -1,
        peakMilitary: -1,
      };
      return raw;
    },
    afterMigrate: migrated => {
      const v = migrated.civilizations.player.diplomacy.vassalage;
      if (v.overlord === 'player') throw new Error('migration 27 left a self-overlord in place');
      if (v.vassals.includes('ai-ghost')) throw new Error('migration 27 left a dangling vassal id in place');
    },
  },
];

export const SAVE_COMPAT_MATRIX: readonly SaveCompatCase[] = [
  ...Array.from({ length: CURRENT_SAVE_SCHEMA_VERSION + 1 }, (_, version) => wellFormedCase(version)),
  ...MALFORMED_CASES,
];

/** Source versions with at least one `well-formed` case. */
export const COVERED_WELL_FORMED_VERSIONS: ReadonlySet<number> = new Set(
  SAVE_COMPAT_MATRIX.filter(c => c.kind === 'well-formed').map(c => c.sourceVersion),
);
