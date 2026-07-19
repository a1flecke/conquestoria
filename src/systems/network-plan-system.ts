import type {
  NetworkPlan,
  NetworkPlanDefinitionId,
  NetworkPlanTarget,
  NetworkPlanSource,
} from '@/core/autonomy-state';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { isAtWar } from '@/systems/diplomacy-system';
import { hexDistance } from '@/systems/hex-utils';
import { isAutonomyActivated as isAutonomyActivatedForCiv } from './autonomy-activation';
import { getNetworkPlanDefinition, getNetworkPlanLoad } from './network-plan-definitions';
import { getAutonomyCapacity, getAutonomyLoad } from './autonomy-capacity';
import {
  resolveNetworkPlanAtTargetEnd,
  type NetworkEffectEvent,
} from './network-effect-resolver';

export interface NetworkPlanRequest {
  ownerCivId: string;
  sourceUnitId?: string;
  source?: NetworkPlanSource;
  definitionId: NetworkPlanDefinitionId;
  target: NetworkPlanTarget;
  linkedUnitIds?: string[];
  linkedCityIds?: string[];
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
        | 'ordinary-load-exceeds-capacity'
        | 'network-recovering'
        | 'missing-plan';
    };

export interface NetworkPlanMutationResult {
  state: GameState;
  validation: NetworkPlanValidation;
  plan: NetworkPlan | null;
}

export interface NetworkPlanPreview {
  validation: NetworkPlanValidation;
  load: number;
  capacity: number;
  remainingCapacity: number;
  effect: ReturnType<typeof getNetworkPlanDefinition>['effect'];
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
  return isAutonomyActivatedForCiv(state, civId);
}

function hasActivePlanForSource(state: GameState, sourceUnitId: string): boolean {
  return Object.values(state.autonomyByCiv ?? {}).some(autonomy =>
    Object.values(autonomy.plans).some(plan =>
      (plan.source?.kind === 'unit' ? plan.source.unitId === sourceUnitId : plan.sourceUnitId === sourceUnitId)
      && plan.status !== 'canceled' && plan.status !== 'completed'),
  );
}

function requestSourceForPlan(plan: NetworkPlan): Pick<NetworkPlanRequest, 'source' | 'sourceUnitId'> {
  if (plan.source) return { source: plan.source };
  return plan.sourceUnitId ? { sourceUnitId: plan.sourceUnitId } : {};
}

function requestForPlan(plan: NetworkPlan, ownerCivId: string, target: NetworkPlanTarget): NetworkPlanRequest {
  return {
    ownerCivId,
    ...requestSourceForPlan(plan),
    definitionId: plan.definitionId,
    target,
    linkedUnitIds: plan.linkedUnitIds,
    linkedCityIds: plan.linkedCityIds,
  };
}

function hasCapacityForAssignment(state: GameState, request: NetworkPlanRequest): boolean {
  const load = getAutonomyLoad(state, request.ownerCivId).unrestricted;
  const capacity = getAutonomyCapacity(state, request.ownerCivId).unrestricted;
  const definition = getNetworkPlanDefinition(request.definitionId);
  const safeguardedHostileLoad = state.autonomyByCiv?.[request.ownerCivId]?.posture === 'safeguarded'
    && definition.targetKind === 'at-war-enemy-city' ? 1 : 0;
  return load + getNetworkPlanLoad(request.definitionId, request.linkedUnitIds) + safeguardedHostileLoad <= capacity;
}

function hasActivePlanForCitySource(state: GameState, cityId: string): boolean {
  return Object.values(state.autonomyByCiv ?? {}).some(autonomy =>
    Object.values(autonomy.plans).some(plan =>
      plan.source?.kind === 'city' && plan.source.cityId === cityId
      && plan.status !== 'canceled' && plan.status !== 'completed'),
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
  options: { allowDuringRecovery?: boolean } = {},
): NetworkPlanValidation {
  const owner = state.civilizations[request.ownerCivId];
  if (!owner) return { ok: false, reason: 'missing-owner' };
  if (!isAutonomyActivated(state, request.ownerCivId)) return { ok: false, reason: 'autonomy-not-activated' };
  const autonomy = state.autonomyByCiv?.[request.ownerCivId];
  if (!options.allowDuringRecovery && autonomy?.surgeRecoveryUntilTurn !== null
    && autonomy?.surgeRecoveryUntilTurn !== undefined && autonomy.surgeRecoveryUntilTurn > state.turn) {
    return { ok: false, reason: 'network-recovering' };
  }

  const definition = getNetworkPlanDefinition(request.definitionId);
  if (definition.sourceKind === 'city') {
    const cityId = request.source?.kind === 'city' ? request.source.cityId : '';
    const sourceCity = state.cities[cityId];
    if (!sourceCity || sourceCity.owner !== request.ownerCivId) return { ok: false, reason: 'missing-source' };
    if (!definition.sourceBuildings?.some(building => sourceCity.buildings.includes(building))) {
      return { ok: false, reason: 'invalid-source' };
    }
    if (hasActivePlanForCitySource(state, cityId)) return { ok: false, reason: 'source-already-assigned' };
    if (request.target.kind !== 'city') return { ok: false, reason: 'invalid-target' };
    const targetCity = state.cities[request.target.cityId];
    if (!targetCity) return { ok: false, reason: 'missing-target-city' };
    if (targetCity.owner !== request.ownerCivId) return { ok: false, reason: 'target-not-friendly' };
    if (request.definitionId === 'research-mesh') {
      const linkedCityIds = request.linkedCityIds ?? [];
      if (linkedCityIds.length > 1 || new Set(linkedCityIds).size !== linkedCityIds.length
        || linkedCityIds.includes(targetCity.id)
        || linkedCityIds.some(linkedCityId => state.cities[linkedCityId]?.owner !== request.ownerCivId)) {
        return { ok: false, reason: 'invalid-target' };
      }
    }
    if (request.definitionId === 'survey-grid') {
      const linkedUnitIds = request.linkedUnitIds ?? [];
      if (linkedUnitIds.length < 1 || linkedUnitIds.length > 2 || new Set(linkedUnitIds).size !== linkedUnitIds.length
        || linkedUnitIds.some(unitId => state.units[unitId]?.owner !== request.ownerCivId)) {
        return { ok: false, reason: 'invalid-target' };
      }
    }
    return hasCapacityForAssignment(state, request) ? { ok: true } : { ok: false, reason: 'ordinary-load-exceeds-capacity' };
  }

  const sourceUnitId = request.source?.kind === 'unit' ? request.source.unitId : request.sourceUnitId;
  const source = sourceUnitId ? state.units[sourceUnitId] : undefined;
  if (!source) return { ok: false, reason: 'missing-source' };
  if (source.owner !== request.ownerCivId || source.type !== 'cyber_unit') {
    return { ok: false, reason: 'invalid-source' };
  }
  if (hasActivePlanForSource(state, source.id)) return { ok: false, reason: 'source-already-assigned' };
  if (definition.targetKind === 'formation') {
    if (request.target.kind !== 'formation' || request.target.unitIds.length < 1 || request.target.unitIds.length > 3) {
      return { ok: false, reason: 'invalid-target' };
    }
    const distinctUnitIds = new Set(request.target.unitIds);
    if (distinctUnitIds.size !== request.target.unitIds.length || request.target.unitIds.some(unitId => {
      const unit = state.units[unitId];
      return !unit || unit.owner !== request.ownerCivId || hexDistance(source.position, unit.position) > definition.range;
    })) return { ok: false, reason: 'invalid-target' };
    return hasCapacityForAssignment(state, request) ? { ok: true } : { ok: false, reason: 'ordinary-load-exceeds-capacity' };
  }
  if (request.target.kind !== 'city') return { ok: false, reason: 'invalid-target' };

  const city = state.cities[request.target.cityId];
  if (!city) return { ok: false, reason: 'missing-target-city' };
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
  return hasCapacityForAssignment(state, request) ? { ok: true } : { ok: false, reason: 'ordinary-load-exceeds-capacity' };
}

/** Single public read model used by the UI and AI; it never mutates state. */
export function previewNetworkPlan(state: GameState, request: NetworkPlanRequest): NetworkPlanPreview {
  const definition = getNetworkPlanDefinition(request.definitionId);
  const capacity = getAutonomyCapacity(state, request.ownerCivId).unrestricted;
  const currentLoad = getAutonomyLoad(state, request.ownerCivId).unrestricted;
  return {
    validation: validateNetworkPlanAssignment(state, request),
    load: getNetworkPlanLoad(request.definitionId, request.linkedUnitIds),
    capacity,
    remainingCapacity: capacity - currentLoad,
    effect: definition.effect,
  };
}

export function assignNetworkPlan(
  state: GameState,
  request: NetworkPlanRequest,
): NetworkPlanMutationResult {
  const validation = validateNetworkPlanAssignment(state, request);
  if (!validation.ok) return { state, validation, plan: null };

  const definition = getNetworkPlanDefinition(request.definitionId);
  const currentAutonomy = state.autonomyByCiv?.[request.ownerCivId] ?? createEmptyAutonomyCivState();
  const nextId = state.idCounters.nextNetworkPlanId ?? 1;
  const plan: NetworkPlan = {
    id: `network-plan-${nextId}`,
    ownerCivId: request.ownerCivId,
    definitionId: request.definitionId,
    sourceUnitId: request.source?.kind === 'unit' ? request.source.unitId : request.sourceUnitId,
    source: structuredClone(request.source ?? { kind: 'unit', unitId: request.sourceUnitId! }),
    target: structuredClone(request.target),
    linkedUnitIds: [...(request.linkedUnitIds ?? [])],
    linkedCityIds: [...(request.linkedCityIds ?? [])],
    status: definition.targetKind === 'at-war-enemy-city' ? 'preparing' : 'active',
    createdTurn: state.turn,
    // A victim's next player turn can occur later in this hot-seat round, before the
    // global round counter advances.  The warning gate, not a round offset, owns timing.
    nextResolutionTurn: definition.targetKind === 'at-war-enemy-city' && currentAutonomy.posture === 'safeguarded'
      ? state.turn + 1 : state.turn,
    warnedTurn: null,
    surgeResolutionTurn: null,
    ...(request.definitionId === 'harden' ? { effectState: { hardenCharges: 1 } } : {}),
  };
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
  const request = requestForPlan(existing, ownerCivId, target);
  const validation = validateNetworkPlanAssignment(withoutOldPlan, request, { allowDuringRecovery: true });
  if (!validation.ok) return { state, validation, plan: null };

  const plan: NetworkPlan = {
    ...existing,
    target: structuredClone(target),
    status: getNetworkPlanDefinition(existing.definitionId).targetKind === 'at-war-enemy-city' ? 'preparing' : 'active',
    nextResolutionTurn: state.turn,
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

export function cancelNetworkPlan(state: GameState, ownerCivId: string, planId: string): NetworkPlanMutationResult {
  const plan = state.autonomyByCiv?.[ownerCivId]?.plans[planId];
  if (!plan) return { state, validation: { ok: false, reason: 'missing-plan' }, plan: null };
  return { state: stateWithoutPlan(state, ownerCivId, planId), validation: { ok: true }, plan: null };
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
    const validation = validateNetworkPlanAssignment(withoutPlan, requestForPlan(plan, ownerCivId, plan.target), { allowDuringRecovery: true });
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
  let nextState = cancelInvalidNetworkPlans(state).state;
  const warnings: NetworkTurnStartResult['warnings'] = [];
  const candidates = Object.entries(nextState.autonomyByCiv ?? {})
    .flatMap(([ownerCivId, autonomy]) => Object.values(autonomy.plans)
      .map(plan => ({ ownerCivId, plan })))
    .filter(({ plan }) => plan.definitionId === 'exploit'
      && plan.status === 'preparing'
      && plan.warnedTurn === null
      && plan.nextResolutionTurn <= nextState.turn
      && plan.target.kind === 'city'
      && nextState.cities[plan.target.cityId]?.owner === victimCivId)
    .sort((left, right) => left.plan.id.localeCompare(right.plan.id));

  for (const { ownerCivId, plan } of candidates) {
    const autonomy = nextState.autonomyByCiv![ownerCivId];
    const warnedPlan: NetworkPlan = { ...plan, status: 'active', warnedTurn: nextState.turn };
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
  let nextState = cancelInvalidNetworkPlans(state).state;
  const creditsByOwner: Record<string, number> = {};
  const events: NetworkEffectEvent[] = [];
  const planIds = Object.values(nextState.autonomyByCiv ?? {})
    .flatMap(autonomy => Object.values(autonomy.plans))
    .filter(plan => plan.definitionId === 'exploit'
      && plan.status === 'active'
      && plan.warnedTurn === nextState.turn
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
    const ownerAutonomy = resolution.state.autonomyByCiv?.[plan.ownerCivId];
    const resolvedPlan = ownerAutonomy?.plans[planId];
    nextState = resolvedPlan ? {
      ...resolution.state,
      autonomyByCiv: {
        ...resolution.state.autonomyByCiv,
        [plan.ownerCivId]: {
          ...ownerAutonomy,
          plans: {
            ...ownerAutonomy!.plans,
            [planId]: {
              ...resolvedPlan,
              status: 'preparing',
              warnedTurn: null,
              nextResolutionTurn: nextState.turn + 1,
            },
          },
        },
      },
    } : resolution.state;
    for (const [ownerCivId, credits] of Object.entries(resolution.creditsByOwner)) {
      creditsByOwner[ownerCivId] = (creditsByOwner[ownerCivId] ?? 0) + credits;
    }
    events.push(...resolution.events);
  }
  return { state: nextState, creditsByOwner, events };
}
