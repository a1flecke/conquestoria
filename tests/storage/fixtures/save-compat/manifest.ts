import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameState } from '@/core/types';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-schema-version';
import { buildBaselineSave, buildHotSeatBaselineSave } from './baseline';

/**
 * #1006 — the save-compatibility matrix manifest.
 *
 * One `well-formed` case per source schema version 0..CURRENT: a save written
 * at that version, migrated forward, run for a turn, re-saved and reloaded,
 * then checked against the shared invariant validators. Plus `malformed-repair`
 * cases for the migrations that exist ONLY to scrub hand-edited corruption
 * (23, 25, 26, 27) and for the unconditional corruption repairs that never bump
 * a version (bilateral war #995, cargo reciprocity #1000) — a well-formed
 * fixture would exercise nothing there.
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
  /** Completed rounds to process after loading (default 3). */
  runRounds?: number;
}

type RawState = Record<string, any>;

/**
 * Optional containers / fields added over the project's history. A save written
 * at version `v` would not carry anything whose `introducedAt` is greater than
 * `v`; `downgradeToVersion` strips those so each migration has real work.
 *
 * Deliberately conservative — only fields whose absence is a faithful "old
 * save" shape and whose rehydration path is a migration or the unconditional
 * normalizer tail. Migrations that reshape a value already present rather than
 * add a container (2 late resources, 4 based aircraft, 5 dual-era world age,
 * 8 combat-notification detail, 10/11 retimed cavalry/knight, 12 the main.ts
 * fixup bundle) get no tailored strip: for those source versions the migrated
 * fixture is a near-no-op, and the matrix's contract there is only "migrate →
 * run rounds → reload stays structurally valid". Field-level correctness of
 * those specific migrations is owned by their targeted `save-migrations-v*`
 * tests, which this file does not replace. The real archived save (case below)
 * is the counterweight to the fixtures all being `createNewGame`-shaped.
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
  {
    // #995 — no version bump: `normalizeBilateralWar` is an unconditional
    // corruption repair, so this exercises it against a corrupt CURRENT save.
    sourceVersion: CURRENT_SAVE_SCHEMA_VERSION,
    label: 'repair — normalizes one-sided / duplicated / self major-civ war state (#995)',
    kind: 'malformed-repair',
    focus: ['diplomacy', 'bilateral war'],
    build: () => {
      const raw = buildBaselineSave('save-compat-malformed-bilateral-war').state as RawState;
      const civs = raw.civilizations as RawState;
      // player lists ai-1 but ai-1 does not list player → one-sided
      civs.player.diplomacy.atWarWith = ['ai-1', 'ai-1', 'player'];
      civs['ai-1'].diplomacy.atWarWith = [];
      // ai-2 lists ai-1 one-sidedly the other direction
      if (civs['ai-2']) civs['ai-2'].diplomacy.atWarWith = ['ai-1'];
      return raw;
    },
    afterMigrate: migrated => {
      const player = migrated.civilizations.player.diplomacy.atWarWith;
      if (player.length !== 0) {
        throw new Error(`bilateral-war repair should have emptied player.atWarWith (orphans + self + dupe), got ${JSON.stringify(player)}`);
      }
      const ai2 = migrated.civilizations['ai-2']?.diplomacy.atWarWith ?? [];
      if (ai2.includes('ai-1')) throw new Error('bilateral-war repair left a one-sided ai-2 → ai-1 war in place');
    },
  },
  {
    // #1000 — no version bump: `normalizeCargoReciprocity` is an unconditional
    // corruption repair. Exercises it against a corrupt CURRENT save carrying a
    // dangling manifest entry, a missing back-pointer, a one-sided transportId,
    // and a based aircraft whose carrier is gone.
    sourceVersion: CURRENT_SAVE_SCHEMA_VERSION,
    label: 'repair — normalizes transport/cargo and carrier-aircraft links (#1000)',
    kind: 'malformed-repair',
    focus: ['transport cargo', 'carrier aircraft', 'cargo reciprocity'],
    runRounds: 1,
    build: () => {
      const raw = buildBaselineSave('save-compat-malformed-cargo-reciprocity').state as RawState;
      const units = raw.units as RawState;
      const playerRoster = (raw.civilizations as RawState).player.units as string[];
      const anchor = Object.values(units).find((u: RawState) => u.owner === 'player') as RawState;
      const pos = { q: anchor.position.q, r: anchor.position.r };
      const base = {
        owner: 'player', position: { ...pos }, movementPointsLeft: 3,
        health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      };
      units['unit-4900'] = { ...base, id: 'unit-4900', type: 'transport', cargoUnitIds: ['unit-4901', 'unit-ghost-cargo'] };
      units['unit-4901'] = { ...base, id: 'unit-4901', type: 'warrior' /* transportId missing — rebuilt from manifest */ };
      units['unit-4902'] = { ...base, id: 'unit-4902', type: 'warrior', transportId: 'unit-4900' /* one-sided — cleared */ };
      units['unit-4903'] = { ...base, id: 'unit-4903', type: 'biplane', airBase: { kind: 'carrier', unitId: 'unit-ghost-carrier' } };
      playerRoster.push('unit-4900', 'unit-4901', 'unit-4902', 'unit-4903');
      return raw;
    },
    afterMigrate: migrated => {
      const u = migrated.units;
      if (JSON.stringify(u['unit-4900']?.cargoUnitIds) !== JSON.stringify(['unit-4901'])) {
        throw new Error(`cargo-reciprocity repair should have dropped the dangling manifest entry, got ${JSON.stringify(u['unit-4900']?.cargoUnitIds)}`);
      }
      if (u['unit-4901']?.transportId !== 'unit-4900') {
        throw new Error(`cargo-reciprocity repair should have rebuilt the back-pointer, got ${JSON.stringify(u['unit-4901']?.transportId)}`);
      }
      if (u['unit-4902']?.transportId !== undefined) {
        throw new Error(`cargo-reciprocity repair should have cleared the one-sided transportId, got ${JSON.stringify(u['unit-4902']?.transportId)}`);
      }
      if (u['unit-4903'] !== undefined) {
        throw new Error('cargo-reciprocity repair should have removed the aircraft whose carrier is gone');
      }
      if (migrated.civilizations.player.units.includes('unit-4903')) {
        throw new Error('cargo-reciprocity repair left the removed aircraft in its owner roster');
      }
    },
  },
];

/**
 * A genuine archived save — `tests/fixtures/issue-365-crowded-map-save.json`,
 * turn 42, unversioned (schema 0), captured from a real playthrough, not
 * `createNewGame` output. The one case in the matrix whose shape the synthetic
 * fixtures cannot reproduce. `runRounds: 1` — it is a full crowded-map board,
 * and the point here is "a real old save migrates and survives a turn", not a
 * multi-round projection.
 */
const REAL_ARCHIVED_SAVE_CASE: SaveCompatCase = {
  sourceVersion: 0,
  label: 'real archived save — issue #365 crowded map, turn 42, unversioned',
  kind: 'well-formed',
  focus: ['real playthrough shape', 'full migration chain', 'crowded map'],
  runRounds: 1,
  build: () => JSON.parse(
    // vitest runs with cwd = repo/worktree root (see determinism-contract-meta.test.ts).
    readFileSync(resolve(process.cwd(), 'tests/fixtures/issue-365-crowded-map-save.json'), 'utf8'),
  ) as Record<string, unknown>,
};

/**
 * Hot-seat shape — the `hotSeat` slot config and per-viewer `pendingEvents`
 * queues a solo save never carries. Full migration chain (source version 0).
 */
const HOT_SEAT_CASE: SaveCompatCase = {
  sourceVersion: 0,
  label: 'hot-seat save (2 human viewers, queued pendingEvents), unversioned',
  kind: 'well-formed',
  focus: ['hot seat', 'pendingEvents per viewer', 'full migration chain'],
  build: () => downgradeToVersion(buildHotSeatBaselineSave('save-compat-hotseat-v0').state, 0),
  afterMigrate: migrated => {
    if (!migrated.hotSeat) throw new Error('migration dropped the hotSeat config');
    if (!migrated.pendingEvents || Object.keys(migrated.pendingEvents).length === 0) {
      throw new Error('migration dropped the per-viewer pendingEvents queue');
    }
  },
};

export const SAVE_COMPAT_MATRIX: readonly SaveCompatCase[] = [
  ...Array.from({ length: CURRENT_SAVE_SCHEMA_VERSION + 1 }, (_, version) => wellFormedCase(version)),
  REAL_ARCHIVED_SAVE_CASE,
  HOT_SEAT_CASE,
  ...MALFORMED_CASES,
];

/** Source versions with at least one `well-formed` case. */
export const COVERED_WELL_FORMED_VERSIONS: ReadonlySet<number> = new Set(
  SAVE_COMPAT_MATRIX.filter(c => c.kind === 'well-formed').map(c => c.sourceVersion),
);
