import type { EventBus } from '@/core/event-bus';
import type {
  AIStrategicPlan,
  GameMap,
  GameState,
  MajorCivPlanPortfolio,
  PersonalityTraits,
} from '@/core/types';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { civHasCoastalCity, getTrainableUnitsForCiv, TRAINABLE_UNITS } from '@/systems/city-system';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { isTrustedObservedLastSeenTile } from '@/systems/last-seen-presentation';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { getAvailableActions, hasArmsControlTreaty } from '@/systems/diplomacy-system';
import { buildDominationKnowledge } from '@/systems/domination-knowledge';
import {
  buildMajorCivPerception,
  estimatePerceivedCivStrength,
  type MajorCivPerception,
} from './ai-perception';
import type { AIDecisionTrace } from './ai-decision-trace';
import {
  EXPANSION_SITE_SHORTLIST,
  getExpansionCitySoftCap,
  getKnownExpansionSites,
} from './ai-expansion-sites';
import { findRegionCrossings } from './ai-amphibious-routing';
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
import {
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
} from '@/core/opponent-challenge';
import { getCrisisDispatchCandidates } from './ai-crisis-response';
import { isCrisisPressureEligible, isPiratePressureEligible } from '@/systems/world-pressure-eligibility';
import {
  evaluateDominationDoctrine,
  getDominationCounterplay,
  isKnownIndependentDominationTarget,
  type DominationDoctrine,
} from './ai-domination';
import { resolveCivDefinition } from '@/systems/civ-registry';

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
  desired?: number;
  assigned?: number;
}

export function getPreparedAssignmentProfile(
  state: Pick<GameState, 'opponentChallenge'>,
) {
  return OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)];
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
    existing.desired += Math.max(0, Math.floor(addition.desired ?? 1));
    existing.assigned += Math.max(0, Math.floor(addition.assigned ?? 0));
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

/**
 * #1064 -- an INCREMENTAL demand: "one more R, up to `cap`".
 *
 * `desired = min(owned + 1, cap)` and `assigned = owned`, so the merged `missing` is
 * structurally 0 or 1. A standing force can never be requested in a single round, and
 * a demand can never outrun the units that satisfy it -- which is exactly the failure
 * that made a persistent readiness role produce one unit per turn forever.
 *
 * Returns [] once already OVER the cap (owned > cap) so callers stay declarative.
 * Exactly AT the cap still emits a satisfied entry (desired === assigned === cap,
 * so missing === 0) rather than [] -- an off-by-one here would make a demand
 * disappear right at the boundary instead of reading as satisfied.
 */
export function incrementalDemandSeed(
  role: AIForceDemand['role'],
  sourceId: string,
  priority: number,
  owned: number,
  cap: number,
): PreparedForceDemandSeed[] {
  const held = Math.max(0, Math.floor(owned));
  const ceiling = Math.max(0, Math.floor(cap));
  if (held > ceiling) return [];
  return [{ role, sourceId, priority, desired: Math.min(held + 1, ceiling), assigned: held }];
}

/** Most workers an empire will ever ask for, regardless of city count. */
export const WORKER_SOFT_CAP = 4;

function observedArmorDemand(
  state: Readonly<GameState>,
  perception: MajorCivPerception,
  profile: ReturnType<typeof getPreparedAssignmentProfile>,
): PreparedForceDemandSeed[] {
  const armor = perception.units.filter(unit =>
    unit.type !== null
      && isAIHostileOwner(state, perception.actorId, unit.owner)
      && UNIT_CLASS_BY_TYPE[unit.type].includes('armor'));
  const visibleArmor = armor.filter(unit => unit.confidence === 'visible');
  const rememberedArmor = armor.filter(unit => unit.confidence === 'remembered');
  const counterCap = Math.max(1, Math.floor(profile.maxPrimaryForce / 3));
  const desired = visibleArmor.length > 0
    ? Math.min(visibleArmor.length, counterCap)
    : rememberedArmor.length > 0 ? 1 : 0;
  if (desired === 0) return [];
  const assigned = perception.ownUnits.filter(unit =>
    getAIStrategicRoles(unit.type).includes('anti-armor')).length;
  return [{
    role: 'anti-armor',
    sourceId: visibleArmor.length > 0 ? 'observed-armor' : 'remembered-armor',
    priority: visibleArmor.length > 0 ? 180 : 80,
    desired,
    assigned,
  }];
}

function observedAirDefenseDemand(
  state: Readonly<GameState>,
  perception: MajorCivPerception,
): PreparedForceDemandSeed[] {
  const hostileAir = perception.units.filter(unit => unit.type !== null
    && isAIHostileOwner(state, perception.actorId, unit.owner)
    && UNIT_DEFINITIONS[unit.type].domain === 'air'
    && UNIT_DEFINITIONS[unit.type].airOperation?.missions.includes('strike'));
  const visible = hostileAir.filter(unit => unit.confidence === 'visible');
  const remembered = hostileAir.filter(unit => unit.confidence === 'remembered');
  if (visible.length === 0 && remembered.length === 0) return [];
  const assigned = perception.ownUnits.filter(unit =>
    getAIStrategicRoles(unit.type).includes('air-defense')).length;
  return [{ role: 'air-defense', sourceId: visible.length > 0 ? 'observed-air' : 'remembered-air', priority: visible.length > 0 ? 180 : 80, desired: 1, assigned }];
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
  doctrine: DominationDoctrine,
  knowledge: ReturnType<typeof buildDominationKnowledge>,
  personality: PersonalityTraits,
): AIObjectiveCandidate[] {
  const actor = state.civilizations[civId];
  const operationalAnchors = perception.ownCities.length > 0
    ? perception.ownCities.map(city => city.position)
    : perception.ownUnits
        .filter(unit => !unit.transportId)
        .map(unit => unit.position);
  // #1107 -- a settler committed to an in-progress expand site must not get
  // redirected to a different one just because fog revealed a few more terrain
  // tiles this round and shifted the raw score ordering. Computed once, reused
  // both to keep this target in getKnownExpansionSites' result (pinnedAnchor
  // below) and to prefer it when collapsing to a single bestExpand candidate.
  //
  // Belief can be wrong; canonical legality always wins over stickiness. The
  // belief layer's own "legal" check (isCityCenterTerrain + distance from
  // KNOWN cities) can disagree with canFoundCityAt's full, canonical check --
  // e.g. another civ founded a real city near the target in the meantime,
  // never observed due to fog. Once a target is PROVEN illegal, it must stop
  // being pinned/preferred: a settler that physically arrives at a
  // since-invalidated site has nothing else to do there, and stickiness would
  // otherwise keep re-proposing the same illegal anchor forever, trapping it.
  const currentPlan = state.opponentAI?.majorCivs[civId]?.primaryPlan;
  const currentExpandTargetRaw = currentPlan?.objective === 'expand' && currentPlan.target.kind === 'region'
    ? currentPlan.target
    : undefined;
  const currentExpandTarget = currentExpandTargetRaw && canFoundCityAt(state, currentExpandTargetRaw.anchor)
    ? currentExpandTargetRaw
    : undefined;
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
    const rivalStrength = estimatePerceivedCivStrength(
      perception,
      city.owner,
      actorEra,
    ).midpoint;
    const peacefulDominationTarget = doctrine.pursuit
      && actor.knownCivilizations?.includes(city.owner) === true
      && isKnownIndependentDominationTarget(knowledge, city.owner)
      && getAvailableActions(actor.diplomacy, city.owner, {
        completedTechs: actor.techState.completed,
        civilizationEra: actorEra,
        hasArmsControlTreaty: hasArmsControlTreaty(state as GameState, civId),
      }).includes('declare_war');
    const expectedLossRatio = Math.min(2, rivalStrength / Math.max(1, ownStrength));
    if (!activeWar && !recentAttack && (!peacefulDominationTarget || expectedLossRatio > 1)) continue;
    const candidate: AIObjectiveCandidate = {
      objective: 'capture',
      target: {
        kind: 'city',
        id: city.id,
        lastKnownPosition: { ...city.position },
      },
      theaterId: `local:${city.position.q},${city.position.r}`,
      travelTurns,
      strategicValue: activeWar
        ? 75
        : recentAttack
          ? 45
          : Math.min(100, 75 + doctrine.captureValueBonus),
      expectedLossRatio,
      supplyDistance: travelTurns,
      explicitDistantReasons: recentAttack
        ? ['retaliate-recent-attack']
        : activeWar
          ? ['continue-active-war']
          : [],
      reasonCodes: peacefulDominationTarget ? doctrine.reasonCodes : [],
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
  // #1064: expansion is a real objective, not an administrative side-channel. With no
  // settler this candidate is ineligible (missingRoles) but still reports `settlement`,
  // which becomes an objective-readiness demand and makes the settler buildable. With a
  // settler it becomes a plan and the settler is assigned to it.
  if (perception.ownCities.length < getExpansionCitySoftCap(personality.expansionDrive)) {
    // BUG FOUND VIA INTEGRATION TESTING (not caught by unit tests): perception.knownCities
    // is built ONLY from OTHER civs' cities the actor has observed -- the actor's own live
    // separately in perception.ownCities. Omitting them here let a belief-layer site win
    // one tile from the civ's own capital (its highest-scoring neighbourhood, since nothing
    // else competed), which is always illegal under MIN_CITY_CENTER_DISTANCE -- and because
    // scoring never re-checks legality, the SAME illegal site was regenerated as "best"
    // every round, permanently freezing the assigned settler (found-city refused,
    // move-to-self is a zero-length path). A live 25-round determinism run caught this;
    // no isolated unit test exercised the real perception.knownCities/ownCities split.
    const knownCityPositions = [
      ...perception.ownCities.map(city => city.position),
      ...perception.knownCities.flatMap(city => city.position ? [city.position] : []),
    ];
    for (const site of getKnownExpansionSites(
      knownMap,
      knownCityPositions,
      operationalAnchors,
      EXPANSION_SITE_SHORTLIST,
      !civHasCoastalCity(state, civId),
      currentExpandTarget?.anchor,
    )) {
      const anchor = nearestAnchor(site.anchor);
      const travelTurns = Math.ceil(distance(state, anchor, site.anchor) / 2);
      const candidate: AIObjectiveCandidate = {
        objective: 'expand',
        target: {
          kind: 'region',
          id: `settle:${hexKey(site.anchor)}`,
          anchor: { ...site.anchor },
        },
        theaterId: `local:${site.anchor.q},${site.anchor.r}`,
        travelTurns,
        strategicValue: Math.max(0, Math.min(100, site.score * (0.5 + personality.expansionDrive))),
        expectedLossRatio: 0,
        supplyDistance: travelTurns,
        // Expansion is LOCAL activity. It must never earn scoreObjectiveCandidate's
        // +35 distant-reason bonus.
        explicitDistantReasons: [],
        requiredRoles: { settlement: 1 },
      };
      candidates.push(candidate);
      startByCandidate.set(candidate, anchor);
    }
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
  // #1066: one BFS per civ per turn, reused by every candidate below that
  // needs a sea-crossing fallback -- see
  // docs/superpowers/specs/2026-09-13-issue-1066-amphibious-objective-routing-design.md.
  const originRegionKeys = new Set(
    operationalAnchors
      .map(anchor => knownMap.tiles[hexKey(anchor)]?.regionKey)
      .filter((key): key is string => key !== undefined),
  );
  const crossings = findRegionCrossings(knownMap, originRegionKeys);
  const resolved = resolveObjectiveTravelCandidates(knownMap, travelInputs, crossings);
  // Exactly ONE expand candidate reaches the caller, so the decision trace grows by at
  // most 1 unconditionally -- assertLegalChoices hard-throws above 12 candidates. The
  // shortlist exists only so an unreachable best site falls back to a reachable one.
  // One is also the semantically correct number: a civ has one primaryPlan and, by the
  // incremental settlement demand, at most one settler.
  const rankedExpand = resolved
    .filter(candidate =>
      candidate.objective === 'expand' && Number.isFinite(candidate.travelTurns))
    .sort((left, right) =>
      scoreObjectiveCandidate(right) - scoreObjectiveCandidate(left)
      || targetStableKey(left.target).localeCompare(targetStableKey(right.target)));
  // A settler committed to an in-progress expand site must not get redirected to a
  // marginally-better-scoring one just because fog revealed a few more terrain tiles
  // this round -- site scores are recomputed fresh every round from whatever's
  // currently known, so two close-scoring sites can trade the #1 spot turn to turn
  // with no actual change in legality/reachability. Without this, the settler never
  // completes a single journey: found via #1107's coastal-recovery bias making
  // several previously-uncompetitive coastal sites suddenly compete against EACH
  // OTHER for the top slot, but the underlying "recompute best from scratch every
  // round" behavior predates #1107 and is not specific to coastal sites.
  // getKnownExpansionSites' pinnedAnchor (above) guarantees currentExpandTarget's
  // own site survives its shortlist truncation, so it's always findable here too.
  const stillCommitted = currentExpandTarget
    ? rankedExpand.find(candidate =>
        candidate.target.kind === 'region' && candidate.target.id === currentExpandTarget.id)
    : undefined;
  const bestExpand = stillCommitted ?? rankedExpand[0];
  return [
    ...resolved.filter(candidate => candidate.objective !== 'expand'),
    ...(bestExpand ? [bestExpand] : []),
  ];
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

// Converts CrisisDispatchCandidate (pirate fleets, later hunt foes) into the
// same AIPlanCandidate shape objectiveCandidates() produces, so they compete
// for primaryPlan through the existing selectPrimaryPlan scoring in
// ai-plan-portfolio.ts rather than a parallel decision path.
function crisisDispatchPlanCandidates(state: GameState, civId: string): AIPlanCandidate[] {
  return getCrisisDispatchCandidates(state, civId).flatMap(candidate => {
    const eligible = candidate.kind === 'stampede' || candidate.kind === 'rogue-elephant-host'
      ? isCrisisPressureEligible(state, civId)
      : isPiratePressureEligible(state, civId);
    if (!eligible) return [];
    const unit = state.units[candidate.targetUnitId];
    if (!unit) return [];
    return [{
      objective: 'repel',
      target: { kind: 'unit', id: candidate.targetUnitId, lastKnownPosition: { ...unit.position } },
      theaterId: `local:${unit.position.q},${unit.position.r}`,
      score: candidate.score,
      reasonCodes: [candidate.kind === 'stampede' ? 'visible-stampede' : 'urgent-defense'],
      requiredRoles: { [candidate.kind === 'stampede' || candidate.kind === 'rogue-elephant-host' ? 'frontline' : 'naval-combat']: 1 },
      commitment: 0.25,
      targetValid: true,
      reasonValid: true,
      expectedLossRatio: 0,
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
  const knowledge = buildDominationKnowledge(state, civId);
  const personality = resolveCivDefinition(state, civ.civType)?.personality ?? {
    traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5,
  };
  const doctrine = evaluateDominationDoctrine({
    knowledge,
    ownCityCount: perception.ownCities.length,
    personality,
    challenge: resolveOpponentChallenge(state),
  });
  const counterplay = getDominationCounterplay(knowledge);
  const candidates = objectiveCandidates(state, civId, perception, knownMap, doctrine, knowledge, personality);
  const availableRoles = availableRoleCounts(perception);
  const choice = choosePrimaryObjective({
    actorId: civId,
    turn: state.turn,
    candidates,
    availableRoles,
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
    actorEliminated: !getCivilizationLiveness(state, civId).living,
    portfolio: previous,
    candidates: [...planCandidates(candidates, choice), ...crisisDispatchPlanCandidates(state, civId)],
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
      activeOtherDuty: Boolean(
        unit.workerTask
        || unit.committedToRouteId
        || portfolioResult.portfolio.upgradeRoutesByUnitId[unit.id],
      ),
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
    profile: getPreparedAssignmentProfile(state),
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
      // #1064: a readiness demand means "I own ZERO units of role R, so I cannot even
      // consider this objective". Owning one satisfies it. Before this it re-seeded
      // desired:1/assigned:0 every turn, and residualDemands only discounts QUEUED
      // units -- so a persistent readiness role produced one unit per turn forever.
      ...choice.demands.flatMap(role => incrementalDemandSeed(
        role,
        'objective-readiness',
        90,
        Math.min(availableRoles[role] ?? 0, 1),
        1,
      )),
      // #1064: workers have the production gap but not the execution gap -- basic-ai's
      // idle-worker loop already tasks them. Bounded by city count so a wide empire
      // does not turn into a worker farm.
      ...incrementalDemandSeed(
        'worker',
        'worker-infrastructure',
        40,
        perception.ownUnits.filter(unit =>
          !unit.transportId && getAIStrategicRoles(unit.type).includes('worker')).length,
        Math.min(perception.ownCities.length, WORKER_SOFT_CAP),
      ),
      ...(counterplay ? [{
        ...counterplay.forceDemand,
        desired: 1,
      }] : []),
      ...portfolioResult.unplannedDefenseCityIds.map(cityId => ({
        role: 'frontline' as const,
        sourceId: `defense-overflow:${cityId}`,
        priority: 600,
      })),
      ...observedArmorDemand(state, perception, getPreparedAssignmentProfile(state)),
      ...observedAirDefenseDemand(state, perception),
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
