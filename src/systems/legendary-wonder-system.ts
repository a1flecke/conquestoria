import type { GameState, LegendaryWonderProject, ResourceYield } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { getLegendaryWonderDefinition, getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getTechById } from '@/systems/tech-system';
import { hexDistance } from '@/systems/hex-utils';

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

function getOwnedResources(state: GameState, cityId: string): Set<string> {
  const city = state.cities[cityId];
  if (!city) {
    return new Set();
  }

  return new Set(
    city.ownedTiles
      .map(coord => state.map.tiles[`${coord.q},${coord.r}`]?.resource)
      .filter((resource): resource is string => resource !== null),
  );
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

function sanitizeLegendaryWonderIntel(
  state: GameState,
  projects: Record<string, LegendaryWonderProject>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(state.legendaryWonderIntel ?? {}).map(([viewerId, projectKeys]) => [
      viewerId,
      projectKeys.filter(projectKey => {
        const project = projects[projectKey];
        return Boolean(project && project.phase === 'building');
      }),
    ]).filter(([, projectKeys]) => projectKeys.length > 0),
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
    case 'buildings-in-multiple-cities':
      return `Develop ${step.targetCount ?? 2} well-built cities.`;
    case 'trade-routes-established':
      return `Maintain ${step.targetCount ?? 1} trade routes.`;
    case 'map-discoveries':
      return `Discover ${step.targetCount ?? 2} remarkable sites.`;
  }
}

function evaluateLegendaryWonderStep(state: GameState, project: LegendaryWonderProject, stepId: string): boolean {
  const definition = getLegendaryWonderDefinition(project.wonderId);
  const step = definition?.questSteps.find(candidate => candidate.id === stepId);
  const city = state.cities[project.cityId];
  const civ = state.civilizations[project.ownerId];
  if (!definition || !step || !city || !civ) {
    return false;
  }

  const discoveredWonderCount = Object.values(state.wonderDiscoverers ?? {})
    .filter(discoverers => discoverers.includes(project.ownerId))
    .length;
  const ownedTradeRoutes = (state.marketplace?.tradeRoutes ?? []).filter(route => route.fromCityId === project.cityId || civ.cities.includes(route.fromCityId));
  const builtUpCities = civ.cities
    .map(cityRef => state.cities[cityRef])
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter(candidate => candidate.buildings.length >= 3);

  switch (stepId) {
    case 'discover-natural-wonder':
      return discoveredWonderCount >= 1;
    case 'complete-pilgrimage-route':
    case 'complete-sacred-route':
      return ownedTradeRoutes.length >= 1;
    case 'connect-two-cities':
    case 'establish-two-trade-links':
      return ownedTradeRoutes.length >= 2;
    case 'grow-river-city':
      return hasCityRequirement(state, city.id, 'river') && city.population >= 7;
    case 'complete-four-communication-techs':
      return civ.techState.completed.filter(techId => getTechById(techId)?.track === 'communication').length >= 4;
  }

  switch (step.type) {
    case 'discover_wonder':
      return discoveredWonderCount >= (step.targetCount ?? 1);
    case 'trade_route':
    case 'trade-routes-established':
      return ownedTradeRoutes.length >= (step.targetCount ?? 1);
    case 'research_count': {
      if (step.track) {
        const trackCount = civ.techState.completed.filter(techId => {
          return getTechById(techId)?.track === step.track;
        }).length;
        return trackCount >= (step.targetCount ?? 1);
      }
      return civ.techState.completed.length >= (step.targetCount ?? 1);
    }
    case 'defeat_stronghold':
      return (state.legendaryWonderHistory?.destroyedStrongholds ?? [])
        .filter(record => record.civId === project.ownerId)
        .some(record => {
          if (step.scope === 'near-city') {
            return hexDistance(record.position, city.position) <= (step.radius ?? 4);
          }
          return true;
        });
    case 'buildings-in-multiple-cities':
      return builtUpCities.length >= (step.targetCount ?? 2);
    case 'map-discoveries':
      return discoveredWonderCount >= (step.targetCount ?? 2);
  }
}

function syncLegendaryWonderQuestSteps(state: GameState, project: LegendaryWonderProject): LegendaryWonderProject {
  return {
    ...project,
    questSteps: project.questSteps.map(step => ({
      ...step,
      completed: step.completed || evaluateLegendaryWonderStep(state, project, step.id),
    })),
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
      continue;
    }

    legendaryWonderProjects[buildLegendaryWonderProjectKey(civId, cityId, definition.id)] = {
      wonderId: definition.id,
      ownerId: civId,
      cityId,
      phase: 'questing',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: definition.questSteps.map(step => ({
        id: step.id,
        description: step.description ?? getDefaultQuestStepDescription(step),
        completed: false,
      })),
    };
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
    legendaryWonderIntel: sanitizeLegendaryWonderIntel(state, sanitizeLegendaryWonderProjects(state)),
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
  const civ = seededState.civilizations[civId];
  const city = seededState.cities[cityId];
  if (!civ || !city) {
    return [];
  }

  const ownedResources = getOwnedResources(seededState, cityId);

  return Object.values(seededState.legendaryWonderProjects ?? {})
    .filter(project => project.ownerId === civId && project.cityId === cityId)
    .map(project => project.wonderId)
    .filter(wonderId => {
      if (!isLegendaryWonderStillAvailable(seededState, wonderId)) {
        return false;
      }

      const definition = getLegendaryWonderDefinition(wonderId);
      if (!definition) {
        return false;
      }

      const hasRequiredTechs = definition.requiredTechs.every(tech => civ.techState.completed.includes(tech));
      if (!hasRequiredTechs) {
        return false;
      }

      const hasRequiredResources = definition.requiredResources.every(resource => ownedResources.has(resource));
      if (!hasRequiredResources) {
        return false;
      }

      return hasCityRequirement(seededState, cityId, definition.cityRequirement);
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

        applyLegendaryWonderReward(updatedCivilizations, project.ownerId, definition.reward);
        _bus.emit('wonder:legendary-completed', {
          civId: project.ownerId,
          cityId: project.cityId,
          wonderId: project.wonderId,
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

          const compensation = loseLegendaryWonderRace(rivalProject.investedProduction);
          const rivalCity = updatedCities[rivalProject.cityId];
          const rivalCivilization = updatedCivilizations[rivalProject.ownerId];

          updatedProjects[rivalProjectId] = {
            ...rivalProject,
            phase: 'lost_race',
            transferableProduction: compensation.transferableProduction,
          };

          if (rivalCivilization) {
            rivalCivilization.gold += compensation.goldRefund;
          }

          if (rivalCity) {
            const wasActivelyBuilding = rivalCity.productionQueue[0] === `legendary:${rivalProject.wonderId}`;
            updatedCities[rivalCity.id] = {
              ...rivalCity,
              productionQueue: wasActivelyBuilding
                ? rivalCity.productionQueue.filter(item => item !== `legendary:${rivalProject.wonderId}`)
                : rivalCity.productionQueue,
              productionProgress: wasActivelyBuilding ? 0 : rivalCity.productionProgress,
            };
          }

          if (rivalProject.investedProduction > 0) {
            _bus.emit('wonder:legendary-lost', {
              civId: rivalProject.ownerId,
              cityId: rivalProject.cityId,
              wonderId: rivalProject.wonderId,
              goldRefund: compensation.goldRefund,
              transferableProduction: compensation.transferableProduction,
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
    legendaryWonderIntel: sanitizeLegendaryWonderIntel(
      {
        ...seededState,
        legendaryWonderProjects: updatedProjects,
      },
      updatedProjects,
    ),
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
    || hasActiveLegendaryWonderBuildForCiv(seededState, civId, wonderId, cityId)
  ) {
    return seededState;
  }

  const wonderDefinition = getLegendaryWonderDefinition(project.wonderId);
  const city = seededState.cities[cityId];
  const civilization = seededState.civilizations[civId];
  const pendingEvents = { ...(seededState.pendingEvents ?? {}) };
  const legendaryWonderIntel = { ...(seededState.legendaryWonderIntel ?? {}) };
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
    legendaryWonderIntel[observerId] = Array.from(new Set([
      ...(legendaryWonderIntel[observerId] ?? []),
      projectKey,
    ]));
    bus?.emit('wonder:legendary-race-revealed', {
      observerId,
      civId,
      cityId,
      wonderId: project.wonderId,
    });
  }

  return {
    ...seededState,
    pendingEvents,
    legendaryWonderIntel,
    cities: city ? {
      ...seededState.cities,
      [cityId]: {
        ...city,
        productionQueue: [`legendary:${wonderId}`],
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
}

export function getLegendaryWonderProjectDefinition(state: GameState, wonderId: string) {
  const project = Object.values(state.legendaryWonderProjects ?? {}).find(candidate => candidate.wonderId === wonderId);
  if (!project) {
    return undefined;
  }
  return getLegendaryWonderDefinition(project.wonderId);
}

function applyLegendaryWonderReward(
  civilizations: GameState['civilizations'],
  ownerId: string,
  reward: NonNullable<ReturnType<typeof getLegendaryWonderDefinition>>['reward'],
): void {
  const civilization = civilizations[ownerId];
  if (!civilization) {
    return;
  }

  if (reward.instantResearch) {
    civilization.techState = {
      ...civilization.techState,
      researchProgress: civilization.techState.researchProgress + reward.instantResearch,
    };
  }
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

  for (const [wonderId, completion] of Object.entries(state.completedLegendaryWonders ?? {})) {
    if (completion.ownerId !== civId) {
      continue;
    }

    const definition = getLegendaryWonderDefinition(wonderId);
    totals = addYieldTotals(totals, definition?.reward.civYieldBonus);
  }

  return totals;
}

export function getLegendaryWonderCityYieldBonus(
  state: GameState,
  civId: string,
  cityId: string,
): Partial<ResourceYield> {
  let totals: Partial<ResourceYield> = {};

  for (const [wonderId, completion] of Object.entries(state.completedLegendaryWonders ?? {})) {
    if (completion.ownerId !== civId || completion.cityId !== cityId) {
      continue;
    }

    const definition = getLegendaryWonderDefinition(wonderId);
    totals = addYieldTotals(totals, definition?.reward.cityYieldBonus);
  }

  return totals;
}
