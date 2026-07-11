import type { GameState } from '@/core/types';

export const CURRENT_SAVE_SCHEMA_VERSION = 1;

export type SaveMigration = (state: GameState) => GameState;

export class UnsupportedSaveSchemaVersionError extends Error {
  constructor(readonly version: number) {
    super(`Save schema version ${version} is newer than this version of Conquestoria.`);
    this.name = 'UnsupportedSaveSchemaVersionError';
  }
}

function stableLegacyGameId(state: GameState): string {
  const tileFingerprint = Object.entries(state.map?.tiles ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tileId, tile]) => [tileId, tile.q, tile.r, tile.terrain, tile.resource ?? ''].join(':'))
    .join('|');
  const source = `${state.currentPlayer}|${state.turn}|${tileFingerprint}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

export function remapPersistedTechId(techId: string): string {
  return techId === 'quantum-computing' ? 'cloud-computing' : techId;
}

function remapTechIds(techIds: readonly string[], excluded: ReadonlySet<string> = new Set()): string[] {
  const remapped: string[] = [];
  const seen = new Set(excluded);
  for (const techId of techIds) {
    const mapped = remapPersistedTechId(techId);
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    remapped.push(mapped);
  }
  return remapped;
}

function remapPersistedTechReferences(state: GameState): GameState {
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => {
    if (!civilization.techState) return [civId, civilization];
    const completed = remapTechIds(civilization.techState.completed);
    const currentResearch = civilization.techState.currentResearch
      ? remapPersistedTechId(civilization.techState.currentResearch)
      : null;
    const currentIsCompleted = currentResearch !== null && completed.includes(currentResearch);
    const excluded = new Set([...completed, ...(currentIsCompleted || !currentResearch ? [] : [currentResearch])]);
    return [civId, {
      ...civilization,
      techState: {
        ...civilization.techState,
        completed,
        currentResearch: currentIsCompleted ? null : currentResearch,
        researchQueue: remapTechIds(civilization.techState.researchQueue, excluded),
        researchProgress: currentIsCompleted ? 0 : civilization.techState.researchProgress,
      },
    }];
  }));

  const opponentAI = state.opponentAI
    ? {
      ...state.opponentAI,
      majorCivs: Object.fromEntries(Object.entries(state.opponentAI.majorCivs).map(([civId, portfolio]) => [civId, {
        ...portfolio,
        researchTargetTechId: portfolio.researchTargetTechId
          ? remapPersistedTechId(portfolio.researchTargetTechId)
          : null,
      }])),
    }
    : undefined;

  const espionage = state.espionage
    ? Object.fromEntries(Object.entries(state.espionage).map(([civId, civState]) => [civId, {
      ...civState,
      spies: Object.fromEntries(Object.entries(civState.spies).map(([spyId, spy]) => [spyId, {
        ...spy,
        ...(spy.stolenTechFrom ? {
          stolenTechFrom: Object.fromEntries(Object.entries(spy.stolenTechFrom).map(([targetCivId, techIds]) => [
            targetCivId,
            remapTechIds(techIds),
          ])),
        } : {}),
      }])),
    }]))
    : undefined;

  return { ...state, civilizations, ...(opponentAI ? { opponentAI } : {}), ...(espionage ? { espionage } : {}) };
}

function migrateToEra13Foundation(state: GameState): GameState {
  const withStableIdentity = state.gameId ? state : { ...state, gameId: stableLegacyGameId(state) };
  return remapPersistedTechReferences(withStableIdentity);
}

export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
};

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

  let state = structuredClone(raw) as GameState;
  for (let version = sourceVersion + 1; version <= CURRENT_SAVE_SCHEMA_VERSION; version += 1) {
    const migration = SAVE_MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Missing save migration for schema version ${version}.`);
    }
    state = { ...migration(state), saveSchemaVersion: version };
  }
  return state.gameId ? state : migrateToEra13Foundation(state);
}
