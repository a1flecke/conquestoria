import type { GameState, LegendaryWonderProject, ResourceYield } from '@/core/types';
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
  const updatedCivilizations = structuredClone(state.civilizations);
  const completedLegendaryWonders = { ...(state.completedLegendaryWonders ?? {}) };
  let changed = false;

  for (const [projectId, project] of Object.entries(state.legendaryWonderProjects)) {
    if (updatedProjects[projectId]) {
      continue;
    }

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

        for (const [rivalProjectId, rivalProject] of Object.entries(state.legendaryWonderProjects)) {
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
    ...state,
    cities: updatedCities,
    civilizations: updatedCivilizations,
    legendaryWonderProjects: updatedProjects,
    completedLegendaryWonders,
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
  const carriedProduction = city?.productionProgress ?? 0;

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
    cities: city ? {
      ...state.cities,
      [cityId]: {
        ...city,
        productionQueue: [`legendary:${wonderId}`],
        productionProgress: carriedProduction,
      },
    } : state.cities,
    legendaryWonderProjects: {
      ...state.legendaryWonderProjects,
      [wonderId]: {
        ...project,
        phase: 'building',
        investedProduction: carriedProduction,
        transferableProduction: 0,
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
