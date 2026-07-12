import type { GameState } from '@/core/types';
import { createRng } from '@/systems/map-generator';
import { placeLateResources } from '@/systems/late-resource-placement';
import { createMarketplaceState } from '@/systems/trade-system';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';

export const CURRENT_SAVE_SCHEMA_VERSION = 3;

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
    .map(([tileId, tile]) => [tileId, tile.coord.q, tile.coord.r, tile.terrain, tile.resource ?? ''].join(':'))
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
    const completed = remapTechIds(Array.isArray(civilization.techState.completed) ? civilization.techState.completed : []);
    const currentResearch = typeof civilization.techState.currentResearch === 'string'
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
        researchQueue: remapTechIds(Array.isArray(civilization.techState.researchQueue) ? civilization.techState.researchQueue : [], excluded),
        researchProgress: currentIsCompleted ? 0 : (civilization.techState.researchProgress ?? 0),
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

function migrateLateResources(state: GameState): GameState {
  const gameId = state.gameId ?? stableLegacyGameId(state);
  const tiles = Object.fromEntries(Object.entries(state.map?.tiles ?? {}).map(([key, tile]) => [key, { ...tile }]));
  placeLateResources(
    tiles,
    createRng(`${gameId}-late-resources`),
    Object.values(state.cities ?? {}).map(city => city.position),
  );

  const defaults = createMarketplaceState();
  const marketplace = state.marketplace
    ? {
      ...state.marketplace,
      prices: { ...defaults.prices, ...state.marketplace.prices },
      priceHistory: { ...defaults.priceHistory, ...state.marketplace.priceHistory },
      purchasedResources: state.marketplace.purchasedResources ?? [],
    }
    : defaults;

  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const grandfathered = city.productionQueue.filter(item => {
      const building = BUILDINGS[item];
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      return (building?.resourceRequired?.length ?? unit?.resourceRequired?.length ?? 0) > 0;
    });
    return [cityId, grandfathered.length > 0
      ? { ...city, legacyResourceGrace: [...new Set([...(city.legacyResourceGrace ?? []), ...grandfathered])] }
      : city];
  }));

  return { ...state, gameId, map: { ...state.map, tiles }, marketplace, cities };
}

function migrateAutonomyNetwork(state: GameState): GameState {
  const autonomyByCiv = Object.fromEntries(Object.keys(state.civilizations ?? {}).map(civId => [
    civId,
    state.autonomyByCiv?.[civId] ?? createEmptyAutonomyCivState(),
  ]));
  return {
    ...state,
    autonomyByCiv,
    networkCivicPressureByCity: state.networkCivicPressureByCity ?? {},
    idCounters: { ...state.idCounters, nextNetworkPlanId: state.idCounters?.nextNetworkPlanId ?? 1 },
  };
}

export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
  2: migrateLateResources,
  3: migrateAutonomyNetwork,
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
