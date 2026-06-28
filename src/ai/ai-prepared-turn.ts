import type { EventBus } from '@/core/event-bus';
import type { GameState, MajorCivPlanPortfolio } from '@/core/types';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { getTrainableUnitsForCiv } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import {
  buildMajorCivPerception,
  type MajorCivPerception,
} from './ai-perception';
import type { AIDecisionTrace } from './ai-decision-trace';
import {
  assignUnitsToPortfolio,
  type AIForceDemand,
  type AIUnitAssignmentResult,
} from './ai-unit-assignment';
import {
  choosePrimaryObjective,
  resolveObjectiveTravelCandidates,
  scoreObjectiveCandidate,
  targetStableKey,
  type AIObjectiveCandidate,
  type AIObjectiveChoice,
  type AIObjectiveTravelCandidate,
} from './ai-objective-scoring';
import {
  createEmptyMajorCivPortfolio,
  refreshMajorCivPortfolio,
  type AICityThreat,
  type AIPlanCandidate,
} from './ai-plan-portfolio';
import { getAIStrategicRoles, hasAICombatRole } from './ai-unit-roles';

export interface PreparedMajorCivPlan {
  civId: string;
  perception: MajorCivPerception;
  portfolio: MajorCivPlanPortfolio;
  assignments: AIUnitAssignmentResult;
  forceDemands: AIForceDemand[];
  traces: AIDecisionTrace[];
}

export interface ProcessMajorCivStrategicTurnResult {
  state: GameState;
}

export type PrepareMajorCivPlan = (
  planningSnapshot: Readonly<GameState>,
  civId: string,
) => PreparedMajorCivPlan;

export type ExecutePreparedMajorCivPlan = (
  latestState: GameState,
  prepared: PreparedMajorCivPlan,
  bus: EventBus,
) => ProcessMajorCivStrategicTurnResult;

function distance(
  state: Readonly<GameState>,
  left: { q: number; r: number },
  right: { q: number; r: number },
): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(left, right, state.map.width)
    : hexDistance(left, right);
}

function objectiveCandidates(
  state: Readonly<GameState>,
  civId: string,
  perception: MajorCivPerception,
): AIObjectiveCandidate[] {
  const actor = state.civilizations[civId];
  const anchor = perception.ownCities[0]?.position ?? perception.ownUnits[0]?.position;
  if (!actor || !anchor) return [];

  const candidates: AIObjectiveCandidate[] = [];
  for (const city of perception.knownCities) {
    if (!city.position || city.owner === civId) continue;
    const travelTurns = Math.ceil(distance(state, anchor, city.position) / 2);
    const recentAttack = actor.diplomacy.events.some(event =>
      event.type === 'military_attacked'
      && event.otherCiv === city.owner
      && state.turn - event.turn <= 6);
    const activeWar = actor.diplomacy.atWarWith.includes(city.owner);
    candidates.push({
      objective: 'capture',
      target: {
        kind: 'city',
        id: city.id,
        lastKnownPosition: { ...city.position },
      },
      theaterId: `local:${city.position.q},${city.position.r}`,
      travelTurns,
      strategicValue: activeWar ? 75 : 45,
      expectedLossRatio: 0.75,
      supplyDistance: travelTurns,
      explicitDistantReasons: recentAttack
        ? ['retaliate-recent-attack']
        : activeWar
          ? ['continue-active-war']
          : [],
      requiredRoles: { frontline: 1, capture: 1 },
    });
  }
  for (const resource of perception.knownResources.filter(entry => entry.owner !== civId)) {
    const travelTurns = Math.ceil(distance(state, anchor, resource.position) / 3);
    candidates.push({
      objective: 'secure-resource',
      target: {
        kind: 'resource',
        resource: resource.resource,
        position: { ...resource.position },
      },
      theaterId: `local:${resource.position.q},${resource.position.r}`,
      travelTurns,
      strategicValue: 55,
      expectedLossRatio: 0,
      supplyDistance: travelTurns,
      explicitDistantReasons: [],
      requiredRoles: { 'resource-expedition': 1 },
    });
  }
  const knownMap = structuredClone(state.map);
  for (const key of Object.keys(knownMap.tiles)) {
    const visibility = actor.visibility.tiles[key] ?? 'unexplored';
    if (visibility === 'visible') continue;
    const snapshot = actor.visibility.lastSeen?.[key];
    if (
      visibility !== 'fog'
      || snapshot?.source !== 'observed'
      || !Number.isFinite(snapshot.observedTurn)
    ) {
      delete knownMap.tiles[key];
      continue;
    }
    knownMap.tiles[key] = {
      ...knownMap.tiles[key],
      coord: { ...snapshot.coord },
      terrain: snapshot.terrain,
      elevation: snapshot.elevation,
      resource: snapshot.resource,
      improvement: snapshot.improvement,
      improvementTurnsLeft: snapshot.improvementTurnsLeft,
      owner: snapshot.owner,
      hasRiver: snapshot.hasRiver,
      wonder: snapshot.wonder,
    };
  }
  const travelInputs: AIObjectiveTravelCandidate[] = candidates.map(candidate => {
    const { travelTurns: _travelTurns, ...withoutTravel } = candidate;
    return {
      ...withoutTravel,
      start: { ...anchor },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: [...actor.techState.completed].sort().join(','),
    };
  });
  return resolveObjectiveTravelCandidates(knownMap, travelInputs);
}

function availableRoleCounts(perception: MajorCivPerception) {
  const counts: Partial<Record<ReturnType<typeof getAIStrategicRoles>[number], number>> = {};
  for (const unit of perception.ownUnits) {
    if (unit.transportId) continue;
    for (const role of getAIStrategicRoles(unit.type)) {
      counts[role] = (counts[role] ?? 0) + 1;
    }
  }
  return counts;
}

function planCandidates(
  candidates: readonly AIObjectiveCandidate[],
  choice: AIObjectiveChoice,
): AIPlanCandidate[] {
  if (!choice.plan) return [];
  const selected = candidates.find(candidate =>
    candidate.objective === choice.plan!.objective
    && targetStableKey(candidate.target) === targetStableKey(choice.plan!.target));
  if (!selected) return [];
  return [{
    objective: selected.objective,
    target: selected.target,
    theaterId: selected.theaterId,
    score: scoreObjectiveCandidate(selected),
    reasonCodes: [...choice.plan.reasonCodes],
    requiredRoles: { ...selected.requiredRoles },
    commitment: 0.25,
    targetValid: Number.isFinite(selected.travelTurns),
    reasonValid: true,
    expectedLossRatio: selected.expectedLossRatio,
    progress: false,
  }];
}

function cityThreats(
  state: Readonly<GameState>,
  civId: string,
  perception: MajorCivPerception,
): AICityThreat[] {
  const actor = state.civilizations[civId];
  if (!actor) return [];
  const atWar = new Set(actor.diplomacy.atWarWith);
  return perception.ownCities.flatMap((city, index) => {
    const hostile = perception.units
      .filter(unit =>
        unit.position
        && atWar.has(unit.owner)
        && unit.type
        && hasAICombatRole(unit.type))
      .map(unit => ({
        unit,
        turns: Math.ceil(distance(state, city.position, unit.position!) / 2),
      }))
      .sort((left, right) => left.turns - right.turns)[0];
    if (!hostile) return [];
    return [{
      cityId: city.id,
      position: { ...city.position },
      theaterId: `local:${city.position.q},${city.position.r}`,
      travelTurns: hostile.turns,
      alreadyAttackedTerritory: actor.diplomacy.events.some(event =>
        event.type === 'military_attacked'
        && event.otherCiv === hostile.unit.owner
        && state.turn - event.turn <= 1),
      captureRisk: Math.max(0, 100 - hostile.turns * 20),
      hostileStrength: hostile.unit.type
        ? UNIT_DEFINITIONS[hostile.unit.type].strength
        : 0,
      isCapital: index === 0,
      isLastCity: perception.ownCities.length === 1,
      threatStillValid: hostile.unit.confidence !== 'rumored',
    }];
  });
}

export function prepareMajorCivStrategicPlan(
  planningSnapshot: Readonly<GameState>,
  civId: string,
): PreparedMajorCivPlan {
  const state = planningSnapshot as GameState;
  const civ = state.civilizations[civId];
  const perception = buildMajorCivPerception(state, civId);
  const candidates = objectiveCandidates(state, civId, perception);
  const choice = choosePrimaryObjective({
    actorId: civId,
    turn: state.turn,
    candidates,
    availableRoles: availableRoleCounts(perception),
  });
  const previous = state.opponentAI?.majorCivs[civId] ?? createEmptyMajorCivPortfolio();
  const trainable = getTrainableUnitsForCiv(civ.techState.completed, civ.civType);
  const bestTrainableStrength = Math.max(
    0,
    ...trainable.map(entry => UNIT_DEFINITIONS[entry.type].strength),
  );
  const deployedCombat = perception.ownUnits.filter(unit => hasAICombatRole(unit.type));
  const portfolioResult = refreshMajorCivPortfolio({
    actorId: civId,
    turn: state.turn,
    actorEliminated: civ.isEliminated === true,
    portfolio: previous,
    candidates: planCandidates(candidates, choice),
    cityThreats: cityThreats(state, civId, perception),
    modernization: {
      bestTrainableStrength,
      deployedStrength: Math.max(
        0,
        ...deployedCombat.map(unit => UNIT_DEFINITIONS[unit.type].strength),
      ),
      actorEra: state.era,
      globalEra: state.era,
      knownRivalMaxStrength: Math.max(
        0,
        ...perception.units
          .filter(unit => unit.type)
          .map(unit => UNIT_DEFINITIONS[unit.type!].strength),
      ),
      obsoleteUnitShare: 0,
      treasuryCanAct: civ.gold > 0,
    },
  });
  const plans = [
    ...Object.values(portfolioResult.portfolio.defensePlansByCityId),
    ...(portfolioResult.portfolio.primaryPlan ? [portfolioResult.portfolio.primaryPlan] : []),
  ];
  const assignments = assignUnitsToPortfolio({
    portfolio: portfolioResult.portfolio,
    units: perception.ownUnits.map(unit => ({
      id: unit.id,
      type: unit.type,
      health: unit.health,
      experience: unit.experience,
      embarked: Boolean(unit.transportId),
      activeOtherDuty: Boolean(unit.workerTask || unit.committedToRouteId),
      travelTurnsByPlanId: Object.fromEntries(plans.map(plan => [
        plan.id,
        Math.ceil(distance(
          state,
          unit.position,
          plan.rallyPoint
            ?? ('lastKnownPosition' in plan.target
              ? plan.target.lastKnownPosition
              : plan.target.kind === 'resource'
                ? plan.target.position
                : plan.target.anchor),
        ) / Math.max(1, UNIT_DEFINITIONS[unit.type].movementPoints)),
      ])),
    })),
    profile: { maxPrimaryForce: 8, retreatHealthPercent: 30 },
    defenseThreatScoreByPlanId: Object.fromEntries(
      Object.values(portfolioResult.portfolio.defensePlansByCityId)
        .map(plan => [plan.id, 100]),
    ),
    eliminationDefensePlanIds: perception.ownCities.length === 1
      ? Object.values(portfolioResult.portfolio.defensePlansByCityId).map(plan => plan.id)
      : [],
    onlyImmediateDefenderUnitIds: [],
    requiresEmbarkationByPlanId: {},
  });

  return {
    civId,
    perception,
    portfolio: assignments.portfolio,
    assignments,
    forceDemands: assignments.forceDemands,
    traces: [choice.trace],
  };
}
