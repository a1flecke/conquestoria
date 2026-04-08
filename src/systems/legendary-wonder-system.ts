import type { GameState, LegendaryWonderProject } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';

export function getEligibleLegendaryWonders(
  state: GameState,
  civId: string,
  cityId: string,
): string[] {
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city) {
    return [];
  }

  return Object.values(state.legendaryWonderProjects ?? {})
    .filter(project => project.ownerId === civId && project.cityId === cityId)
    .map(project => project.wonderId)
    .filter(wonderId => {
      const definition = getLegendaryWonderDefinition(wonderId);
      if (!definition) {
        return false;
      }

      const hasRequiredTechs = definition.requiredTechs.every(tech => civ.techState.completed.includes(tech));
      if (!hasRequiredTechs) {
        return false;
      }

      const ownedResources = new Set(
        city.ownedTiles
          .map(coord => state.map.tiles[`${coord.q},${coord.r}`]?.resource)
          .filter((resource): resource is string => resource !== null),
      );
      const hasRequiredResources = definition.requiredResources.every(resource => ownedResources.has(resource));
      if (!hasRequiredResources) {
        return false;
      }

      if (definition.cityRequirement === 'river') {
        return city.ownedTiles.some(coord => state.map.tiles[`${coord.q},${coord.r}`]?.hasRiver);
      }
      if (definition.cityRequirement === 'coastal') {
        return city.ownedTiles.some(coord => {
          const tile = state.map.tiles[`${coord.q},${coord.r}`];
          return tile?.terrain === 'coast' || tile?.terrain === 'ocean';
        });
      }
      return true;
    });
}

export function unlockLegendaryWonderProject(
  state: GameState,
  civId: string,
  wonderId: string,
): LegendaryWonderProject {
  const project = state.legendaryWonderProjects?.[wonderId];
  if (!project || project.ownerId !== civId) {
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
  if (!state.legendaryWonderProjects) {
    return state;
  }

  const updatedProjects: Record<string, LegendaryWonderProject> = {};
  const updatedCities = { ...state.cities };
  let changed = false;

  for (const [projectId, project] of Object.entries(state.legendaryWonderProjects)) {
    const city = state.cities[project.cityId];
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
        _bus.emit('wonder:legendary-completed', {
          civId: project.ownerId,
          cityId: project.cityId,
          wonderId: project.wonderId,
        });
        updatedProjects[projectId] = {
          ...project,
          phase: 'completed',
          investedProduction: definition.productionCost,
        };
        updatedCities[city.id] = {
          ...city,
          productionQueue: city.productionQueue.slice(1),
          productionProgress: 0,
        };
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
    ...state,
    cities: updatedCities,
    legendaryWonderProjects: updatedProjects,
  };
}

export function startLegendaryWonderBuild(
  state: GameState,
  civId: string,
  cityId: string,
  wonderId: string,
  bus?: EventBus,
): GameState {
  const project = state.legendaryWonderProjects?.[wonderId];
  if (!project || project.ownerId !== civId || project.cityId !== cityId || project.phase !== 'ready_to_build') {
    return state;
  }

  const wonderDefinition = getLegendaryWonderDefinition(project.wonderId);
  const city = state.cities[cityId];
  const civilization = state.civilizations[civId];
  const pendingEvents = { ...(state.pendingEvents ?? {}) };

  for (const [observerId, espionageState] of Object.entries(state.espionage ?? {})) {
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
    bus?.emit('wonder:legendary-race-revealed', {
      observerId,
      civId,
      cityId,
      wonderId: project.wonderId,
    });
  }

  return {
    ...state,
    pendingEvents,
    legendaryWonderProjects: {
      ...state.legendaryWonderProjects,
      [wonderId]: {
        ...project,
        phase: 'building',
      },
    },
  };
}

export function getLegendaryWonderProjectDefinition(state: GameState, wonderId: string) {
  const project = state.legendaryWonderProjects?.[wonderId];
  if (!project) {
    return undefined;
  }
  return getLegendaryWonderDefinition(project.wonderId);
}
