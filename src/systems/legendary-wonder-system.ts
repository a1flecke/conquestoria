import type {
  City,
  Civilization,
  GameState,
  LegendaryWonderDefinition,
  LegendaryWonderProject,
  ResourceType,
  ResourceYield,
} from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { getLegendaryWonderDefinition, getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getTechById } from '@/systems/tech-system';
import { hexDistance } from '@/systems/hex-utils';
import { routeMatchesLegendaryWonderRequirement } from '@/systems/trade-route-classification';
import {
  createHostLocationLegendaryWonderIntelEntry,
  createStartedLegendaryWonderIntelEntry,
  recordKnownHumanLegendaryWonderCompletionIntel,
  recordLegendaryWonderIntel,
  sanitizeLegendaryWonderIntel,
} from '@/systems/legendary-wonder-intel';
import { countLegendaryWonderDiscoverySites } from '@/systems/legendary-wonder-history';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getActiveResourceSourceCount } from '@/systems/resource-acquisition-system';

export type LegendaryWonderBlocker =
  | { kind: 'quest-incomplete'; incompleteStepIds: string[] }
  | { kind: 'required-tech'; techId: string }
  | { kind: 'resource'; resource: ResourceType }
  | { kind: 'city-requirement'; requirement: 'coastal' | 'river' }
  | { kind: 'lost-race' };

export interface LegendaryWonderEligibility {
  buildable: boolean;
  blockers: LegendaryWonderBlocker[];
}

export function getLegendaryWonderAvailabilityKey(civId: string, wonderId: string): string {
  return `${civId}:${wonderId}`;
}

function hasCityRequirement(state: GameState, cityId: string, requirement: 'river' | 'coastal' | 'any'): boolean {
  const city = state.cities[cityId];
  if (!city) {
    return false;
  }

  if (requirement === 'river') {
    return city.ownedTiles.some(coord => state.map.tiles[`${coord.q},${coord.r}`]?.hasRiver);
  }
  if (requirement === 'coastal') {
    return city.ownedTiles.some(coord => {
      const tile = state.map.tiles[`${coord.q},${coord.r}`];
      return tile?.terrain === 'coast' || tile?.terrain === 'ocean';
    });
  }
  return true;
}

export function getLegendaryWonderEligibility(
  state: GameState,
  civId: string,
  cityId: string,
  definition: LegendaryWonderDefinition,
): LegendaryWonderEligibility {
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city || city.owner !== civId) {
    return { buildable: false, blockers: [{ kind: 'city-requirement', requirement: definition.cityRequirement === 'any' ? 'river' : definition.cityRequirement }] };
  }

  const blockers: LegendaryWonderBlocker[] = [];
  const project = findLegendaryWonderProjectEntry(state, civId, cityId, definition.id)?.[1];
  const incompleteStepIds = project?.questSteps.filter(step => !step.completed).map(step => step.id) ?? [];
  if (incompleteStepIds.length > 0) blockers.push({ kind: 'quest-incomplete', incompleteStepIds });
  for (const techId of definition.requiredTechs) {
    if (!civ.techState.completed.includes(techId)) blockers.push({ kind: 'required-tech', techId });
  }
  const availableResources = getCivAvailableResources(state, civId);
  for (const resource of definition.requiredResources as ResourceType[]) {
    if (!availableResources.has(resource)) blockers.push({ kind: 'resource', resource });
  }
  if (definition.cityRequirement !== 'any' && !hasCityRequirement(state, cityId, definition.cityRequirement)) {
    blockers.push({ kind: 'city-requirement', requirement: definition.cityRequirement });
  }
  if (!isLegendaryWonderStillAvailable(state, definition.id)) blockers.push({ kind: 'lost-race' });

  return { buildable: blockers.length === 0, blockers };
}

function buildLegendaryWonderProjectKey(civId: string, cityId: string, wonderId: string): string {
  return `${wonderId}:${civId}:${cityId}`;
}

function isLegendaryWonderStillAvailable(state: GameState, wonderId: string): boolean {
  return !state.completedLegendaryWonders?.[wonderId];
}

function shouldKeepLegendaryWonderProject(state: GameState, project: LegendaryWonderProject): boolean {
  const completion = state.completedLegendaryWonders?.[project.wonderId];
  if (!completion) {
    return true;
  }

  return project.phase === 'completed'
    && completion.ownerId === project.ownerId
    && completion.cityId === project.cityId;
}

function sanitizeLegendaryWonderProjects(state: GameState): Record<string, LegendaryWonderProject> {
  return Object.fromEntries(
    Object.entries(state.legendaryWonderProjects ?? {}).filter(([, project]) =>
      shouldKeepLegendaryWonderProject(state, project),
    ),
  );
}

function findLegendaryWonderProjectEntry(
  state: GameState,
  civId: string,
  cityId: string,
  wonderId: string,
): [string, LegendaryWonderProject] | undefined {
  return Object.entries(state.legendaryWonderProjects ?? {}).find(([, project]) =>
    project.ownerId === civId
    && project.cityId === cityId
    && project.wonderId === wonderId,
  );
}

function hasActiveLegendaryWonderBuildForCiv(
  state: GameState,
  civId: string,
  wonderId: string,
  excludeCityId?: string,
): boolean {
  return Object.values(state.legendaryWonderProjects ?? {}).some(project =>
    project.ownerId === civId
    && project.wonderId === wonderId
    && project.phase === 'building'
    && project.cityId !== excludeCityId,
  );
}

function getDefaultQuestStepDescription(step: NonNullable<ReturnType<typeof getLegendaryWonderDefinition>>['questSteps'][number]): string {
  switch (step.type) {
    case 'discover_wonder':
      return 'Discover a natural wonder.';
    case 'trade_route':
      return 'Establish a trade route.';
    case 'research_count':
      return `Complete ${step.targetCount ?? 1} technologies${step.track ? ` in ${step.track}` : ''}.`;
    case 'defeat_stronghold':
      return 'Destroy a barbarian stronghold.';
    case 'buildings-in-multiple-cities': {
      const minimumBuildings = step.minimumBuildingsPerCity ?? 3;
      if (step.cityScope === 'host-city' && (step.targetCount ?? 1) === 1) {
        return `Develop this city with at least ${minimumBuildings} completed buildings.`;
      }
      return `Develop ${step.targetCount ?? 2} cities with at least ${minimumBuildings} completed buildings each.`;
    }
    case 'trade-routes-established':
      return `Maintain ${step.targetCount ?? 1} trade routes.`;
    case 'map-discoveries': {
      const discoveryTypes = step.discoveryTypes ?? ['natural-wonder'];
      if (discoveryTypes.length === 1 && discoveryTypes[0] === 'natural-wonder') {
        return `Discover ${step.targetCount ?? 2} natural wonders.`;
      }
      return `Discover ${step.targetCount ?? 2} notable sites across the world.`;
    }
    case 'resource-count':
      return `Secure ${step.target} active ${step.resource} source${step.target === 1 ? '' : 's'}.`;
  }
}

function getEffectiveLegendaryWonderInvestment(
  state: GameState,
  project: LegendaryWonderProject,
): number {
  const city = state.cities[project.cityId];
  if (project.phase === 'building' && city?.productionQueue[0] === `legendary:${project.wonderId}`) {
    return city.productionProgress;
  }
  return project.investedProduction;
}

function getNormalizedLegendaryWonderProject(
  state: GameState,
  project: LegendaryWonderProject,
): LegendaryWonderProject {
  const syncedProject = syncLegendaryWonderQuestSteps(state, project);
  if (syncedProject.phase === 'questing' && syncedProject.questSteps.every(step => step.completed)) {
    return {
      ...syncedProject,
      phase: 'ready_to_build',
    };
  }
  return syncedProject;
}

function getRawResearchCount(civ: Civilization, track?: string): number {
  if (track) {
    return civ.techState.completed.filter(techId => getTechById(techId)?.track === track).length;
  }
  return civ.techState.completed.length;
}

type ResearchCountStep = NonNullable<ReturnType<typeof getLegendaryWonderDefinition>>['questSteps'][number];

// Single source of truth for research_count progress: baseline-adjusted count vs target.
// Used by both step evaluation (completion) and quest-step description text (display) so
// the two can never drift out of sync.
export function getResearchCountProgress(
  project: LegendaryWonderProject,
  step: ResearchCountStep,
  civ: Civilization,
): { current: number; target: number } {
  if (step.type !== 'research_count') {
    throw new Error('Research progress requires a research_count quest step');
  }
  const baseline = project.questBaselines?.[step.id] ?? 0;
  const raw = getRawResearchCount(civ, step.track);
  return {
    current: Math.max(0, raw - baseline),
    target: step.targetCount ?? 1,
  };
}

function createLegendaryWonderProject(
  state: GameState,
  civId: string,
  cityId: string,
  definition: NonNullable<ReturnType<typeof getLegendaryWonderDefinition>>,
): LegendaryWonderProject {
  const civ = state.civilizations[civId];
  const questBaselines: Record<string, number> = {};
  for (const step of definition.questSteps) {
    if (step.type === 'research_count' && civ) {
      questBaselines[step.id] = getRawResearchCount(civ, step.track);
    }
  }

  return getNormalizedLegendaryWonderProject(state, {
    wonderId: definition.id,
    ownerId: civId,
    cityId,
    phase: 'questing',
    investedProduction: 0,
    transferableProduction: 0,
    questBaselines,
    questSteps: definition.questSteps.map(step => ({
      id: step.id,
      description: step.description ?? getDefaultQuestStepDescription(step),
      completed: false,
    })),
  });
}

function evaluateLegendaryWonderStep(state: GameState, project: LegendaryWonderProject, stepId: string): boolean {
  const definition = getLegendaryWonderDefinition(project.wonderId);
  const step = definition?.questSteps.find(candidate => candidate.id === stepId);
  const city = state.cities[project.cityId];
  const civ = state.civilizations[project.ownerId];
  if (!definition || !step || !city || !civ) {
    return false;
  }
  if (step.type === 'resource-count') {
    return getActiveResourceSourceCount(state, project.ownerId, step.resource, {
      scope: step.scope,
      cityId: step.scope === 'host-city' ? project.cityId : undefined,
    }) >= step.target;
  }

  const discoveredWonderCount = Object.values(state.wonderDiscoverers ?? {})
    .filter(discoverers => discoverers.includes(project.ownerId))
    .length;
  const ownedTradeRoutes = (state.marketplace?.tradeRoutes ?? []).filter(route => route.fromCityId === project.cityId || civ.cities.includes(route.fromCityId));
  switch (step.type) {
    case 'discover_wonder':
      return discoveredWonderCount >= (step.targetCount ?? 1);
    case 'trade_route':
    case 'trade-routes-established':
      return ownedTradeRoutes.filter(route => routeMatchesLegendaryWonderRequirement(
        state, route, step.routeRequirement ?? 'any', step.minimumRouteDistance ?? 0,
      )).length >= (step.targetCount ?? 1);
    case 'research_count': {
      const progress = getResearchCountProgress(project, step, civ);
      return progress.current >= progress.target;
    }
    case 'defeat_stronghold': {
      const matchingStrongholds = (state.legendaryWonderHistory?.destroyedStrongholds ?? [])
        .filter(record => {
          if (record.civId !== project.ownerId) return false;
          if (step.scope === 'near-city') {
            return hexDistance(record.position, city.position) <= (step.radius ?? 4);
          }
          return true;
        });
      return matchingStrongholds.length >= (step.targetCount ?? 1);
    }
    case 'buildings-in-multiple-cities': {
      const minimumBuildings = step.minimumBuildingsPerCity ?? 3;
      const hostQualifies = city.buildings.length >= minimumBuildings;
      if (step.cityScope === 'host-city' && !hostQualifies) {
        return false;
      }
      return civ.cities.map(cityRef => state.cities[cityRef])
        .filter((candidate): candidate is City => Boolean(candidate))
        .filter(candidate => candidate.buildings.length >= minimumBuildings).length >= (step.targetCount ?? 2);
    }
    case 'map-discoveries':
      return countLegendaryWonderDiscoverySites(
        state,
        project.ownerId,
        step.discoveryTypes ?? ['natural-wonder'],
      ) >= (step.targetCount ?? 2);
  }
}

function describeLegendaryWonderStep(
  state: GameState,
  project: LegendaryWonderProject,
  definitionStep: ResearchCountStep | undefined,
  fallback: string,
): string {
  const baseDescription = definitionStep?.description ?? fallback;
  if (!definitionStep || definitionStep.type !== 'research_count') {
    return baseDescription;
  }
  const civ = state.civilizations[project.ownerId];
  if (!civ) return baseDescription;
  const progress = getResearchCountProgress(project, definitionStep, civ);
  return `${baseDescription} (${Math.min(progress.current, progress.target)}/${progress.target})`;
}

function syncLegendaryWonderQuestSteps(state: GameState, project: LegendaryWonderProject): LegendaryWonderProject {
  const definition = getLegendaryWonderDefinition(project.wonderId);
  return {
    ...project,
    questSteps: project.questSteps.map(step => {
      const definitionStep = definition?.questSteps.find(candidate => candidate.id === step.id);
      const evaluated = evaluateLegendaryWonderStep(state, project, step.id);
      const completed = definitionStep?.type === 'resource-count'
        ? evaluated
        : step.completed || evaluated;
      return {
        ...step,
        description: completed
          ? (definitionStep?.description ?? step.description)
          : describeLegendaryWonderStep(state, project, definitionStep, step.description),
        completed,
      };
    }),
  };
}

export function initializeLegendaryWonderProjectsForCity(
  state: GameState,
  civId: string,
  cityId: string,
): GameState {
  const city = state.cities[cityId];
  if (!city || city.owner !== civId) {
    return state;
  }

  const legendaryWonderProjects = sanitizeLegendaryWonderProjects(state);
  let changed = false;

  for (const definition of getLegendaryWonderDefinitions()) {
    if (!isLegendaryWonderStillAvailable(state, definition.id)) {
      continue;
    }

    const existing = findLegendaryWonderProjectEntry({ ...state, legendaryWonderProjects }, civId, cityId, definition.id);
    if (existing) {
      const refreshed = syncLegendaryWonderQuestSteps({ ...state, legendaryWonderProjects }, {
        ...existing[1],
        questSteps: existing[1].questSteps.map(step => ({
          ...step,
          description: definition.questSteps.find(candidate => candidate.id === step.id)?.description
            ?? getDefaultQuestStepDescription(
              definition.questSteps.find(candidate => candidate.id === step.id) ?? definition.questSteps[0],
            ),
        })),
      });
      legendaryWonderProjects[existing[0]] = refreshed;
      changed = true;
      continue;
    }

    legendaryWonderProjects[buildLegendaryWonderProjectKey(civId, cityId, definition.id)] = createLegendaryWonderProject(
      { ...state, legendaryWonderProjects },
      civId,
      cityId,
      definition,
    );
    changed = true;
  }

  return changed
    ? {
      ...state,
      legendaryWonderProjects,
    }
    : state;
}

export function initializeLegendaryWonderProjectsForAllCities(state: GameState): GameState {
  let nextState: GameState = {
    ...state,
    legendaryWonderProjects: sanitizeLegendaryWonderProjects(state),
    legendaryWonderIntel: sanitizeLegendaryWonderIntel(state),
  };
  for (const city of Object.values(state.cities)) {
    nextState = initializeLegendaryWonderProjectsForCity(nextState, city.owner, city.id);
  }
  return nextState;
}

export function getEligibleLegendaryWonders(
  state: GameState,
  civId: string,
  cityId: string,
): string[] {
  const seededState = initializeLegendaryWonderProjectsForCity(state, civId, cityId);
  if (!seededState.civilizations[civId] || !seededState.cities[cityId]) {
    return [];
  }

  return Object.values(seededState.legendaryWonderProjects ?? {})
    .filter(project => project.ownerId === civId && project.cityId === cityId)
    .map(project => project.wonderId)
    .filter(wonderId => {
      const definition = getLegendaryWonderDefinition(wonderId);
      if (!definition) return false;
      return !getLegendaryWonderEligibility(seededState, civId, cityId, definition)
        .blockers.some(blocker => blocker.kind !== 'quest-incomplete');
    });
}

export function getReachableLegendaryWonderProjects(
  state: GameState,
  civId: string,
  cityId: string,
): LegendaryWonderProject[] {
  const seededState = initializeLegendaryWonderProjectsForCity(state, civId, cityId);
  const eligibleWonderIds = new Set(getEligibleLegendaryWonders(seededState, civId, cityId));

  return Object.values(seededState.legendaryWonderProjects ?? {}).filter(project =>
    project.ownerId === civId
    && project.cityId === cityId
    && eligibleWonderIds.has(project.wonderId)
    && (project.phase === 'questing' || project.phase === 'ready_to_build'),
  );
}

export function unlockLegendaryWonderProject(
  state: GameState,
  civId: string,
  wonderId: string,
): LegendaryWonderProject {
  const projectEntry = Object.entries(state.legendaryWonderProjects ?? {}).find(([, project]) =>
    project.ownerId === civId && project.wonderId === wonderId,
  );
  const project = projectEntry?.[1];
  if (!project) {
    throw new Error(`Legendary wonder project ${wonderId} not found`);
  }

  return {
    ...project,
    phase: project.questSteps.every(step => step.completed) ? 'ready_to_build' : project.phase,
  };
}

export function loseLegendaryWonderRace(investedProduction: number): {
  goldRefund: number;
  transferableProduction: number;
  lostProduction: number;
} {
  const goldRefund = Math.floor(investedProduction * 0.25);
  const transferableProduction = Math.floor(investedProduction * 0.25);
  const lostProduction = investedProduction - goldRefund - transferableProduction;

  return {
    goldRefund,
    transferableProduction,
    lostProduction,
  };
}

export type LegendaryWonderScrapReason = 'required-resource-lost' | 'resource-count-quest-lost' | 'rival-completed';

export function scrapLegendaryWonderConstruction(
  state: GameState,
  projectId: string,
  reason: LegendaryWonderScrapReason,
): GameState {
  const project = state.legendaryWonderProjects?.[projectId];
  const city = project && state.cities[project.cityId];
  if (!project || !city) return state;
  const queueItem = `legendary:${project.wonderId}`;
  const active = city.productionQueue[0] === queueItem;
  const investedProduction = getEffectiveLegendaryWonderInvestment(state, project);
  const refundGold = Math.floor(investedProduction / 2);
  const phase = reason === 'rival-completed'
    ? 'lost_race'
    : reason === 'resource-count-quest-lost' ? 'questing' : 'ready_to_build';
  return {
    ...state,
    cities: {
      ...state.cities,
      [city.id]: {
        ...city,
        productionQueue: city.productionQueue.filter(item => item !== queueItem),
        productionProgress: active ? 0 : city.productionProgress,
      },
    },
    civilizations: {
      ...state.civilizations,
      [project.ownerId]: {
        ...state.civilizations[project.ownerId],
        gold: state.civilizations[project.ownerId].gold + refundGold,
      },
    },
    legendaryWonderProjects: {
      ...state.legendaryWonderProjects,
      [projectId]: { ...project, phase, investedProduction: 0, transferableProduction: 0 },
    },
  };
}

export function reconcileLegendaryWonderAvailability(state: GameState, bus: EventBus): GameState {
  let nextState = state;
  for (const [projectId, rawProject] of Object.entries(state.legendaryWonderProjects ?? {})) {
    if (rawProject.phase !== 'building') continue;
    const definition = getLegendaryWonderDefinition(rawProject.wonderId);
    if (!definition) continue;
    const project = syncLegendaryWonderQuestSteps(nextState, rawProject);
    nextState = {
      ...nextState,
      legendaryWonderProjects: { ...nextState.legendaryWonderProjects, [projectId]: project },
    };
    const completedBy = nextState.completedLegendaryWonders?.[project.wonderId];
    if (getEffectiveLegendaryWonderInvestment(nextState, project) >= definition.productionCost) {
      continue;
    }
    if (completedBy && completedBy.ownerId !== project.ownerId) {
      bus.emit('wonder:legendary-lost', {
        civId: project.ownerId,
        cityId: project.cityId,
        wonderId: project.wonderId,
        goldRefund: Math.floor(getEffectiveLegendaryWonderInvestment(nextState, project) / 2),
        transferableProduction: 0,
      });
      nextState = scrapLegendaryWonderConstruction(nextState, projectId, 'rival-completed');
      continue;
    }
    const eligibility = getLegendaryWonderEligibility(nextState, project.ownerId, project.cityId, definition);
    if (eligibility.blockers.some(blocker => blocker.kind === 'resource')) {
      bus.emit('wonder:legendary-lost', {
        civId: project.ownerId,
        cityId: project.cityId,
        wonderId: project.wonderId,
        goldRefund: Math.floor(getEffectiveLegendaryWonderInvestment(nextState, project) / 2),
        transferableProduction: 0,
      });
      nextState = scrapLegendaryWonderConstruction(nextState, projectId, 'required-resource-lost');
    } else if (definition.questSteps.some(step => step.type === 'resource-count')
      && project.questSteps.some(step => !step.completed)) {
      bus.emit('wonder:legendary-lost', {
        civId: project.ownerId,
        cityId: project.cityId,
        wonderId: project.wonderId,
        goldRefund: Math.floor(getEffectiveLegendaryWonderInvestment(nextState, project) / 2),
        transferableProduction: 0,
      });
      nextState = scrapLegendaryWonderConstruction(nextState, projectId, 'resource-count-quest-lost');
    }
  }
  const previousAvailability = nextState.legendaryWonderAvailability ?? {};
  const availability = { ...previousAvailability };
  for (const civ of Object.values(nextState.civilizations)) {
    for (const definition of getLegendaryWonderDefinitions()) {
      const project = Object.values(nextState.legendaryWonderProjects ?? {}).find(candidate =>
        candidate.ownerId === civ.id && candidate.wonderId === definition.id,
      );
      const completion = nextState.completedLegendaryWonders?.[definition.id];
      let status: import('@/core/types').LegendaryWonderAvailabilityStatus;
      if (completion) status = completion.ownerId === civ.id ? 'completed' : 'lost_race';
      else if (project?.phase === 'building') status = 'building';
      else if (project?.phase === 'questing') status = 'questing';
      else if (project?.phase === 'lost_race') status = 'lost_race';
      else {
        const cityId = civ.cities.find(cityId => getLegendaryWonderEligibility(nextState, civ.id, cityId, definition).buildable);
        status = cityId ? 'buildable' : 'blocked';
      }
      const key = getLegendaryWonderAvailabilityKey(civ.id, definition.id);
      const previous = previousAvailability[key]?.status;
      availability[key] = { status };
      if (previous !== status && (previous !== undefined || status === 'buildable')) {
        const cityActions = status === 'buildable'
          ? civ.cities
            .filter(cityId => getLegendaryWonderEligibility(nextState, civ.id, cityId, definition).buildable)
            .slice(0, 2)
            .map(cityId => ({
              cityId,
              wonderId: definition.id,
              label: `Build in ${nextState.cities[cityId]?.name ?? 'city'}`,
            }))
          : [];
        bus.emit('wonder:legendary-availability', {
          recipientCivId: civ.id,
          wonderId: definition.id,
          status,
          cityActions,
        });
      }
    }
  }
  return { ...nextState, legendaryWonderAvailability: availability };
}

export function tickLegendaryWonderProjects(state: GameState, _bus: EventBus): GameState {
  const seededState = initializeLegendaryWonderProjectsForAllCities({
    ...state,
    legendaryWonderProjects: sanitizeLegendaryWonderProjects(state),
  });
  if (!seededState.legendaryWonderProjects) {
    return seededState;
  }

  const updatedProjects: Record<string, LegendaryWonderProject> = {};
  const updatedCities = { ...seededState.cities };
  const updatedCivilizations = structuredClone(seededState.civilizations);
  const completedLegendaryWonders = { ...(seededState.completedLegendaryWonders ?? {}) };
  let legendaryWonderIntel = sanitizeLegendaryWonderIntel(seededState);
  let changed = seededState !== state;

  for (const [projectId, rawProject] of Object.entries(seededState.legendaryWonderProjects)) {
    if (updatedProjects[projectId]) {
      continue;
    }

    const project = syncLegendaryWonderQuestSteps(seededState, rawProject);
    const city = updatedCities[project.cityId];
    const definition = getLegendaryWonderDefinition(project.wonderId);

    if (project.phase === 'questing' && project.questSteps.every(step => step.completed)) {
      _bus.emit('wonder:legendary-ready', {
        civId: project.ownerId,
        cityId: project.cityId,
        wonderId: project.wonderId,
      });
      updatedProjects[projectId] = {
        ...project,
        phase: 'ready_to_build',
      };
      changed = true;
      continue;
    }

    if (project.phase === 'building' && city?.productionQueue[0] === `legendary:${project.wonderId}`) {
      const investedProduction = city.productionProgress;
      if (definition && investedProduction >= definition.productionCost) {
        if (!isLegendaryWonderStillAvailable(seededState, project.wonderId)) {
          updatedProjects[projectId] = project;
          changed = true;
          continue;
        }

        applyLegendaryWonderReward(state, updatedCivilizations, project.ownerId, definition.reward);
        _bus.emit('wonder:legendary-completed', {
          civId: project.ownerId,
          cityId: project.cityId,
          wonderId: project.wonderId,
          turnCompleted: state.turn,
        });
        updatedProjects[projectId] = {
          ...project,
          phase: 'completed',
          investedProduction: definition.productionCost,
          transferableProduction: 0,
        };
        completedLegendaryWonders[project.wonderId] = {
          ownerId: project.ownerId,
          cityId: project.cityId,
          turnCompleted: state.turn,
        };
        legendaryWonderIntel = recordKnownHumanLegendaryWonderCompletionIntel(
          {
            ...seededState,
            civilizations: updatedCivilizations,
            cities: updatedCities,
            completedLegendaryWonders,
            legendaryWonderIntel,
          },
          {
            wonderId: project.wonderId,
            civId: project.ownerId,
            completionTurn: state.turn,
            learnedTurn: state.turn,
          },
        );
        updatedCities[city.id] = {
          ...city,
          productionQueue: city.productionQueue.slice(1),
          productionProgress: 0,
        };

        for (const [rivalProjectId, rivalRawProject] of Object.entries(seededState.legendaryWonderProjects)) {
          const rivalProject = syncLegendaryWonderQuestSteps(seededState, rivalRawProject);
          if (rivalProjectId === projectId || rivalProject.wonderId !== project.wonderId || rivalProject.phase === 'completed') {
            continue;
          }

          const rivalInvestment = getEffectiveLegendaryWonderInvestment(seededState, rivalProject);
          const goldRefund = Math.floor(rivalInvestment / 2);
          const rivalCity = updatedCities[rivalProject.cityId];
          const rivalCivilization = updatedCivilizations[rivalProject.ownerId];

          updatedProjects[rivalProjectId] = {
            ...rivalProject,
            phase: 'lost_race',
            investedProduction: 0,
            transferableProduction: 0,
          };

          if (rivalCivilization) {
            rivalCivilization.gold += goldRefund;
          }

          if (rivalCity) {
            const wasActivelyBuilding = rivalCity.productionQueue[0] === `legendary:${rivalProject.wonderId}`;
            updatedCities[rivalCity.id] = {
              ...rivalCity,
              productionQueue: rivalCity.productionQueue.filter(item => item !== `legendary:${rivalProject.wonderId}`),
              productionProgress: wasActivelyBuilding ? 0 : rivalCity.productionProgress,
            };
          }

          if (rivalInvestment > 0) {
            _bus.emit('wonder:legendary-lost', {
              civId: rivalProject.ownerId,
              cityId: rivalProject.cityId,
              wonderId: rivalProject.wonderId,
              goldRefund,
              transferableProduction: 0,
            });
          }
        }
      } else {
        updatedProjects[projectId] = {
          ...project,
          investedProduction,
        };
      }
      changed = true;
      continue;
    }

    if (project.phase === 'building' && city) {
      updatedProjects[projectId] = {
        ...project,
        investedProduction: city.productionProgress,
      };
      changed = true;
      continue;
    }

    updatedProjects[projectId] = project;
  }

  if (!changed) {
    return state;
  }

  return {
    ...seededState,
    cities: updatedCities,
    civilizations: updatedCivilizations,
    legendaryWonderProjects: updatedProjects,
    completedLegendaryWonders,
    legendaryWonderIntel,
  };
}

export function startLegendaryWonderBuild(
  state: GameState,
  civId: string,
  cityId: string,
  wonderId: string,
  bus?: EventBus,
): GameState {
  const seededState = initializeLegendaryWonderProjectsForCity(state, civId, cityId);
  const projectEntry = findLegendaryWonderProjectEntry(seededState, civId, cityId, wonderId);
  const projectKey = projectEntry?.[0];
  const project = projectEntry?.[1];
  if (
    !projectKey
    || !project
    || project.phase !== 'ready_to_build'
    || !isLegendaryWonderStillAvailable(seededState, wonderId)
    || !getEligibleLegendaryWonders(seededState, civId, cityId).includes(wonderId)
    || hasActiveLegendaryWonderBuildForCiv(seededState, civId, wonderId, cityId)
  ) {
    return seededState;
  }

  const wonderDefinition = getLegendaryWonderDefinition(project.wonderId);
  const city = seededState.cities[cityId];
  const civilization = seededState.civilizations[civId];
  const pendingEvents = { ...(seededState.pendingEvents ?? {}) };
  let legendaryWonderIntel = { ...(seededState.legendaryWonderIntel ?? {}) };
  const carriedProduction = city?.productionProgress ?? 0;

  for (const [observerId, espionageState] of Object.entries(seededState.espionage ?? {})) {
    if (observerId === civId) {
      continue;
    }

    const hasStationedSpy = Object.values(espionageState.spies).some(spy =>
      spy.status === 'stationed'
      && spy.targetCivId === civId
      && spy.targetCityId === cityId,
    );

    if (!hasStationedSpy) {
      continue;
    }

    const message = `${civilization?.name ?? civId} began ${wonderDefinition?.name ?? project.wonderId} in ${city?.name ?? cityId}.`;
    pendingEvents[observerId] = [
      ...(pendingEvents[observerId] ?? []),
      {
        type: 'legendary-wonder-started',
        message,
        turn: state.turn,
      },
    ];
    legendaryWonderIntel = recordLegendaryWonderIntel(
      {
        ...seededState,
        legendaryWonderIntel,
      },
      observerId,
      createStartedLegendaryWonderIntelEntry({
        projectKey,
        wonderId: project.wonderId,
        civId,
        civName: civilization?.name ?? civId,
        cityId,
        cityName: city?.name ?? cityId,
        revealedTurn: state.turn,
      }),
    );
    if (city) {
      legendaryWonderIntel = recordLegendaryWonderIntel(
        {
          ...seededState,
          legendaryWonderIntel,
        },
        observerId,
        createHostLocationLegendaryWonderIntelEntry({
          projectKey,
          wonderId: project.wonderId,
          civId,
          civName: civilization?.name ?? civId,
          cityId,
          cityName: city.name,
          coord: city.position,
          learnedTurn: state.turn,
          source: 'spy-location',
        }),
      );
    }
    bus?.emit('wonder:legendary-race-revealed', {
      observerId,
      civId,
      cityId,
      wonderId: project.wonderId,
    });
  }

  const startedState: GameState = {
    ...seededState,
    pendingEvents,
    legendaryWonderIntel,
    cities: city ? {
        ...seededState.cities,
        [cityId]: {
          ...city,
          productionQueue: [`legendary:${wonderId}`, ...city.productionQueue.filter(item => item !== `legendary:${wonderId}`)],
          productionProgress: carriedProduction,
        },
      } : state.cities,
    legendaryWonderProjects: {
      ...seededState.legendaryWonderProjects,
      [projectKey]: {
        ...project,
        phase: 'building',
        investedProduction: carriedProduction,
        transferableProduction: 0,
      },
    },
  };
  const availabilityKey = getLegendaryWonderAvailabilityKey(civId, wonderId);
  const nextState = {
    ...startedState,
    legendaryWonderAvailability: {
      ...startedState.legendaryWonderAvailability,
      [availabilityKey]: { status: 'building' as const },
    },
  };
  bus?.emit('wonder:legendary-availability', {
    recipientCivId: civId,
    wonderId,
    status: 'building',
    cityActions: [],
  });
  return nextState;
}

export function getLegendaryWonderProjectDefinition(state: GameState, wonderId: string) {
  const project = Object.values(state.legendaryWonderProjects ?? {}).find(candidate => candidate.wonderId === wonderId);
  if (!project) {
    return undefined;
  }
  return getLegendaryWonderDefinition(project.wonderId);
}

function applyLegendaryWonderReward(
  state: GameState,
  civilizations: GameState['civilizations'],
  ownerId: string,
  reward: NonNullable<ReturnType<typeof getLegendaryWonderDefinition>>['reward'],
): void {
  const civilization = civilizations[ownerId];
  if (!civilization) {
    return;
  }

  const civBonus = resolveCivDefinition(state, civilization.civType ?? '')?.bonusEffect;
  const wonderRewardMultiplier = civBonus?.type === 'wonder_rewards' ? civBonus.rewardMultiplier : 1;

  if (reward.instantResearch) {
    civilization.techState = {
      ...civilization.techState,
      researchProgress: civilization.techState.researchProgress + Math.round(reward.instantResearch * wonderRewardMultiplier),
    };
  }
}

function getWonderRewardMultiplier(state: GameState, civId: string): number {
  const civBonus = resolveCivDefinition(state, state.civilizations[civId]?.civType ?? '')?.bonusEffect;
  return civBonus?.type === 'wonder_rewards' ? civBonus.rewardMultiplier : 1;
}

function scaleYieldTotals(source: Partial<ResourceYield> | undefined, multiplier: number): Partial<ResourceYield> | undefined {
  if (!source) {
    return source;
  }

  return {
    food: source.food !== undefined ? Math.round(source.food * multiplier) : undefined,
    production: source.production !== undefined ? Math.round(source.production * multiplier) : undefined,
    gold: source.gold !== undefined ? Math.round(source.gold * multiplier) : undefined,
    science: source.science !== undefined ? Math.round(source.science * multiplier) : undefined,
  };
}

function addYieldTotals(target: Partial<ResourceYield>, source?: Partial<ResourceYield>): Partial<ResourceYield> {
  if (!source) {
    return target;
  }

  return {
    food: (target.food ?? 0) + (source.food ?? 0),
    production: (target.production ?? 0) + (source.production ?? 0),
    gold: (target.gold ?? 0) + (source.gold ?? 0),
    science: (target.science ?? 0) + (source.science ?? 0),
  };
}

export function getLegendaryWonderCivYieldBonus(state: GameState, civId: string): Partial<ResourceYield> {
  let totals: Partial<ResourceYield> = {};
  const multiplier = getWonderRewardMultiplier(state, civId);

  for (const [wonderId, completion] of Object.entries(state.completedLegendaryWonders ?? {})) {
    if (completion.ownerId !== civId) {
      continue;
    }

    const definition = getLegendaryWonderDefinition(wonderId);
    totals = addYieldTotals(totals, scaleYieldTotals(definition?.reward.civYieldBonus, multiplier));
  }

  return totals;
}

export function getLegendaryWonderCityYieldBonus(
  state: GameState,
  civId: string,
  cityId: string,
): Partial<ResourceYield> {
  let totals: Partial<ResourceYield> = {};
  const multiplier = getWonderRewardMultiplier(state, civId);

  for (const [wonderId, completion] of Object.entries(state.completedLegendaryWonders ?? {})) {
    if (completion.ownerId !== civId || completion.cityId !== cityId) {
      continue;
    }

    const definition = getLegendaryWonderDefinition(wonderId);
    totals = addYieldTotals(totals, scaleYieldTotals(definition?.reward.cityYieldBonus, multiplier));
  }

  return totals;
}
