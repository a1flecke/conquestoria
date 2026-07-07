import type {
  GameState,
  MinorCivCoalitionRecord,
  MinorCivCoalitionStatus,
  MinorCivRegionalCooldown,
  MinorCivRegionalGrievance,
  MinorCivRegionalGrievanceCause,
  MinorCivRegionalGrievanceStatus,
} from '@/core/types';

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
