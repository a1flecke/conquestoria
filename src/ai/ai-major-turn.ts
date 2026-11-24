import type { EventBus } from '@/core/event-bus';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import {
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
} from '@/core/opponent-challenge';
import type { GameState, Unit } from '@/core/types';
import type { AIStrategicRole, AIStrategicPlan } from '@/core/types/ai';
import { rebaseAircraft, resolveAirStrike, resolveReconMission, resolvePatrolMission, startIntercept } from '@/systems/air-operations-system';
import { executeParadrop, executeAirAssault } from '@/systems/airborne-system';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { resolveUnitCityBombardment } from '@/systems/city-bombardment-system';
import {
  canUnitOccupyCity,
} from '@/systems/city-capture-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { getVisibility } from '@/systems/fog-of-war';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { conquestMinorCiv } from '@/systems/minor-civ-system';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import {
  canEstablishOutpost,
  performEstablishOutpost,
} from '@/systems/resource-acquisition-system';
import {
  loadUnitOntoTransport,
  detachCargoForEmbarkedAssault,
  getEmbarkedAssaultTarget,
  unloadUnitFromTransport,
} from '@/systems/transport-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import {
  buildUnitOccupancy,
  getUnitIdsAtCoord,
} from '@/systems/unit-occupancy';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { restUnit } from '@/systems/unit-healing';
import { getRestAvailability } from '@/systems/supply-combat';
import { applyWorkerAction } from '@/systems/worker-action-system';
import {
  createAIDecisionTrace,
  type AIDecisionTrace,
} from './ai-decision-trace';
import type { MajorCivPerception } from './ai-perception';
import type { PreparedMajorCivPlan } from './ai-prepared-turn';
import {
  chooseAttackActionForUnit,
  chooseTacticalSequence,
  getOperationalRegroupingRoute,
  rankUnitTacticalActions,
  isLastCitySoleDefender,
  unitNeedsShipping,
  type AITacticalAction,
  type AITacticalContext,
} from './ai-tactics';
import { canUnitFulfillAIStrategicRole, countAIStrategicRoleCapabilities, getAIStrategicRoles } from './ai-unit-roles';
import { executeAIUnitAttack, occupyMajorCity } from './ai-unit-attack-execution';
import { isAIHostileOwner } from './ai-hostility';
import { processAIUpgradesInPlace } from './ai-upgrades';
import { createOperationalRouting, getOperationalRoute, type AIOperationalRouting } from './ai-operational-routing';

export interface ProcessMajorCivStrategicTurnResult {
  state: GameState;
  actions: AITacticalAction[];
  traces: AIDecisionTrace[];
  primaryPlanMadeProgress: boolean;
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

// #1807: occupyMajorCity and executeAttack moved verbatim to
// `ai-unit-attack-execution.ts` so every AI attack caller (the tactical executor here,
// the Seize-grant spending pass in ai-general-command) shares one implementation.

function executeEmbarkedAttack(
  state: GameState,
  action: Extract<AITacticalAction, { kind: 'embarked-attack' }>,
  civId: string,
  bus: EventBus,
): { state: GameState; followUps: AITacticalAction[] } {
  const cargo = state.units[action.unitId];
  const defender = state.units[action.targetUnitId];
  if (!cargo || !defender || cargo.owner !== civId) return { state, followUps: [] };
  const legality = getEmbarkedAssaultTarget(state, cargo.id, defender.position, { viewerId: civId, requireVisibility: true });
  if (!legality.ok || legality.targetType !== 'unit' || legality.targetUnitId !== defender.id) return { state, followUps: [] };
  const detached = detachCargoForEmbarkedAssault(state, cargo.id);
  if (!detached.ok) return { state, followUps: [] };
  return executeAIUnitAttack(
    detached.state,
    cargo.id,
    defender.id,
    civId,
    bus,
    true,
  );
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
  const conquest = conquestMinorCiv(movement.state, city.owner, civId);
  if (!conquest.conquered) return { state, succeeded: false };
  emitMinorCivQuestTransitions(bus, conquest.transitions, conquest.state);
  bus.emit('minor-civ:destroyed', {
    minorCivId: city.owner,
    conquerorId: civId,
  });
  return { state: conquest.state, succeeded: true };
}

/**
 * Direct assault on a coastal city from a ship. It is the human path's sequence verbatim
 * (`beginPlayerCityAssault`): re-check `getEmbarkedAssaultTarget`, take the shared
 * amphibious multiplier, detach the cargo, then run the one city-assault executor.
 */
function executeEmbarkedCityCapture(
  state: GameState,
  action: Extract<AITacticalAction, { kind: 'capture-city' }>,
  civId: string,
  bus: EventBus,
): { state: GameState; succeeded: boolean; followUps: AITacticalAction[] } {
  const unfinished = { state, succeeded: false, followUps: [] };
  const cargo = state.units[action.unitId];
  const city = state.cities[action.cityId];
  if (!cargo || !city || cargo.owner !== civId || !state.civilizations[city.owner] || !canUnitOccupyCity(cargo)) return unfinished;
  const legality = getEmbarkedAssaultTarget(state, cargo.id, city.position, { viewerId: civId, requireVisibility: true });
  if (!legality.ok || legality.targetType !== 'city' || legality.cityId !== city.id) return unfinished;
  const attackerMultiplier = getAmphibiousAssaultMultiplier(state, cargo, city.position);
  const detached = detachCargoForEmbarkedAssault(state, cargo.id);
  if (!detached.ok) return unfinished;
  const capture = occupyMajorCity(detached.state, city.id, cargo.id, civId, bus, undefined, attackerMultiplier);
  // As for any assault, a repelled attempt still spent the unit's turn: keep its state.
  return { state: capture.state, succeeded: capture.state !== state, followUps: [] };
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
    case 'air-recon': {
      const result = resolveReconMission(state, action.unitId, action.target);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'air-intercept': {
      const result = startIntercept(state, action.unitId);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'air-rebase': {
      const result = rebaseAircraft(state, action.unitId, action.base);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'air-strike': {
      const result = resolveAirStrike(state, action.unitId, action.target, bus);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'attack': {
      const attack = executeAIUnitAttack(state, action.unitId, action.targetUnitId, civId, bus);
      return {
        state: attack.state,
        succeeded: attack.state !== state,
        followUps: attack.followUps,
      };
    }
    case 'bombard-city': {
      const bombardment = resolveUnitCityBombardment(state, {
        attackerUnitId: action.unitId,
        cityId: action.cityId,
        source: 'ai',
      });
      if (bombardment.ok) {
        if (bombardment.cityEvent) bus.emit('city:bombarded', bombardment.cityEvent);
        if (bombardment.batteryEvent) bus.emit('city:coastal-battery-fired', bombardment.batteryEvent);
      }
      return { state: bombardment.ok ? bombardment.state : state, succeeded: bombardment.ok, followUps: [] };
    }
    case 'embarked-attack': {
      const attack = executeEmbarkedAttack(state, action, civId, bus);
      return { state: attack.state, succeeded: attack.state !== state, followUps: attack.followUps };
    }
    case 'capture-city': {
      const city = state.cities[action.cityId];
      if (state.units[action.unitId]?.transportId) {
        return executeEmbarkedCityCapture(state, action, civId, bus);
      }
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
      // succeeded means "the action was legally attempted and changed state" --
      // matching the 'attack' case above (attack.state !== state), NOT "the assault
      // won." A losing attack still consumes the unit's turn and is recorded as a real
      // action; a repelled city assault (#522 pre-merge review fix) must behave the
      // same way, or the caller's `if (!executed.succeeded) continue;` (below, in
      // processMajorCivStrategicTurn) discards the repel's state entirely -- silently
      // undoing counter-fire damage/death and the attacker's consumed action, on top of
      // never recording the attempt in `appliedActions`/traces.
      return {
        state: capture.state,
        succeeded: capture.state !== state,
        followUps: [],
      };
    }
    case 'assault-camp': {
      // #845: the AI-facing counterpart to beginPlayerCampAssault (player-action-controller.ts)
      // -- destroys an undefended camp in one step, mirroring the notification/quest-transition
      // sequence applyCampDestructionAtTarget's other call site above (resolveAttackFollowUp)
      // already runs after a camp's last defender dies in combat.
      const camp = state.barbarianCamps[action.campId];
      const attacker = state.units[action.unitId];
      if (
        !camp
        || !attacker
        || attacker.owner !== civId
        || distance(state, attacker.position, camp.position) !== 1
        || getUnitIdsAtCoord(buildUnitOccupancy(state.units), camp.position).length > 0
      ) {
        return { state, succeeded: false, followUps: [] };
      }
      const next = structuredClone(state);
      next.units[action.unitId] = { ...attacker, hasMoved: true, hasActed: true, movementPointsLeft: 0 };
      const destroyed = applyCampDestructionAtTarget(next, civId, camp.position, next.turn);
      if (!destroyed.campId) return { state, succeeded: false, followUps: [] };
      emitMinorCivQuestTransitions(bus, destroyed.questTransitions, destroyed.state);
      bus.emit('barbarian:camp-destroyed', { campId: destroyed.campId, reward: destroyed.reward });
      return { state: destroyed.state, succeeded: true, followUps: [] };
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
        state: movement.ok ? movement.state : state,
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
        } else if (event.type === 'road:started') {
          bus.emit('road:started', event.payload);
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
    case 'paradrop': {
      const result = executeParadrop(state, action.unitId, action.destination, bus);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'air-assault': {
      const result = executeAirAssault(state, action.unitId, action.destination, bus);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'patrol': {
      const result = resolvePatrolMission(state, action.unitId, action.center);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
    case 'rest': {
      const unit = state.units[action.unitId];
      // #544 "Rest UX": the executor re-runs the candidate gate — an unsupported
      // unit's rest is a wasted action (the round-end heal loop denies it), so a
      // stale candidate list can never commit one.
      if (!unit || unit.owner !== civId || unit.hasActed || !getRestAvailability(unit.landSupply).canRest) {
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

/**
 * Spends a Seize the Moment grant the round scheduler issued after the prepared tactical
 * sequence. Without this pass the charge grants an action nothing ever uses: the unit that
 * made it eligible has already acted, and nothing re-enters the tactical sequence for it.
 *
 * Only units carrying THIS turn's grant are considered. Each gets at most one offensive
 * action, chosen by the same ranker the ordinary sequence uses (so a target the AI would
 * never pick in its plan is never picked here), and any city capture the attack earns is
 * executed through the same follow-up path. A unit whose plan withholds offensive action
 * (scouting/mobilizing) or that has no legal target keeps the grant unspent.
 */
export function processSeizedUnitActions(
  state: GameState,
  prepared: PreparedMajorCivPlan,
  bus: EventBus,
): GameState {
  const civId = prepared.civId;
  let working = state;
  const plans = [
    ...Object.values(prepared.portfolio.defensePlansByCityId)
      .sort((left, right) => left.id.localeCompare(right.id)),
    ...(prepared.portfolio.primaryPlan ? [prepared.portfolio.primaryPlan] : []),
  ];
  const seized = (working.civilizations[civId]?.units ?? [])
    .map(id => working.units[id])
    .filter((unit): unit is Unit =>
      Boolean(unit) && unit.seizeGrantedBy?.turn === working.turn && !unit.hasActed)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const seizedUnit of seized) {
    const current = working.units[seizedUnit.id];
    if (!current || current.hasActed) continue;
    const plan = plans.find(candidate =>
      (prepared.assignments.assignmentsByPlanId[candidate.id] ?? candidate.assignedUnitIds)
        .includes(seizedUnit.id));
    if (!plan) continue;
    const assignedUnitIds = prepared.assignments.assignmentsByPlanId[plan.id] ?? plan.assignedUnitIds;
    const context: AITacticalContext = {
      state: working,
      actorId: civId,
      plan: executionPlan(working, plan),
      assignedUnitIds,
      allowOffensiveActions: !(
        isOffensivePlan(plan)
        && (plan.phase === 'scouting' || plan.phase === 'mobilizing')
      ),
      routing: createOperationalRouting(),
    };
    const action = chooseAttackActionForUnit(context, seizedUnit.id);
    if (!action) continue;
    const executed = executeAction(working, action, civId, bus);
    if (!executed.succeeded) continue;
    working = executed.state;
    for (const followUp of executed.followUps) {
      const next = executeAction(working, followUp, civId, bus);
      if (next.succeeded) working = next.state;
    }
  }
  return working;
}

function hasRequiredRoles(
  state: GameState,
  plan: AIStrategicPlan,
  assignedUnitIds: readonly string[],
): boolean {
  const units = assignedUnitIds.map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit) && unit.owner === plan.actorId);
  const available = countAIStrategicRoleCapabilities(units, plan.requiredRoles);
  return Object.entries(plan.requiredRoles).every(([role, desired]) =>
    (available[role as AIStrategicRole] ?? 0) >= (desired ?? 0));
}

function hasCaptureOrFrontline(
  state: GameState,
  assignedUnitIds: readonly string[],
): boolean {
  return assignedUnitIds.some(unitId => {
    const unit = state.units[unitId];
    if (!unit) return false;
    return getAIStrategicRoles(unit.type).includes('capture')
      || canUnitFulfillAIStrategicRole(unit.type, 'frontline');
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

function hasVisibleLocalCounterattack(
  state: GameState,
  plan: AIStrategicPlan,
): boolean {
  const visibility = state.civilizations[plan.actorId]?.visibility;
  const target = targetPosition(plan);
  return Object.values(state.units).some(unit =>
    !unit.transportId
    && isAIHostileOwner(state, plan.actorId, unit.owner)
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
      return perception.knownCities.some(city => city.id === target.id && city.confidence !== 'rumored')
        || perception.cityStateIntel.cities.some(city => city.id === target.id);
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
  if (isLastCitySoleDefender(state, plan, assignedUnitIds)) return false;
  const units = assignedUnitIds
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit));
  if (units.length === 0) return false;
  if (units.some(unit => unit.landSupply?.state === 'severe')) return true;
  const profile = OPPONENT_CHALLENGE_PROFILES[
    resolveOpponentChallenge(state)
  ];
  const averageHealth = units.reduce((sum, unit) => sum + unit.health, 0)
    / units.length;
  if (averageHealth < profile.retreatHealthPercent) return true;

  const target = targetPosition(plan);
  const ownStrength = units.reduce((sum, unit) =>
    sum + UNIT_DEFINITIONS[unit.type].strength * (unit.health / 100), 0);
  // A force with zero total combat strength (e.g. a lone settler on an expand
  // plan) was never going to fight anything -- "outmatched" is meaningless
  // for it, and the strength-ratio check below is structurally always 0/N,
  // triggering withdrawal whenever ANY hostile unit is merely within 4 tiles
  // of the target, however harmless. #1107 found this: a settler-only expand
  // plan cycled mobilizing -> withdrawing -> mobilizing forever every time a
  // wandering barbarian came within range, never once reaching 'advancing'
  // or completing its journey. The health-based retreat check above still
  // applies to every assigned force, combat-capable or not.
  if (ownStrength === 0) return false;
  const hostileStrength = Object.values(state.units)
    .filter(unit =>
      isAIHostileOwner(state, plan.actorId, unit.owner)
      && !unit.transportId
      && getVisibility(
        state.civilizations[plan.actorId]?.visibility,
        unit.position,
      ) === 'visible'
      && !isUnitConcealedFrom(state, unit, plan.actorId)
      && distance(state, unit.position, target) <= 4)
    .reduce((sum, unit) =>
      sum + UNIT_DEFINITIONS[unit.type].strength * (unit.health / 100), 0);
  return hostileStrength > 0 && ownStrength / hostileStrength < 0.65;
}

export function nextPlanPhase(
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
  if (plan.phase === 'withdrawing') return 'mobilizing';
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
    // #1124: `>` not `>=` -- a deadline of exactly `mobilizationRounds` elapsed rounds
    // means "no grace period has been given yet" for a challenge tier whose configured
    // value is 0 (veteran), collapsing this into an unconditional bypass of
    // hasRequiredRoles from the very round a plan is created. Requiring strictly more
    // than the configured value guarantees every tier gets at least one genuine round of
    // mobilization before the deadline can override counted role requirements.
    const deadlineReached = after.turn - plan.createdTurn
      > profile.mobilizationRounds;
    const migrationGrace = after.opponentAI?.migrationGraceRoundsRemaining ?? 0;
    if (
      migrationGrace === 0
      // #1064: capture/frontline is an OFFENSIVE readiness requirement. A settle plan
      // carries a settler and nothing else, and would otherwise sit in `mobilizing`
      // for its whole life, permanently distorting plan-stuck / maxNoProgressRounds.
      // Scoped to `expand` specifically, not "every non-offensive objective" -- the
      // other five objectives (defend/recover/secure-resource/repel/support-ally)
      // always assign combat-capable units and must keep the real readiness gate.
      && (plan.objective === 'expand' || hasCaptureOrFrontline(after, assignedUnitIds))
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

function actionAdvancesPlan(
  before: GameState,
  after: GameState,
  plan: AIStrategicPlan,
  action: AITacticalAction,
  routing: AIOperationalRouting,
): boolean {
  const target = targetPosition(plan);
  const relevantPosition = (position: { q: number; r: number }) => distance(before, position, target) <= 4;
  switch (action.kind) {
    case 'move':
    case 'withdraw':
    case 'unload':
    case 'paradrop':
    case 'air-assault': {
      const unit = before.units[action.unitId];
      const moved = after.units[action.unitId];
      if (!unit || !moved || hexKey(unit.position) === hexKey(moved.position)) return false;
      const roles = [...Object.keys(plan.requiredRoles), ...Object.keys(plan.supportRoles ?? {})] as AIStrategicRole[];
      if (!roles.some(role => canUnitFulfillAIStrategicRole(unit.type, role))) return false;
      if ((UNIT_DEFINITIONS[unit.type].domain ?? 'land') !== 'land' || unit.transportId
        || action.kind === 'paradrop' || action.kind === 'air-assault') {
        return distance(before, moved.position, target) < distance(before, unit.position, target);
      }
      const route = getOperationalRoute(before, unit, target, routing);
      if ((route?.findIndex(position => hexKey(position) === hexKey(moved.position)) ?? -1) > 0) return true;
      const regroupingRoute = getOperationalRegroupingRoute({ state: before, actorId: plan.actorId, plan,
        assignedUnitIds: plan.assignedUnitIds, routing }, unit);
      return (regroupingRoute?.findIndex(position => hexKey(position) === hexKey(moved.position)) ?? -1) > 0;
    }
    case 'attack':
    case 'embarked-attack': {
      const victim = before.units[action.targetUnitId];
      return Boolean(victim && relevantPosition(victim.position)
        && (after.units[victim.id]?.health ?? 0) < victim.health);
    }
    case 'bombard-city':
      return plan.target.kind === 'city' && action.cityId === plan.target.id
        && (after.cities[action.cityId]?.hp ?? 100) < (before.cities[action.cityId]?.hp ?? 100);
    case 'capture-city':
      return plan.target.kind === 'city' && action.cityId === plan.target.id
        && before.cities[action.cityId]?.owner !== plan.actorId && after.cities[action.cityId]?.owner === plan.actorId;
    case 'assault-camp':
      return plan.target.kind === 'camp' && action.campId === plan.target.id
        && Boolean(before.barbarianCamps[action.campId]) && !after.barbarianCamps[action.campId];
    case 'found-city':
      return plan.objective === 'expand' && Object.keys(after.cities).length > Object.keys(before.cities).length;
    case 'establish-outpost':
    case 'worker-action':
      return plan.objective === 'secure-resource' && plan.target.kind === 'resource'
        && hexKey(before.units[action.unitId]!.position) === hexKey(plan.target.position);
    case 'load': {
      // Boarding is progress only for a unit that still needs a ship to reach the target (#1434).
      const passenger = before.units[action.unitId];
      return (plan.requiredRoles.transport ?? 0) > 0 && Boolean(passenger) && !passenger!.transportId
        && after.units[action.unitId]?.transportId === action.transportId
        && unitNeedsShipping(before, plan.actorId, plan, passenger!);
    }
    case 'air-strike':
      return relevantPosition(action.target) && Object.values(before.units).some(unit =>
        unit.owner !== plan.actorId && hexKey(unit.position) === hexKey(action.target)
        && getVisibility(before.civilizations[plan.actorId]?.visibility, unit.position) === 'visible'
        && !isUnitConcealedFrom(before, unit, plan.actorId)
        && (after.units[unit.id]?.health ?? 0) < unit.health);
    case 'air-recon':
      return getVisibility(before.civilizations[plan.actorId]?.visibility, target) !== 'visible'
        && getVisibility(after.civilizations[plan.actorId]?.visibility, target) === 'visible';
    case 'air-rebase':
    case 'air-intercept':
    case 'patrol':
    case 'rest':
    case 'hold':
      return false;
  }
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
  options: { excludedUnitIds?: ReadonlySet<string> } = {},
): ProcessMajorCivStrategicTurnResult {
  return processMajorCivStrategicTurnInPlace(structuredClone(state), prepared, bus, options);
}

/**
 * #1330 — in-place variant for `processAITurnInternal`, which already owns the
 * per-civ deep clone (`basic-ai.ts:622`) that the public entry point used to
 * clone a second time. Mutates and returns `working`; the public
 * `processMajorCivStrategicTurn` keeps its non-mutating contract by cloning first.
 */
export function processMajorCivStrategicTurnInPlace(
  working: GameState,
  prepared: PreparedMajorCivPlan,
  bus: EventBus,
  options: { excludedUnitIds?: ReadonlySet<string> } = {},
): ProcessMajorCivStrategicTurnResult {
  const preparedPlans = [
    ...(prepared.portfolio.primaryPlan
      ? [prepared.portfolio.primaryPlan]
      : []),
    ...Object.values(prepared.portfolio.defensePlansByCityId),
  ];
  if (
    prepared.civId === ''
    || !working.civilizations[prepared.civId]
    || preparedPlans.some(plan => plan.actorId !== prepared.civId)
  ) {
    return { state: working, actions: [], traces: [], primaryPlanMadeProgress: false };
  }

  working = normalizeOpponentAIState(working);
  working = {
    ...working,
    opponentAI: {
      ...working.opponentAI!,
      majorCivs: {
        ...working.opponentAI!.majorCivs,
        [prepared.civId]: structuredClone(prepared.portfolio),
      },
      // #1086: mirrors the majorCivs write immediately above -- this function is the
      // single write-back path for basic-ai.ts's direct per-civ execution (it never
      // routes through ai-round-scheduler.ts's writePreparedPortfolios), so national
      // intent must be persisted here too. Redundant-but-idempotent for the round-
      // scheduler's own bulk path, which already commits the identical value.
      nationalIntentByCiv: {
        ...working.opponentAI!.nationalIntentByCiv,
        [prepared.civId]: structuredClone(prepared.nationalIntent),
      },
    },
  };
  working = processAIUpgradesInPlace(
    working,
    prepared.civId,
    prepared,
    bus,
    options,
  ).state;
  const plans = [
    ...Object.values(prepared.portfolio.defensePlansByCityId)
      .sort((left, right) => left.id.localeCompare(right.id)),
    ...(prepared.portfolio.primaryPlan
      ? [prepared.portfolio.primaryPlan]
      : []),
  ];
  const appliedActions: AITacticalAction[] = [];
  const traces: AIDecisionTrace[] = [];
  const routing = createOperationalRouting();
  let primaryPlanMadeProgress = false;

  for (const originalPlan of plans) {
    const requestedUnitIds = prepared.assignments
      .assignmentsByPlanId[originalPlan.id]
      ?? originalPlan.assignedUnitIds;
    const formationUnitIds = [...new Set(requestedUnitIds)].filter(unitId =>
      working.units[unitId]?.owner === prepared.civId
      && !options.excludedUnitIds?.has(unitId)
      && !Boolean(
        working.opponentAI?.majorCivs[prepared.civId]
          ?.upgradeRoutesByUnitId[unitId],
      ));
    const assignedUnitIds = formationUnitIds.filter(unitId => !working.units[unitId]?.hasActed);
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
    const preparingOffense = isOffensivePlan(originalPlan)
      && (
        originalPlan.phase === 'scouting'
        || originalPlan.phase === 'mobilizing'
      );
    const tacticalContext: AITacticalContext = {
      state: working,
      actorId: prepared.civId,
      plan: tacticalPlan,
      assignedUnitIds: formationUnitIds,
      allowOffensiveActions: !preparingOffense,
      routing,
    };
    const selectedActions = chooseTacticalSequence(tacticalContext);
    let madeProgress = false;
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
      madeProgress ||= actionAdvancesPlan(working, executed.state, tacticalPlan, action, routing)
        || executed.followUps.some(followUp => actionAdvancesPlan(working, executed.state, tacticalPlan, followUp, routing));
      working = executed.state;
      appliedActions.push(action, ...executed.followUps);
    }
    const planActions = appliedActions.slice(planActionStart);
    if (originalPlan.id === prepared.portfolio.primaryPlan?.id) primaryPlanMadeProgress = madeProgress;
    const phase = nextPlanPhase(
      working,
      originalPlan,
      assignedUnitIds,
      planActions,
      prepared.perception,
    );
    working = writeUpdatedPlan(working, {
      ...originalPlan,
      phase,
      lastProgressTurn: madeProgress
        ? working.turn
        : originalPlan.lastProgressTurn,
      assignedUnitIds: [...assignedUnitIds],
    });
  }

  return { state: working, actions: appliedActions, traces, primaryPlanMadeProgress };
}
