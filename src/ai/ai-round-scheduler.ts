import { processPreparedAITurn } from '@/ai/basic-ai';
import type { EventBus } from '@/core/event-bus';
import {
  createEmptyMajorCivPlanPortfolio,
  normalizeOpponentAIState,
} from '@/core/opponent-ai-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { refreshMajorCivIntel } from './ai-perception';
import type {
  ExecutePreparedMajorCivPlan,
  PrepareMajorCivPlan,
  PreparedMajorCivPlan,
} from './ai-prepared-turn';
import { prepareMajorCivStrategicPlan } from './ai-prepared-turn';
import type { AIDecisionTrace } from './ai-decision-trace';

export function getLivingNonHumanMajorIds(state: GameState): string[] {
  return Object.values(state.civilizations)
    .filter(civ => {
      if (civ.isHuman || civ.isEliminated === true) return false;
      const hasLiveCity = civ.cities.some(id => state.cities[id]?.owner === civ.id);
      const hasLiveUnit = civ.units.some(id => state.units[id]?.owner === civ.id);
      return hasLiveCity || hasLiveUnit;
    })
    .map(civ => civ.id)
    .sort();
}

export function rotateIdsForRound(ids: readonly string[], turn: number): string[] {
  if (ids.length === 0) return [];
  const start = ((turn % ids.length) + ids.length) % ids.length;
  return [...ids.slice(start), ...ids.slice(0, start)];
}

export interface ProcessNonHumanRoundOptions {
  prepare?: PrepareMajorCivPlan;
  executePrepared?: ExecutePreparedMajorCivPlan;
}

export interface ProcessNonHumanRoundResult {
  state: GameState;
  traces: AIDecisionTrace[];
  planningErrors: Array<{
    actorId: string;
    phase: 'prepare';
    message: string;
  }>;
}

function planTargetIsStale(
  state: GameState,
  civId: string,
  plan: NonNullable<PreparedMajorCivPlan['portfolio']['primaryPlan']>,
): boolean {
  switch (plan.target.kind) {
    case 'city': {
      const city = state.cities[plan.target.id];
      if (!city) return true;
      if (plan.objective === 'defend') return city.owner !== civId;
      return plan.objective === 'capture' && city.owner === civId;
    }
    case 'unit':
      return !Object.prototype.hasOwnProperty.call(state.units, plan.target.id);
    case 'camp':
      return state.barbarianCamps[plan.target.id] === undefined;
    case 'resource': {
      const tile = state.map.tiles[hexKey(plan.target.position)];
      if (!tile || tile.resource !== plan.target.resource) return true;
      if (tile.owner === null) return false;
      if (tile.owner === civId) return true;
      return !state.civilizations[civId]?.diplomacy.atWarWith.includes(tile.owner);
    }
    case 'region':
      return state.map.tiles[hexKey(plan.target.anchor)] === undefined;
  }
}

function revalidatePreparedPlan(
  state: GameState,
  prepared: PreparedMajorCivPlan,
): PreparedMajorCivPlan {
  const primaryPlan = prepared.portfolio.primaryPlan
    && !planTargetIsStale(state, prepared.civId, prepared.portfolio.primaryPlan)
    ? prepared.portfolio.primaryPlan
    : null;
  const defensePlansByCityId = Object.fromEntries(
    Object.entries(prepared.portfolio.defensePlansByCityId)
      .filter(([, plan]) => !planTargetIsStale(state, prepared.civId, plan)),
  );
  const validPlanIds = new Set([
    ...(primaryPlan ? [primaryPlan.id] : []),
    ...Object.values(defensePlansByCityId).map(plan => plan.id),
  ]);
  const validUnitIds = new Set(
    Object.values(state.units)
      .filter(unit => unit.owner === prepared.civId)
      .map(unit => unit.id),
  );
  const assignmentsByPlanId = Object.fromEntries(
    Object.entries(prepared.assignments.assignmentsByPlanId)
      .filter(([planId]) => validPlanIds.has(planId))
      .map(([planId, unitIds]) => [
        planId,
        unitIds.filter(unitId => validUnitIds.has(unitId)),
      ]),
  );
  const forceDemands = prepared.forceDemands.flatMap(demand => {
    const sourcePlanIds = demand.sourcePlanIds.filter(sourceId => {
      if (sourceId === 'objective-readiness') return true;
      if (sourceId.startsWith('defense-overflow:')) {
        const cityId = sourceId.slice('defense-overflow:'.length);
        return state.cities[cityId]?.owner === prepared.civId;
      }
      return validPlanIds.has(sourceId);
    });
    return sourcePlanIds.length > 0 ? [{ ...demand, sourcePlanIds }] : [];
  });
  const portfolio = {
    ...prepared.portfolio,
    primaryPlan: primaryPlan
      ? {
          ...primaryPlan,
          assignedUnitIds: primaryPlan.assignedUnitIds
            .filter(unitId => validUnitIds.has(unitId)),
        }
      : null,
    defensePlansByCityId: Object.fromEntries(
      Object.entries(defensePlansByCityId).map(([cityId, plan]) => [
        cityId,
        {
          ...plan,
          assignedUnitIds: plan.assignedUnitIds
            .filter(unitId => validUnitIds.has(unitId)),
        },
      ]),
    ),
  };
  return {
    ...prepared,
    portfolio,
    assignments: {
      ...prepared.assignments,
      portfolio,
      assignmentsByPlanId,
      recoveryUnitIds: prepared.assignments.recoveryUnitIds
        .filter(unitId => validUnitIds.has(unitId)),
      forceDemands,
    },
    forceDemands,
  };
}

function writePreparedPortfolios(
  state: GameState,
  preparedPlans: readonly PreparedMajorCivPlan[],
): GameState {
  const normalized = normalizeOpponentAIState(state);
  const majorCivs = { ...normalized.opponentAI!.majorCivs };
  for (const prepared of preparedPlans) {
    majorCivs[prepared.civId] = structuredClone(prepared.portfolio);
  }
  return {
    ...normalized,
    opponentAI: {
      ...normalized.opponentAI!,
      majorCivs,
      lastPlannedRound: normalized.turn,
    },
  };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (!value || typeof value !== 'object') return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function withMajorPortfolio(
  state: GameState,
  civId: string,
  portfolio: NonNullable<GameState['opponentAI']>['majorCivs'][string],
): GameState {
  return {
    ...state,
    opponentAI: {
      ...state.opponentAI!,
      majorCivs: {
        ...state.opponentAI!.majorCivs,
        [civId]: portfolio,
      },
    },
  };
}

export function processNonHumanMajorRound(
  state: GameState,
  bus: EventBus,
  options: ProcessNonHumanRoundOptions = {},
): ProcessNonHumanRoundResult {
  let working = normalizeOpponentAIState(state);
  if (working.opponentAI!.lastProcessedRound === working.turn) {
    return { state: working, traces: [], planningErrors: [] };
  }

  const stableActorIds = getLivingNonHumanMajorIds(working);
  const actorIds = rotateIdsForRound(stableActorIds, working.turn);
  let refreshed = working;
  for (const civId of stableActorIds) {
    refreshed = refreshMajorCivIntel(refreshed, civId);
  }
  const planningSnapshot = deepFreeze(structuredClone(refreshed));
  const prepare = options.prepare ?? prepareMajorCivStrategicPlan;
  const preparedPlans: PreparedMajorCivPlan[] = [];
  const planningErrors: ProcessNonHumanRoundResult['planningErrors'] = [];
  for (const civId of stableActorIds) {
    try {
      const prepared = prepare(planningSnapshot, civId);
      if (prepared.civId !== civId) {
        throw new Error(
          `Prepared actor mismatch: expected ${civId}, received ${prepared.civId}`,
        );
      }
      preparedPlans.push(prepared);
    } catch (error) {
      planningErrors.push({
        actorId: civId,
        phase: 'prepare',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const preparedByCiv = new Map(preparedPlans.map(prepared => [prepared.civId, prepared]));
  const traces = preparedPlans.flatMap(prepared => prepared.traces);
  working = writePreparedPortfolios(refreshed, preparedPlans);

  const executePrepared = options.executePrepared ?? processPreparedAITurn;
  for (const civId of actorIds) {
    const prepared = preparedByCiv.get(civId);
    const civ = working.civilizations[civId];
    const portfolio = working.opponentAI?.majorCivs[civId];
    if (
      !prepared
      || !civ
      || civ.isHuman
      || civ.isEliminated
      || portfolio?.lastExecutedTurn === working.turn
    ) {
      continue;
    }
    const revalidated = revalidatePreparedPlan(working, prepared);
    working = withMajorPortfolio(working, civId, revalidated.portfolio);
    working = executePrepared(working, revalidated, bus).state;
    working = normalizeOpponentAIState(working);
    const executedPortfolio = working.opponentAI!.majorCivs[civId]
      ?? createEmptyMajorCivPlanPortfolio();
    working = withMajorPortfolio(working, civId, {
      ...executedPortfolio,
      lastExecutedTurn: working.turn,
    });
  }

  working = normalizeOpponentAIState(working);
  return {
    state: {
      ...working,
      opponentAI: {
        ...working.opponentAI!,
        lastPlannedRound: working.turn,
        lastProcessedRound: working.turn,
      },
    },
    traces,
    planningErrors,
  };
}
