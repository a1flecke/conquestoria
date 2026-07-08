import type {
  GameState,
  MinorCivEconomyState,
  MinorCivPolicy,
  MinorCivPosture,
  UnitType,
} from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-system';

const MINOR_CIV_POLICIES = new Set<MinorCivPolicy>([
  'balanced',
  'defense',
  'economy',
  'knowledge',
  'recovery',
]);

const MINOR_CIV_POSTURES = new Set<MinorCivPosture>([
  'settled',
  'fortifying',
  'mobilizing',
  'recovering',
]);

const SAFE_UNIT_TYPES = new Set<UnitType>(TRAINABLE_UNITS.map(unit => unit.type));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizePendingSpawn(
  value: unknown,
  state: Pick<GameState, 'turn'>,
): MinorCivEconomyState['pendingUnitSpawn'] {
  if (!isRecord(value) || typeof value.unitType !== 'string') {
    return undefined;
  }

  if (!SAFE_UNIT_TYPES.has(value.unitType as UnitType)) {
    return undefined;
  }

  if (
    !isFiniteNonNegativeNumber(value.completedTurn)
    || !isFiniteNonNegativeNumber(value.attempts)
    || value.completedTurn > state.turn
  ) {
    return undefined;
  }

  return {
    unitType: value.unitType as UnitType,
    completedTurn: value.completedTurn,
    attempts: value.attempts,
  };
}

function normalizeRecentProductionSummary(value: unknown): MinorCivEconomyState['recentProductionSummary'] {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.itemId !== 'string'
    || (value.itemClass !== 'building' && value.itemClass !== 'unit' && value.itemClass !== 'idle')
    || !isFiniteNonNegativeNumber(value.completedTurn)
  ) {
    return undefined;
  }

  return {
    itemId: value.itemId,
    itemClass: value.itemClass,
    completedTurn: value.completedTurn,
  };
}

export function createDefaultMinorCivEconomyState(state: Pick<GameState, 'turn'>): MinorCivEconomyState {
  return {
    policy: 'balanced',
    posture: 'settled',
    lastProcessedTurn: Math.max(0, state.turn - 1),
  };
}

function normalizeEconomyState(value: unknown, state: Pick<GameState, 'turn'>): MinorCivEconomyState {
  const defaults = createDefaultMinorCivEconomyState(state);
  if (!isRecord(value)) {
    return defaults;
  }

  const economy: MinorCivEconomyState = {
    policy: typeof value.policy === 'string' && MINOR_CIV_POLICIES.has(value.policy as MinorCivPolicy)
      ? value.policy as MinorCivPolicy
      : defaults.policy,
    posture: typeof value.posture === 'string' && MINOR_CIV_POSTURES.has(value.posture as MinorCivPosture)
      ? value.posture as MinorCivPosture
      : defaults.posture,
    lastProcessedTurn: isFiniteNonNegativeNumber(value.lastProcessedTurn)
      ? value.lastProcessedTurn
      : defaults.lastProcessedTurn,
  };

  if (isFiniteNonNegativeNumber(value.lastPostureChangeTurn)) {
    economy.lastPostureChangeTurn = value.lastPostureChangeTurn;
  }
  if (isFiniteNonNegativeNumber(value.localRecoveryUntilTurn)) {
    economy.localRecoveryUntilTurn = value.localRecoveryUntilTurn;
  }
  if (isFiniteNonNegativeNumber(value.lastQueueDecisionTurn)) {
    economy.lastQueueDecisionTurn = value.lastQueueDecisionTurn;
  }

  const pendingUnitSpawn = normalizePendingSpawn(value.pendingUnitSpawn, state);
  if (pendingUnitSpawn) {
    economy.pendingUnitSpawn = pendingUnitSpawn;
  }

  const recentProductionSummary = normalizeRecentProductionSummary(value.recentProductionSummary);
  if (recentProductionSummary) {
    economy.recentProductionSummary = recentProductionSummary;
  }

  return economy;
}

export function normalizeMinorCivEconomyState(state: GameState): GameState {
  const minorCivs = { ...state.minorCivs };
  for (const [minorCivId, minorCiv] of Object.entries(minorCivs)) {
    minorCivs[minorCivId] = {
      ...minorCiv,
      economy: normalizeEconomyState(minorCiv.economy, state),
    };
  }
  return { ...state, minorCivs };
}
