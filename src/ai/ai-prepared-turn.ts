import type { EventBus } from '@/core/event-bus';
import type {
  AIStrategicPlan,
  GameMap,
  GameState,
  MajorCivPlanPortfolio,
} from '@/core/types';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { getTrainableUnitsForCiv, TRAINABLE_UNITS } from '@/systems/city-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { isTrustedObservedLastSeenTile } from '@/systems/last-seen-presentation';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import {
  buildMajorCivPerception,
  estimatePerceivedCivStrength,
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
import { isAIHostileOwner } from './ai-hostility';

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

export interface PreparedForceDemandSeed {
  role: AIForceDemand['role'];
  sourceId: string;
  priority: number;
}

export function mergePreparedForceDemands(
  assignmentDemands: readonly AIForceDemand[],
  additionalDemands: readonly PreparedForceDemandSeed[],
): AIForceDemand[] {
  const byRole = new Map(assignmentDemands.map(demand => [
    demand.role,
    {
      ...demand,
      sourcePlanIds: [...demand.sourcePlanIds],
    },
  ]));
  for (const addition of additionalDemands) {
    const existing = byRole.get(addition.role) ?? {
      role: addition.role,
      desired: 0,
      assigned: 0,
      missing: 0,
      priority: 0,
      sourcePlanIds: [],
    };
    existing.desired += 1;
    existing.missing = Math.max(0, existing.desired - existing.assigned);
    existing.priority = Math.max(existing.priority, addition.priority);
    existing.sourcePlanIds = [...new Set([
      ...existing.sourcePlanIds,
      addition.sourceId,
    ])].sort();
    byRole.set(addition.role, existing);
  }
  return [...byRole.values()].sort((left, right) =>
    right.priority - left.priority || left.role.localeCompare(right.role));
}

function distance(
  state: Readonly<GameState>,
  left: { q: number; r: number },
  right: { q: number; r: number },
): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(left, right, state.map.width)
    : hexDistance(left, right);
}

function buildKnownPathMap(
  state: Readonly<GameState>,
  civId: string,
): GameMap {
  const actor = state.civilizations[civId];
  const knownMap = structuredClone(state.map);
  if (!actor) {
    knownMap.tiles = {};
    return knownMap;
  }
  for (const key of Object.keys(knownMap.tiles)) {
    const visibility = actor.visibility.tiles[key] ?? 'unexplored';
    if (visibility === 'visible') continue;
    const snapshot = actor.visibility.lastSeen?.[key];
    if (visibility !== 'fog' || !isTrustedObservedLastSeenTile(snapshot)) {
      delete knownMap.tiles[key];
      continue;
    }
    knownMap.tiles[key] = {
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
  return knownMap;
}

function objectiveCandidates(
  state: Readonly<GameState>,
  civId: string,
  perception: MajorCivPerception,
  knownMap: GameMap,
): AIObjectiveCandidate[] {
  const actor = state.civilizations[civId];
  const operationalAnchors = perception.ownCities.length > 0
    ? perception.ownCities.map(city => city.position)
    : perception.ownUnits
        .filter(unit => !unit.transportId)
        .map(unit => unit.position);
  if (!actor || operationalAnchors.length === 0) return [];
  const nearestAnchor = (target: { q: number; r: number }) =>
    [...operationalAnchors].sort((left, right) =>
      distance(state, left, target) - distance(state, right, target)
      || hexKey(left).localeCompare(hexKey(right)))[0];

  const candidates: AIObjectiveCandidate[] = [];
  const startByCandidate = new Map<AIObjectiveCandidate, { q: number; r: number }>();
  const actorEra = resolveCivilizationEra(actor.techState.completed);
  const ownStrength = estimatePerceivedCivStrength(perception, civId, actorEra).midpoint;
  for (const city of perception.knownCities) {
    if (!city.position || city.owner === civId) continue;
    const anchor = nearestAnchor(city.position);
    const travelTurns = Math.ceil(distance(state, anchor, city.position) / 2);
    const recentAttack = actor.diplomacy.events.some(event =>
      event.type === 'military_attacked'
      && event.otherCiv === city.owner
      && state.turn - event.turn <= 6);
    const activeWar = actor.diplomacy.atWarWith.includes(city.owner);
    if (!activeWar && !recentAttack) continue;
    const rivalStrength = estimatePerceivedCivStrength(
      perception,
      city.owner,
      actorEra,
    ).midpoint;
    const candidate: AIObjectiveCandidate = {
      objective: 'capture',
      target: {
        kind: 'city',
        id: city.id,
        lastKnownPosition: { ...city.position },
      },
      theaterId: `local:${city.position.q},${city.position.r}`,
      travelTurns,
      strategicValue: activeWar ? 75 : 45,
      expectedLossRatio: Math.min(2, rivalStrength / Math.max(1, ownStrength)),
      supplyDistance: travelTurns,
      explicitDistantReasons: recentAttack
        ? ['retaliate-recent-attack']
        : activeWar
          ? ['continue-active-war']
          : [],
      requiredRoles: { frontline: 1, capture: 1 },
    };
    candidates.push(candidate);
    startByCandidate.set(candidate, anchor);
  }
  for (const resource of perception.knownResources.filter(entry =>
    entry.owner === null
    || (
      entry.owner !== civId
      && actor.diplomacy.atWarWith.includes(entry.owner)
    ))) {
    const anchor = nearestAnchor(resource.position);
    const travelTurns = Math.ceil(distance(state, anchor, resource.position) / 3);
    const candidate: AIObjectiveCandidate = {
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
    };
    candidates.push(candidate);
    startByCandidate.set(candidate, anchor);
  }
  const travelInputs: AIObjectiveTravelCandidate[] = candidates.map(candidate => {
    const { travelTurns: _travelTurns, ...withoutTravel } = candidate;
    return {
      ...withoutTravel,
      start: { ...startByCandidate.get(candidate)! },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: [...actor.techState.completed].sort().join(','),
    };
  });
  return resolveObjectiveTravelCandidates(knownMap, travelInputs);
}

function planTargetPosition(plan: AIStrategicPlan): { q: number; r: number } {
  if ('lastKnownPosition' in plan.target) return plan.target.lastKnownPosition;
  return plan.target.kind === 'resource'
    ? plan.target.position
    : plan.target.anchor;
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
  const eligibleIds = new Set(choice.eligibleCandidateIds);
  return candidates.flatMap(candidate => {
    const id = `${candidate.objective}:${targetStableKey(candidate.target)}`;
    if (!eligibleIds.has(id)) return [];
    const selected = choice.plan
      && candidate.objective === choice.plan.objective
      && targetStableKey(candidate.target) === targetStableKey(choice.plan.target);
    return [{
      objective: candidate.objective,
      target: candidate.target,
      theaterId: candidate.theaterId,
      score: scoreObjectiveCandidate(candidate),
      reasonCodes: selected
        ? [...choice.plan!.reasonCodes]
        : candidate.explicitDistantReasons.length > 0
          ? [...candidate.explicitDistantReasons]
          : ['nearby-opportunity'],
      requiredRoles: { ...candidate.requiredRoles },
      commitment: 0.25,
      targetValid: Number.isFinite(candidate.travelTurns),
      reasonValid: true,
      expectedLossRatio: candidate.expectedLossRatio,
      progress: false,
    }];
  });
}

function cityThreats(
  state: Readonly<GameState>,
  civId: string,
  perception: MajorCivPerception,
): AICityThreat[] {
  const actor = state.civilizations[civId];
  if (!actor) return [];
  return perception.ownCities.flatMap((city, index) => {
    const hostile = perception.units
      .filter(unit =>
        unit.position
        && isAIHostileOwner(state, civId, unit.owner)
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
        && state.turn - event.turn <= 1
        && hostile.turns <= 6),
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
  const actorEra = resolveCivilizationEra(civ.techState.completed);
  const perception = buildMajorCivPerception(state, civId);
  const knownMap = buildKnownPathMap(state, civId);
  const candidates = objectiveCandidates(state, civId, perception, knownMap);
  const choice = choosePrimaryObjective({
    actorId: civId,
    turn: state.turn,
    candidates,
    availableRoles: availableRoleCounts(perception),
  });
  const previous = state.opponentAI?.majorCivs[civId] ?? createEmptyMajorCivPortfolio();
  const trainable = getTrainableUnitsForCiv(
    civ.techState.completed,
    civ.civType,
    getCivAvailableResources(state, civId),
  );
  const bestTrainableStrength = Math.max(
    0,
    ...trainable.map(entry => UNIT_DEFINITIONS[entry.type].strength),
  );
  const deployedCombat = perception.ownUnits.filter(unit => hasAICombatRole(unit.type));
  const obsoleteTypes = new Set(
    TRAINABLE_UNITS
      .filter(entry =>
        entry.obsoletedByTech
        && civ.techState.completed.includes(entry.obsoletedByTech))
      .map(entry => entry.type),
  );
  const threats = cityThreats(state, civId, perception);
  const portfolioResult = refreshMajorCivPortfolio({
    actorId: civId,
    turn: state.turn,
    actorEliminated: civ.isEliminated === true,
    portfolio: previous,
    candidates: planCandidates(candidates, choice),
    cityThreats: threats,
    modernization: {
      bestTrainableStrength,
      deployedStrength: Math.max(
        0,
        ...deployedCombat.map(unit => UNIT_DEFINITIONS[unit.type].strength),
      ),
      actorEra,
      globalEra: state.era,
      knownRivalMaxStrength: Math.max(
        0,
        ...perception.units
          .filter(unit => unit.type)
          .map(unit => UNIT_DEFINITIONS[unit.type!].strength),
      ),
      obsoleteUnitShare: deployedCombat.length > 0
        ? deployedCombat.filter(unit => obsoleteTypes.has(unit.type)).length / deployedCombat.length
        : 0,
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
      travelTurnsByPlanId: Object.fromEntries(plans.map(plan => {
        const path = findPath(
          unit.position,
          plan.rallyPoint ?? planTargetPosition(plan),
          knownMap,
          UNIT_DEFINITIONS[unit.type].domain ?? 'land',
          { unit, completedTechs: civ.techState.completed },
        );
        return [
          plan.id,
          path
            ? Math.ceil(
                Math.max(0, path.length - 1)
                / Math.max(1, UNIT_DEFINITIONS[unit.type].movementPoints),
              )
            : Number.POSITIVE_INFINITY,
        ];
      })),
    })),
    profile: { maxPrimaryForce: 8, retreatHealthPercent: 30 },
    defenseThreatScoreByPlanId: Object.fromEntries(
      Object.values(portfolioResult.portfolio.defensePlansByCityId)
        .map(plan => {
          const cityId = plan.target.kind === 'city' ? plan.target.id : '';
          return [
            plan.id,
            threats.find(threat => threat.cityId === cityId)?.captureRisk ?? 0,
          ];
        }),
    ),
    eliminationDefensePlanIds: perception.ownCities.length === 1
      ? Object.values(portfolioResult.portfolio.defensePlansByCityId).map(plan => plan.id)
      : [],
    onlyImmediateDefenderUnitIds: perception.ownCities.length === 1
      && Object.keys(portfolioResult.portfolio.defensePlansByCityId).length > 0
      && deployedCombat.length === 1
      ? [deployedCombat[0].id]
      : [],
    requiresEmbarkationByPlanId: {},
  });
  const forceDemands = mergePreparedForceDemands(
    assignments.forceDemands,
    [
      ...choice.demands.map(role => ({
        role,
        sourceId: 'objective-readiness',
        priority: 90,
      })),
      ...portfolioResult.unplannedDefenseCityIds.map(cityId => ({
        role: 'frontline' as const,
        sourceId: `defense-overflow:${cityId}`,
        priority: 600,
      })),
    ],
  );
  const preparedAssignments = {
    ...assignments,
    forceDemands,
  };

  return {
    civId,
    perception,
    portfolio: preparedAssignments.portfolio,
    assignments: preparedAssignments,
    forceDemands,
    traces: [choice.trace],
  };
}
