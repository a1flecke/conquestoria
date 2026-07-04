import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import type { AIDecisionTrace } from '@/ai/ai-decision-trace';
import { getAIStrategicRoles } from '@/ai/ai-unit-roles';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { EventBus } from '@/core/event-bus';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
import type {
  AIStrategicPlan,
  GameEvents,
  GameState,
  OpponentChallenge,
  UnitType,
} from '@/core/types';
import { getTrainableUnitsForCity, TRAINABLE_UNITS } from '@/systems/city-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { isTrustedObservedLastSeenTile } from '@/systems/last-seen-presentation';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { TECH_TREE, resolveCivilizationEra } from '@/systems/tech-definitions';
import { getAvailableTechs } from '@/systems/tech-system';
import { processTurn } from '@/core/turn-manager';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';

export type AIPersonality =
  | 'aggressive'
  | 'diplomatic'
  | 'expansionist'
  | 'trader';

export interface AISimulationOptions {
  seed: string;
  challenge: OpponentChallenge;
  turns: number;
  mapSize: 'small' | 'medium' | 'large';
  humanCount: number;
  aiCount: number;
  personalitySet: AIPersonality[];
}

export interface AISimulationMetrics {
  turns: number;
  cityCaptures: number;
  campsResolved: number;
  pirateRaids: number;
  plansCreated: number;
  plansCompleted: number;
  plansAbandoned: number;
  planProgressTransitions: number;
  maxNoProgressRounds: number;
  modernUnitShareByCiv: Record<string, number>;
  eraByCiv: Record<string, number>;
  maxObjectiveCandidatesPerActor: number;
  maxPathQueriesPerActor: number;
  maxIndependentThreatsByHuman: Record<string, number>;
  visibleWarningLeadRounds: number[];
  roundDurationsMs: number[];
  elapsedMs: number;
}

const PERSONALITY_CIV: Record<AIPersonality, string> = {
  aggressive: 'mongolia',
  diplomatic: 'babylon',
  expansionist: 'egypt',
  trader: 'persia',
};

const WORLD_OWNERS = new Set(['barbarian', 'pirate', 'rebels', 'beasts']);

function plansForState(state: GameState): Map<string, AIStrategicPlan> {
  const plans = new Map<string, AIStrategicPlan>();
  for (const portfolio of Object.values(state.opponentAI?.majorCivs ?? {})) {
    if (portfolio.primaryPlan) plans.set(portfolio.primaryPlan.id, portfolio.primaryPlan);
    for (const plan of Object.values(portfolio.defensePlansByCityId)) {
      plans.set(plan.id, plan);
    }
  }
  return plans;
}

function initializeScenario(options: AISimulationOptions): GameState {
  if (options.personalitySet.length < options.aiCount) {
    throw new Error(`${options.seed}: personalitySet must cover every AI`);
  }
  const totalPlayers = options.humanCount + options.aiCount;
  const state = options.humanCount === 1
    ? createNewGame({
        civType: 'rome',
        seed: options.seed,
        mapSize: options.mapSize,
        opponentCount: options.aiCount,
        gameTitle: options.seed,
        opponentChallenge: options.challenge,
        settingsOverrides: { tutorialEnabled: false },
        mapScript: 'balanced',
      })
    : createHotSeatGame({
        playerCount: totalPlayers,
        mapSize: options.mapSize,
        mapScript: 'balanced',
        players: [
          ...Array.from({ length: options.humanCount }, (_, index) => ({
            name: `Human ${index + 1}`,
            slotId: `player-${index + 1}`,
            civType: ['rome', 'greece', 'china'][index % 3]!,
            isHuman: true,
          })),
          ...Array.from({ length: options.aiCount }, (_, index) => ({
            name: `AI ${index + 1}`,
            slotId: `ai-${index + 1}`,
            civType: PERSONALITY_CIV[options.personalitySet[index]!],
            isHuman: false,
          })),
        ],
      }, options.seed, options.seed, options.challenge);

  const aiIds = Object.values(state.civilizations)
    .filter(civ => !civ.isHuman)
    .map(civ => civ.id)
    .sort();
  for (let index = 0; index < aiIds.length; index++) {
    state.civilizations[aiIds[index]!]!.civType =
      PERSONALITY_CIV[options.personalitySet[index]!]!;
  }
  state.gameId = `simulation:${options.seed}`;

  let founded = state;
  const setupBus = new EventBus();
  for (const civId of Object.keys(founded.civilizations).sort()) {
    const settlerId = founded.civilizations[civId]!.units.find(
      unitId => founded.units[unitId]?.type === 'settler',
    );
    if (!settlerId) throw new Error(`${options.seed}: ${civId} has no starting settler`);
    founded = foundCityInState(founded, settlerId, setupBus).state;
  }
  return founded;
}

function assertFiniteSerializable(state: GameState, seed: string): void {
  const json = JSON.stringify(state);
  if (!json) throw new Error(`${seed}: state is not serializable`);
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`${seed}: non-finite number at ${path}`);
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(state, 'state');
}

function assertOwnersAndReferences(state: GameState, seed: string): void {
  for (const unit of Object.values(state.units)) {
    if (
      !state.civilizations[unit.owner]
      && !state.minorCivs[unit.owner]
      && !state.pirates?.factions[unit.owner]
      && !WORLD_OWNERS.has(unit.owner)
    ) {
      throw new Error(`${seed}: unit ${unit.id} has invalid owner ${unit.owner}`);
    }
  }
  for (const city of Object.values(state.cities)) {
    if (!state.civilizations[city.owner] && !state.minorCivs[city.owner]) {
      throw new Error(`${seed}: city ${city.id} has invalid owner ${city.owner}`);
    }
  }
  for (const civ of Object.values(state.civilizations)) {
    for (const unitId of civ.units) {
      const unit = state.units[unitId];
      if (unit && unit.owner !== civ.id) {
        throw new Error(`${seed}: ${civ.id} references wrong-owner unit ${unitId}`);
      }
    }
    for (const cityId of civ.cities) {
      const city = state.cities[cityId];
      if (city && city.owner !== civ.id) {
        throw new Error(`${seed}: ${civ.id} references wrong-owner city ${cityId}`);
      }
    }
  }
}

function targetWasPerceived(
  state: GameState,
  actorId: string,
  plan: AIStrategicPlan,
): boolean {
  if (plan.target.kind === 'region') return true;
  const actor = state.civilizations[actorId];
  if (!actor) return false;
  const position = plan.target.kind === 'resource'
    ? plan.target.position
    : plan.target.lastKnownPosition;
  if (plan.target.kind === 'city' && state.cities[plan.target.id]?.owner === actorId) {
    return true;
  }
  if (plan.target.kind === 'unit' && state.units[plan.target.id]?.owner === actorId) {
    return true;
  }
  if (getVisibility(actor.visibility, position) === 'visible') return true;
  const remembered = actor.visibility.lastSeen?.[hexKey(position)];
  if (!isTrustedObservedLastSeenTile(remembered)) return false;
  if (plan.target.kind === 'city') return remembered.city?.id === plan.target.id;
  if (plan.target.kind === 'unit') {
    const targetUnitId = plan.target.id;
    return remembered.units?.some(unit => unit.id === targetUnitId) ?? false;
  }
  if (plan.target.kind === 'resource') return remembered.resource === plan.target.resource;
  return plan.target.kind === 'camp';
}

function assertPlanInvariants(state: GameState, seed: string): void {
  for (const [actorId, portfolio] of Object.entries(state.opponentAI?.majorCivs ?? {})) {
    const plans = [
      ...(portfolio.primaryPlan ? [portfolio.primaryPlan] : []),
      ...Object.values(portfolio.defensePlansByCityId),
    ];
    if (Object.keys(portfolio.defensePlansByCityId).length > 4) {
      throw new Error(`${seed}: ${actorId} exceeded four retained defense plans`);
    }
    for (const plan of plans) {
      if (state.turn > plan.expiresAfterTurn) {
        throw new Error(`${seed}: ${plan.id} remained active after expiry`);
      }
      if (!targetWasPerceived(state, actorId, plan)) {
        throw new Error(`${seed}: ${plan.id} has an unearned exact target`);
      }
      for (const unitId of plan.assignedUnitIds) {
        if (state.units[unitId]?.owner !== actorId) {
          throw new Error(`${seed}: ${plan.id} assigned dead or wrong-owner ${unitId}`);
        }
      }
    }
  }
}

function assertLegalChoices(
  state: GameState,
  traces: readonly AIDecisionTrace[],
  seed: string,
  lateEra: boolean,
): void {
  for (const trace of traces) {
    if (trace.candidates.length > 12) {
      throw new Error(`${seed}: ${trace.actorId} trace exceeded 12 candidates`);
    }
    if (trace.selectedId) {
      const selected = trace.candidates.find(candidate => candidate.id === trace.selectedId);
      if (!selected?.eligible) {
        throw new Error(`${seed}: ${trace.actorId} selected ineligible ${trace.decision}`);
      }
    }
  }
  for (const civ of Object.values(state.civilizations).filter(civ => !civ.isHuman && !civ.isEliminated)) {
    const hasCity = civ.cities.some(cityId => state.cities[cityId]?.owner === civ.id);
    if (!hasCity) continue;
    if (!civ.techState.currentResearch && getAvailableTechs(civ.techState).length === 0
      && civ.techState.completed.length < TECH_TREE.length) {
      throw new Error(`${seed}: ${civ.id} has no legal research choice`);
    }
    if (!lateEra) continue;
    const resources = getCivAvailableResources(state, civ.id);
    for (const cityId of civ.cities) {
      const city = state.cities[cityId];
      if (!city) continue;
      const queuedUnit = TRAINABLE_UNITS.find(entry => entry.type === city.productionQueue[0]);
      if (
        queuedUnit
        && !getTrainableUnitsForCity(
          city,
          civ.techState.completed,
          state.map,
          civ.civType,
          resources,
        ).some(entry => entry.type === queuedUnit.type)
      ) {
        throw new Error(`${seed}: ${civ.id} queued blocked unit ${queuedUnit.type}`);
      }
    }
  }
}

function modernForceMetrics(state: GameState): {
  modernUnitShareByCiv: Record<string, number>;
  eraByCiv: Record<string, number>;
} {
  const modernUnitShareByCiv: Record<string, number> = {};
  const eraByCiv: Record<string, number> = {};
  for (const civ of Object.values(state.civilizations).filter(civ => !civ.isHuman && !civ.isEliminated)) {
    const completed = new Set(civ.techState.completed);
    const routed = new Set(
      Object.keys(state.opponentAI?.majorCivs[civ.id]?.upgradeRoutesByUnitId ?? {}),
    );
    const combat = civ.units
      .map(unitId => state.units[unitId])
      .filter(unit => unit && UNIT_DEFINITIONS[unit.type].strength > 0 && !routed.has(unit.id));
    const modern = combat.filter(unit => {
      const entry = TRAINABLE_UNITS.find(candidate => candidate.type === unit!.type);
      return entry && (!entry.obsoletedByTech || !completed.has(entry.obsoletedByTech));
    });
    modernUnitShareByCiv[civ.id] = combat.length === 0 ? 0 : modern.length / combat.length;
    eraByCiv[civ.id] = resolveCivilizationEra(civ.techState.completed);
  }
  return { modernUnitShareByCiv, eraByCiv };
}

function assertLateEraForce(state: GameState, seed: string): void {
  for (const civ of Object.values(state.civilizations).filter(civ => !civ.isHuman && !civ.isEliminated)) {
    const unitTypes = civ.units
      .map(unitId => state.units[unitId]?.type)
      .filter((type): type is UnitType => Boolean(type));
    if (!unitTypes.some(type => getAIStrategicRoles(type).some(
      role => role === 'capture' || role === 'frontline',
    ))) {
      throw new Error(`${seed}: ${civ.id} has no capture/frontline unit`);
    }
    const trainable = TRAINABLE_UNITS.filter(entry =>
      (!entry.techRequired || civ.techState.completed.includes(entry.techRequired))
      && (!entry.obsoletedByTech || !civ.techState.completed.includes(entry.obsoletedByTech)));
    const supportTrainable = trainable.some(entry =>
      getAIStrategicRoles(entry.type).some(role => role === 'ranged' || role === 'siege'));
    if (
      supportTrainable
      && !unitTypes.some(type =>
        getAIStrategicRoles(type).some(role => role === 'ranged' || role === 'siege'))
    ) {
      throw new Error(`${seed}: ${civ.id} has no ranged/siege support`);
    }
  }
}

function simulate(
  options: AISimulationOptions,
  lateEra: boolean,
): AISimulationMetrics {
  let state = initializeScenario(options);
  if (lateEra) {
    const eraNineTechs = TECH_TREE.filter(tech => tech.era <= 9).map(tech => tech.id);
    state.era = 9;
    for (const civ of Object.values(state.civilizations)) {
      civ.techState.completed = [...eraNineTechs];
      civ.techState.currentResearch = null;
      civ.techState.researchQueue = [];
      civ.techState.researchProgress = 0;
      civ.gold = 1_000;
      if (civ.isHuman) continue;
      const warrior = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'warrior');
      if (warrior) {
        warrior.type = 'tank';
        warrior.movementPointsLeft = UNIT_DEFINITIONS.tank.movementPoints;
      }
      const city = civ.cities.map(id => state.cities[id]).find(Boolean);
      if (city) {
        const support = createUnit('biplane', civ.id, city.position, state.idCounters);
        state.units[support.id] = support;
        civ.units.push(support.id);
      }
    }
  }

  const metrics: AISimulationMetrics = {
    turns: 0,
    cityCaptures: 0,
    campsResolved: 0,
    pirateRaids: 0,
    plansCreated: 0,
    plansCompleted: 0,
    plansAbandoned: 0,
    planProgressTransitions: 0,
    maxNoProgressRounds: 0,
    modernUnitShareByCiv: {},
    eraByCiv: {},
    maxObjectiveCandidatesPerActor: 0,
    maxPathQueriesPerActor: 0,
    maxIndependentThreatsByHuman: {},
    visibleWarningLeadRounds: [],
    roundDurationsMs: [],
    elapsedMs: 0,
  };
  const humanIds = Object.values(state.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .map(civ => civ.id)
    .sort();
  for (const id of humanIds) metrics.maxIndependentThreatsByHuman[id] = 0;

  const warningRoundByViewerActor = new Map<string, number>();
  const startedAt = performance.now();
  for (let round = 0; round < options.turns; round++) {
    const roundStart = performance.now();
    const beforePlans = plansForState(state);
    const beforeInput = JSON.stringify(state);
    let traces: AIDecisionTrace[] = [];
    let planningErrors: string[] = [];
    const bus = new EventBus();
    const captures: GameEvents['city:captured'][] = [];
    bus.on('city:captured', event => {
      metrics.cityCaptures += 1;
      captures.push(event);
    });
    bus.on('barbarian:camp-destroyed', () => {
      metrics.campsResolved += 1;
    });
    bus.on('threat:pirate-plunder', () => {
      metrics.pirateRaids += 1;
    });
    bus.on('pirate:audio-cue', event => {
      if (event.cue === 'raid') metrics.pirateRaids += 1;
    });
    bus.on('ai:strategic-warning', warning => {
      warningRoundByViewerActor.set(
        `${warning.viewerId}:${warning.actorId}`,
        round,
      );
    });

    const completed = runCompletedRound(state, bus, {
      improvements: (current, eventBus) => processImprovementTurns(current, eventBus),
      majors: (current, eventBus) => {
        const result = processNonHumanMajorRound(current, eventBus);
        traces = result.traces;
        planningErrors = result.planningErrors.map(error =>
          `${error.actorId}: ${error.message}`);
        return result.state;
      },
      world: (current, eventBus) => processTurn(current, eventBus),
      postprocess: (beforeRound, current, eventBus) =>
        applyStrategicWarningTransitions(beforeRound, current, eventBus),
    });
    if (!completed.ok) {
      throw new Error(`${options.seed}: completed round ${round + 1} failed`, {
        cause: completed.error,
      });
    }
    if (JSON.stringify(state) !== beforeInput) {
      throw new Error(`${options.seed}: completed-round input mutated`);
    }
    state = completed.state;
    const commitErrors = completed.events.commitTo(bus);
    if (commitErrors.length > 0) {
      throw new Error(`${options.seed}: event commit failed`, { cause: commitErrors[0] });
    }
    if (planningErrors.length > 0) {
      throw new Error(`${options.seed}: planning failed: ${planningErrors.join('; ')}`);
    }

    const livingAIs = Object.values(state.civilizations)
      .filter(civ => !civ.isHuman && !civ.isEliminated)
      .filter(civ =>
        civ.cities.some(id => state.cities[id]?.owner === civ.id)
        || civ.units.some(id => state.units[id]?.owner === civ.id));
    for (const civ of livingAIs) {
      const portfolio = state.opponentAI?.majorCivs[civ.id];
      if (
        portfolio?.lastPlannedTurn !== state.turn - 1
        || portfolio.lastExecutedTurn !== state.turn - 1
      ) {
        throw new Error(`${options.seed}: ${civ.id} did not prepare and execute exactly once`);
      }
    }

    const afterPlans = plansForState(state);
    for (const [id, plan] of afterPlans) {
      const before = beforePlans.get(id);
      if (!before) {
        metrics.plansCreated += 1;
        metrics.planProgressTransitions += 1;
      } else if (
        before.phase !== plan.phase
        || before.lastProgressTurn !== plan.lastProgressTurn
      ) {
        metrics.planProgressTransitions += 1;
      }
      metrics.maxNoProgressRounds = Math.max(
        metrics.maxNoProgressRounds,
        state.turn - plan.lastProgressTurn,
      );
    }
    for (const [id, before] of beforePlans) {
      if (afterPlans.has(id)) continue;
      const completedTarget =
        before.target.kind === 'city' && state.cities[before.target.id]?.owner === before.actorId
        || before.target.kind === 'unit' && !state.units[before.target.id]
        || before.target.kind === 'camp' && !state.barbarianCamps[before.target.id];
      if (completedTarget) metrics.plansCompleted += 1;
      else metrics.plansAbandoned += 1;
    }

    for (const trace of traces) {
      metrics.maxObjectiveCandidatesPerActor = Math.max(
        metrics.maxObjectiveCandidatesPerActor,
        trace.candidates.length,
      );
      if (trace.decision === 'objective') {
        metrics.maxPathQueriesPerActor = Math.max(
          metrics.maxPathQueriesPerActor,
          Math.min(24, trace.candidates.length),
        );
      }
    }
    for (const humanId of humanIds) {
      const ledger = state.opponentAI?.pressureByHuman[humanId];
      if (!ledger) throw new Error(`${options.seed}: missing pressure ledger for ${humanId}`);
      const activeCount = ledger.activeIndependentThreatIds.length;
      metrics.maxIndependentThreatsByHuman[humanId] = Math.max(
        metrics.maxIndependentThreatsByHuman[humanId] ?? 0,
        activeCount,
      );
      const cap = OPPONENT_CHALLENGE_PROFILES[options.challenge].maxIndependentCrisesPerHuman;
      if (activeCount > cap) {
        throw new Error(`${options.seed}: ${humanId} exceeded pressure cap ${cap}`);
      }
    }
    for (const threatId of new Set(humanIds.flatMap(
      humanId => state.opponentAI!.pressureByHuman[humanId]!.activeIndependentThreatIds,
    ))) {
      const materiallyAffected = humanIds.filter(humanId =>
        state.opponentAI!.pressureByHuman[humanId]!.activeIndependentThreatIds.includes(threatId));
      if (materiallyAffected.length > 1 && materiallyAffected.some(humanId =>
        !state.opponentAI!.pressureByHuman[humanId]!.activeIndependentThreatIds.includes(threatId))) {
        throw new Error(`${options.seed}: shared threat ${threatId} has inconsistent ledgers`);
      }
    }

    for (const capture of captures) {
      if (!humanIds.includes(capture.previousOwner)) continue;
      const key = `${capture.previousOwner}:${capture.newOwner}`;
      const warningRound = warningRoundByViewerActor.get(key);
      const priorPlan = [...beforePlans.values()].find(plan =>
        plan.actorId === capture.newOwner
        && plan.target.kind === 'city'
        && plan.target.id === capture.cityId);
      if (priorPlan && warningRound === undefined) {
        throw new Error(`${options.seed}: visible planned capture lacked strategic warning evidence`);
      }
      if (warningRound !== undefined) {
        metrics.visibleWarningLeadRounds.push(round - warningRound);
      }
    }

    assertFiniteSerializable(state, options.seed);
    assertOwnersAndReferences(state, options.seed);
    assertPlanInvariants(state, options.seed);
    assertLegalChoices(state, traces, options.seed, lateEra);
    metrics.roundDurationsMs.push(performance.now() - roundStart);
    metrics.turns += 1;
  }
  metrics.elapsedMs = performance.now() - startedAt;
  Object.assign(metrics, modernForceMetrics(state));
  if (lateEra) {
    assertLateEraForce(state, options.seed);
    for (const [civId, share] of Object.entries(metrics.modernUnitShareByCiv)) {
      if (share < 0.6) {
        const deployed = state.civilizations[civId]?.units
          .map(unitId => state.units[unitId]?.type)
          .filter(Boolean)
          .join(', ');
        throw new Error(
          `${options.seed}: ${civId} modern combat share ${share} is below 0.6 (${deployed})`,
        );
      }
    }
  }
  return metrics;
}

export function simulateAIRounds(options: AISimulationOptions): AISimulationMetrics {
  return simulate(options, false);
}

export function simulateLateEraAIRounds(
  options: AISimulationOptions,
): AISimulationMetrics {
  return simulate(options, true);
}
