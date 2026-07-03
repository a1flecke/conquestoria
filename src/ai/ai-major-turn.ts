import type { EventBus } from '@/core/event-bus';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import {
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
} from '@/core/opponent-challenge';
import type {
  AIStrategicPlan,
  CombatResult,
  GameState,
  Unit,
} from '@/core/types';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { resolveCombat } from '@/systems/combat-system';
import {
  beginMajorCityAssault,
  canUnitOccupyCity,
  emitMajorCityCaptureEvents,
  resolveMajorCityCapture,
} from '@/systems/city-capture-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getVisibility } from '@/systems/fog-of-war';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { conquestMinorCiv } from '@/systems/minor-civ-system';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import {
  canEstablishOutpost,
  performEstablishOutpost,
} from '@/systems/resource-acquisition-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import {
  loadUnitOntoTransport,
  unloadUnitFromTransport,
} from '@/systems/transport-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import {
  buildUnitOccupancy,
  getUnitIdsAtCoord,
  hasHostileUnitAtCoord,
} from '@/systems/unit-occupancy';
import { restUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { applyWorkerAction } from '@/systems/worker-action-system';
import {
  createAIDecisionTrace,
  type AIDecisionTrace,
} from './ai-decision-trace';
import type { MajorCivPerception } from './ai-perception';
import type { PreparedMajorCivPlan } from './ai-prepared-turn';
import {
  chooseTacticalSequence,
  rankUnitTacticalActions,
  type AITacticalAction,
  type AITacticalContext,
} from './ai-tactics';
import { getAIStrategicRoles } from './ai-unit-roles';

export interface ProcessMajorCivStrategicTurnResult {
  state: GameState;
  actions: AITacticalAction[];
  traces: AIDecisionTrace[];
}

function distance(
  state: GameState,
  from: { q: number; r: number },
  to: { q: number; r: number },
): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

function targetPosition(plan: AIStrategicPlan) {
  if ('lastKnownPosition' in plan.target) return plan.target.lastKnownPosition;
  return plan.target.kind === 'resource'
    ? plan.target.position
    : plan.target.anchor;
}

function deterministicCombatSeed(
  state: GameState,
  attackerId: string,
  defenderId: string,
): number {
  const source = [
    state.gameId ?? 'legacy',
    state.turn,
    attackerId,
    defenderId,
  ].join(':');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.max(1, hash >>> 0);
}

function combatContext(state: GameState, attacker: Unit, defender: Unit) {
  const defenderKey = hexKey(defender.position);
  return {
    attackerBonus: resolveCivDefinition(
      state,
      state.civilizations[attacker.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderBonus: resolveCivDefinition(
      state,
      state.civilizations[defender.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderCityHasAntiAir: Object.values(state.cities).some(city =>
      hexKey(city.position) === defenderKey
      && city.buildings.includes('anti_air_battery')),
    attackerHasAirForceCommand: Object.values(state.cities).some(city =>
      city.owner === attacker.owner
      && city.buildings.includes('air_force_command')),
  };
}

function actionMatches(
  left: AITacticalAction,
  right: AITacticalAction,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tacticalTrace(
  context: AITacticalContext,
  action: AITacticalAction,
): AIDecisionTrace {
  const candidates = rankUnitTacticalActions(context, action.unitId);
  const selected = candidates.find(candidate =>
    actionMatches(candidate.action, action));
  return createAIDecisionTrace({
    actorId: context.actorId,
    turn: context.state.turn,
    decision: 'tactical',
    selectedId: selected?.id ?? null,
    candidates: candidates.map(candidate => ({
      id: candidate.id,
      score: candidate.score,
      eligible: true,
      reasonCodes: candidate.mandatory ? ['mandatory'] : [],
    })),
  });
}

function occupyMajorCity(
  state: GameState,
  cityId: string,
  attackerId: string,
  civId: string,
  bus: EventBus,
  precedingCombat?: CombatResult,
): { state: GameState; captured: boolean } {
  const city = state.cities[cityId];
  if (!city || !state.civilizations[city.owner]) {
    return { state, captured: false };
  }
  const previousOwnerId = city.owner;
  const assault = beginMajorCityAssault(
    state,
    attackerId,
    cityId,
    {
      actor: 'ai',
      civId,
      bus,
      precedingCombat,
    },
  );
  if (!assault.ok) return { state, captured: false };
  const capture = resolveMajorCityCapture(
    assault.state,
    cityId,
    civId,
    'occupy',
    assault.state.turn,
  );
  emitMajorCityCaptureEvents(
    state,
    capture,
    cityId,
    civId,
    previousOwnerId,
    bus,
  );
  return { state: capture.state, captured: true };
}

function executeAttack(
  state: GameState,
  action: Extract<AITacticalAction, { kind: 'attack' }>,
  civId: string,
  bus: EventBus,
): { state: GameState; followUps: AITacticalAction[] } {
  const next = structuredClone(state);
  const attacker = next.units[action.unitId];
  const defender = next.units[action.targetUnitId];
  if (!attacker || !defender || attacker.owner !== civId) {
    return { state, followUps: [] };
  }
  const legality = canUnitAttackTarget(
    next,
    attacker,
    defender.position,
    { viewerId: civId, requireVisibility: true },
  );
  if (
    !legality.ok
    || legality.targetType !== 'unit'
    || legality.targetUnitId !== defender.id
  ) {
    return { state, followUps: [] };
  }

  const seed = deterministicCombatSeed(next, attacker.id, defender.id);
  const combat = resolveCombat(
    attacker,
    defender,
    next.map,
    seed,
    combatContext(next, attacker, defender),
    next.era,
  );
  const presentation = buildCombatPresentation(next, combat, attacker, defender);
  const applied = applyCombatOutcomeToState(next, combat, seed);
  let working = recordCombatForCiv(
    applied.state,
    civId,
    defender.position,
  );
  emitMinorCivQuestTransitions(bus, applied.questTransitions, working);
  bus.emit('combat:resolved', { result: combat, ...presentation });
  for (const reward of applied.rewards) {
    bus.emit('combat:reward-earned', { reward });
  }

  const followUps: AITacticalAction[] = [];
  if (applied.defenderDefeated) {
    const camp = applyCampDestructionAtTarget(
      working,
      civId,
      defender.position,
      working.turn,
    );
    if (camp.campId) {
      working = camp.state;
      emitMinorCivQuestTransitions(bus, camp.questTransitions, working);
      bus.emit('barbarian:camp-destroyed', {
        campId: camp.campId,
        reward: camp.reward,
      });
    }

    const city = Object.values(working.cities).find(candidate =>
      hexKey(candidate.position) === hexKey(defender.position)
      && candidate.owner !== civId);
    const attackerAfterCombat = working.units[attacker.id];
    const occupancy = buildUnitOccupancy(working.units);
    if (
      city
      && attackerAfterCombat
      && !hasHostileUnitAtCoord(occupancy, city.position, civId)
      && working.civilizations[city.owner]
    ) {
      const capture = occupyMajorCity(
        working,
        city.id,
        attacker.id,
        civId,
        bus,
        combat,
      );
      if (capture.captured) {
        working = capture.state;
        followUps.push({
          kind: 'capture-city',
          unitId: attacker.id,
          cityId: city.id,
        });
      }
    }
  }
  return { state: working, followUps };
}

function executeMinorCityCapture(
  state: GameState,
  action: Extract<AITacticalAction, { kind: 'capture-city' }>,
  civId: string,
  bus: EventBus,
): { state: GameState; succeeded: boolean } {
  const city = state.cities[action.cityId];
  const attacker = state.units[action.unitId];
  if (
    !city
    || !city.owner.startsWith('mc-')
    || !isMinorCivAtWar(state, civId, city.owner)
    || !attacker
    || attacker.owner !== civId
    || !canUnitOccupyCity(attacker)
    || distance(state, attacker.position, city.position) !== 1
    || getUnitIdsAtCoord(
      buildUnitOccupancy(state.units),
      city.position,
    ).length > 0
  ) {
    return { state, succeeded: false };
  }
  const next = structuredClone(state);
  const movement = executeUnitMove(
    next,
    action.unitId,
    city.position,
    {
      actor: 'ai',
      civId,
      bus,
      foreignCityEntryId: city.id,
    },
  );
  if (!movement.ok) return { state, succeeded: false };
  const conquest = conquestMinorCiv(next, city.owner, civId);
  if (!conquest.conquered) return { state, succeeded: false };
  emitMinorCivQuestTransitions(bus, conquest.transitions, conquest.state);
  bus.emit('minor-civ:destroyed', {
    minorCivId: city.owner,
    conquerorId: civId,
  });
  return { state: conquest.state, succeeded: true };
}

function executeAction(
  state: GameState,
  action: AITacticalAction,
  civId: string,
  bus: EventBus,
): {
  state: GameState;
  succeeded: boolean;
  followUps: AITacticalAction[];
} {
  switch (action.kind) {
    case 'attack': {
      const attack = executeAttack(state, action, civId, bus);
      return {
        state: attack.state,
        succeeded: attack.state !== state,
        followUps: attack.followUps,
      };
    }
    case 'capture-city': {
      const city = state.cities[action.cityId];
      if (city?.owner.startsWith('mc-')) {
        const capture = executeMinorCityCapture(state, action, civId, bus);
        return { ...capture, followUps: [] };
      }
      const capture = occupyMajorCity(
        state,
        action.cityId,
        action.unitId,
        civId,
        bus,
      );
      return {
        state: capture.state,
        succeeded: capture.captured,
        followUps: [],
      };
    }
    case 'move':
    case 'withdraw': {
      const next = structuredClone(state);
      const movement = executeUnitMove(
        next,
        action.unitId,
        action.destination,
        { actor: 'ai', civId, bus },
      );
      return {
        state: movement.ok ? next : state,
        succeeded: movement.ok,
        followUps: [],
      };
    }
    case 'found-city':
      try {
        return {
          state: foundCityInState(state, action.unitId, bus).state,
          succeeded: true,
          followUps: [],
        };
      } catch {
        return { state, succeeded: false, followUps: [] };
      }
    case 'establish-outpost':
      return canEstablishOutpost(state, action.unitId)
        ? {
            state: performEstablishOutpost(state, action.unitId),
            succeeded: true,
            followUps: [],
          }
        : { state, succeeded: false, followUps: [] };
    case 'worker-action': {
      const result = applyWorkerAction(state, action.unitId, action.action);
      if (!result.ok) return { state, succeeded: false, followUps: [] };
      for (const event of result.events) {
        if (event.type === 'improvement:started') {
          bus.emit('improvement:started', event.payload);
        } else {
          bus.emit('unit:destroyed', event.payload);
        }
      }
      return { state: result.state, succeeded: true, followUps: [] };
    }
    case 'load': {
      const result = loadUnitOntoTransport(
        state,
        action.unitId,
        action.transportId,
      );
      return {
        state: result.ok ? result.state : state,
        succeeded: result.ok,
        followUps: [],
      };
    }
    case 'unload': {
      const cargo = state.units[action.unitId];
      if (!cargo?.transportId) {
        return { state, succeeded: false, followUps: [] };
      }
      const result = unloadUnitFromTransport(
        state,
        cargo.transportId,
        action.unitId,
        action.destination,
      );
      return {
        state: result.ok ? result.state : state,
        succeeded: result.ok,
        followUps: [],
      };
    }
    case 'rest': {
      const unit = state.units[action.unitId];
      if (!unit || unit.owner !== civId || unit.hasActed) {
        return { state, succeeded: false, followUps: [] };
      }
      return {
        state: {
          ...state,
          units: {
            ...state.units,
            [unit.id]: restUnit(unit),
          },
        },
        succeeded: true,
        followUps: [],
      };
    }
    case 'hold': {
      const unit = state.units[action.unitId];
      if (!unit || unit.owner !== civId) {
        return { state, succeeded: false, followUps: [] };
      }
      return {
        state: {
          ...state,
          units: {
            ...state.units,
            [unit.id]: {
              ...unit,
              hasActed: true,
              movementPointsLeft: 0,
            },
          },
        },
        succeeded: true,
        followUps: [],
      };
    }
  }
}

function hasRequiredRoles(
  state: GameState,
  plan: AIStrategicPlan,
  assignedUnitIds: readonly string[],
): boolean {
  const counts = new Map<string, number>();
  for (const unitId of assignedUnitIds) {
    const unit = state.units[unitId];
    if (!unit || unit.owner !== plan.actorId) continue;
    for (const role of getAIStrategicRoles(unit.type)) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return Object.entries(plan.requiredRoles).every(([role, desired]) =>
    (counts.get(role) ?? 0) >= (desired ?? 0));
}

function hasCaptureOrFrontline(
  state: GameState,
  assignedUnitIds: readonly string[],
): boolean {
  return assignedUnitIds.some(unitId => {
    const unit = state.units[unitId];
    if (!unit) return false;
    const roles = getAIStrategicRoles(unit.type);
    return roles.includes('capture') || roles.includes('frontline');
  });
}

function targetStillValid(
  state: GameState,
  plan: AIStrategicPlan,
): boolean {
  switch (plan.target.kind) {
    case 'city': {
      const city = state.cities[plan.target.id];
      if (!city) return false;
      if (plan.objective === 'capture') {
        return city.owner !== plan.actorId || plan.phase === 'consolidating';
      }
      if (plan.objective === 'repel') return city.owner === plan.actorId;
      return true;
    }
    case 'unit':
      return Boolean(state.units[plan.target.id]);
    case 'camp':
      return Boolean(state.barbarianCamps[plan.target.id]);
    case 'resource':
      return state.map.tiles[hexKey(plan.target.position)]?.resource
        === plan.target.resource;
    case 'region':
      return Boolean(state.map.tiles[hexKey(plan.target.anchor)]);
  }
}

function isHostileOwner(
  state: GameState,
  actorId: string,
  ownerId: string,
): boolean {
  if (ownerId === actorId) return false;
  if (isAlwaysHostilePair(actorId, ownerId)) return true;
  if (ownerId.startsWith('mc-')) {
    return isMinorCivAtWar(state, actorId, ownerId);
  }
  return state.civilizations[actorId]?.diplomacy.atWarWith
    .includes(ownerId) ?? false;
}

function hasVisibleLocalCounterattack(
  state: GameState,
  plan: AIStrategicPlan,
): boolean {
  const visibility = state.civilizations[plan.actorId]?.visibility;
  const target = targetPosition(plan);
  return Object.values(state.units).some(unit =>
    !unit.transportId
    && isHostileOwner(state, plan.actorId, unit.owner)
    && getVisibility(visibility, unit.position) === 'visible'
    && UNIT_DEFINITIONS[unit.type].strength > 0
    && distance(state, unit.position, target) <= 4);
}

function isOffensivePlan(plan: AIStrategicPlan): boolean {
  return plan.objective === 'capture'
    || plan.objective === 'raid'
    || plan.objective === 'blockade';
}

function hasSufficientTargetConfidence(
  state: GameState,
  perception: MajorCivPerception,
  plan: AIStrategicPlan,
): boolean {
  const target = plan.target;
  switch (target.kind) {
    case 'city':
      return perception.knownCities.some(city =>
        city.id === target.id && city.confidence !== 'rumored');
    case 'unit':
      return perception.units.some(unit =>
        unit.id === target.id && unit.confidence !== 'rumored');
    case 'resource':
      return perception.knownResources.some(resource =>
        resource.resource === target.resource
        && hexKey(resource.position) === hexKey(target.position));
    case 'camp':
      return getVisibility(
        state.civilizations[plan.actorId]?.visibility,
        target.lastKnownPosition,
      ) !== 'unexplored';
    case 'region':
      return getVisibility(
        state.civilizations[plan.actorId]?.visibility,
        target.anchor,
      ) !== 'unexplored';
  }
}

function shouldWithdraw(
  state: GameState,
  plan: AIStrategicPlan,
  assignedUnitIds: readonly string[],
): boolean {
  const units = assignedUnitIds
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit));
  if (units.length === 0) return false;
  const profile = OPPONENT_CHALLENGE_PROFILES[
    resolveOpponentChallenge(state)
  ];
  const averageHealth = units.reduce((sum, unit) => sum + unit.health, 0)
    / units.length;
  if (averageHealth < profile.retreatHealthPercent) return true;

  const target = targetPosition(plan);
  const ownStrength = units.reduce((sum, unit) =>
    sum + UNIT_DEFINITIONS[unit.type].strength * (unit.health / 100), 0);
  const hostileStrength = Object.values(state.units)
    .filter(unit =>
      isHostileOwner(state, plan.actorId, unit.owner)
      && !unit.transportId
      && getVisibility(
        state.civilizations[plan.actorId]?.visibility,
        unit.position,
      ) === 'visible'
      && distance(state, unit.position, target) <= 4)
    .reduce((sum, unit) =>
      sum + UNIT_DEFINITIONS[unit.type].strength * (unit.health / 100), 0);
  return hostileStrength > 0 && ownStrength / hostileStrength < 0.65;
}

function nextPlanPhase(
  after: GameState,
  plan: AIStrategicPlan,
  assignedUnitIds: readonly string[],
  actions: readonly AITacticalAction[],
  perception: MajorCivPerception,
): AIStrategicPlan['phase'] {
  if (actions.some(action => action.kind === 'capture-city')) {
    return 'consolidating';
  }
  if (!targetStillValid(after, plan)) {
    if (actions.some(action => action.kind === 'attack')) {
      return isOffensivePlan(plan) ? 'consolidating' : 'complete';
    }
    return 'abandoned';
  }
  if (shouldWithdraw(after, plan, assignedUnitIds)) return 'withdrawing';
  if (
    plan.phase === 'scouting'
    && hasSufficientTargetConfidence(after, perception, plan)
  ) {
    return 'mobilizing';
  }
  if (plan.phase === 'mobilizing') {
    const profile = OPPONENT_CHALLENGE_PROFILES[
      resolveOpponentChallenge(after)
    ];
    const deadlineReached = after.turn - plan.createdTurn
      >= profile.mobilizationRounds;
    const migrationGrace = after.opponentAI?.migrationGraceRoundsRemaining ?? 0;
    if (
      migrationGrace === 0
      && hasCaptureOrFrontline(after, assignedUnitIds)
      && (hasRequiredRoles(after, plan, assignedUnitIds) || deadlineReached)
    ) {
      return 'advancing';
    }
  }
  if (
    plan.phase === 'advancing'
    && actions.some(action => action.kind === 'attack')
    && (
      (after.opponentAI?.migrationGraceRoundsRemaining ?? 0) === 0
      || !isOffensivePlan(plan)
    )
  ) {
    return 'attacking';
  }
  if (
    plan.phase === 'consolidating'
    && after.turn - plan.lastProgressTurn >= 2
    && !hasVisibleLocalCounterattack(after, plan)
  ) {
    return 'complete';
  }
  return plan.phase;
}

function actionAdvancesPlan(action: AITacticalAction): boolean {
  return action.kind !== 'hold' && action.kind !== 'rest';
}

function executionPlan(
  state: GameState,
  plan: AIStrategicPlan,
): AIStrategicPlan {
  if (
    (plan.phase === 'scouting' || plan.phase === 'mobilizing')
    && plan.rallyPoint
  ) {
    return {
      ...plan,
      objective: 'expand',
      target: {
        kind: 'region',
        id: `rally:${plan.id}`,
        anchor: { ...plan.rallyPoint },
      },
    };
  }
  if (plan.phase === 'withdrawing') {
    const nearestCity = Object.values(state.cities)
      .filter(city => city.owner === plan.actorId)
      .sort((left, right) =>
        distance(state, left.position, targetPosition(plan))
        - distance(state, right.position, targetPosition(plan))
        || left.id.localeCompare(right.id))[0];
    if (nearestCity) {
      return {
        ...plan,
        objective: 'recover',
        target: {
          kind: 'region',
          id: `withdraw:${plan.id}`,
          anchor: { ...nearestCity.position },
        },
      };
    }
  }
  return plan;
}

function writeUpdatedPlan(
  state: GameState,
  plan: AIStrategicPlan,
): GameState {
  const portfolio = state.opponentAI?.majorCivs[plan.actorId];
  if (!portfolio) return state;
  if (portfolio.primaryPlan?.id === plan.id) {
    return {
      ...state,
      opponentAI: {
        ...state.opponentAI!,
        majorCivs: {
          ...state.opponentAI!.majorCivs,
          [plan.actorId]: {
            ...portfolio,
            primaryPlan: plan,
          },
        },
      },
    };
  }
  const defenseEntry = Object.entries(portfolio.defensePlansByCityId)
    .find(([, candidate]) => candidate.id === plan.id);
  if (!defenseEntry) return state;
  return {
    ...state,
    opponentAI: {
      ...state.opponentAI!,
      majorCivs: {
        ...state.opponentAI!.majorCivs,
        [plan.actorId]: {
          ...portfolio,
          defensePlansByCityId: {
            ...portfolio.defensePlansByCityId,
            [defenseEntry[0]]: plan,
          },
        },
      },
    },
  };
}

export function processMajorCivStrategicTurn(
  state: GameState,
  prepared: PreparedMajorCivPlan,
  bus: EventBus,
): ProcessMajorCivStrategicTurnResult {
  const preparedPlans = [
    ...(prepared.portfolio.primaryPlan
      ? [prepared.portfolio.primaryPlan]
      : []),
    ...Object.values(prepared.portfolio.defensePlansByCityId),
  ];
  if (
    prepared.civId === ''
    || !state.civilizations[prepared.civId]
    || preparedPlans.some(plan => plan.actorId !== prepared.civId)
  ) {
    return { state: structuredClone(state), actions: [], traces: [] };
  }

  let working = normalizeOpponentAIState(structuredClone(state));
  working = {
    ...working,
    opponentAI: {
      ...working.opponentAI!,
      majorCivs: {
        ...working.opponentAI!.majorCivs,
        [prepared.civId]: structuredClone(prepared.portfolio),
      },
    },
  };
  const plans = [
    ...Object.values(prepared.portfolio.defensePlansByCityId)
      .sort((left, right) => left.id.localeCompare(right.id)),
    ...(prepared.portfolio.primaryPlan
      ? [prepared.portfolio.primaryPlan]
      : []),
  ];
  const appliedActions: AITacticalAction[] = [];
  const traces: AIDecisionTrace[] = [];

  for (const originalPlan of plans) {
    const requestedUnitIds = prepared.assignments
      .assignmentsByPlanId[originalPlan.id]
      ?? originalPlan.assignedUnitIds;
    const assignedUnitIds = [...new Set(requestedUnitIds)].filter(unitId =>
      working.units[unitId]?.owner === prepared.civId);
    if (!targetStillValid(working, originalPlan)) {
      working = writeUpdatedPlan(working, {
        ...originalPlan,
        phase: 'abandoned',
        assignedUnitIds: [...assignedUnitIds],
      });
      continue;
    }
    if (assignedUnitIds.length === 0) continue;
    const planActionStart = appliedActions.length;
    const tacticalPlan = executionPlan(working, originalPlan);
    const tacticalContext: AITacticalContext = {
      state: working,
      actorId: prepared.civId,
      plan: tacticalPlan,
      assignedUnitIds,
    };
    const preparingOffense = isOffensivePlan(originalPlan)
      && (
        originalPlan.phase === 'scouting'
        || originalPlan.phase === 'mobilizing'
      );
    const selectedActions = chooseTacticalSequence(tacticalContext)
      .filter(action =>
        !preparingOffense
        || action.kind !== 'attack' && action.kind !== 'capture-city');
    for (const action of selectedActions) {
      const latestContext = {
        ...tacticalContext,
        state: working,
      };
      traces.push(tacticalTrace(latestContext, action));
      const executed = executeAction(
        working,
        action,
        prepared.civId,
        bus,
      );
      if (!executed.succeeded) continue;
      working = executed.state;
      appliedActions.push(action, ...executed.followUps);
    }
    const planActions = appliedActions.slice(planActionStart);
    const phase = nextPlanPhase(
      working,
      originalPlan,
      assignedUnitIds,
      planActions,
      prepared.perception,
    );
    const madeProgress = planActions.some(actionAdvancesPlan);
    working = writeUpdatedPlan(working, {
      ...originalPlan,
      phase,
      lastProgressTurn: madeProgress
        ? working.turn
        : originalPlan.lastProgressTurn,
      assignedUnitIds: [...assignedUnitIds],
    });
  }

  return { state: working, actions: appliedActions, traces };
}
