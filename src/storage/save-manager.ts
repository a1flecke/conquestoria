import { QUEST_TYPES, type City, type CityFocus, type CityMaturity, type GameState, type QuestTarget, type SaveSlotMeta } from '@/core/types';
import { drawNextCityName } from '@/systems/city-name-system';
import { isCityCoastal, BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { INITIAL_CITY_FOCUS, INITIAL_CITY_MATURITY } from '@/systems/city-maturity-system';
import { canonicalizeCityCoord, normalizeCityWorkClaims, recalculateTerritory } from '@/systems/city-territory-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { getQuestChain, getQuestChainForArchetype } from '@/systems/quest-chain-definitions';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';
import { scanIdCounters } from '@/core/id-counters';
import {
  createEmptyPirateState,
  PIRATE_RELOCATION_DIRECTIONS,
  PIRATE_STATE_VERSION,
  type PirateFactionIntel,
  type PirateFactionState,
  type PirateHeadquarters,
  type PirateHistoryEntry,
  type PirateRelocationDirection,
  type PirateState,
} from '@/core/pirate-state';
import type { NotificationEntry, NotificationLog } from '@/core/notification-log';
import { dbGet, dbPut, dbDelete, dbGetAllKeys } from './db';
import { tagLandmassRegions } from '@/systems/landmass-tagger';

const SAVE_PREFIX = 'save:';
const META_PREFIX = 'meta:';
const LEGACY_AUTO_SAVE_KEY = 'autosave';
const AUTO_SAVE_PREFIX = 'autosave:';
const SETTINGS_KEY = 'settings';
const LOCALSTORAGE_AUTOSAVE_KEY = 'conquestoria-autosave';

export type NormalizedGameState = GameState & {
  pirates: PirateState;
  notificationLog: NotificationLog;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureGameIdentity(state: GameState): GameState {
  if (!state.gameId) {
    state.gameId = `game-${Date.now()}`;
  }
  if (!state.gameTitle) {
    const civType = state.hotSeat ? 'Hot Seat' : (state.civilizations[state.currentPlayer]?.civType ?? 'Unknown');
    state.gameTitle = `Recovered ${civType} Campaign`;
  }
  return state;
}

function migrateLegacyPlanningState(state: GameState): GameState {
  for (const city of Object.values(state.cities ?? {})) {
    city.productionQueue ??= [];
    if (city.productionQueue.length > 4) {
      city.productionQueue = city.productionQueue.slice(0, 4);
    }
  }

  for (const civ of Object.values(state.civilizations ?? {})) {
    civ.techState ??= {
      completed: [],
      currentResearch: null,
      researchQueue: [],
      researchProgress: 0,
      trackPriorities: {} as GameState['civilizations'][string]['techState']['trackPriorities'],
    };
    civ.techState.researchQueue ??= [];
  }

  return state;
}

function migrateStripCityGrid(state: GameState): GameState {
  const cities = Object.fromEntries(
    Object.entries(state.cities ?? {}).map(([id, city]) => {
      const { grid: _grid, gridSize: _gridSize, ...rest } = city as any;
      return [id, rest];
    }),
  );
  return { ...state, cities };
}

function normalizeLegacyCitySimState(state: GameState): GameState {
  const cities: Record<string, City> = {};
  for (const [cityId, city] of Object.entries(state.cities ?? {})) {
    const canonicalizeLoadedCoord = (coord: { q: number; r: number }) => (
      state.map ? canonicalizeCityCoord(coord, state.map) : { ...coord }
    );
    cities[cityId] = {
      ...city,
      ownedTiles: (city.ownedTiles ?? []).map(canonicalizeLoadedCoord),
      workedTiles: (city.workedTiles ?? []).map(canonicalizeLoadedCoord),
      focus: (city.focus ?? INITIAL_CITY_FOCUS) as CityFocus,
      maturity: (city.maturity ?? INITIAL_CITY_MATURITY) as CityMaturity,
    };
  }
  return { ...state, cities };
}

function allowedQuestTypesForStep(chainId: string, stepIndex: number): Set<string> | null {
  const chain = getQuestChain(chainId);
  if (!chain || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 2) return null;
  const types = new Set<string>();
  for (const variant of Object.values(chain.steps[stepIndex as 0 | 1 | 2].eraVariants)) {
    types.add(variant.preferred.type);
    for (const fallback of variant.fallbacks) types.add(fallback.type);
  }
  return types;
}

function effectiveLoadedMinorCivStatus(state: GameState, minorCivId: string, majorCivId: string) {
  const minorCiv = state.minorCivs[minorCivId];
  if (isMinorCivAtWar(state, majorCivId, minorCivId)) return 'at-war' as const;
  if (minorCiv.chainStatusByCiv[majorCivId]?.status === 'allied') return 'allied' as const;
  const relationship = minorCiv.diplomacy.relationships[majorCivId] ?? 0;
  if (relationship <= -60) return 'hostile' as const;
  if (relationship >= 30) return 'friendly' as const;
  return 'neutral' as const;
}

function isFiniteCoord(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const coord = value as { q?: unknown; r?: unknown };
  return Number.isFinite(coord.q) && Number.isFinite(coord.r);
}

function isPirateRelocationDirection(value: unknown): value is PirateRelocationDirection {
  return typeof value === 'string'
    && (PIRATE_RELOCATION_DIRECTIONS as readonly string[]).includes(value);
}

function normalizePirateHeadquarters(value: unknown): PirateHeadquarters | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'coastal-enclave') {
    if (!isFiniteCoord(value.position) || !Number.isFinite(value.integrity) || !Number.isFinite(value.maxIntegrity)) return null;
    const maxIntegrity = Math.max(1, Number(value.maxIntegrity));
    return {
      kind: 'coastal-enclave',
      position: { ...(value.position as { q: number; r: number }) },
      integrity: Math.max(0, Math.min(maxIntegrity, Number(value.integrity))),
      maxIntegrity,
    };
  }
  if (value.kind !== 'deep-sea-flotilla' || typeof value.flagshipUnitId !== 'string') return null;
  const relocation = isRecord(value.relocation) ? value.relocation : {};
  const planned = isRecord(relocation.planned)
    && Number.isFinite(relocation.planned.plannedRound)
    && Number(relocation.planned.plannedRound) >= 0
    && Number.isFinite(relocation.planned.resolvesOnRound)
    && Number(relocation.planned.resolvesOnRound) === Number(relocation.planned.plannedRound) + 1
    && isPirateRelocationDirection(relocation.planned.direction)
    && Array.isArray(relocation.planned.path)
    && relocation.planned.path.length >= 2
    && relocation.planned.path.length <= 4
    && relocation.planned.path.every(isFiniteCoord)
    ? {
        plannedRound: Number(relocation.planned.plannedRound),
        resolvesOnRound: Number(relocation.planned.resolvesOnRound),
        direction: relocation.planned.direction as NonNullable<Extract<PirateHeadquarters, { kind: 'deep-sea-flotilla' }>['relocation']['planned']>['direction'],
        path: relocation.planned.path.map(coord => ({ ...(coord as { q: number; r: number }) })),
      }
    : null;
  return {
    kind: 'deep-sea-flotilla',
    flagshipUnitId: value.flagshipUnitId,
    relocation: {
      planned,
      lastRelocatedRound: Number.isFinite(relocation.lastRelocatedRound) ? Number(relocation.lastRelocatedRound) : null,
    },
  };
}

function normalizePirateHistory(value: unknown): PirateHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PirateHistoryEntry =>
    isRecord(entry)
    && typeof entry.id === 'string'
    && (entry.kind === 'destroyed' || entry.kind === 'contract-resolved')
    && typeof entry.factionId === 'string'
    && /^pirate-\d+$/.test(entry.factionId)
    && typeof entry.factionName === 'string'
    && Number.isFinite(entry.round),
  ).map(entry => structuredClone(entry));
}

function normalizeWarningMarkers(value: unknown, state: GameState): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (Array.isArray(value)) {
    for (const civId of value) {
      if (typeof civId === 'string' && state.civilizations[civId]) result[civId] = true;
    }
    return result;
  }
  if (!isRecord(value)) return result;
  for (const [civId, delivered] of Object.entries(value)) {
    if (delivered === true && state.civilizations[civId]) result[civId] = true;
  }
  return result;
}

function normalizePirateIntel(value: unknown, state: GameState, factions: PirateState['factions']): PirateState['intelByCiv'] {
  if (!isRecord(value)) return {};
  const intelByCiv: PirateState['intelByCiv'] = {};
  for (const [civId, rawIntelByFaction] of Object.entries(value)) {
    if (!state.civilizations[civId] || !isRecord(rawIntelByFaction)) continue;
    const normalizedByFaction: Record<string, PirateFactionIntel> = {};
    for (const [factionId, rawIntel] of Object.entries(rawIntelByFaction)) {
      if (!factions[factionId] || !isRecord(rawIntel) || rawIntel.factionId !== factionId) continue;
      if (rawIntel.level !== 'rumor' && rawIntel.level !== 'sighted' && rawIntel.level !== 'tracked') continue;
      if (!Number.isFinite(rawIntel.discoveredRound) || !Number.isFinite(rawIntel.lastUpdatedRound)) continue;
      const region = isRecord(rawIntel.approximateRegion)
        && isFiniteCoord(rawIntel.approximateRegion.center)
        && Number.isFinite(rawIntel.approximateRegion.radius)
        && Number(rawIntel.approximateRegion.radius) > 0
        ? {
            center: { ...(rawIntel.approximateRegion.center as { q: number; r: number }) },
            radius: Number(rawIntel.approximateRegion.radius),
          }
        : undefined;
      const headquarters = isRecord(rawIntel.lastKnownHeadquarters)
        && (rawIntel.lastKnownHeadquarters.kind === 'coastal-enclave' || rawIntel.lastKnownHeadquarters.kind === 'deep-sea-flotilla')
        && isFiniteCoord(rawIntel.lastKnownHeadquarters.position)
        && Number.isFinite(rawIntel.lastKnownHeadquarters.observedRound)
        ? {
            kind: rawIntel.lastKnownHeadquarters.kind as 'coastal-enclave' | 'deep-sea-flotilla',
            position: { ...(rawIntel.lastKnownHeadquarters.position as { q: number; r: number }) },
            observedRound: Number(rawIntel.lastKnownHeadquarters.observedRound),
          }
        : undefined;
      if (rawIntel.level === 'rumor' ? !region : !headquarters) continue;
      normalizedByFaction[factionId] = {
        factionId: factionId as PirateFactionIntel['factionId'],
        level: rawIntel.level,
        discoveredRound: Number(rawIntel.discoveredRound),
        lastUpdatedRound: Number(rawIntel.lastUpdatedRound),
        ...(region ? { approximateRegion: region } : {}),
        ...(headquarters ? { lastKnownHeadquarters: headquarters } : {}),
        ...(Array.isArray(rawIntel.observedUnitIds)
          ? { observedUnitIds: rawIntel.observedUnitIds.filter((id): id is string => typeof id === 'string') }
          : {}),
        ...(rawIntel.level === 'tracked'
          && isPirateRelocationDirection(rawIntel.plannedRelocationDirection)
          ? { plannedRelocationDirection: rawIntel.plannedRelocationDirection }
          : {}),
      };
    }
    intelByCiv[civId] = normalizedByFaction;
  }
  return intelByCiv;
}

export function normalizePirateState(state: GameState): PirateState {
  const raw = isRecord(state.pirates) ? (state.pirates as unknown as Record<string, unknown>) : {};
  const normalized = createEmptyPirateState();
  normalized.version = PIRATE_STATE_VERSION;
  normalized.history = normalizePirateHistory(raw.history);
  normalized.nextSpawnCheckTurn = Number.isFinite(raw.nextSpawnCheckTurn) ? Math.max(0, Number(raw.nextSpawnCheckTurn)) : 0;
  normalized.activatedTurn = Number.isFinite(raw.activatedTurn) ? Number(raw.activatedTurn) : null;
  normalized.activationWarningDeliveredByCiv = normalizeWarningMarkers(raw.activationWarningDeliveredByCiv, state);
  if (isRecord(raw.pressure)) {
    normalized.pressure.value = Number.isFinite(raw.pressure.value) ? Math.max(0, Number(raw.pressure.value)) : 0;
    normalized.pressure.suppression = Array.isArray(raw.pressure.suppression)
      ? raw.pressure.suppression.filter(entry => isRecord(entry)
        && typeof entry.regionKey === 'string'
        && /^-?\d+,-?\d+$/.test(entry.regionKey)
        && Number.isFinite(entry.amount)
        && Number.isFinite(entry.expiresAfterRound)
        && Number(entry.expiresAfterRound) > state.turn,
      ).map(entry => ({
        regionKey: String(entry.regionKey),
        amount: Math.max(0, Number(entry.amount)),
        expiresAfterRound: Number(entry.expiresAfterRound),
      }))
      : [];
  }

  if (isRecord(raw.factions)) {
    for (const [factionId, rawFaction] of Object.entries(raw.factions)) {
      if (!/^pirate-\d+$/.test(factionId) || !isRecord(rawFaction)) continue;
      const headquarters = normalizePirateHeadquarters(rawFaction.headquarters);
      if (!headquarters || typeof rawFaction.name !== 'string') continue;
      if (rawFaction.behavior !== 'patrolling' && rawFaction.behavior !== 'raiding' && rawFaction.behavior !== 'blockading') continue;
      if (![1, 2, 3, 4, 5].includes(Number(rawFaction.maritimeStage))) continue;
      const transitionGuards = isRecord(rawFaction.transitionGuards) ? rawFaction.transitionGuards : {};
      const reminderRounds: Record<string, number> = {};
      if (isRecord(transitionGuards.lastDemandReminderRoundByCiv)) {
        for (const [civId, round] of Object.entries(transitionGuards.lastDemandReminderRoundByCiv)) {
          if (state.civilizations[civId] && Number.isFinite(round)) reminderRounds[civId] = Math.max(0, Number(round));
        }
      }
      const faction: PirateFactionState = {
        id: factionId as PirateFactionState['id'],
        name: rawFaction.name,
        spawnedRound: Number.isFinite(rawFaction.spawnedRound)
          ? Math.max(0, Number(rawFaction.spawnedRound))
          : normalized.activatedTurn ?? state.turn,
        behavior: rawFaction.behavior,
        maritimeStage: Number(rawFaction.maritimeStage) as PirateFactionState['maritimeStage'],
        notoriety: Number.isFinite(rawFaction.notoriety) ? Math.max(0, Number(rawFaction.notoriety)) : 0,
        shipIds: Array.isArray(rawFaction.shipIds) ? rawFaction.shipIds.filter((id): id is string => typeof id === 'string') : [],
        headquarters,
        tributeByCiv: {},
        demandByCiv: {},
        contract: null,
        intent: null,
        transitionGuards: {
          emittedEventKeys: [...new Set(Array.isArray(transitionGuards.emittedEventKeys)
            ? transitionGuards.emittedEventKeys.filter((key): key is string => typeof key === 'string')
            : [])],
          ...(Object.keys(reminderRounds).length > 0 ? { lastDemandReminderRoundByCiv: reminderRounds } : {}),
          ...(Number.isFinite(transitionGuards.lastBehaviorTransitionRound)
            ? { lastBehaviorTransitionRound: Math.max(0, Number(transitionGuards.lastBehaviorTransitionRound)) }
            : {}),
          ...(Number.isFinite(transitionGuards.lastStageReinforcementRound)
            ? { lastStageReinforcementRound: Math.max(0, Number(transitionGuards.lastStageReinforcementRound)) }
            : {}),
          ...(Number.isFinite(transitionGuards.lastFlagshipAttackedRound)
            ? { lastFlagshipAttackedRound: Math.max(0, Number(transitionGuards.lastFlagshipAttackedRound)) }
            : {}),
        },
      };
      if (isRecord(rawFaction.tributeByCiv)) {
        for (const [civId, tribute] of Object.entries(rawFaction.tributeByCiv)) {
          if (!state.civilizations[civId] || !isRecord(tribute)) continue;
          if (!Number.isFinite(tribute.paidRound) || !Number.isFinite(tribute.protectedUntilRound)) continue;
          if (Number(tribute.protectedUntilRound) <= state.turn) continue;
          faction.tributeByCiv[civId] = {
            paidRound: Number(tribute.paidRound),
            protectedUntilRound: Number(tribute.protectedUntilRound),
          };
        }
      }
      if (isRecord(rawFaction.demandByCiv)) {
        for (const [civId, demand] of Object.entries(rawFaction.demandByCiv)) {
          if (!state.civilizations[civId] || !isRecord(demand)) continue;
          if (!Number.isFinite(demand.demandedRound) || !Number.isFinite(demand.quotedCost)) continue;
          faction.demandByCiv[civId] = {
            demandedRound: Number(demand.demandedRound),
            lastReminderRound: Number.isFinite(demand.lastReminderRound) ? Number(demand.lastReminderRound) : null,
            quotedCost: Math.max(0, Number(demand.quotedCost)),
          };
        }
      }
      if (isRecord(rawFaction.contract)) {
        const employerId = rawFaction.contract.employerId;
        const targetId = rawFaction.contract.targetId;
        const contractValid = headquarters.kind === 'deep-sea-flotilla'
          && faction.maritimeStage === 5
          && typeof employerId === 'string'
          && typeof targetId === 'string'
          && employerId !== targetId
          && Boolean(state.civilizations[employerId])
          && Boolean(state.civilizations[targetId])
          && Number.isFinite(rawFaction.contract.startedRound)
          && Number.isFinite(rawFaction.contract.expiresAfterRound)
          && Number(rawFaction.contract.expiresAfterRound) > state.turn;
        if (contractValid) {
          faction.contract = {
            employerId,
            targetId,
            startedRound: Number(rawFaction.contract.startedRound),
            expiresAfterRound: Number(rawFaction.contract.expiresAfterRound),
            successfulRaidCount: Number.isFinite(rawFaction.contract.successfulRaidCount)
              ? Math.max(0, Number(rawFaction.contract.successfulRaidCount))
              : 0,
            exposed: rawFaction.contract.exposed === true,
            exposureResolvedRaidKeys: Array.isArray(rawFaction.contract.exposureResolvedRaidKeys)
              ? [...new Set(rawFaction.contract.exposureResolvedRaidKeys.filter((key): key is string => typeof key === 'string'))]
              : [],
          };
        }
      }
      if (headquarters.kind === 'deep-sea-flotilla' && !state.units?.[headquarters.flagshipUnitId]) {
        if (!normalized.history.some(entry => entry.kind === 'destroyed' && entry.factionId === faction.id)) {
          normalized.history.push({
            id: `pirate-history-destroyed-${faction.id}`,
            kind: 'destroyed',
            factionId: faction.id,
            factionName: faction.name,
            round: state.turn,
            headquartersKind: headquarters.kind,
            destroyedByOwnerId: null,
            bountyAwarded: 0,
            reason: 'missing-flagship',
          });
        }
        continue;
      }
      normalized.factions[factionId] = faction;
    }
  }
  normalized.intelByCiv = normalizePirateIntel(raw.intelByCiv, state, normalized.factions);
  return normalized;
}

function normalizeNotificationTarget(value: unknown): NotificationEntry['target'] | undefined {
  if (!isRecord(value) || value.kind !== 'map' || !isFiniteCoord(value.coord) || typeof value.label !== 'string') return undefined;
  return { kind: 'map', coord: { ...(value.coord as { q: number; r: number }) }, label: value.label };
}

export function normalizeNotificationLog(value: unknown): NotificationLog {
  if (!isRecord(value)) return {};
  const allEntries = Object.values(value).flatMap(entries => Array.isArray(entries) ? entries : []);
  let nextId = allEntries.reduce((max, entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string') return max;
    const match = /^notification-(\d+)$/.exec(entry.id);
    return match ? Math.max(max, Number(match[1]) + 1) : max;
  }, 1);
  const usedIds = new Set<string>();
  const log: NotificationLog = {};
  for (const [civId, rawEntries] of Object.entries(value)) {
    if (!Array.isArray(rawEntries)) continue;
    const entries: NotificationEntry[] = [];
    for (const rawEntry of rawEntries.slice(-50)) {
      if (!isRecord(rawEntry) || typeof rawEntry.message !== 'string' || !Number.isFinite(rawEntry.turn)) continue;
      if (rawEntry.type !== 'info' && rawEntry.type !== 'success' && rawEntry.type !== 'warning') continue;
      let id = typeof rawEntry.id === 'string' && /^notification-\d+$/.test(rawEntry.id) ? rawEntry.id : '';
      if (!id || usedIds.has(id)) id = `notification-${nextId++}`;
      usedIds.add(id);
      const review = isRecord(rawEntry.review)
        && ((rawEntry.review.kind === 'pirate-faction' && typeof rawEntry.review.factionId === 'string')
          || (rawEntry.review.kind === 'pirate-history' && typeof rawEntry.review.historyId === 'string'))
        ? structuredClone(rawEntry.review) as NotificationEntry['review']
        : undefined;
      entries.push({
        id,
        message: rawEntry.message,
        type: rawEntry.type,
        turn: Number(rawEntry.turn),
        read: rawEntry.read === true,
        ...(normalizeNotificationTarget(rawEntry.target) ? { target: normalizeNotificationTarget(rawEntry.target) } : {}),
        ...(typeof rawEntry.linkedCityId === 'string' ? { linkedCityId: rawEntry.linkedCityId } : {}),
        ...(review ? { review } : {}),
      });
    }
    log[civId] = entries;
  }
  return log;
}

export function normalizeIdCounters(state: GameState): GameState['idCounters'] {
  const scanned = scanIdCounters(state);
  const current = (isRecord(state.idCounters) ? state.idCounters : {}) as Partial<GameState['idCounters']>;
  const positive = (value: unknown): number | null => Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
  return {
    nextUnitId: Math.max(positive(current.nextUnitId) ?? 1, scanned.nextUnitId),
    nextCityId: Math.max(positive(current.nextCityId) ?? 1, scanned.nextCityId),
    nextCampId: Math.max(positive(current.nextCampId) ?? 1, scanned.nextCampId),
    nextQuestId: Math.max(positive(current.nextQuestId) ?? 1, scanned.nextQuestId),
    nextRouteId: Math.max(positive(current.nextRouteId) ?? 1, scanned.nextRouteId ?? 1),
    nextPirateFactionId: Math.max(positive(current.nextPirateFactionId) ?? 1, scanned.nextPirateFactionId ?? 1),
    nextNotificationId: Math.max(positive(current.nextNotificationId) ?? 1, scanned.nextNotificationId ?? 1),
  };
}

function isValidQuestTarget(target: QuestTarget, minorCivId: string): boolean {
  switch (target.type) {
    case 'destroy_camp':
      return typeof target.campId === 'string' && isFiniteCoord(target.position);
    case 'gift_gold':
      return Number.isFinite(target.amount) && target.amount > 0;
    case 'defeat_units':
      return Number.isInteger(target.count) && target.count > 0
        && Number.isFinite(target.radius) && target.radius > 0
        && isFiniteCoord(target.nearPosition);
    case 'trade_route':
      return target.minorCivId === minorCivId;
    case 'sponsor_festival':
      return Number.isFinite(target.amount) && target.amount > 0 && target.requiresLuxury === true;
  }
}

function normalizeMinorCivQuestState(state: GameState): GameState {
  const nextState = structuredClone(state);
  for (const [minorCivId, minorCiv] of Object.entries(nextState.minorCivs ?? {})) {
    minorCiv.activeQuests ??= {};
    minorCiv.chainStatusByCiv ??= {};
    minorCiv.questCooldownUntilByCiv ??= {};

    const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minorCiv.definitionId);
    const expectedChainId = definition ? getQuestChainForArchetype(definition.archetype).id : null;

    for (const [majorCivId, quest] of Object.entries(minorCiv.activeQuests ?? {})) {
      if (!quest || typeof quest !== 'object' || !quest.target || typeof quest.target !== 'object') {
        delete minorCiv.activeQuests[majorCivId];
        minorCiv.questCooldownUntilByCiv[majorCivId] = nextState.turn + 3;
        continue;
      }
      if (quest.target.type === 'destroy_camp' && !quest.target.position) {
        const camp = nextState.barbarianCamps?.[quest.target.campId];
        if (camp) quest.target.position = { ...camp.position };
      }
      const knownQuestType = QUEST_TYPES.includes(quest.type);
      const validReward = Number.isFinite(quest.reward?.relationshipBonus)
        && (quest.reward.gold === undefined || Number.isFinite(quest.reward.gold))
        && (quest.reward.science === undefined || Number.isFinite(quest.reward.science));
      const validLifecycle = typeof quest.id === 'string'
        && quest.status === 'active'
        && Number.isFinite(quest.progress)
        && quest.progress >= 0
        && Number.isFinite(quest.turnIssued)
        && (quest.expiresOnTurn === null || Number.isFinite(quest.expiresOnTurn));
      if (!knownQuestType || quest.target.type !== quest.type || !isValidQuestTarget(quest.target, minorCivId)
        || !validReward || !validLifecycle) {
        delete minorCiv.activeQuests[majorCivId];
        minorCiv.questCooldownUntilByCiv[majorCivId] = nextState.turn + 3;
        continue;
      }
      const hasChainId = typeof quest.chainId === 'string';
      const hasStepIndex = Number.isInteger(quest.stepIndex);
      if (!hasChainId && !hasStepIndex) continue;
      const allowedTypes = hasChainId && hasStepIndex
        ? allowedQuestTypesForStep(quest.chainId!, quest.stepIndex!)
        : null;
      if (!allowedTypes?.has(quest.type) || quest.chainId !== expectedChainId) {
        delete minorCiv.activeQuests[majorCivId];
        minorCiv.questCooldownUntilByCiv[majorCivId] = nextState.turn + 3;
      }
    }

    for (const [majorCivId, status] of Object.entries(minorCiv.chainStatusByCiv)) {
      if (!status || typeof status !== 'object') {
        delete minorCiv.chainStatusByCiv[majorCivId];
        continue;
      }
      const knownChain = Boolean(getQuestChain(status.chainId)) && status.chainId === expectedChainId;
      const validPending = status.status === 'pending'
        && Number.isFinite(status.statusTurn)
        && Number.isInteger(status.pendingStepIndex)
        && status.pendingStepIndex >= 0
        && status.pendingStepIndex <= 2
        && Number.isFinite(status.pendingExpiresOnTurn)
        && !('earnedTurn' in status);
      const validSettled = (status.status === 'allied' || status.status === 'broken')
        && Number.isFinite(status.statusTurn)
        && Number.isFinite(status.earnedTurn)
        && !('pendingStepIndex' in status)
        && !('pendingExpiresOnTurn' in status);
      if (!knownChain || (!validPending && !validSettled)) delete minorCiv.chainStatusByCiv[majorCivId];
    }

    for (const [majorCivId, status] of Object.entries(minorCiv.chainStatusByCiv)) {
      if (status.status === 'allied' && isMinorCivAtWar(nextState, majorCivId, minorCivId)) {
        minorCiv.chainStatusByCiv[majorCivId] = {
          chainId: status.chainId,
          status: 'broken',
          statusTurn: nextState.turn,
          earnedTurn: status.earnedTurn,
        };
      }
    }

    for (const [majorCivId, cooldown] of Object.entries(minorCiv.questCooldownUntilByCiv)) {
      if (!Number.isFinite(cooldown)) delete minorCiv.questCooldownUntilByCiv[majorCivId];
    }

    minorCiv.lastNotifiedStatusByCiv ??= {};
    const validStatuses = new Set(['at-war', 'hostile', 'neutral', 'friendly', 'allied']);
    for (const [majorCivId, status] of Object.entries(minorCiv.lastNotifiedStatusByCiv)) {
      if (!validStatuses.has(status)) delete minorCiv.lastNotifiedStatusByCiv[majorCivId];
    }
    for (const majorCivId of Object.keys(nextState.civilizations ?? {})) {
      if (!(majorCivId in minorCiv.lastNotifiedStatusByCiv)) {
        minorCiv.lastNotifiedStatusByCiv[majorCivId] = effectiveLoadedMinorCivStatus(nextState, minorCivId, majorCivId);
      }
    }
  }
  return nextState;
}

function normalizeLandmassKeys(state: GameState): GameState {
  if (!state.map?.tiles) return state;
  const anyLandMissingKey = Object.values(state.map.tiles).some(
    t => t.terrain !== 'ocean' && t.terrain !== 'coast' && !t.regionKey
  );
  if (!anyLandMissingKey) return state;
  const taggedTiles = tagLandmassRegions(state.map);
  return { ...state, map: { ...state.map, tiles: taggedTiles } };
}

function normalizeThreatPressureDefaults(state: GameState): GameState {
  if (state.pirateFleets !== undefined && state.pirateFleetCooldownByCivLandmass !== undefined) {
    return state;
  }
  return {
    ...state,
    pirateFleets: state.pirateFleets ?? {},
    pirateFleetCooldownByCivLandmass: state.pirateFleetCooldownByCivLandmass ?? {},
    resurgentCampCooldownByCivLandmass: state.resurgentCampCooldownByCivLandmass ?? {},
  };
}

export function migrateLegacyCoastalData(state: GameState): GameState {
  if (!state.map) return state;
  const cities = { ...state.cities };
  let changed = false;
  for (const [id, city] of Object.entries(cities)) {
    if (isCityCoastal(city, state.map)) continue;
    const cleanQueue = city.productionQueue.filter(item => {
      if (BUILDINGS[item]?.coastalRequired) return false;
      const unit = TRAINABLE_UNITS.find(u => u.type === item);
      return !unit?.coastalRequired;
    });
    const cleanBuildings = city.buildings.filter(bId => !BUILDINGS[bId]?.coastalRequired);
    if (
      cleanQueue.length !== city.productionQueue.length ||
      cleanBuildings.length !== city.buildings.length
    ) {
      cities[id] = { ...city, productionQueue: cleanQueue, buildings: cleanBuildings };
      changed = true;
    }
  }
  return changed ? { ...state, cities } : state;
}

export function normalizeLoadedState(state: GameState): NormalizedGameState {
  const normalizedCityState = normalizeMinorCivQuestState(
    migrateLegacyCoastalData(normalizeThreatPressureDefaults(normalizeLandmassKeys(normalizeLegacyCitySimState(migrateStripCityGrid(migrateLegacyPlanningState(migrateLegacyNamingState(ensureGameIdentity(state)))))))),
  );
  normalizedCityState.pirates = normalizePirateState(normalizedCityState);
  normalizedCityState.notificationLog = normalizeNotificationLog(normalizedCityState.notificationLog);
  normalizedCityState.idCounters = normalizeIdCounters(normalizedCityState);
  if (!normalizedCityState.map?.tiles) {
    normalizedCityState.pendingDiplomacyRequests ??= [];
    return normalizedCityState as NormalizedGameState;
  }
  const territoryNormalized = recalculateTerritory(normalizedCityState, {
    reason: 'load',
    preserveForeignHolders: true,
    preserveCurrentHolderOnTie: true,
  }).state;
  const normalized = normalizeCityWorkClaims(territoryNormalized).state;
  normalized.pendingDiplomacyRequests ??= [];
  normalized.era ??= 1;
  // Clear stale disguise on spy_scouts — they have no tier-1+ options
  if (normalized.espionage) {
    for (const espState of Object.values(normalized.espionage)) {
      for (const [unitId, spyRecord] of Object.entries(espState.spies)) {
        const unit = normalized.units[unitId];
        if (unit?.type === 'spy_scout' && spyRecord.disguiseAs != null) {
          spyRecord.disguiseAs = null;
        }
      }
    }
  }
  return normalized as NormalizedGameState;
}

export const normalizeLoadedStateForTest = normalizeLoadedState;

function getCityNamingInfo(state: GameState, ownerId: string): { civType: string; civName: string; namingPool?: string[] } {
  const majorCiv = state.civilizations[ownerId];
  if (majorCiv) {
    const definition = resolveCivDefinition(state, majorCiv.civType ?? '');
    return {
      civType: majorCiv.civType ?? ownerId,
      civName: definition?.name ?? majorCiv.name,
      namingPool: definition?.cityNames,
    };
  }

  if (ownerId.startsWith('mc-')) {
    const minorDefinitionId = ownerId.slice(3);
    const minorDefinition = MINOR_CIV_DEFINITIONS.find(def => def.id === minorDefinitionId);
    if (minorDefinition) {
      return {
        civType: minorDefinition.id,
        civName: minorDefinition.name,
        namingPool: [minorDefinition.name],
      };
    }
  }

  return { civType: ownerId, civName: 'City' };
}

function getLegacyCitySequence(cityId: string): number | null {
  const match = /^city-(\d+)$/.exec(cityId);
  return match ? Number(match[1]) : null;
}

function compareLegacyCityIds(leftId: string, rightId: string): number {
  const leftSequence = getLegacyCitySequence(leftId);
  const rightSequence = getLegacyCitySequence(rightId);
  if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return leftId.localeCompare(rightId);
}

export function migrateLegacyNamingState(state: GameState): GameState {
  if (!state.cities || !state.civilizations) {
    return state;
  }

  const sortedCities = Object.entries(state.cities).sort(([leftId], [rightId]) => compareLegacyCityIds(leftId, rightId));
  const usedNames = new Set<string>();

  for (const [, city] of sortedCities) {
    const namingInfo = getCityNamingInfo(state, city.owner);
    const pool = namingInfo.namingPool ?? [];
    const nameIsAllowed = pool.length === 0 || pool.includes(city.name);
    const nameIsUnique = !usedNames.has(city.name);

    if (nameIsAllowed && nameIsUnique) {
      usedNames.add(city.name);
      continue;
    }

    city.name = drawNextCityName(namingInfo.civType, usedNames, {
      namingPool: namingInfo.namingPool,
      civName: namingInfo.civName,
    });
    usedNames.add(city.name);
  }

  return state;
}

function buildSaveMeta(slotId: string, name: string, state: GameState, kind: 'manual' | 'autosave'): SaveSlotMeta {
  const resolved = ensureGameIdentity(state);
  return {
    id: slotId,
    name,
    civType: resolved.hotSeat ? 'hotseat' : (resolved.civilizations[resolved.currentPlayer]?.civType ?? 'generic'),
    turn: resolved.turn,
    lastPlayed: new Date().toISOString(),
    kind,
    gameMode: resolved.hotSeat ? 'hotseat' : 'solo',
    playerCount: resolved.hotSeat?.playerCount,
    playerNames: resolved.hotSeat?.players.filter(p => p.isHuman).map(p => p.name),
    gameId: resolved.gameId,
    gameTitle: resolved.gameTitle,
  };
}

function compareSaveMeta(a: SaveSlotMeta, b: SaveSlotMeta): number {
  const turnDelta = b.turn - a.turn;
  if (turnDelta !== 0) {
    return turnDelta;
  }

  const timeDelta = Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed);
  if (!Number.isNaN(timeDelta) && timeDelta !== 0) {
    return timeDelta;
  }

  return a.name.localeCompare(b.name);
}

export interface SaveEpic {
  gameId: string;
  title: string;
  latestTurn: number;
  latestPlayed: string;
  gameMode: SaveSlotMeta['gameMode'];
  playerNames?: string[];
  saves: SaveSlotMeta[];
}

export function groupSaveEpics(saves: SaveSlotMeta[]): SaveEpic[] {
  const groups = new Map<string, SaveSlotMeta[]>();
  for (const save of saves) {
    const gameId = save.gameId ?? save.id;
    groups.set(gameId, [...(groups.get(gameId) ?? []), save]);
  }

  return [...groups.entries()]
    .map(([gameId, entries]) => {
      const sorted = [...entries].sort(compareSaveMeta);
      const newestFive = sorted.slice(0, 5);
      const latest = newestFive[0]!;
      const epic: SaveEpic = {
        gameId,
        title: latest.gameTitle ?? latest.name,
        latestTurn: latest.turn,
        latestPlayed: latest.lastPlayed,
        gameMode: latest.gameMode,
        saves: newestFive,
      };
      if (latest.playerNames) epic.playerNames = latest.playerNames;
      return epic;
    })
    .sort((left, right) => right.latestTurn - left.latestTurn || Date.parse(right.latestPlayed) - Date.parse(left.latestPlayed));
}

function getSaveStorageKey(id: string, kind: 'manual' | 'autosave'): string {
  return kind === 'autosave' ? id : `${SAVE_PREFIX}${id}`;
}

function getMetaStorageKey(id: string): string {
  return `${META_PREFIX}${id}`;
}

function isAutoSaveId(id: string): boolean {
  return id.startsWith(AUTO_SAVE_PREFIX) || id === LEGACY_AUTO_SAVE_KEY;
}

async function listPersistedMetas(): Promise<SaveSlotMeta[]> {
  const allKeys = await dbGetAllKeys();
  const metaKeys = allKeys.filter(key => key.startsWith(META_PREFIX));
  const metas: SaveSlotMeta[] = [];
  for (const key of metaKeys) {
    const meta = await dbGet<SaveSlotMeta>(key);
    if (meta) {
      metas.push(meta);
    }
  }
  return metas.sort(compareSaveMeta);
}

async function loadLegacyAutoSave(): Promise<GameState | undefined> {
  const idbSave = await dbGet<GameState>(LEGACY_AUTO_SAVE_KEY);
  if (idbSave) {
    return normalizeLoadedState(idbSave);
  }

  try {
    const raw = localStorage.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    if (raw) {
      return normalizeLoadedState(JSON.parse(raw) as GameState);
    }
  } catch {
    console.warn('[save] localStorage fallback parse failed');
  }

  return undefined;
}

async function syncLocalStorageBackup(state: GameState | undefined): Promise<void> {
  try {
    if (!state) {
      localStorage.removeItem(LOCALSTORAGE_AUTOSAVE_KEY);
      return;
    }
    localStorage.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    console.warn('[save] localStorage backup failed (quota exceeded?)');
  }
}

async function pruneAutosavesForGame(gameId: string): Promise<void> {
  const metas = (await listPersistedMetas())
    .filter(meta => meta.kind === 'autosave' && meta.gameId === gameId)
    .sort((a, b) => b.turn - a.turn || compareSaveMeta(a, b));

  for (const stale of metas.slice(5)) {
    await dbDelete(getSaveStorageKey(stale.id, 'autosave'));
    await dbDelete(getMetaStorageKey(stale.id));
  }
}

async function listLoadableAutosaveMetas(pruneInvalid: boolean = true): Promise<SaveSlotMeta[]> {
  const metas = (await listPersistedMetas()).filter(meta => meta.kind === 'autosave');
  const valid: SaveSlotMeta[] = [];

  for (const meta of metas) {
    const payload = await dbGet<GameState>(getSaveStorageKey(meta.id, 'autosave'));
    if (payload) {
      valid.push(meta);
      continue;
    }

    if (pruneInvalid) {
      await dbDelete(getMetaStorageKey(meta.id));
    }
  }

  return valid.sort((a, b) => b.turn - a.turn || compareSaveMeta(a, b));
}

async function getMostRecentAutosaveMeta(): Promise<SaveSlotMeta | undefined> {
  return (await listLoadableAutosaveMetas())[0];
}

async function loadMostRecentPersistedAutosave(): Promise<GameState | undefined> {
  const newestMeta = await getMostRecentAutosaveMeta();
  if (!newestMeta) {
    return undefined;
  }

  const state = await dbGet<GameState>(getSaveStorageKey(newestMeta.id, 'autosave'));
  return state ? normalizeLoadedState(state) : undefined;
}

async function retireLegacyAutosaveIfRealAutosavesExist(): Promise<boolean> {
  const loadableAutosaves = await listLoadableAutosaveMetas();
  if (loadableAutosaves.length === 0) {
    return false;
  }

  await dbDelete(LEGACY_AUTO_SAVE_KEY);
  await syncLocalStorageBackup(undefined);
  return true;
}

// --- Auto-save ---

export async function autoSave(state: GameState): Promise<void> {
  const resolved = normalizeLoadedState(state);
  const entryId = `${AUTO_SAVE_PREFIX}${resolved.gameId}:${resolved.turn}`;
  const meta = buildSaveMeta(entryId, `Autosave Turn ${resolved.turn}`, resolved, 'autosave');

  await dbPut(getSaveStorageKey(entryId, 'autosave'), resolved);
  await dbPut(getMetaStorageKey(entryId), meta);
  await pruneAutosavesForGame(resolved.gameId!);
  await retireLegacyAutosaveIfRealAutosavesExist();
  await syncLocalStorageBackup(resolved);
}

export async function loadMostRecentAutoSave(): Promise<GameState | undefined> {
  const retiredLegacy = await retireLegacyAutosaveIfRealAutosavesExist();
  const persistedAutoSave = await loadMostRecentPersistedAutosave();
  if (persistedAutoSave) {
    return persistedAutoSave;
  }

  if (retiredLegacy) {
    return undefined;
  }

  return loadLegacyAutoSave();
}

export async function loadAutoSave(): Promise<GameState | undefined> {
  return loadMostRecentAutoSave();
}

export async function hasAutoSave(): Promise<boolean> {
  return (await loadMostRecentAutoSave()) !== undefined;
}

export async function deleteAutoSave(): Promise<void> {
  const newestMeta = await getMostRecentAutosaveMeta();
  if (newestMeta) {
    await deleteSaveEntry(newestMeta.id, 'autosave');
    return;
  }
  await dbDelete(LEGACY_AUTO_SAVE_KEY);
  await syncLocalStorageBackup(undefined);
}

// --- Settings ---

export async function saveSettings(settings: GameState['settings']): Promise<void> {
  await dbPut(SETTINGS_KEY, settings);
}

export async function loadSettings(): Promise<GameState['settings'] | undefined> {
  return dbGet<GameState['settings']>(SETTINGS_KEY);
}

// --- Multi-slot saves ---

export async function saveGame(slotId: string, name: string, state: GameState): Promise<void> {
  const resolved = normalizeLoadedState(state);
  const meta = buildSaveMeta(slotId, name, resolved, 'manual');
  await dbPut(getSaveStorageKey(slotId, 'manual'), resolved);
  await dbPut(getMetaStorageKey(slotId), meta);
}

export async function loadGame(slotId: string): Promise<GameState | undefined> {
  if (isAutoSaveId(slotId)) {
    if (slotId === LEGACY_AUTO_SAVE_KEY) {
      return loadLegacyAutoSave();
    }
    const save = await dbGet<GameState>(getSaveStorageKey(slotId, 'autosave'));
    return save ? normalizeLoadedState(save) : undefined;
  }

  const save = await dbGet<GameState>(getSaveStorageKey(slotId, 'manual'));
  return save ? normalizeLoadedState(save) : undefined;
}

export async function deleteSaveEntry(entryId: string, kind: 'manual' | 'autosave'): Promise<void> {
  if (kind === 'autosave' && entryId === LEGACY_AUTO_SAVE_KEY) {
    await dbDelete(LEGACY_AUTO_SAVE_KEY);
    await syncLocalStorageBackup(undefined);
    return;
  }

  await dbDelete(getSaveStorageKey(entryId, kind));
  await dbDelete(getMetaStorageKey(entryId));

  if (kind === 'autosave') {
    await syncLocalStorageBackup(await loadMostRecentPersistedAutosave());
  }
}

export async function deleteGame(slotId: string): Promise<void> {
  await deleteSaveEntry(slotId, 'manual');
}

export async function listSaves(options: { includeAutoSave?: boolean } = {}): Promise<SaveSlotMeta[]> {
  const metas = await listPersistedMetas();
  const visible = options.includeAutoSave
    ? metas
    : metas.filter(meta => meta.kind !== 'autosave');

  if (!options.includeAutoSave) {
    return visible;
  }

  const loadableAutosaves = await listLoadableAutosaveMetas();
  const visibleManualSaves = visible.filter(meta => meta.kind !== 'autosave');
  if (loadableAutosaves.length > 0) {
    await retireLegacyAutosaveIfRealAutosavesExist();
    return [...loadableAutosaves, ...visibleManualSaves].sort(compareSaveMeta);
  }

  const legacyAuto = await loadLegacyAutoSave();
  if (!legacyAuto) {
    return visibleManualSaves;
  }

  return [
    buildSaveMeta(LEGACY_AUTO_SAVE_KEY, `Autosave Turn ${legacyAuto.turn}`, legacyAuto, 'autosave'),
    ...visibleManualSaves,
  ].sort(compareSaveMeta);
}

export async function listSaveEpics(): Promise<SaveEpic[]> {
  return groupSaveEpics(await listSaves({ includeAutoSave: true }));
}

export async function renameSave(slotId: string, newName: string): Promise<void> {
  const meta = await dbGet<SaveSlotMeta>(getMetaStorageKey(slotId));
  if (meta) {
    meta.name = newName;
    await dbPut(getMetaStorageKey(slotId), meta);
  }
}
