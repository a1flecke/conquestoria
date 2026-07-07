import type {
  GameState,
  MinorCivCoalitionRecord,
  MinorCivCoalitionStatus,
  MinorCivState,
  MinorCivRegionalCooldown,
  MinorCivRegionalGrievance,
  MinorCivRegionalGrievanceCause,
  MinorCivRegionalGrievanceStatus,
  UnitType,
} from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { declareWar, modifyRelationship } from '@/systems/diplomacy-system';
import { getWrappedHexNeighbors, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { createUnit } from '@/systems/unit-system';

export const MINOR_CIV_REGIONAL_GRIEVANCE_RADIUS = 14;
const CONQUEST_PRESSURE = 35;
const REPEATED_CONQUEST_PRESSURE = 15;
const REPEATED_CONQUEST_WINDOW = 12;
const WARY_PRESSURE = 20;
const MOBILIZING_PRESSURE = 45;
const COALITION_TALKS_PRESSURE = 70;
const TRAINED_DEFENDER_PROGRESS = 24;
const CONSCRIPTION_PRESSURE = 80;
const CONSCRIPTION_COOLDOWN_TURNS = 10;
const CONSCRIPTION_STRAIN_TURNS = 6;

const ERA_DEFENDER_UNIT: Record<number, UnitType> = {
  1: 'warrior',
  2: 'swordsman',
  3: 'pikeman',
  4: 'musketeer',
  5: 'rifleman',
  6: 'rifleman',
  7: 'rifleman',
  8: 'tank',
  9: 'tank',
  10: 'tank',
  11: 'tank',
  12: 'tank',
};

const GRIEVANCE_STATUSES = new Set<MinorCivRegionalGrievanceStatus>([
  'wary',
  'mobilizing',
  'coalition-talks',
  'cooling',
]);

const COALITION_STATUSES = new Set<MinorCivCoalitionStatus>([
  'forming',
  'active',
  'cooling',
]);

function getMinorCivArchetype(minorCiv: MinorCivState) {
  return MINOR_CIV_DEFINITIONS.find(definition => definition.id === minorCiv.definitionId)?.archetype;
}

function resolveGrievanceStatus(pressure: number, era: number): MinorCivRegionalGrievanceStatus {
  if (era <= 1) return 'wary';
  if (pressure >= COALITION_TALKS_PRESSURE) return 'coalition-talks';
  if (pressure >= MOBILIZING_PRESSURE) return 'mobilizing';
  return 'wary';
}

function mobilizationProgressPerTurn(state: GameState): number {
  const challenge = resolveOpponentChallenge(state);
  if (challenge === 'explorer') return 6;
  if (challenge === 'veteran') return 10;
  return 8;
}

function pressureDecayPerTurn(state: GameState): number {
  const challenge = resolveOpponentChallenge(state);
  if (challenge === 'explorer') return 3;
  if (challenge === 'veteran') return 1;
  return 2;
}

function coalitionTalksCountdown(state: GameState): number {
  const challenge = resolveOpponentChallenge(state);
  if (challenge === 'explorer') return 6;
  if (challenge === 'veteran') return 3;
  return 4;
}

function eraDefenderUnit(era: number): UnitType {
  return ERA_DEFENDER_UNIT[Math.max(1, Math.min(12, Math.floor(era)))] ?? 'warrior';
}

function isPassableSpawnTile(state: GameState, coord: { q: number; r: number }): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  return Boolean(tile && tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain');
}

function isTileOccupied(state: GameState, coord: { q: number; r: number }): boolean {
  const key = hexKey(coord);
  return Object.values(state.units).some(unit => hexKey(unit.position) === key);
}

function findRegionalDefenderSpawnPosition(state: GameState, minorCiv: MinorCivState) {
  const city = state.cities[minorCiv.cityId];
  if (!city) return null;
  if (!isTileOccupied(state, city.position)) return city.position;
  return getWrappedHexNeighbors(city.position, state.map.width)
    .filter(coord => isPassableSpawnTile(state, coord) && !isTileOccupied(state, coord))
    .sort((a, b) => a.q - b.q || a.r - b.r)[0] ?? null;
}

function isDirectWarGrievance(state: GameState, minorCiv: MinorCivState, targetCivId: string): boolean {
  return minorCiv.diplomacy.atWarWith.includes(targetCivId)
    || Boolean(state.civilizations[targetCivId]?.diplomacy.atWarWith.includes(minorCiv.id));
}

function spawnRegionalDefender(
  state: GameState,
  minorCiv: MinorCivState,
  health: number,
): { state: GameState; unitId: string } | null {
  const city = state.cities[minorCiv.cityId];
  const spawnPosition = findRegionalDefenderSpawnPosition(state, minorCiv);
  if (!city || !spawnPosition) return null;
  const unit = createUnit(eraDefenderUnit(state.era), minorCiv.id, spawnPosition, state.idCounters);
  unit.health = health;
  unit.movementPointsLeft = 0;
  unit.hasMoved = true;
  unit.hasActed = true;
  return {
    state: {
      ...state,
      units: { ...state.units, [unit.id]: unit },
      minorCivs: {
        ...state.minorCivs,
        [minorCiv.id]: {
          ...state.minorCivs[minorCiv.id],
          units: [...state.minorCivs[minorCiv.id].units, unit.id],
        },
      },
    },
    unitId: unit.id,
  };
}

function relationshipPenaltyForConquest(minorCiv: MinorCivState, distance: number): number {
  let penalty = distance <= Math.floor(MINOR_CIV_REGIONAL_GRIEVANCE_RADIUS / 2) ? -20 : -10;
  const archetype = getMinorCivArchetype(minorCiv);
  if (archetype === 'cultural' || archetype === 'mercantile') penalty -= 5;
  return penalty;
}

function pressureForConquest(
  state: GameState,
  minorCiv: MinorCivState,
  targetCivId: string,
): number {
  let pressure = CONQUEST_PRESSURE;
  const existing = minorCiv.regionalGrievanceByCiv?.[targetCivId];
  const recentConquest = existing?.causes.some(cause => (
    cause.type === 'minor-civ-conquest'
    && state.turn - cause.turn <= REPEATED_CONQUEST_WINDOW
  ));
  if (recentConquest) pressure += REPEATED_CONQUEST_PRESSURE;
  if (getMinorCivArchetype(minorCiv) === 'militaristic') pressure += 5;
  return pressure;
}

export function applyRegionalGrievanceForMinorCivConquest(
  state: GameState,
  conqueredMinorCivId: string,
  conquerorId: string,
): GameState {
  const conquered = state.minorCivs[conqueredMinorCivId];
  const conqueredCity = conquered ? state.cities[conquered.cityId] : null;
  if (!conquered || !conqueredCity || !state.civilizations[conquerorId]) return state;

  let nextState = state;
  for (const [minorCivId, minorCiv] of Object.entries(state.minorCivs)) {
    if (minorCivId === conqueredMinorCivId || minorCiv.isDestroyed) continue;
    const city = state.cities[minorCiv.cityId];
    if (!city) continue;
    const distance = wrappedHexDistance(city.position, conqueredCity.position, state.map.width);
    if (distance > MINOR_CIV_REGIONAL_GRIEVANCE_RADIUS) continue;

    const pressureDelta = pressureForConquest(state, minorCiv, conquerorId);
    const existing = minorCiv.regionalGrievanceByCiv?.[conquerorId];
    const nextPressure = Math.min(100, (existing?.pressure ?? 0) + pressureDelta);
    const nextCause: MinorCivRegionalGrievanceCause = {
      type: 'minor-civ-conquest',
      turn: state.turn,
      minorCivId: conqueredMinorCivId,
      distance,
      pressure: pressureDelta,
    };
    const nextGrievance: MinorCivRegionalGrievance = {
      targetCivId: conquerorId,
      pressure: nextPressure,
      status: resolveGrievanceStatus(nextPressure, state.era),
      lastUpdatedTurn: state.turn,
      lastConquestTurn: state.turn,
      decayBlockedUntilTurn: state.turn + 4,
      cooldownUntilTurn: existing?.cooldownUntilTurn,
      causes: [...(existing?.causes ?? []), nextCause].slice(-8),
    };
    nextState = {
      ...nextState,
      minorCivs: {
        ...nextState.minorCivs,
        [minorCivId]: {
          ...nextState.minorCivs[minorCivId],
          diplomacy: modifyRelationship(
            nextState.minorCivs[minorCivId].diplomacy,
            conquerorId,
            relationshipPenaltyForConquest(minorCiv, distance),
          ),
          regionalGrievanceByCiv: {
            ...(nextState.minorCivs[minorCivId].regionalGrievanceByCiv ?? {}),
            [conquerorId]: nextGrievance,
          },
        },
      },
      minorCivCoalitions: nextState.minorCivCoalitions ?? {},
      minorCivRegionalCooldowns: nextState.minorCivRegionalCooldowns ?? {},
    };
  }
  return nextState;
}

export function processMinorCivRegionalGrievanceTurn(
  state: GameState,
  minorCivId: string,
): GameState {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv || minorCiv.isDestroyed) return state;

  let nextState = state;
  const grievanceByCiv = { ...(minorCiv.regionalGrievanceByCiv ?? {}) };
  for (const [targetCivId, grievance] of Object.entries(minorCiv.regionalGrievanceByCiv ?? {})) {
    if (!nextState.civilizations[targetCivId]) {
      delete grievanceByCiv[targetCivId];
      continue;
    }

    let nextGrievance: MinorCivRegionalGrievance = {
      ...grievance,
      pressure: Math.max(0, grievance.pressure),
      status: resolveGrievanceStatus(grievance.pressure, nextState.era),
      mobilizationProgress: grievance.mobilizationProgress ?? 0,
      causes: [...grievance.causes],
    };
    if ((nextGrievance.decayBlockedUntilTurn ?? 0) < nextState.turn) {
      nextGrievance = {
        ...nextGrievance,
        pressure: Math.max(0, nextGrievance.pressure - pressureDecayPerTurn(nextState)),
      };
    }
    nextGrievance = {
      ...nextGrievance,
      status: resolveGrievanceStatus(nextGrievance.pressure, nextState.era),
    };

    const currentMinor = nextState.minorCivs[minorCivId];
    const city = nextState.cities[currentMinor.cityId];
    const conscriptionReady = (nextGrievance.conscriptCooldownUntilTurn ?? 0) <= nextState.turn;
    const severeThreat = nextGrievance.pressure >= CONSCRIPTION_PRESSURE
      || isDirectWarGrievance(nextState, currentMinor, targetCivId);
    if (
      nextState.era >= 2
      && city
      && city.population >= 3
      && conscriptionReady
      && severeThreat
    ) {
      const spawned = spawnRegionalDefender(nextState, currentMinor, 65);
      if (spawned) {
        nextState = {
          ...spawned.state,
          cities: {
            ...spawned.state.cities,
            [city.id]: { ...spawned.state.cities[city.id], population: city.population - 1 },
          },
        };
        nextGrievance = {
          ...nextGrievance,
          conscriptCooldownUntilTurn: nextState.turn + CONSCRIPTION_COOLDOWN_TURNS,
          recoveryStrainedUntilTurn: nextState.turn + CONSCRIPTION_STRAIN_TURNS,
        };
      }
    }

    if (
      nextState.era >= 2
      && (nextGrievance.status === 'mobilizing' || nextGrievance.status === 'coalition-talks')
    ) {
      const nextProgress = (nextGrievance.mobilizationProgress ?? 0) + mobilizationProgressPerTurn(nextState);
      if (nextProgress >= TRAINED_DEFENDER_PROGRESS) {
        const spawned = spawnRegionalDefender(nextState, nextState.minorCivs[minorCivId], 100);
        if (spawned) {
          nextState = spawned.state;
          nextGrievance = {
            ...nextGrievance,
            mobilizationProgress: nextProgress - TRAINED_DEFENDER_PROGRESS,
            lastMobilizedTurn: nextState.turn,
          };
        } else {
          nextGrievance = { ...nextGrievance, mobilizationProgress: TRAINED_DEFENDER_PROGRESS };
        }
      } else {
        nextGrievance = { ...nextGrievance, mobilizationProgress: nextProgress };
      }
    }

    grievanceByCiv[targetCivId] = nextGrievance;
  }

  return {
    ...nextState,
    minorCivs: {
      ...nextState.minorCivs,
      [minorCivId]: {
        ...nextState.minorCivs[minorCivId],
        regionalGrievanceByCiv: grievanceByCiv,
      },
    },
  };
}

function isRegionMatureForCoalition(state: GameState, memberIds: string[]): boolean {
  if (memberIds.length < 2) return false;
  let totalPopulation = 0;
  let livingCombatUnits = 0;
  for (const memberId of memberIds) {
    const minorCiv = state.minorCivs[memberId];
    if (!minorCiv || minorCiv.isDestroyed) return false;
    totalPopulation += state.cities[minorCiv.cityId]?.population ?? 0;
    livingCombatUnits += minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length;
  }
  return totalPopulation >= 6 || livingCombatUnits >= 2;
}

function hasBlockingRegionalCooldown(state: GameState, targetCivId: string, memberIds: string[]): boolean {
  const memberSet = new Set(memberIds);
  return Object.values(state.minorCivRegionalCooldowns ?? {}).some(cooldown => (
    cooldown.targetCivId === targetCivId
    && cooldown.cooldownUntil > state.turn
    && cooldown.memberIds.some(memberId => memberSet.has(memberId))
  ));
}

function activateCoalitionWar(state: GameState, coalition: MinorCivCoalitionRecord): GameState {
  let nextState = state;
  for (const memberId of coalition.memberIds) {
    const minorCiv = nextState.minorCivs[memberId];
    const target = nextState.civilizations[coalition.targetCivId];
    if (!minorCiv || minorCiv.isDestroyed || !target) continue;
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [coalition.targetCivId]: {
          ...target,
          diplomacy: declareWar(target.diplomacy, memberId, nextState.turn),
        },
      },
      minorCivs: {
        ...nextState.minorCivs,
        [memberId]: {
          ...minorCiv,
          diplomacy: declareWar(minorCiv.diplomacy, coalition.targetCivId, nextState.turn),
        },
      },
    };
  }
  return {
    ...nextState,
    minorCivCoalitions: {
      ...(nextState.minorCivCoalitions ?? {}),
      [coalition.id]: {
        ...coalition,
        status: 'active',
        updatedTurn: nextState.turn,
      },
    },
  };
}

export function processMinorCivCoalitionsTurn(state: GameState): GameState {
  let nextState: GameState = {
    ...state,
    minorCivCoalitions: state.minorCivCoalitions ?? {},
    minorCivRegionalCooldowns: state.minorCivRegionalCooldowns ?? {},
  };

  for (const coalition of Object.values(nextState.minorCivCoalitions ?? {})) {
    if (coalition.status === 'forming' && coalition.cooldownUntilTurn <= nextState.turn) {
      nextState = activateCoalitionWar(nextState, coalition);
    }
  }

  if (nextState.era <= 1) return nextState;

  const existingTargets = new Set(
    Object.values(nextState.minorCivCoalitions ?? {})
      .filter(coalition => coalition.status === 'forming' || coalition.status === 'active')
      .map(coalition => coalition.targetCivId),
  );
  const candidatesByTarget: Record<string, string[]> = {};
  for (const [minorCivId, minorCiv] of Object.entries(nextState.minorCivs)) {
    if (minorCiv.isDestroyed) continue;
    for (const [targetCivId, grievance] of Object.entries(minorCiv.regionalGrievanceByCiv ?? {})) {
      if (
        grievance.status === 'coalition-talks'
        && grievance.pressure >= COALITION_TALKS_PRESSURE
        && !existingTargets.has(targetCivId)
      ) {
        candidatesByTarget[targetCivId] ??= [];
        candidatesByTarget[targetCivId].push(minorCivId);
      }
    }
  }

  for (const [targetCivId, memberIds] of Object.entries(candidatesByTarget)) {
    const sortedMemberIds = Array.from(new Set(memberIds)).sort();
    if (
      hasBlockingRegionalCooldown(nextState, targetCivId, sortedMemberIds)
      || !isRegionMatureForCoalition(nextState, sortedMemberIds)
    ) continue;
    const id = `minor-civ-coalition-${targetCivId}-${nextState.turn}`;
    nextState = {
      ...nextState,
      minorCivCoalitions: {
        ...(nextState.minorCivCoalitions ?? {}),
        [id]: {
          id,
          targetCivId,
          memberIds: sortedMemberIds,
          status: 'forming',
          createdTurn: nextState.turn,
          updatedTurn: nextState.turn,
          cooldownUntilTurn: nextState.turn + coalitionTalksCountdown(nextState),
        },
      },
    };
  }

  return nextState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCause(cause: unknown, state: GameState): MinorCivRegionalGrievanceCause | null {
  if (!isRecord(cause)) return null;
  if (cause.type === 'minor-civ-conquest') {
    if (
      !isFiniteNumber(cause.turn)
      || !isFiniteNumber(cause.distance)
      || !isFiniteNumber(cause.pressure)
      || typeof cause.minorCivId !== 'string'
      || !state.minorCivs[cause.minorCivId]
    ) return null;
    return {
      type: 'minor-civ-conquest',
      turn: cause.turn,
      minorCivId: cause.minorCivId,
      distance: cause.distance,
      pressure: cause.pressure,
    };
  }
  if (cause.type === 'reparations') {
    if (
      !isFiniteNumber(cause.turn)
      || !isFiniteNumber(cause.pressure)
      || typeof cause.actorCivId !== 'string'
      || !state.civilizations[cause.actorCivId]
    ) return null;
    return {
      type: 'reparations',
      turn: cause.turn,
      actorCivId: cause.actorCivId,
      pressure: cause.pressure,
    };
  }
  return null;
}

function normalizeGrievance(value: unknown, state: GameState): MinorCivRegionalGrievance | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.targetCivId !== 'string'
    || !state.civilizations[value.targetCivId]
    || !isFiniteNumber(value.pressure)
    || value.pressure < 0
    || value.pressure > 100
    || typeof value.status !== 'string'
    || !GRIEVANCE_STATUSES.has(value.status as MinorCivRegionalGrievanceStatus)
    || !isFiniteNumber(value.lastUpdatedTurn)
    || !Array.isArray(value.causes)
  ) return null;

  const causes = value.causes
    .map(cause => normalizeCause(cause, state))
    .filter((cause): cause is MinorCivRegionalGrievanceCause => cause !== null);
  if (causes.length !== value.causes.length) return null;

  const grievance: MinorCivRegionalGrievance = {
    targetCivId: value.targetCivId,
    pressure: value.pressure,
    status: value.status as MinorCivRegionalGrievanceStatus,
    lastUpdatedTurn: value.lastUpdatedTurn,
    causes,
  };
  if (isFiniteNumber(value.lastConquestTurn)) grievance.lastConquestTurn = value.lastConquestTurn;
  if (isFiniteNumber(value.decayBlockedUntilTurn)) grievance.decayBlockedUntilTurn = value.decayBlockedUntilTurn;
  if (isFiniteNumber(value.cooldownUntilTurn)) grievance.cooldownUntilTurn = value.cooldownUntilTurn;
  if (isFiniteNumber(value.mobilizationProgress)) grievance.mobilizationProgress = value.mobilizationProgress;
  if (isFiniteNumber(value.lastMobilizedTurn)) grievance.lastMobilizedTurn = value.lastMobilizedTurn;
  if (isFiniteNumber(value.conscriptCooldownUntilTurn)) grievance.conscriptCooldownUntilTurn = value.conscriptCooldownUntilTurn;
  if (isFiniteNumber(value.recoveryStrainedUntilTurn)) grievance.recoveryStrainedUntilTurn = value.recoveryStrainedUntilTurn;
  return grievance;
}

function normalizeMemberIds(value: unknown, state: GameState): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((memberId): memberId is string => (
    typeof memberId === 'string'
    && Boolean(state.minorCivs[memberId])
    && !state.minorCivs[memberId].isDestroyed
  ));
  if (ids.length !== value.length) return null;
  return Array.from(new Set(ids)).sort();
}

function normalizeCoalition(value: unknown, state: GameState): MinorCivCoalitionRecord | null {
  if (!isRecord(value)) return null;
  const memberIds = normalizeMemberIds(value.memberIds, state);
  if (
    typeof value.id !== 'string'
    || typeof value.targetCivId !== 'string'
    || !state.civilizations[value.targetCivId]
    || !memberIds
    || memberIds.length < 2
    || typeof value.status !== 'string'
    || !COALITION_STATUSES.has(value.status as MinorCivCoalitionStatus)
    || !isFiniteNumber(value.createdTurn)
    || !isFiniteNumber(value.updatedTurn)
    || !isFiniteNumber(value.cooldownUntilTurn)
  ) return null;
  return {
    id: value.id,
    targetCivId: value.targetCivId,
    memberIds,
    status: value.status as MinorCivCoalitionStatus,
    createdTurn: value.createdTurn,
    updatedTurn: value.updatedTurn,
    cooldownUntilTurn: value.cooldownUntilTurn,
  };
}

function normalizeRegionalCooldown(value: unknown, state: GameState): MinorCivRegionalCooldown | null {
  if (!isRecord(value)) return null;
  const memberIds = normalizeMemberIds(value.memberIds, state);
  if (
    typeof value.targetCivId !== 'string'
    || !state.civilizations[value.targetCivId]
    || !memberIds
    || memberIds.length < 2
    || !isFiniteNumber(value.cooldownUntil)
  ) return null;
  return {
    targetCivId: value.targetCivId,
    memberIds,
    cooldownUntil: value.cooldownUntil,
  };
}

export function normalizeMinorCivCoalitionState(state: GameState): GameState {
  const nextState = structuredClone(state);
  for (const [minorCivId, minorCiv] of Object.entries(nextState.minorCivs ?? {})) {
    const grievanceByCiv: Record<string, MinorCivRegionalGrievance> = {};
    for (const [targetCivId, grievance] of Object.entries(minorCiv.regionalGrievanceByCiv ?? {})) {
      const normalized = normalizeGrievance(grievance, nextState);
      if (normalized && normalized.targetCivId === targetCivId) {
        grievanceByCiv[targetCivId] = normalized;
      }
    }
    nextState.minorCivs[minorCivId] = {
      ...minorCiv,
      regionalGrievanceByCiv: grievanceByCiv,
    };
  }

  nextState.minorCivCoalitions = {};
  for (const [coalitionId, coalition] of Object.entries(state.minorCivCoalitions ?? {})) {
    const normalized = normalizeCoalition(coalition, nextState);
    if (normalized && normalized.id === coalitionId) {
      nextState.minorCivCoalitions[coalitionId] = normalized;
    }
  }

  nextState.minorCivRegionalCooldowns = {};
  for (const [cooldownId, cooldown] of Object.entries(state.minorCivRegionalCooldowns ?? {})) {
    const normalized = normalizeRegionalCooldown(cooldown, nextState);
    if (normalized) {
      nextState.minorCivRegionalCooldowns[cooldownId] = normalized;
    }
  }

  return nextState;
}
