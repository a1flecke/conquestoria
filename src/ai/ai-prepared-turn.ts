import type { EventBus } from '@/core/event-bus';
import type {
  AIStrategicPlan,
  AIStrategicRole,
  GameMap,
  GameState,
  MajorCivPlanPortfolio,
  NationalIntentState,
  PersonalityTraits,
  UnitType,
} from '@/core/types';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import {
  civHasCoastalCity,
  cityFollowsOwnFaith,
  getTrainableUnitsForCity,
  getTrainableUnitsForCiv,
  TRAINABLE_UNITS,
} from '@/systems/city-system';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { isVisible } from '@/systems/fog-of-war';
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
import { createAIDecisionTrace, type AIDecisionTrace } from './ai-decision-trace';
import {
  EXPANSION_SEARCH_RADIUS,
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
import { countAIStrategicRoleCapabilities, getAIStrategicRoles, hasAICombatRole } from './ai-unit-roles';
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
import {
  NATIONAL_INTENT_POSTURE,
  resolveNationalIntent,
  scoreIntents,
  type NationalIntentPosture,
} from './ai-national-intent';

export interface PreparedMajorCivPlan {
  civId: string;
  perception: MajorCivPerception;
  portfolio: MajorCivPlanPortfolio;
  assignments: AIUnitAssignmentResult;
  forceDemands: AIForceDemand[];
  traces: AIDecisionTrace[];
  nationalIntent: NationalIntentState;
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

/**
 * Force-demand `sourcePlanIds` entries that name a standing, observation-derived need
 * rather than a specific `AIStrategicPlan` -- these are recomputed fresh from world
 * state every round (never carried over from a prior round the way a plan is), so they
 * can never go "stale" the way a persisted plan can and must never be checked against
 * `validPlanIds`. `revalidatePreparedPlan` (`ai-round-scheduler.ts`) is the only other
 * consumer of this taxonomy -- it must treat every one of these, plus every
 * `DOMINATION_THREAT_SOURCE_PREFIX`-prefixed id, as always valid; anything absent from
 * both is assumed to be a real plan id and checked against `validPlanIds` instead.
 *
 * #1116: `worker-infrastructure` was missing from this set (which didn't exist as a
 * shared export yet -- `ai-round-scheduler.ts` hardcoded only `objective-readiness`),
 * so #1064's worker-production demand was silently dropped every single round since it
 * shipped -- no AI civ has ever trained a Worker as a result. `observed-armor` /
 * `remembered-armor` / `observed-air` / `remembered-air` had the identical defect.
 * Add a new entry here (or to `DOMINATION_THREAT_SOURCE_PREFIX`-style prefix handling
 * in `ai-round-scheduler.ts` for a per-target tag) whenever a new plan-agnostic demand
 * source is introduced -- never re-hardcode a string directly in the scheduler.
 */
export const PLAN_AGNOSTIC_DEMAND_SOURCE_IDS: ReadonlySet<string> = new Set([
  'objective-readiness',
  'worker-infrastructure',
  'observed-armor',
  'remembered-armor',
  'observed-air',
  'remembered-air',
]);

/**
 * Per-target-city plan-agnostic prefix (`ai-round-scheduler.ts` still validates the
 * named city still exists and is still owned by the demanding civ -- unlike the exact
 * sources above, the overflow *target* itself can legitimately go stale).
 */
export const DEFENSE_OVERFLOW_SOURCE_PREFIX = 'defense-overflow:';

/**
 * Per-target-civ plan-agnostic prefix from `ai-domination.ts`'s counterplay demand --
 * recomputed fresh every round from current domination knowledge like the exact
 * sources above, so no further per-target revalidation is needed.
 */
export const DOMINATION_THREAT_SOURCE_PREFIX = 'domination-threat:';

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
  trainableTypes: readonly (typeof TRAINABLE_UNITS)[number]['type'][],
  posture: NationalIntentPosture,
): AIObjectiveCandidate[] {
  const actor = state.civilizations[civId];
  const operationalAnchors = perception.ownCities.length > 0
    ? perception.ownCities.map(city => city.position)
    : perception.ownUnits
        .filter(unit => !unit.transportId)
        .map(unit => unit.position);
  if (!actor || operationalAnchors.length === 0) return [];
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
  // A pin/preference must stay bounded by the same EXPANSION_SEARCH_RADIUS the
  // belief layer's own normal site search respects -- otherwise a target that
  // was reachable when it was first pinned can end up permanently favoured
  // even after the civ's own operational anchors move on (a new city founded
  // elsewhere, an old one lost), leaving it stuck "committed" to a target
  // far away while better, genuinely local candidates sit unused. This bound is
  // a structural guarantee rather than a fix for an observed stall: in the
  // lh-late-era-medium campaign the one suspicious-looking case turned out to
  // be within radius once horizontal map wrapping is accounted for.
  const currentExpandTargetInReach = currentExpandTargetRaw
    ? operationalAnchors.some(anchor =>
        distance(state, anchor, currentExpandTargetRaw.anchor) <= EXPANSION_SEARCH_RADIUS)
    : false;
  const currentExpandTarget = currentExpandTargetRaw
    && currentExpandTargetInReach
    && canFoundCityAt(state, currentExpandTargetRaw.anchor)
    ? currentExpandTargetRaw
    : undefined;
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
    const observedGarrison = perception.units.some(unit => unit.owner === city.owner && unit.position
      && hexKey(unit.position) === hexKey(city.position!));
    const hardened = city.defense === 'fortified' && observedGarrison && city.hpBand === 'healthy';
    const supportRole = hardened
      ? trainableTypes.some(type => getAIStrategicRoles(type).includes('siege')) ? 'siege'
        : trainableTypes.some(type => getAIStrategicRoles(type).includes('ranged')) ? 'ranged'
          : undefined
      : undefined;
    const candidate: AIObjectiveCandidate = {
      objective: 'capture',
      target: {
        kind: 'city',
        id: city.id,
        lastKnownPosition: { ...city.position },
      },
      theaterId: `local:${city.position.q},${city.position.r}`,
      travelTurns,
      // #1086: posture.captureBias is intent's own, separately-reasoned contribution --
      // additive alongside doctrine.captureValueBonus, never replacing or duplicating it
      // (see design doc §6 -- doctrine decides pursuit eligibility, intent decides
      // this-turn priority).
      strategicValue: Math.max(0, Math.min(100, (activeWar
        ? 75
        : recentAttack
          ? 45
          : Math.min(100, 75 + doctrine.captureValueBonus)) + posture.captureBias)),
      expectedLossRatio,
      supplyDistance: travelTurns,
      explicitDistantReasons: recentAttack
        ? ['retaliate-recent-attack']
        : activeWar
          ? ['continue-active-war']
          : [],
      reasonCodes: peacefulDominationTarget ? doctrine.reasonCodes : [],
      requiredRoles: (
        city.defense === 'fortified'
        || observedGarrison
      ) ? { frontline: 2, capture: 1 } : { capture: 1 },
      ...(supportRole ? { supportRoles: { [supportRole]: 1 } } : {}),
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
      strategicValue: Math.max(0, Math.min(100, 55 + posture.resourceBias)),
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
    // #1107: perception.knownCities only ever includes MAJOR civs --
    // buildMajorCivPerception's remembered-city and contacted-civ loops never
    // touch minor-civ (city-state) cities at all. A visible city-state is
    // real and always inside canFoundCityAt's canonical distance check, but
    // was completely invisible to this belief-layer legality filter: found
    // via #1107, where the belief layer kept re-proposing a site 2 tiles
    // from a real, currently-visible minor civ forever, because it had no
    // way to ever learn the site was illegal -- the same class of bug the
    // ownCities fix above (see comment) already fixed for the civ's own
    // capital. Scoped to CURRENTLY VISIBLE minor-civ cities, matching this
    // bug's exact shape; a remembered-but-now-fogged minor-civ city is a
    // smaller completeness gap, not reproduced here.
    const knownCityPositions = [
      ...perception.ownCities.map(city => city.position),
      ...perception.knownCities.flatMap(city => city.position ? [city.position] : []),
      ...Object.values(state.minorCivs).flatMap(minorCiv => {
        const city = state.cities[minorCiv.cityId];
        return city && isVisible(actor.visibility, city.position) ? [city.position] : [];
      }),
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
        // #1086: posture.expandBias is applied AFTER site selection (see bestExpand
        // below), not per-candidate here -- applying it per-candidate would shift the
        // #1107 anti-thrash switching-margin comparison between two already-viable
        // expand SITES (a site-selection concern), when intent is only meant to bias
        // expand's priority against OTHER objectives, never which specific site wins.
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
  const bestRankedExpand = rankedExpand[0];
  // Sticky, but not absolutely -- mirrors selectPrimaryPlan's own switchingBonus
  // hysteresis (10 + 20*commitment): a small score gap (fog noise, minor terrain
  // reveals) must not evict a committed target; a LARGE one (a much better site
  // genuinely became known/reachable) must. Without this, once any target
  // qualifies as "still committed" (legal, in reach) it wins forever regardless
  // of how much better another option is. Found via a #1107 Task-7 follow-up:
  // ai-1 stayed on a target scoring 46.75 -- technically in reach via a real
  // wraparound route, not a stale/unreachable pin, so the radius check above
  // correctly kept it -- while three local candidates scoring 71-73 sat
  // completely untried, because "still findable" alone was the only criterion
  // for staying committed.
  const switchingMargin = 10 + 20 * (currentPlan?.commitment ?? 0);
  const bestExpand = stillCommitted
    && bestRankedExpand
    && scoreObjectiveCandidate(stillCommitted) + switchingMargin >= scoreObjectiveCandidate(bestRankedExpand)
    ? stillCommitted
    : bestRankedExpand;
  // #1086: posture.expandBias applies once, to whichever site the (unaffected) #1107
  // stickiness logic above already chose -- biasing expand's priority against sibling
  // capture/secure-resource candidates without ever influencing which expand SITE wins.
  const biasedExpand = bestExpand
    ? { ...bestExpand, strategicValue: Math.max(0, Math.min(100, bestExpand.strategicValue + posture.expandBias)) }
    : bestExpand;
  return [
    ...resolved.filter(candidate => candidate.objective !== 'expand'),
    ...(biasedExpand ? [biasedExpand] : []),
  ];
}

function planTargetPosition(plan: AIStrategicPlan): { q: number; r: number } {
  if ('lastKnownPosition' in plan.target) return plan.target.lastKnownPosition;
  return plan.target.kind === 'resource'
    ? plan.target.position
    : plan.target.anchor;
}

function availableRoleCounts(perception: MajorCivPerception) {
  const roles = [...new Set((Object.keys(UNIT_DEFINITIONS) as Array<keyof typeof UNIT_DEFINITIONS>)
    .flatMap(type => getAIStrategicRoles(type)))];
  return countAIStrategicRoleCapabilities(perception.ownUnits.filter(unit => !unit.transportId),
    Object.fromEntries(roles.map(role => [role, 1])));
}

function hasMissingCriticalRole(
  candidate: AIObjectiveCandidate,
  availableRoles: Partial<Record<AIStrategicRole, number>>,
): boolean {
  return Object.entries(candidate.requiredRoles).some(([role, desired]) =>
    Math.max(0, Math.floor(desired ?? 0)) > (availableRoles[role as AIStrategicRole] ?? 0));
}

function planCandidates(
  candidates: readonly AIObjectiveCandidate[],
  choice: AIObjectiveChoice,
  availableRoles: Partial<Record<AIStrategicRole, number>>,
  trainableInOwnedCities: readonly UnitType[],
): AIPlanCandidate[] {
  const eligibleIds = new Set(choice.eligibleCandidateIds);
  return candidates.flatMap(candidate => {
    const id = `${candidate.objective}:${targetStableKey(candidate.target)}`;
    // A capture operation may be strategically valid before all of its counted force
    // exists. Retaining it in mobilizing lets assignment/production replenish the
    // target-specific deficit instead of dropping the operation until it is too late.
    const incompleteCapture = candidate.objective === 'capture'
      && Number.isFinite(candidate.travelTurns)
      && candidate.travelTurns >= 0
      // A strategic catalog entry is not a production source. Keep a force-short
      // capture operation only when every missing critical role can actually be
      // replenished by one of this civ's current cities. Optional support remains
      // intentionally outside this guard.
      && !(hasMissingCriticalRole(candidate, availableRoles)
        && Object.entries(candidate.requiredRoles).some(([role, desired]) =>
          Math.max(0, Math.floor(desired ?? 0)) > (availableRoles[role as AIStrategicRole] ?? 0)
          && !trainableInOwnedCities.some(type =>
            getAIStrategicRoles(type).includes(role as AIStrategicRole))));
    if (!eligibleIds.has(id) && !incompleteCapture) return [];
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
      ...(candidate.supportRoles ? { supportRoles: { ...candidate.supportRoles } } : {}),
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
  const challenge = resolveOpponentChallenge(state);
  const doctrine = evaluateDominationDoctrine({
    knowledge,
    ownCityCount: perception.ownCities.length,
    personality,
    challenge,
  });
  // #1086: computed early (cityThreats depends only on state/civId/perception, not on
  // doctrine/candidates) so it can feed both the national-intent shock check and its
  // existing later use (unplanned-defense force demand) without a duplicate pass.
  const threats = cityThreats(state, civId, perception);
  const previousIntent = state.opponentAI?.nationalIntentByCiv[civId] ?? null;
  const nationalIntent = resolveNationalIntent({
    turn: state.turn,
    previous: previousIntent,
    perception,
    personality,
    doctrine,
    cityThreats: threats,
    atWarWith: civ.diplomacy.atWarWith,
    challenge,
  });
  const posture = NATIONAL_INTENT_POSTURE[nationalIntent.current];
  const availableResources = getCivAvailableResources(state, civId);
  const trainable = getTrainableUnitsForCiv(
    civ.techState.completed,
    civ.civType,
    availableResources,
  );
  const counterplay = getDominationCounterplay(knowledge);
  const candidates = objectiveCandidates(state, civId, perception, knownMap, doctrine, knowledge, personality,
    trainable.map(entry => entry.type), posture);
  const availableRoles = availableRoleCounts(perception);
  // City-specific trainability is only relevant to an actual capture deficit. Most
  // peaceful/no-shortfall turns avoid this per-city production-legality pass entirely.
  const trainableInOwnedCities = candidates.some(candidate =>
    candidate.objective === 'capture' && hasMissingCriticalRole(candidate, availableRoles))
    ? civ.cities.flatMap(cityId => {
      const city = state.cities[cityId];
      if (!city || city.owner !== civId) return [];
      return getTrainableUnitsForCity(
        city,
        civ.techState.completed,
        state.map,
        civ.civType,
        availableResources,
        cityFollowsOwnFaith(state, city),
      ).map(unit => unit.type);
    })
    : [];
  const choice = choosePrimaryObjective({
    actorId: civId,
    turn: state.turn,
    candidates,
    availableRoles,
  });
  const previous = state.opponentAI?.majorCivs[civId] ?? createEmptyMajorCivPortfolio();
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
  const portfolioResult = refreshMajorCivPortfolio({
    actorId: civId,
    turn: state.turn,
    actorEliminated: !getCivilizationLiveness(state, civId).living,
    portfolio: previous,
    candidates: [
      ...planCandidates(candidates, choice, availableRoles, trainableInOwnedCities),
      ...crisisDispatchPlanCandidates(state, civId),
    ],
    cityThreats: threats,
    ownedCityIds: new Set(perception.ownCities.map(city => city.id)),
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
  const primaryCaptureRequiredRoles = portfolioResult.portfolio.primaryPlan?.objective === 'capture'
    ? portfolioResult.portfolio.primaryPlan.requiredRoles
    : undefined;
  const forceDemands = mergePreparedForceDemands(
    assignments.forceDemands,
    [
      // #1064: a readiness demand means "I own ZERO units of role R, so I cannot even
      // consider this objective". Owning one satisfies it. Before this it re-seeded
      // desired:1/assigned:0 every turn, and residualDemands only discounts QUEUED
      // units -- so a persistent readiness role produced one unit per turn forever.
      ...Object.entries(choice.demands).flatMap(([role, desired]) => {
        // An incomplete capture candidate is retained as a real mobilizing plan.
        // Its assignment shortage already owns production for its critical roles;
        // adding the generic pre-plan readiness seed here would count the same
        // frontline/capture gap twice and queue an unnecessary second unit.
        if (
          primaryCaptureRequiredRoles
          && (primaryCaptureRequiredRoles[role as AIStrategicRole] ?? 0) > 0
        ) {
          return [];
        }
        return incrementalDemandSeed(
          role as AIForceDemand['role'],
          'objective-readiness',
          90,
          availableRoles[role as keyof typeof availableRoles] ?? 0,
          desired ?? 0,
        );
      }),
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
        sourceId: `${DEFENSE_OVERFLOW_SOURCE_PREFIX}${cityId}`,
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

  // #1086: one 'intent' trace per civ per round, alongside (not replacing) the existing
  // 'objective' trace -- see design doc §8. The shared assertLegalChoices contract
  // (tests/simulation/ai-playability-fixture.ts) requires selectedId to always resolve
  // to an eligible candidate entry, so `recover` -- shock-forced, with no comparative
  // score among the four ambition intents -- still gets its own entry (mandatory: no
  // numeric score is fabricated, mirroring how mandatory tactical actions in
  // ai-tactics.ts skip scoring entirely).
  const intentTrace: AIDecisionTrace = createAIDecisionTrace({
    actorId: civId,
    turn: state.turn,
    decision: 'intent',
    selectedId: nationalIntent.current,
    candidates: nationalIntent.current === 'recover'
      // A finite sentinel, not Infinity -- traces must stay plain JSON-serializable
      // data (JSON.stringify(Infinity) === 'null', which would corrupt any
      // JSON-round-trip comparison of this trace).
      ? [{ id: 'recover', score: Number.MAX_SAFE_INTEGER, eligible: true, reasonCodes: nationalIntent.reasonCodes }]
      : Object.entries(scoreIntents({ perception, personality, doctrine, cityThreats: threats, atWarWith: civ.diplomacy.atWarWith }))
        .map(([id, score]) => ({
          id,
          score,
          eligible: true,
          reasonCodes: nationalIntent.current === id ? nationalIntent.reasonCodes : [],
        })),
  });

  return {
    civId,
    perception,
    portfolio: preparedAssignments.portfolio,
    assignments: preparedAssignments,
    forceDemands,
    traces: [choice.trace, intentTrace],
    nationalIntent,
  };
}
