import type { AirBaseRef, GameState, Unit } from '@/core/types';
import { createRng } from '@/systems/map-generator';
import { placeLateResources } from '@/systems/late-resource-placement';
import { createMarketplaceState } from '@/systems/trade-system';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { assignNetworkPlan, isAutonomyActivated } from '@/systems/network-plan-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export const CURRENT_SAVE_SCHEMA_VERSION = 4;

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
  let working: GameState = {
    ...state,
    autonomyByCiv,
    networkCivicPressureByCity: state.networkCivicPressureByCity ?? {},
    idCounters: { ...state.idCounters, nextNetworkPlanId: state.idCounters?.nextNetworkPlanId ?? 1 },
  };
  for (const civId of Object.keys(working.civilizations).sort()) {
    if (!isAutonomyActivated(working, civId)) continue;
    const sourceIds = Object.values(working.units)
      .filter(unit => unit.owner === civId && unit.type === 'cyber_unit')
      .map(unit => unit.id)
      .sort();
    for (const sourceUnitId of sourceIds) {
      const source = working.units[sourceUnitId];
      const owner = working.civilizations[civId];
      const target = Object.values(working.cities)
        .filter(city => city.owner !== civId
          && working.civilizations[city.owner]
          && owner.diplomacy.atWarWith.includes(city.owner)
          && hexDistance(source.position, city.position) <= 1)
        .sort((left, right) => left.id.localeCompare(right.id))[0];
      if (!target) continue;
      const assigned = assignNetworkPlan(working, {
        ownerCivId: civId,
        sourceUnitId,
        definitionId: 'exploit',
        target: { kind: 'city', cityId: target.id },
      });
      working = assigned.state;
    }
  }
  return working;
}

function legacyAirBaseCandidates(state: GameState, unit: Unit): AirBaseRef[] {
  const operation = UNIT_DEFINITIONS[unit.type]?.airOperation;
  if (!operation) return [];
  const cityBases = Object.values(state.cities)
    .filter(city => city.owner === unit.owner)
    .filter(city => operation.baseKinds.some(kind => city.buildings.includes(kind)))
    .map(city => ({ kind: 'city' as const, cityId: city.id }));
  const carrierBases = Object.values(state.units)
    .filter(candidate => candidate.owner === unit.owner && candidate.type === 'carrier')
    .filter(() => operation.baseKinds.includes('carrier'))
    .map(candidate => ({ kind: 'carrier' as const, unitId: candidate.id }));
  return [...cityBases, ...carrierBases];
}

function legacyAirBasePosition(state: GameState, base: AirBaseRef) {
  return base.kind === 'city' ? state.cities[base.cityId]?.position : state.units[base.unitId]?.position;
}

function legacyAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') return state.units[base.unitId]?.type === 'carrier' ? 2 : 0;
  const city = state.cities[base.cityId];
  if (!city) return 0;
  if (city.buildings.includes('airfield')) {
    return Object.entries(state.builtNationalProjects ?? {}).some(([key, project]) => project.civId === city.owner && key === `${city.owner}:air_force_command`) ? 4 : 3;
  }
  if (city.buildings.includes('helicopter_base') || city.buildings.includes('stealth_airbase')) return 2;
  return 0;
}

function isSameLegacyAirBase(left: AirBaseRef | undefined, right: AirBaseRef): boolean {
  return left?.kind === right.kind
    && (left.kind === 'city' ? left.cityId === right.cityId : left.unitId === right.unitId);
}

function migrateLegacyBasedAircraft(state: GameState): GameState {
  const units = { ...state.units };
  const removedIds = new Set<string>();
  const aircraft = Object.values(units)
    .filter(unit => UNIT_DEFINITIONS[unit.type]?.airOperation && !unit.airBase)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const unit of aircraft) {
    const candidates = legacyAirBaseCandidates({ ...state, units }, unit)
      .map(base => ({ base, position: legacyAirBasePosition({ ...state, units }, base) }))
      .filter((entry): entry is { base: AirBaseRef; position: NonNullable<typeof entry.position> } => entry.position !== undefined)
      .filter(({ base }) => Object.values(units).filter(candidate => isSameLegacyAirBase(candidate.airBase, base)).length < legacyAirBaseCapacity({ ...state, units }, base))
      .sort((left, right) => {
        const distance = (entry: typeof left) => state.map.wrapsHorizontally
          ? wrappedHexDistance(unit.position, entry.position, state.map.width)
          : hexDistance(unit.position, entry.position);
        const baseId = (base: AirBaseRef) => base.kind === 'city' ? `city:${base.cityId}` : `carrier:${base.unitId}`;
        return distance(left) - distance(right) || baseId(left.base).localeCompare(baseId(right.base));
      });
    const destination = candidates[0];
    if (!destination) {
      delete units[unit.id];
      removedIds.add(unit.id);
      continue;
    }
    units[unit.id] = { ...unit, airBase: destination.base, position: { ...destination.position } };
  }
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
    civId,
    removedIds.size > 0 ? { ...civ, units: civ.units.filter(id => !removedIds.has(id)) } : civ,
  ]));
  return { ...state, units, civilizations, reconReveals: state.reconReveals ?? [] };
}

export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
  2: migrateLateResources,
  3: migrateAutonomyNetwork,
  4: migrateLegacyBasedAircraft,
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
