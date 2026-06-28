import { processAITurn } from '@/ai/basic-ai';
import type { EventBus } from '@/core/event-bus';
import {
  createEmptyMajorCivPlanPortfolio,
  normalizeOpponentAIState,
} from '@/core/opponent-ai-state';
import type { GameState } from '@/core/types';
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
  execute?: (state: GameState, civId: string, bus: EventBus) => GameState;
  strategicPlanningEnabled?: boolean;
  prepare?: PrepareMajorCivPlan;
  executePrepared?: ExecutePreparedMajorCivPlan;
}

export interface ProcessNonHumanRoundResult {
  state: GameState;
  traces: AIDecisionTrace[];
}

function preparedTargetIsStale(
  state: GameState,
  prepared: PreparedMajorCivPlan,
): boolean {
  const plan = prepared.portfolio.primaryPlan;
  if (!plan) return false;
  switch (plan.target.kind) {
    case 'city': {
      const city = state.cities[plan.target.id];
      return !city || (
        plan.objective === 'capture'
        && city.owner === prepared.civId
      );
    }
    case 'unit':
      return !Object.prototype.hasOwnProperty.call(state.units, plan.target.id);
    case 'camp':
      return state.barbarianCamps[plan.target.id] === undefined;
    case 'resource':
    case 'region':
      return false;
  }
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
    return { state: working, traces: [] };
  }

  const stableActorIds = getLivingNonHumanMajorIds(working);
  const actorIds = rotateIdsForRound(stableActorIds, working.turn);
  if (options.strategicPlanningEnabled) {
    let refreshed = working;
    for (const civId of stableActorIds) {
      refreshed = refreshMajorCivIntel(refreshed, civId);
    }
    const planningSnapshot = deepFreeze(structuredClone(refreshed));
    const prepare = options.prepare ?? prepareMajorCivStrategicPlan;
    const preparedPlans = stableActorIds.map(civId => prepare(planningSnapshot, civId));
    const preparedByCiv = new Map(preparedPlans.map(prepared => [prepared.civId, prepared]));
    const traces = preparedPlans.flatMap(prepared => prepared.traces);
    working = writePreparedPortfolios(refreshed, preparedPlans);

    const executePrepared = options.executePrepared ?? ((current: GameState) => ({ state: current }));
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
      if (preparedTargetIsStale(working, prepared)) {
        const stalePortfolio = portfolio ?? createEmptyMajorCivPlanPortfolio();
        working = withMajorPortfolio(working, civId, {
          ...stalePortfolio,
          primaryPlan: null,
          lastExecutedTurn: working.turn,
        });
        continue;
      }
      working = executePrepared(working, prepared, bus).state;
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
    };
  }

  const execute = options.execute ?? processAITurn;
  for (const civId of actorIds) {
    const civ = working.civilizations[civId];
    if (!civ || civ.isHuman || civ.isEliminated) continue;
    const hasLiveAsset = civ.cities.some(id => working.cities[id]?.owner === civId)
      || civ.units.some(id => working.units[id]?.owner === civId);
    if (!hasLiveAsset) continue;
    working = execute(working, civId, bus);
  }

  working = normalizeOpponentAIState(working);
  return {
    state: {
      ...working,
      opponentAI: {
        ...working.opponentAI!,
        lastProcessedRound: working.turn,
      },
    },
    traces: [],
  };
}
