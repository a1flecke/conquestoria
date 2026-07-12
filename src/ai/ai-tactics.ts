import type {
  AIStrategicPlan,
  GameState,
  HexCoord,
  Unit,
  WorkerActionType,
} from '@/core/types';
import {
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
} from '@/core/opponent-challenge';
import {
  canAttackByProfileOnMap,
  getAttackTargets,
  getUnitAttackProfile,
} from '@/systems/attack-targeting';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import {
  calculateCombatStrengths,
  resolveCombat,
} from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveMajorCityCapture } from '@/systems/city-capture-system';
import { calculateCityAssaultStrengths } from '@/systems/city-siege-system';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { foundCity } from '@/systems/city-system';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { getVisibility } from '@/systems/fog-of-war';
import {
  hexDistance,
  hexKey,
  wrappedHexDistance,
} from '@/systems/hex-utils';
import {
  getAvailableWorkerActions,
  getKnownTileResourceForWorkerAction,
} from '@/systems/improvement-system';
import { createRng } from '@/systems/map-generator';
import {
  canEstablishOutpost,
  performEstablishOutpost,
} from '@/systems/resource-acquisition-system';
import {
  canLoadUnitOntoTransport,
  getUnloadDestinations,
  loadUnitOntoTransport,
  syncTransportCargoPositions,
  unloadUnitFromTransport,
} from '@/systems/transport-system';
import {
  findPath,
  getMovementRange,
  UNIT_DEFINITIONS,
} from '@/systems/unit-system';
import {
  buildUnitOccupancy,
  getUnitIdsAtCoord,
} from '@/systems/unit-occupancy';
import {
  applyWorkerAction,
  getWorkerChargesRemaining,
} from '@/systems/worker-action-system';
import { chooseRoadBuilderUnit } from '@/systems/road-network';
import { canBuildRoad } from '@/systems/road-system';
import { getAIStrategicRoles, hasAICombatRole } from './ai-unit-roles';
import { isAIHostileOwner } from './ai-hostility';

export type AITacticalAction =
  | { kind: 'attack'; unitId: string; targetUnitId: string }
  | { kind: 'capture-city'; unitId: string; cityId: string }
  | { kind: 'move'; unitId: string; destination: HexCoord }
  | { kind: 'withdraw'; unitId: string; destination: HexCoord }
  | { kind: 'found-city'; unitId: string; destination: HexCoord }
  | { kind: 'establish-outpost'; unitId: string }
  | { kind: 'worker-action'; unitId: string; action: WorkerActionType }
  | { kind: 'load'; unitId: string; transportId: string }
  | { kind: 'unload'; unitId: string; destination: HexCoord }
  | { kind: 'rest'; unitId: string }
  | { kind: 'hold'; unitId: string };

export interface AITacticalContext {
  state: GameState;
  actorId: string;
  plan: AIStrategicPlan;
  assignedUnitIds: readonly string[];
  allowOffensiveActions?: boolean;
}

export interface RankedAITacticalAction {
  id: string;
  action: AITacticalAction;
  score: number;
  mandatory: boolean;
}

function distance(
  state: Pick<GameState, 'map'>,
  left: HexCoord,
  right: HexCoord,
): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(left, right, state.map.width)
    : hexDistance(left, right);
}

function targetPosition(plan: AIStrategicPlan): HexCoord {
  switch (plan.target.kind) {
    case 'city':
    case 'unit':
    case 'camp':
      return plan.target.lastKnownPosition;
    case 'resource':
      return plan.target.position;
    case 'region':
      return plan.target.anchor;
  }
}

function actionId(action: AITacticalAction): string {
  switch (action.kind) {
    case 'attack':
      return `attack:${action.unitId}:${action.targetUnitId}`;
    case 'capture-city':
      return `capture-city:${action.unitId}:${action.cityId}`;
    case 'move':
    case 'withdraw':
    case 'found-city':
    case 'unload':
      return `${action.kind}:${action.unitId}:${hexKey(action.destination)}`;
    case 'worker-action':
      return `worker-action:${action.unitId}:${action.action}`;
    case 'load':
      return `load:${action.unitId}:${action.transportId}`;
    case 'establish-outpost':
    case 'rest':
    case 'hold':
      return `${action.kind}:${action.unitId}`;
  }
}

function ranked(
  action: AITacticalAction,
  score: number,
  mandatory = false,
): RankedAITacticalAction {
  return {
    id: actionId(action),
    action,
    score: Number.isFinite(score) ? score : -Number.MAX_VALUE,
    mandatory,
  };
}

function sortRanked(
  candidates: RankedAITacticalAction[],
): RankedAITacticalAction[] {
  return candidates.sort((left, right) =>
    Number(right.mandatory) - Number(left.mandatory)
    || right.score - left.score
    || left.id.localeCompare(right.id));
}

function hostileOwners(state: GameState, actorId: string): Set<string> {
  const atWar = new Set(state.civilizations[actorId]?.diplomacy.atWarWith ?? []);
  for (const unit of Object.values(state.units)) {
    if (isAIHostileOwner(state, actorId, unit.owner)) atWar.add(unit.owner);
  }
  return atWar;
}

function visibleThreatCount(
  context: AITacticalContext,
  unit: Unit,
  position: HexCoord,
): number {
  const visibleToActor = context.state.civilizations[context.actorId]?.visibility;
  const hostiles = hostileOwners(context.state, context.actorId);
  const predictedUnit = { ...unit, position };
  return Object.values(context.state.units).filter(candidate =>
    candidate.id !== unit.id
    && !candidate.transportId
    && hostiles.has(candidate.owner)
    && getVisibility(visibleToActor, candidate.position) === 'visible'
    && canAttackByProfileOnMap(candidate, predictedUnit, context.state.map)
  ).length;
}

function movementRange(state: GameState, actorId: string, unit: Unit): HexCoord[] {
  const occupancy = buildUnitOccupancy(state.units);
  return getMovementRange(
    unit,
    state.map,
    occupancy.unitIdsByHex,
    occupancy.ownersByUnitId,
    hostileOwners(state, actorId),
    { completedTechs: state.civilizations[actorId]?.techState.completed ?? [] },
  ).filter(destination =>
    getUnitIdsAtCoord(occupancy, destination)
      .filter(unitId => unitId !== unit.id)
      .length === 0);
}

function isForeignCityDestination(
  state: GameState,
  actorId: string,
  destination: HexCoord,
): boolean {
  return Object.values(state.cities).some(city =>
    city.owner !== actorId
    && hexKey(city.position) === hexKey(destination));
}

function supportRemainsCohesive(
  context: AITacticalContext,
  unit: Unit,
  destination: HexCoord,
): boolean {
  const supports = context.assignedUnitIds
    .filter(unitId => unitId !== unit.id)
    .map(unitId => context.state.units[unitId])
    .filter((candidate): candidate is Unit =>
      Boolean(candidate)
      && candidate.owner === context.actorId
      && !candidate.transportId
      && hasAICombatRole(candidate.type));
  if (supports.length === 0) return true;
  return supports.some(support => {
    const movementPoints = Math.max(1, UNIT_DEFINITIONS[support.type].movementPoints);
    return Math.ceil(distance(context.state, support.position, destination) / movementPoints) <= 1;
  });
}

function rankWithdrawals(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  const profile = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(context.state)];
  if (unit.health >= profile.retreatHealthPercent || unit.hasActed) return [];
  const ownCities = Object.values(context.state.cities)
    .filter(city => city.owner === context.actorId);
  const isOnlyImmediateDefender = context.plan.objective === 'defend'
    && context.plan.target.kind === 'city'
    && ownCities.length === 1
    && ownCities[0]?.id === context.plan.target.id
    && context.assignedUnitIds
      .map(unitId => context.state.units[unitId])
      .filter((candidate): candidate is Unit =>
        Boolean(candidate)
        && candidate.owner === context.actorId
        && candidate.health > 0
        && hasAICombatRole(candidate.type))
      .length === 1;
  if (isOnlyImmediateDefender) return [];

  const healingPositions = [
    ...ownCities.map(city => city.position),
    ...Object.values(context.state.map.tiles)
      .filter(tile => tile.owner === context.actorId)
      .map(tile => tile.coord),
  ];
  if (healingPositions.length === 0) {
    return [ranked({ kind: 'rest', unitId: unit.id }, 1_100, true)];
  }

  const healingDistance = (position: HexCoord) =>
    Math.min(...healingPositions.map(healing => distance(context.state, position, healing)));
  const currentDistance = healingDistance(unit.position);
  const destination = movementRange(context.state, context.actorId, unit)
    .filter(coord =>
      healingDistance(coord) < currentDistance
      && !isForeignCityDestination(context.state, context.actorId, coord))
    .sort((left, right) =>
      healingDistance(left) - healingDistance(right)
      || distance(context.state, unit.position, right)
        - distance(context.state, unit.position, left)
      || hexKey(left).localeCompare(hexKey(right)))[0];
  return destination
    ? [ranked({ kind: 'withdraw', unitId: unit.id, destination }, 1_100, true)]
    : [ranked({ kind: 'rest', unitId: unit.id }, 1_100, true)];
}

function isOnlyCaptureUnit(context: AITacticalContext, unit: Unit): boolean {
  if (!getAIStrategicRoles(unit.type).includes('capture')) return false;
  return context.assignedUnitIds
    .map(unitId => context.state.units[unitId])
    .filter((candidate): candidate is Unit =>
      Boolean(candidate)
      && candidate.owner === context.actorId
      && candidate.health > 0
      && getAIStrategicRoles(candidate.type).includes('capture'))
    .length === 1;
}

function rankAttacks(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  if (context.allowOffensiveActions === false) return [];
  const attacks: RankedAITacticalAction[] = [];
  for (const target of getAttackTargets(context.state, unit, {
    viewerId: context.actorId,
    requireVisibility: true,
  })) {
    if (target.result.targetType !== 'unit') continue;
    const defender = context.state.units[target.result.targetUnitId];
    if (!defender) continue;
    if (!isAIHostileOwner(context.state, context.actorId, defender.owner)) {
      continue;
    }
    const strengths = calculateCombatStrengths(
      unit,
      defender,
      context.state.map,
      buildCombatContextForDefender(context.state, unit, defender),
    );
    const expectedDamageRatio = Math.min(
      2,
      strengths.attackerStrength / Math.max(1, strengths.defenderStrength),
    );
    const deathRisk = Math.min(
      2,
      strengths.defenderStrength / Math.max(1, strengths.attackerStrength),
    );
    const defenderProfile = getUnitAttackProfile(defender.type);
    const safeRanged = target.result.range > defenderProfile.range;
    const action: AITacticalAction = {
      kind: 'attack',
      unitId: unit.id,
      targetUnitId: defender.id,
    };
    const preview = resolveCombat(
      unit,
      defender,
      context.state.map,
      combatSeed(context, action),
      buildCombatContextForDefender(context.state, unit, defender),
      context.state.era,
    );
    const likelyFinish = !preview.defenderSurvived;
    const focusFireBonus = likelyFinish ? 90 : Math.max(0, 100 - defender.health) * 0.4;
    const planProgress = context.plan.target.kind === 'unit'
      && context.plan.target.id === defender.id
      ? 1
      : distance(context.state, defender.position, targetPosition(context.plan)) <= 1
        ? 0.5
        : 0;
    const rolePreservationBonus = safeRanged ? 25 : 0;
    const blocksCaptureUnitPenalty = isOnlyCaptureUnit(context, unit) && !likelyFinish ? 45 : 0;
    const sequencePriority = context.plan.objective === 'defend'
      ? 1_000
      : safeRanged
        ? 800
        : likelyFinish
          ? 700
          : 500;
    const score = sequencePriority
      + planProgress * 30
      + expectedDamageRatio * 25
      + focusFireBonus
      + rolePreservationBonus
      - strengths.terrainDefenseBonus * 10
      - deathRisk * 40
      - blocksCaptureUnitPenalty;
    const lethalCityDefense = context.plan.objective === 'defend'
      && distance(
        context.state,
        defender.position,
        targetPosition(context.plan),
      ) <= 1
      && likelyFinish;
    attacks.push(ranked(action, score, lethalCityDefense));
  }
  return attacks;
}

function rankCapture(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  if (
    context.allowOffensiveActions === false
    || context.plan.target.kind !== 'city'
    || !getAIStrategicRoles(unit.type).includes('capture')
    || unit.hasActed
    || unit.movementPointsLeft <= 0
  ) {
    return [];
  }
  const city = context.state.cities[context.plan.target.id];
  if (!city || city.owner === context.actorId) return [];
  if (getVisibility(
    context.state.civilizations[context.actorId].visibility,
    city.position,
  ) !== 'visible') {
    return [];
  }
  const attackTarget = getAttackTargets(context.state, unit, {
    viewerId: context.actorId,
    requireVisibility: true,
  }).find(target =>
    target.result.targetType === 'city'
    && target.result.cityId === city.id);
  if (!attackTarget) return [];
  if (distance(context.state, unit.position, city.position) !== 1) return [];
  const occupancy = buildUnitOccupancy(context.state.units);
  if (getUnitIdsAtCoord(occupancy, city.position).some(unitId =>
    context.state.units[unitId]?.owner !== context.actorId)) {
    return [];
  }
  const reachable = movementRange(context.state, context.actorId, unit)
    .some(coord => hexKey(coord) === hexKey(city.position));
  if (!reachable) return [];

  // Score by win probability (#522) -- previously a flat 600 regardless of the city's
  // walls/population, because capture was unconditionally guaranteed. Left unweighted,
  // the AI would blindly send units to die against a heavily-defended city with no way
  // to tell that apart from a free capture. Never fully excludes the action (a 0% odds
  // city still appears as a low-scoring candidate) so a cornered AI with no better
  // option still attempts it.
  const ownerCiv = context.state.civilizations[city.owner];
  const winProbability = ownerCiv
    ? calculateCityAssaultStrengths(unit, city, ownerCiv, context.state.map).winProbability
    : 1;
  return [ranked({ kind: 'capture-city', unitId: unit.id, cityId: city.id }, Math.round(winProbability * 600))];
}

function rankCivilianAndTransportActions(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  if (unit.transportId) {
    const transport = context.state.units[unit.transportId];
    if (!transport) return [];
    const profile = OPPONENT_CHALLENGE_PROFILES[
      resolveOpponentChallenge(context.state)
    ];
    const endangered = transport.health < profile.retreatHealthPercent
      || visibleThreatCount(context, transport, transport.position) > 0;
    const destinations = getUnloadDestinations(context.state, unit.transportId, unit.id)
      .sort((left, right) =>
        visibleThreatCount(context, unit, left)
        - visibleThreatCount(context, unit, right)
        || distance(context.state, left, targetPosition(context.plan))
        - distance(context.state, right, targetPosition(context.plan))
        || hexKey(left).localeCompare(hexKey(right)));
    const hasSafeDestination = destinations.some(destination =>
      visibleThreatCount(context, unit, destination) === 0);
    return destinations.length > 0
      ? destinations.map(destination => ranked({
          kind: 'unload',
          unitId: unit.id,
          destination,
        }, 650
          - visibleThreatCount(context, unit, destination) * 100
          - distance(context.state, destination, targetPosition(context.plan)),
        endangered
          && hasSafeDestination
          && visibleThreatCount(context, unit, destination) === 0))
      : [];
  }

  if (unit.type === 'settler' && !unit.hasActed && unit.movementPointsLeft > 0) {
    return canFoundCityAt(context.state, unit.position)
      ? [ranked({ kind: 'found-city', unitId: unit.id, destination: unit.position }, 650)]
      : [];
  }
  if (
    unit.type === 'expedition'
    && !unit.hasActed
    && unit.movementPointsLeft > 0
    && canEstablishOutpost(context.state, unit.id)
  ) {
    return [ranked({ kind: 'establish-outpost', unitId: unit.id }, 650)];
  }
  if (
    unit.type === 'worker'
    && !unit.hasActed
    && getWorkerChargesRemaining(unit) > 0
  ) {
    const tile = context.state.map.tiles[hexKey(unit.position)];
    const completedTechs = context.state.civilizations[context.actorId]?.techState.completed ?? [];
    const isCityTile = Object.values(context.state.cities)
      .some(city => hexKey(city.position) === hexKey(unit.position));

    const roadBuilder = chooseRoadBuilderUnit(context.state, context.actorId);
    if (roadBuilder && roadBuilder.workerId === unit.id) {
      if (hexKey(unit.position) === hexKey(roadBuilder.targetCoord)) {
        if (canBuildRoad(tile, completedTechs, context.actorId, isCityTile)) {
          return [ranked({ kind: 'worker-action', unitId: unit.id, action: 'build_road' }, 640)];
        }
      } else if (unit.movementPointsLeft > 0) {
        const path = findPath(unit.position, roadBuilder.targetCoord, context.state.map, 'land', { unit, completedTechs });
        if (path && path.length > 1) {
          return [ranked({ kind: 'move', unitId: unit.id, destination: path[1]! }, 630)];
        }
      }
    }

    const actions = getAvailableWorkerActions(
      tile,
      completedTechs,
      context.actorId,
      {
        isCityTile,
        knownResource: tile
          ? getKnownTileResourceForWorkerAction(tile, completedTechs)
          : null,
        currentTurn: context.state.turn,
      },
    );
    return actions.map((action, index) => ranked({
      kind: 'worker-action',
      unitId: unit.id,
      action,
    }, 620 - index));
  }

  const planNeedsTransport = (context.plan.requiredRoles.transport ?? 0) > 0
    || findPath(
      unit.position,
      targetPosition(context.plan),
      context.state.map,
      UNIT_DEFINITIONS[unit.type].domain ?? 'land',
      {
        unit,
        completedTechs: context.state.civilizations[context.actorId]?.techState.completed ?? [],
      },
    ) === null;
  if (!planNeedsTransport || (UNIT_DEFINITIONS[unit.type].domain ?? 'land') !== 'land') {
    return [];
  }
  return Object.values(context.state.units)
    .filter(candidate =>
      candidate.owner === context.actorId
      && canLoadUnitOntoTransport(context.state, unit.id, candidate.id).ok)
    .map(transport => ranked({
      kind: 'load',
      unitId: unit.id,
      transportId: transport.id,
    }, 550));
}

function rankMoves(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  if (unit.hasActed || unit.movementPointsLeft <= 0 || unit.transportId) return [];
  const target = targetPosition(context.plan);
  const currentTargetDistance = distance(context.state, unit.position, target);
  const destinations = movementRange(context.state, context.actorId, unit)
    .filter(destination =>
      distance(context.state, destination, target) < currentTargetDistance
      && supportRemainsCohesive(context, unit, destination)
      && !isForeignCityDestination(context.state, context.actorId, destination))
    .sort((left, right) =>
      distance(context.state, left, target) - distance(context.state, right, target)
      || distance(context.state, unit.position, right)
        - distance(context.state, unit.position, left)
      || hexKey(left).localeCompare(hexKey(right)));
  return destinations.map(destination => {
    const planProgress = currentTargetDistance - distance(context.state, destination, target);
    const support = context.assignedUnitIds
      .filter(unitId => unitId !== unit.id)
      .map(unitId => context.state.units[unitId])
      .filter((candidate): candidate is Unit => Boolean(candidate) && hasAICombatRole(candidate.type));
    const cohesionBreakTurns = support.length === 0
      ? 0
      : Math.max(0, Math.min(...support.map(candidate =>
          Math.ceil(
            distance(context.state, candidate.position, destination)
            / Math.max(1, UNIT_DEFINITIONS[candidate.type].movementPoints),
          ))) - 1);
    return ranked({
      kind: 'move',
      unitId: unit.id,
      destination,
    }, 300 + planProgress * 30 - cohesionBreakTurns * 15);
  });
}

export function rankUnitTacticalActions(
  context: AITacticalContext,
  unitId: string,
): RankedAITacticalAction[] {
  const unit = context.state.units[unitId];
  if (!unit || unit.owner !== context.actorId) {
    return [ranked({ kind: 'hold', unitId }, -1_000)];
  }
  if (unit.transportId) {
    return sortRanked([
      ...rankCivilianAndTransportActions(context, unit),
      ranked({ kind: 'hold', unitId }, 0),
    ]);
  }
  const withdrawals = rankWithdrawals(context, unit);
  if (withdrawals.length > 0) return sortRanked(withdrawals);

  const candidates = [
    ...rankCivilianAndTransportActions(context, unit),
    ...rankAttacks(context, unit),
    ...rankCapture(context, unit),
    ...rankMoves(context, unit),
  ];
  if (unit.health < 100 && !unit.hasActed) {
    candidates.push(ranked({ kind: 'rest', unitId }, 100));
  }
  candidates.push(ranked({ kind: 'hold', unitId }, 0));
  return sortRanked(candidates);
}

function chooseRankedAction(
  context: AITacticalContext,
  unitId: string,
): RankedAITacticalAction {
  const actions = rankUnitTacticalActions(context, unitId);
  const best = actions[0]!;
  if (best.mandatory) return best;
  const profile = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(context.state)];
  const nearBest = actions.filter(action =>
    action.score >= best.score - profile.seededMistakeScoreBand);
  const rng = createRng([
    context.state.gameId ?? 'legacy',
    context.state.turn,
    context.actorId,
    unitId,
    context.plan.id,
  ].join(':'));
  if (
    rng() < profile.seededSuboptimalChance
    && nearBest.length > 1
  ) {
    return nearBest[Math.min(nearBest.length, profile.tacticalTopK) - 1]!;
  }
  return best;
}

export function chooseUnitTacticalAction(
  context: AITacticalContext,
  unitId: string,
): AITacticalAction {
  return chooseRankedAction(context, unitId).action;
}

function combatSeed(context: AITacticalContext, action: AITacticalAction): number {
  const rng = createRng([
    context.state.gameId ?? 'legacy',
    context.state.turn,
    context.actorId,
    context.plan.id,
    actionId(action),
  ].join(':'));
  return Math.max(1, Math.floor(rng() * 2_147_483_646));
}

function applyPredictedAction(
  state: GameState,
  context: AITacticalContext,
  action: AITacticalAction,
): GameState {
  const next = structuredClone(state);
  const unit = next.units[action.unitId];
  if (!unit) return next;
  switch (action.kind) {
    case 'attack': {
      const defender = next.units[action.targetUnitId];
      if (!defender) return next;
      const seed = combatSeed({ ...context, state: next }, action);
      const result = resolveCombat(
        unit,
        defender,
        next.map,
        seed,
        buildCombatContextForDefender(next, unit, defender),
        next.era,
      );
      return applyCombatOutcomeToState(next, result, seed).state;
    }
    case 'move':
    case 'withdraw':
      next.units[unit.id] = {
        ...unit,
        position: { ...action.destination },
        hasMoved: true,
        movementPointsLeft: 0,
      };
      return unit.cargoUnitIds?.length
        ? syncTransportCargoPositions(next, unit.id)
        : next;
    case 'capture-city': {
      const city = next.cities[action.cityId];
      if (!city) return next;
      next.units[unit.id] = {
        ...unit,
        position: { ...city.position },
        hasMoved: true,
        hasActed: true,
        movementPointsLeft: 0,
      };
      return resolveMajorCityCapture(
        next,
        city.id,
        context.actorId,
        'occupy',
        next.turn,
      ).state;
    }
    case 'load': {
      const result = loadUnitOntoTransport(next, action.unitId, action.transportId);
      return result.ok ? result.state : next;
    }
    case 'unload': {
      const result = unloadUnitFromTransport(
        next,
        unit.transportId ?? '',
        action.unitId,
        action.destination,
      );
      return result.ok ? result.state : next;
    }
    case 'rest':
      next.units[unit.id] = {
        ...unit,
        isResting: true,
        hasActed: true,
        movementPointsLeft: 0,
      };
      return next;
    case 'found-city': {
      const civ = next.civilizations[context.actorId];
      if (!civ || !canFoundCityAt(next, action.destination)) return next;
      const city = foundCity(
        context.actorId,
        action.destination,
        next.map,
        next.idCounters,
        {
          civType: civ.civType,
          civName: civ.name,
          usedNames: collectUsedCityNames(next),
          completedTechs: civ.techState.completed,
        },
      );
      next.cities[city.id] = city;
      next.civilizations[context.actorId] = {
        ...civ,
        cities: [...civ.cities, city.id],
        units: civ.units.filter(unitId => unitId !== unit.id),
      };
      for (const coord of city.ownedTiles) {
        const key = hexKey(coord);
        const tile = next.map.tiles[key];
        if (tile) next.map.tiles[key] = { ...tile, owner: context.actorId };
      }
      delete next.units[unit.id];
      return next;
    }
    case 'establish-outpost':
      return performEstablishOutpost(next, unit.id);
    case 'worker-action': {
      const result = applyWorkerAction(next, unit.id, action.action);
      return result.ok ? result.state : next;
    }
    case 'hold':
      next.units[unit.id] = { ...unit, hasActed: true };
      return next;
  }
}

export function chooseTacticalSequence(
  context: AITacticalContext,
): AITacticalAction[] {
  let scratch = structuredClone(context.state);
  const remaining = new Set(
    context.assignedUnitIds
      .filter(unitId => scratch.units[unitId]?.owner === context.actorId),
  );
  const actions: AITacticalAction[] = [];
  while (remaining.size > 0) {
    const scratchContext = { ...context, state: scratch };
    const selected = [...remaining]
      .map(unitId => chooseRankedAction(scratchContext, unitId))
      .sort((left, right) =>
        Number(right.mandatory) - Number(left.mandatory)
        || right.score - left.score
        || left.id.localeCompare(right.id))[0];
    if (!selected) break;
    actions.push(selected.action);
    remaining.delete(selected.action.unitId);
    scratch = applyPredictedAction(scratch, scratchContext, selected.action);
  }
  return actions;
}
