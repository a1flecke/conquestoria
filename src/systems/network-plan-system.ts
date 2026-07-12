import type {
  NetworkPlan,
  NetworkPlanDefinitionId,
  NetworkPlanTarget,
} from '@/core/autonomy-state';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { isAtWar } from '@/systems/diplomacy-system';
import { hexDistance } from '@/systems/hex-utils';
import { TECH_TREE } from '@/systems/tech-definitions';
import { getNetworkPlanDefinition } from './network-plan-definitions';
import {
  resolveNetworkPlanAtTargetEnd,
  type NetworkEffectEvent,
} from './network-effect-resolver';

export interface NetworkPlanRequest {
  ownerCivId: string;
  sourceUnitId: string;
  definitionId: NetworkPlanDefinitionId;
  target: NetworkPlanTarget;
}

export type NetworkPlanValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'autonomy-not-activated'
        | 'missing-owner'
        | 'missing-source'
        | 'invalid-source'
        | 'source-already-assigned'
        | 'invalid-target'
        | 'missing-target-city'
        | 'target-not-friendly'
        | 'target-not-enemy'
        | 'target-not-at-war'
        | 'target-out-of-range'
        | 'same-type-target-already-assigned'
        | 'missing-plan';
    };

export interface NetworkPlanMutationResult {
  state: GameState;
  validation: NetworkPlanValidation;
  plan: NetworkPlan | null;
}

export interface NetworkTurnStartResult {
  state: GameState;
  warnings: Array<{ planId: string; victimCivId: string }>;
}

export interface NetworkTurnEndResult {
  state: GameState;
  creditsByOwner: Record<string, number>;
  events: NetworkEffectEvent[];
}

export interface NetworkPlanCleanupResult {
  state: GameState;
  cancelled: Array<{ planId: string; reason: Exclude<NetworkPlanValidation, { ok: true }>['reason'] }>;
}

export function isAutonomyActivated(state: GameState, civId: string): boolean {
  const completed = state.civilizations[civId]?.techState?.completed ?? [];
  return completed.some(techId => TECH_TREE.find(tech => tech.id === techId)?.era === 13);
}

function hasActivePlanForSource(state: GameState, sourceUnitId: string): boolean {
  return Object.values(state.autonomyByCiv ?? {}).some(autonomy =>
    Object.values(autonomy.plans).some(plan =>
      plan.sourceUnitId === sourceUnitId && plan.status !== 'canceled' && plan.status !== 'completed'),
  );
}

function hasSameTypeCityPlan(state: GameState, definitionId: NetworkPlanDefinitionId, cityId: string): boolean {
  return Object.values(state.autonomyByCiv ?? {}).some(autonomy =>
    Object.values(autonomy.plans).some(plan =>
      plan.definitionId === definitionId
      && plan.target.kind === 'city'
      && plan.target.cityId === cityId
      && plan.status !== 'canceled'
      && plan.status !== 'completed'),
  );
}

export function validateNetworkPlanAssignment(
  state: GameState,
  request: NetworkPlanRequest,
): NetworkPlanValidation {
  const owner = state.civilizations[request.ownerCivId];
  if (!owner) return { ok: false, reason: 'missing-owner' };
  if (!isAutonomyActivated(state, request.ownerCivId)) return { ok: false, reason: 'autonomy-not-activated' };

  const source = state.units[request.sourceUnitId];
  if (!source) return { ok: false, reason: 'missing-source' };
  if (source.owner !== request.ownerCivId || source.type !== 'cyber_unit') {
    return { ok: false, reason: 'invalid-source' };
  }
  if (hasActivePlanForSource(state, source.id)) return { ok: false, reason: 'source-already-assigned' };
  if (request.target.kind !== 'city') return { ok: false, reason: 'invalid-target' };

  const city = state.cities[request.target.cityId];
  if (!city) return { ok: false, reason: 'missing-target-city' };
  const definition = getNetworkPlanDefinition(request.definitionId);
  if (hexDistance(source.position, city.position) > definition.range) {
    return { ok: false, reason: 'target-out-of-range' };
  }
  if (definition.targetKind === 'friendly-city' && city.owner !== request.ownerCivId) {
    return { ok: false, reason: 'target-not-friendly' };
  }
  if (definition.targetKind === 'at-war-enemy-city') {
    const targetCiv = state.civilizations[city.owner];
    if (!targetCiv || city.owner === request.ownerCivId) return { ok: false, reason: 'target-not-enemy' };
    if (!isAtWar(owner.diplomacy, city.owner) || !isAtWar(targetCiv.diplomacy, request.ownerCivId)) {
      return { ok: false, reason: 'target-not-at-war' };
    }
  }
  if (hasSameTypeCityPlan(state, request.definitionId, city.id)) {
    return { ok: false, reason: 'same-type-target-already-assigned' };
  }
  return { ok: true };
}

export function assignNetworkPlan(
  state: GameState,
  request: NetworkPlanRequest,
): NetworkPlanMutationResult {
  const validation = validateNetworkPlanAssignment(state, request);
  if (!validation.ok) return { state, validation, plan: null };

  const nextId = state.idCounters.nextNetworkPlanId ?? 1;
  const plan: NetworkPlan = {
    id: `network-plan-${nextId}`,
    ownerCivId: request.ownerCivId,
    definitionId: request.definitionId,
    sourceUnitId: request.sourceUnitId,
    target: structuredClone(request.target),
    status: request.definitionId === 'harden' ? 'active' : 'preparing',
    createdTurn: state.turn,
    nextResolutionTurn: request.definitionId === 'harden' ? state.turn : state.turn + 1,
    warnedTurn: null,
    ...(request.definitionId === 'harden' ? { effectState: { hardenCharges: 1 } } : {}),
  };
  const currentAutonomy = state.autonomyByCiv?.[request.ownerCivId] ?? createEmptyAutonomyCivState();
  return {
    state: {
      ...state,
      autonomyByCiv: {
        ...state.autonomyByCiv,
        [request.ownerCivId]: {
          ...currentAutonomy,
          plans: { ...currentAutonomy.plans, [plan.id]: plan },
        },
      },
      idCounters: { ...state.idCounters, nextNetworkPlanId: nextId + 1 },
    },
    validation,
    plan,
  };
}

function stateWithoutPlan(state: GameState, ownerCivId: string, planId: string): GameState {
  const autonomy = state.autonomyByCiv?.[ownerCivId] ?? createEmptyAutonomyCivState();
  const { [planId]: _removed, ...plans } = autonomy.plans;
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [ownerCivId]: { ...autonomy, plans },
    },
  };
}

export function retargetNetworkPlan(
  state: GameState,
  ownerCivId: string,
  planId: string,
  target: NetworkPlanTarget,
): NetworkPlanMutationResult {
  const existing = state.autonomyByCiv?.[ownerCivId]?.plans[planId];
  if (!existing) {
    return { state, validation: { ok: false, reason: 'missing-plan' }, plan: null };
  }
  const withoutOldPlan = stateWithoutPlan(state, ownerCivId, planId);
  const request: NetworkPlanRequest = {
    ownerCivId,
    sourceUnitId: existing.sourceUnitId,
    definitionId: existing.definitionId,
    target,
  };
  const validation = validateNetworkPlanAssignment(withoutOldPlan, request);
  if (!validation.ok) return { state, validation, plan: null };

  const plan: NetworkPlan = {
    ...existing,
    target: structuredClone(target),
    status: existing.definitionId === 'harden' ? 'active' : 'preparing',
    nextResolutionTurn: existing.definitionId === 'harden' ? state.turn : state.turn + 1,
    warnedTurn: null,
  };
  return {
    state: {
      ...withoutOldPlan,
      autonomyByCiv: {
        ...withoutOldPlan.autonomyByCiv,
        [ownerCivId]: {
          ...withoutOldPlan.autonomyByCiv![ownerCivId],
          plans: { ...withoutOldPlan.autonomyByCiv![ownerCivId].plans, [plan.id]: plan },
        },
      },
    },
    validation,
    plan,
  };
}

export function holdNetworkPlan(
  state: GameState,
  ownerCivId: string,
  sourceUnitId: string,
): NetworkPlanMutationResult {
  const plan = Object.values(state.autonomyByCiv?.[ownerCivId]?.plans ?? {})
    .find(candidate => candidate.sourceUnitId === sourceUnitId);
  if (!plan) return { state, validation: { ok: true }, plan: null };
  return { state: stateWithoutPlan(state, ownerCivId, plan.id), validation: { ok: true }, plan: null };
}

export function cancelInvalidNetworkPlans(state: GameState): NetworkPlanCleanupResult {
  let nextState = state;
  const cancelled: NetworkPlanCleanupResult['cancelled'] = [];
  const candidates = Object.entries(state.autonomyByCiv ?? {})
    .flatMap(([ownerCivId, autonomy]) => Object.values(autonomy.plans)
      .map(plan => ({ ownerCivId, plan })))
    .sort((left, right) => left.plan.id.localeCompare(right.plan.id));
  for (const { ownerCivId, plan } of candidates) {
    const withoutPlan = stateWithoutPlan(nextState, ownerCivId, plan.id);
    const validation = validateNetworkPlanAssignment(withoutPlan, {
      ownerCivId,
      sourceUnitId: plan.sourceUnitId,
      definitionId: plan.definitionId,
      target: plan.target,
    });
    if (validation.ok) continue;
    nextState = withoutPlan;
    cancelled.push({ planId: plan.id, reason: validation.reason });
  }
  return { state: nextState, cancelled };
}

export function beginNetworkPlansForVictimTurn(
  state: GameState,
  victimCivId: string,
): NetworkTurnStartResult {
  let nextState = state;
  const warnings: NetworkTurnStartResult['warnings'] = [];
  const candidates = Object.entries(state.autonomyByCiv ?? {})
    .flatMap(([ownerCivId, autonomy]) => Object.values(autonomy.plans)
      .map(plan => ({ ownerCivId, plan })))
    .filter(({ plan }) => plan.definitionId === 'exploit'
      && plan.status === 'preparing'
      && plan.warnedTurn === null
      && plan.nextResolutionTurn <= state.turn
      && plan.target.kind === 'city'
      && state.cities[plan.target.cityId]?.owner === victimCivId)
    .sort((left, right) => left.plan.id.localeCompare(right.plan.id));

  for (const { ownerCivId, plan } of candidates) {
    const autonomy = nextState.autonomyByCiv![ownerCivId];
    const warnedPlan: NetworkPlan = { ...plan, status: 'active', warnedTurn: state.turn };
    nextState = {
      ...nextState,
      autonomyByCiv: {
        ...nextState.autonomyByCiv,
        [ownerCivId]: {
          ...autonomy,
          plans: { ...autonomy.plans, [plan.id]: warnedPlan },
        },
      },
    };
    warnings.push({ planId: plan.id, victimCivId });
  }
  return { state: nextState, warnings };
}

export function resolveNetworkPlansForVictimTurnEnd(
  state: GameState,
  victimCivId: string,
  baseGoldByCityId: Record<string, number>,
): NetworkTurnEndResult {
  let nextState = state;
  const creditsByOwner: Record<string, number> = {};
  const events: NetworkEffectEvent[] = [];
  const planIds = Object.values(state.autonomyByCiv ?? {})
    .flatMap(autonomy => Object.values(autonomy.plans))
    .filter(plan => plan.definitionId === 'exploit'
      && plan.status === 'active'
      && plan.warnedTurn === state.turn
      && plan.target.kind === 'city'
      && nextState.cities[plan.target.cityId]?.owner === victimCivId)
    .map(plan => plan.id)
    .sort();

  for (const planId of planIds) {
    const plan = Object.values(nextState.autonomyByCiv ?? {})
      .map(autonomy => autonomy.plans[planId])
      .find(Boolean);
    if (!plan || plan.target.kind !== 'city') continue;
    const resolution = resolveNetworkPlanAtTargetEnd(nextState, planId, {
      baseCityGold: baseGoldByCityId[plan.target.cityId] ?? 0,
    });
    nextState = resolution.state;
    for (const [ownerCivId, credits] of Object.entries(resolution.creditsByOwner)) {
      creditsByOwner[ownerCivId] = (creditsByOwner[ownerCivId] ?? 0) + credits;
    }
    events.push(...resolution.events);
  }
  return { state: nextState, creditsByOwner, events };
}
