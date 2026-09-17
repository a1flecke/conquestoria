import type {
  GameState,
  PersonalityTraits,
  ResourceType,
  Tech,
  TechState,
} from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  TRAINABLE_UNITS,
  civHasCoastalCity,
} from '@/systems/city-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { getCivAvailableResources, getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import {
  UNREST_RELIEF_SOURCES,
  UNREST_TRIGGER_PRESSURE,
  createUnrestEvaluationContext,
  getUnrestPressureBreakdown,
} from '@/systems/faction-system';

import {
  activateNextQueuedResearch,
  enqueueResearch,
} from '@/systems/planning-system';
import type { AIForceDemand } from './ai-unit-assignment';
import type { PreparedMajorCivPlan } from './ai-prepared-turn';
import { evaluateAITechCapabilities } from './ai-tech-evaluation';
import { weightTechChoice } from './ai-personality';
import { simulateResearchQueueTiming } from '@/systems/tech-progression';

export interface AIResearchPlanningContext {
  techState: TechState;
  personality: PersonalityTraits;
  modernizationDemand: number;
  forceDemands: readonly AIForceDemand[];
  coastalEmpire: boolean;
  availableResources: ReadonlySet<ResourceType>;
  sciencePerTurn: number;
  /**
   * City ids scoped to the relief building that can address their current
   * pressure. Identities, rather than counts, keep a future multi-building
   * unlock's bonus correct when its affected cities overlap.
   */
  pressuredReliefCityIdsByBuildingId?: Readonly<Record<string, readonly string[]>>;
  /** Compatibility for isolated planning callers; live AI supplies per-source counts. */
  pressuredReliefCityCount?: number;
  techs?: readonly Tech[];
}

export interface AIResearchScoreComponents {
  modernizationFit: number;
  activePlanFit: number;
  economicSupport: number;
  personalityTrackWeight: number;
  eraProgress: number;
  unlockBreadth: number;
  estimatedResearchTurns: number;
  resourceMismatchPenalty: number;
  situationalityPenalty: number;
  unrestReliefTechBonus: number;
}

// #919 MR2: pull toward a tech unlocking any UNREST_RELIEF_SOURCES building when the
// empire is actually pressured. Generic — keyed off the relief-source table, not a
// tech id. Scales with how many cities are pressured (a mildly-strained empire gets a
// nudge; a wide empire with every city near revolt genuinely beelines the counter),
// capped so it never wholly eclipses the rest of the research model. Applied to both
// the preliminary search cut (so the tech survives the top-24 slice) and the final
// score (so it then wins the ranking).
const UNREST_RELIEF_TECH_AI_BASE_BONUS = 6;
const UNREST_RELIEF_TECH_AI_PER_PRESSURED_CITY = 1.5;
const UNREST_RELIEF_TECH_AI_BONUS_CAP = 18;
const UNREST_RELIEF_PRESSURED_CITY_GATE = 2;
function unrestReliefTechBonus(
  tech: Tech,
  cityIdsByBuildingId: Readonly<Record<string, readonly string[]>>,
): number {
  const unlocked = new Set(tech.unlocksBuildings ?? []);
  const pressuredReliefCityCount = new Set(UNREST_RELIEF_SOURCES
    .filter(source => (source.buildingId !== undefined && unlocked.has(source.buildingId))
      || source.researchUnlockTechId === tech.id)
    .flatMap(source => cityIdsByBuildingId[source.id] ?? [])).size;
  if (pressuredReliefCityCount < UNREST_RELIEF_PRESSURED_CITY_GATE) return 0;
  return Math.min(
    UNREST_RELIEF_TECH_AI_BONUS_CAP,
    UNREST_RELIEF_TECH_AI_BASE_BONUS
      + UNREST_RELIEF_TECH_AI_PER_PRESSURED_CITY * pressuredReliefCityCount,
  );
}

export interface AIResearchDecision {
  frontierTechId: string;
  downstreamTargetTechId: string;
  score: number;
  scoreComponents: AIResearchScoreComponents;
  searchStats: {
    maxDepth: number;
    evaluatedTargets: number;
  };
  trace: {
    selectedId: string;
    candidates: Array<{
      id: string;
      targetId: string;
      score: number;
      reasonCodes: string[];
    }>;
  };
}

interface SearchTarget {
  frontier: Tech;
  target: Tech;
  depth: number;
  pathCost: number;
  preliminary: number;
  completedAfterPath: ReadonlySet<string>;
  pathTechIds: readonly string[];
}

function descendantsWithinLimit(
  frontier: Tech,
  techs: readonly Tech[],
  completed: ReadonlySet<string>,
  knownTechIds: ReadonlySet<string>,
  reliefCityIdsByBuildingId: Readonly<Record<string, readonly string[]>>,
): SearchTarget[] {
  const byId = new Map(techs.map(tech => [tech.id, tech]));
  const targets: SearchTarget[] = [];
  const queue = [{
    tech: frontier,
    depth: 0,
    pathCost: frontier.cost,
    pathIds: new Set([frontier.id]),
    pathTechIds: [frontier.id],
  }];
  const bestDepth = new Map<string, number>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > 4) continue;
    const previousDepth = bestDepth.get(current.tech.id);
    if (previousDepth !== undefined && previousDepth <= current.depth) continue;
    bestDepth.set(current.tech.id, current.depth);
    const completedAfterPath = new Set([...completed, ...current.pathIds]);
    const capabilities = evaluateAITechCapabilities(current.tech, completedAfterPath, knownTechIds);
    const preliminary = capabilities.militaryPowerSpike
      + capabilities.economicSupport
      + capabilities.eraProgress
      + Object.values(capabilities.rolesUnlocked)
        .reduce((sum, value) => sum + (value ?? 0), 0)
      + unrestReliefTechBonus(current.tech, reliefCityIdsByBuildingId);
    targets.push({
      frontier,
      target: current.tech,
      depth: current.depth,
      pathCost: current.pathCost,
      preliminary,
      completedAfterPath,
      pathTechIds: current.pathTechIds,
    });
    if (current.depth === 4) continue;
    for (const child of techs
      .filter(tech => tech.prerequisites.includes(current.tech.id))
      .sort((left, right) => left.id.localeCompare(right.id))) {
      if (!byId.has(child.id)) continue;
      if (!child.prerequisites.every(prerequisite =>
        completed.has(prerequisite) || current.pathIds.has(prerequisite))) {
        continue;
      }
      queue.push({
        tech: child,
        depth: current.depth + 1,
        pathCost: current.pathCost + child.cost,
        pathIds: new Set([...current.pathIds, child.id]),
        pathTechIds: [...current.pathTechIds, child.id],
      });
    }
  }
  return targets;
}

/**
 * #1108: `descendantsWithinLimit` walks a single linear path from ONE frontier
 * tech, so a tech whose prerequisites converge from two (or more) INDEPENDENT
 * branches -- neither on the other's path -- can never be discovered unless
 * one branch happens to already be `completed`. Real example: `galleys`
 * needs both `fishing` (via `rafts`) and `sailing` (via `pathfinding`), which
 * share no common ancestor. A civ with no independent reason to value either
 * branch on its own merits (e.g. a personality that never weights maritime
 * tech) can hold a persistent, high-priority `naval-combat` force demand
 * (from ambient pirate pressure) and never once see `galleys` as a research
 * candidate -- not "temporarily unresearched", structurally invisible to the
 * scorer, for the entire game.
 *
 * This adds exactly one bounded convergence pass: given every target already
 * discovered by the per-frontier search above, any tech whose prerequisites
 * are ALL satisfied by `completed` plus that already-discovered set becomes a
 * new target, attributed back to each contributing frontier separately (both
 * `rafts` and `pathfinding` are legitimate "first steps" toward `galleys`).
 * O(techs) over the already-computed target list -- no repeated tree walks,
 * no map/geography scan, and no per-candidate-per-turn cost (`planAIResearch`
 * runs once per civ only when a new research choice is actually needed).
 * Deliberately one pass, not recursive: this closes the exact two-branch
 * diamond the evidence shows (#1108), not an arbitrary N-way transitive
 * closure a real tech tree has never been observed to need.
 */
function convergentTargets(
  techs: readonly Tech[],
  completed: ReadonlySet<string>,
  knownTechIds: ReadonlySet<string>,
  reliefCityIdsByBuildingId: Readonly<Record<string, readonly string[]>>,
  discovered: readonly SearchTarget[],
): SearchTarget[] {
  const bestById = new Map<string, SearchTarget>();
  for (const target of discovered) {
    const existing = bestById.get(target.target.id);
    if (!existing || target.pathCost < existing.pathCost) bestById.set(target.target.id, target);
  }
  const reachable = new Set<string>([...completed, ...bestById.keys()]);
  const converged: SearchTarget[] = [];
  for (const candidate of techs) {
    if (completed.has(candidate.id) || bestById.has(candidate.id)) continue;
    if (candidate.prerequisites.length < 2) continue; // a single-branch tech is already found above
    if (!candidate.prerequisites.every(prerequisite => reachable.has(prerequisite))) continue;
    const sourceEntries = candidate.prerequisites
      .map(prerequisite => bestById.get(prerequisite))
      .filter((entry): entry is SearchTarget => entry !== undefined);
    if (sourceEntries.length === 0) continue; // every prerequisite already completed -- not a real convergence
    const combinedPathIds = new Set(sourceEntries.flatMap(entry => entry.pathTechIds));
    combinedPathIds.add(candidate.id);
    const completedAfterPath = new Set([...completed, ...combinedPathIds]);
    const capabilities = evaluateAITechCapabilities(candidate, completedAfterPath, knownTechIds);
    const preliminary = capabilities.militaryPowerSpike
      + capabilities.economicSupport
      + capabilities.eraProgress
      + Object.values(capabilities.rolesUnlocked)
        .reduce((sum, value) => sum + (value ?? 0), 0)
      + unrestReliefTechBonus(candidate, reliefCityIdsByBuildingId);
    const pathCost = sourceEntries.reduce((sum, entry) => sum + entry.pathCost, 0) + candidate.cost;
    const uniqueSources = [...new Map(sourceEntries.map(entry => [entry.frontier.id, entry])).values()];
    for (const ownSource of uniqueSources) {
      // #1108: `pathTechIds[0]` must be THIS entry's own frontier -- callers
      // (`estimateResearchPathTurns`) fall back to `pathTechIds[0]` as the
      // tech actually being researched when nothing is in progress yet. Order
      // this frontier's own branch first, then every other contributing
      // branch, then the converging candidate itself -- total research work
      // is unchanged (all branches are still eventually required), but each
      // emitted entry's own path now starts with the frontier it's attributed
      // to, matching what every other (non-converged) SearchTarget guarantees.
      const orderedPathIds = [
        ...ownSource.pathTechIds,
        ...[...combinedPathIds].filter(id => !ownSource.pathTechIds.includes(id)),
      ];
      converged.push({
        frontier: ownSource.frontier,
        target: candidate,
        depth: Math.min(4, Math.max(...sourceEntries.map(entry => entry.depth)) + 1),
        pathCost,
        preliminary,
        completedAfterPath,
        pathTechIds: orderedPathIds,
      });
    }
  }
  return converged;
}

function estimateResearchPathTurns(
  context: AIResearchPlanningContext,
  target: SearchTarget,
  techs: readonly Tech[],
): number {
  const currentResearch = context.techState.currentResearch ?? target.pathTechIds[0] ?? null;
  const planned = new Set([
    ...(currentResearch ? [currentResearch] : []),
    ...context.techState.researchQueue,
  ]);
  const researchQueue = [
    ...context.techState.researchQueue,
    ...target.pathTechIds.filter(techId => !planned.has(techId)),
  ];
  const timing = simulateResearchQueueTiming({
    ...context.techState,
    currentResearch,
    researchQueue,
  }, context.sciencePerTurn, techs);
  return timing.get(target.target.id)?.finishTurns
    ?? Math.ceil(target.pathCost / Math.max(1, context.sciencePerTurn));
}

function resourceMismatch(
  tech: Tech,
  availableResources: ReadonlySet<ResourceType>,
): number {
  let penalty = 0;
  for (const type of tech.unlocksUnits ?? []) {
    const unit = TRAINABLE_UNITS.find(candidate => candidate.type === type);
    if (!unit?.resourceRequired?.length) continue;
    penalty += unit.resourceRequired
      .filter(resource => !availableResources.has(resource))
      .length * 4;
  }
  return penalty;
}

export function planAIResearch(
  context: AIResearchPlanningContext,
): AIResearchDecision | null {
  const techs = context.techs ?? TECH_TREE;
  const knownTechIds = new Set(techs.map(tech => tech.id));
  const completed = new Set(context.techState.completed);
  const frontier = techs
    .filter(tech =>
      !completed.has(tech.id)
      && tech.id !== context.techState.currentResearch
      && !context.techState.researchQueue.includes(tech.id)
      && tech.prerequisites.every(prerequisite => completed.has(prerequisite)))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (frontier.length === 0) return null;

  const reliefCityIdsByBuildingId = context.pressuredReliefCityIdsByBuildingId
    ?? Object.fromEntries(UNREST_RELIEF_SOURCES.map(source => [
      source.id,
      Array.from({ length: context.pressuredReliefCityCount ?? 0 }, (_, index) => `legacy-${index}`),
    ]));

  const directTargets = frontier
    .flatMap(tech => descendantsWithinLimit(tech, techs, completed, knownTechIds, reliefCityIdsByBuildingId));
  const searchTargets = [
    ...directTargets,
    ...convergentTargets(techs, completed, knownTechIds, reliefCityIdsByBuildingId, directTargets),
  ]
    .sort((left, right) =>
      right.preliminary - left.preliminary
      || left.frontier.id.localeCompare(right.frontier.id)
      || left.target.id.localeCompare(right.target.id))
    .slice(0, 24);
  const evaluated = searchTargets.map(entry => {
    const capabilities = evaluateAITechCapabilities(entry.target, entry.completedAfterPath, knownTechIds);
    const roleCount = Object.values(capabilities.rolesUnlocked)
      .reduce((sum, value) => sum + (value ?? 0), 0);
    const modernizationFit = context.modernizationDemand / 25
      * (capabilities.militaryPowerSpike + roleCount);
    const activePlanFit = context.forceDemands.reduce((sum, demand) =>
      sum + (capabilities.rolesUnlocked[demand.role] ?? 0)
        * Math.max(0, demand.missing)
        * Math.max(1, demand.priority / 100), 0)
      + (context.coastalEmpire
        && (
          (capabilities.rolesUnlocked['naval-combat'] ?? 0) > 0
          || (capabilities.rolesUnlocked.transport ?? 0) > 0
        )
        ? 4
        : 0);
    const personalityTrackWeight = weightTechChoice(
      context.personality,
      entry.target,
    );
    const unlockBreadth = (entry.target.unlocksUnits?.length ?? 0)
      + (entry.target.unlocksBuildings?.length ?? 0)
      + capabilities.resourcesRevealed.length;
    const estimatedResearchTurns = estimateResearchPathTurns(context, entry, techs);
    const scoreComponents: AIResearchScoreComponents = {
      modernizationFit,
      activePlanFit,
      economicSupport: capabilities.economicSupport,
      personalityTrackWeight,
      eraProgress: capabilities.eraProgress,
      unlockBreadth,
      estimatedResearchTurns,
      resourceMismatchPenalty: resourceMismatch(
        entry.target,
        context.availableResources,
      ),
      situationalityPenalty: capabilities.situationality,
      unrestReliefTechBonus: unrestReliefTechBonus(entry.target, reliefCityIdsByBuildingId),
    };
    const score = modernizationFit * 4
      + activePlanFit * 3
      + capabilities.economicSupport * 2
      + personalityTrackWeight
      + capabilities.eraProgress
      + unlockBreadth
      + scoreComponents.unrestReliefTechBonus
      - estimatedResearchTurns * 0.75
      - scoreComponents.resourceMismatchPenalty
      - scoreComponents.situationalityPenalty;
    return {
      ...entry,
      score,
      scoreComponents,
      reasonCodes: [
        ...(modernizationFit > 0 ? ['modernization'] : []),
        ...(activePlanFit > 0 ? ['active-plan'] : []),
        ...(capabilities.economicSupport > 0 ? ['economic-support'] : []),
        ...(scoreComponents.unrestReliefTechBonus > 0 ? ['unrest-relief'] : []),
      ],
    };
  }).sort((left, right) =>
    right.score - left.score
    || left.frontier.id.localeCompare(right.frontier.id)
    || left.target.id.localeCompare(right.target.id));
  const selected = evaluated[0];
  if (!selected) return null;
  return {
    frontierTechId: selected.frontier.id,
    downstreamTargetTechId: selected.target.id,
    score: selected.score,
    scoreComponents: selected.scoreComponents,
    searchStats: {
      maxDepth: Math.max(0, ...evaluated.map(entry => entry.depth)),
      evaluatedTargets: evaluated.length,
    },
    trace: {
      selectedId: selected.frontier.id,
      candidates: evaluated.slice(0, 12).map(entry => ({
        id: entry.frontier.id,
        targetId: entry.target.id,
        score: entry.score,
        reasonCodes: entry.reasonCodes,
      })),
    },
  };
}

export interface ApplyAIResearchResult {
  state: GameState;
  startedTechId: string | null;
}

export function applyAIResearch(
  state: GameState,
  civId: string,
  prepared: PreparedMajorCivPlan,
  personality: PersonalityTraits,
): ApplyAIResearchResult {
  const civ = state.civilizations[civId];
  if (!civ || civ.techState.currentResearch) {
    return { state, startedTechId: null };
  }

  const activated = activateNextQueuedResearch(civ.techState);
  if (activated.currentResearch) {
    return {
      state: {
        ...state,
        civilizations: {
          ...state.civilizations,
          [civId]: { ...civ, techState: activated },
        },
      },
      startedTechId: activated.currentResearch,
    };
  }

  const resources = getCivAvailableResources(state, civId);
  const coastalEmpire = civHasCoastalCity(state, civId);
  const sciencePerTurn = Math.max(1, calculateCivResearchOutput(state, civId).finalScience);
  // City identities are scoped to the relief source whose rows they can cut. This
  // prevents war-only cities from pulling Courthouse research and vice versa.
  const reliefPressureGate = 0.6 * UNREST_TRIGGER_PRESSURE;
  const ownerHappiness = getCivHappinessFromResources(state, civId);
  const unrestContext = createUnrestEvaluationContext();
  const pressuredReliefCityIdsByBuildingId = Object.fromEntries(UNREST_RELIEF_SOURCES.map(source => [source.id, civ.cities.filter(cityId => {
    const city = state.cities[cityId];
    if (!city || (source.isPotentiallyUseful && !source.isPotentiallyUseful(city, state, unrestContext))) return false;
    const rows = getUnrestPressureBreakdown(cityId, state, ownerHappiness, unrestContext);
    const pressure = Math.min(100, Math.max(0, rows.reduce((total, row) => total + row.amount, 0)));
    return pressure >= reliefPressureGate
      && rows.some(row => source.targetRowLabels.includes(row.label) && row.amount > 0);
  })]));
  const decision = planAIResearch({
    techState: activated,
    personality,
    modernizationDemand: prepared.portfolio.modernizationDemand,
    forceDemands: prepared.forceDemands,
    coastalEmpire,
    availableResources: resources,
    sciencePerTurn,
    pressuredReliefCityIdsByBuildingId,
  });
  if (!decision) {
    if (activated === civ.techState) return { state, startedTechId: null };
    return {
      state: {
        ...state,
        civilizations: {
          ...state.civilizations,
          [civId]: { ...civ, techState: activated },
        },
      },
      startedTechId: null,
    };
  }
  const techState = enqueueResearch(activated, decision.frontierTechId);
  const majorCivs = state.opponentAI?.majorCivs;
  const portfolio = majorCivs?.[civId] ?? prepared.portfolio;
  return {
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, techState },
      },
      opponentAI: state.opponentAI && majorCivs
        ? {
            ...state.opponentAI,
            majorCivs: {
              ...majorCivs,
              [civId]: {
                ...portfolio,
                researchTargetTechId: decision.downstreamTargetTechId,
              },
            },
          }
        : state.opponentAI,
    },
    startedTechId: techState.currentResearch,
  };
}
