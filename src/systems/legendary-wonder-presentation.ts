import type { GameState, LegendaryWonderProject } from '@/core/types';
import { getLegendaryWonderDefinition, getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import {
  getEligibleLegendaryWonders,
  initializeLegendaryWonderProjectsForCity,
} from '@/systems/legendary-wonder-system';
import { getTechById } from '@/systems/tech-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getUnrestYieldMultiplier } from '@/systems/faction-system';
import { getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { getLegendaryWonderQueueItemId } from '@/systems/legendary-wonder-production';
export {
  LEGENDARY_WONDER_PRODUCTION_ICON,
  LEGENDARY_WONDER_PRODUCTION_PREFIX,
  getLegendaryWonderDisplayName,
  getLegendaryWonderProductionCost,
  getLegendaryWonderQueueItemId,
  getLegendaryWonderQueueItemMetadata,
  type LegendaryWonderQueueItemMetadata,
} from '@/systems/legendary-wonder-production';

export type LegendaryWonderVisibleState =
  | 'ready'
  | 'questing'
  | 'building'
  | 'completed'
  | 'recovered'
  | 'near'
  | 'blocked';

export type LegendaryWonderEligibilityState = 'buildable' | 'near' | 'blocked' | 'complete';

export type LegendaryWonderMilestoneLabel =
  | 'Foundation laid'
  | 'Rising'
  | 'Final works'
  | 'Nearly complete';

export interface LegendaryWonderPresentationEntry {
  wonderId: string;
  queueItemId: string;
  name: string;
  era: number;
  productionCost: number;
  rewardSummary: string;
  visibleState: LegendaryWonderVisibleState;
  eligibilityState: LegendaryWonderEligibilityState;
  phase: LegendaryWonderProject['phase'] | 'unseeded';
  questCompleted: number;
  questTotal: number;
  questSteps: LegendaryWonderProject['questSteps'];
  investedProduction: number;
  transferableProduction: number;
  missingRequirements: string[];
  canStartBuild: boolean;
  startActionLabel: string | null;
  progressPercent: number;
  turnsRemaining: number | null;
  milestoneLabel: LegendaryWonderMilestoneLabel | null;
  queueContinuityLabel: string | null;
  productionResumedLabel: string | null;
  recoveryLabel: string | null;
  raceTensionLabel: string | null;
}

export function getLegendaryWonderConstructionMilestone(
  investedProduction: number,
  productionCost: number,
): LegendaryWonderMilestoneLabel {
  const progress = productionCost > 0 ? Math.floor((investedProduction / productionCost) * 100) : 0;
  if (progress >= 90) return 'Nearly complete';
  if (progress >= 60) return 'Final works';
  if (progress >= 25) return 'Rising';
  return 'Foundation laid';
}

function titleCaseId(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function isWonderAlreadyCompleted(state: GameState, wonderId: string): boolean {
  return Boolean(state.completedLegendaryWonders?.[wonderId]);
}

function hasSameOwnerActiveBuild(
  state: GameState,
  civId: string,
  cityId: string,
  wonderId: string,
): boolean {
  return Object.values(state.legendaryWonderProjects ?? {}).some(project =>
    project.ownerId === civId
    && project.cityId !== cityId
    && project.wonderId === wonderId
    && project.phase === 'building',
  );
}

function getMissingRequirements(state: GameState, civId: string, cityId: string, wonderId: string): string[] {
  const definition = getLegendaryWonderDefinition(wonderId);
  const civ = state.civilizations[civId];
  if (!definition || !civ || !state.cities[cityId]) {
    return ['Requirements unavailable'];
  }

  const ownedResources = getOwnedResources(state, cityId);
  const missing = [
    ...definition.requiredTechs
      .filter(techId => !civ.techState.completed.includes(techId))
      .map(techId => getTechById(techId)?.name ?? titleCaseId(techId)),
    ...definition.requiredResources
      .filter(resource => !ownedResources.has(resource))
      .map(titleCaseId),
  ];

  if (!hasCityRequirement(state, cityId, definition.cityRequirement)) {
    missing.push(definition.cityRequirement === 'river' ? 'River city' : 'Coastal city');
  }

  if (isWonderAlreadyCompleted(state, wonderId)) {
    missing.push('Already completed elsewhere');
  }

  if (hasSameOwnerActiveBuild(state, civId, cityId, wonderId)) {
    missing.push('Already under construction in another city');
  }

  return missing;
}

function isNearEligible(state: GameState, missingRequirements: string[], era: number): boolean {
  const currentEra = typeof state.era === 'number' ? state.era : 1;
  return era <= currentEra + 1 && missingRequirements.length <= 2;
}

function isCompactEligible(entry: LegendaryWonderPresentationEntry, state: GameState): boolean {
  if (entry.visibleState === 'ready' || entry.visibleState === 'building' || entry.visibleState === 'recovered') {
    return true;
  }
  if (entry.visibleState === 'completed' || entry.visibleState === 'blocked') {
    return false;
  }
  return isNearEligible(state, entry.missingRequirements, entry.era);
}

function getVisibleState(
  state: GameState,
  project: LegendaryWonderProject | undefined,
  missingRequirements: string[],
  canStartBuild: boolean,
  era: number,
): LegendaryWonderVisibleState {
  if (project?.phase === 'completed') {
    return 'completed';
  }
  if (project?.phase === 'lost_race') {
    return 'recovered';
  }
  if (project?.phase === 'building') {
    return 'building';
  }
  if (project?.phase === 'ready_to_build') {
    return canStartBuild ? 'ready' : 'blocked';
  }
  if (project?.phase === 'questing') {
    if (missingRequirements.length > 0) {
      return isNearEligible(state, missingRequirements, era) ? 'near' : 'blocked';
    }
    return 'questing';
  }
  return isNearEligible(state, missingRequirements, era) ? 'near' : 'blocked';
}

function getEligibilityState(
  visibleState: LegendaryWonderVisibleState,
  canStartBuild: boolean,
): LegendaryWonderEligibilityState {
  if (visibleState === 'completed') {
    return 'complete';
  }
  if (canStartBuild) {
    return 'buildable';
  }
  if (visibleState === 'near' || visibleState === 'questing') {
    return 'near';
  }
  return 'blocked';
}

function getDefaultQuestSteps(wonderId: string): LegendaryWonderProject['questSteps'] {
  return getLegendaryWonderDefinition(wonderId)?.questSteps.map(step => ({
    id: step.id,
    description: step.description ?? titleCaseId(step.id),
    completed: false,
  })) ?? [];
}

function progressPercent(investedProduction: number, productionCost: number): number {
  if (productionCost <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((investedProduction / productionCost) * 100)));
}

function turnsRemaining(cityProductionPerTurn: number, investedProduction: number, productionCost: number): number | null {
  if (cityProductionPerTurn <= 0) return null;
  return Math.max(0, Math.ceil(Math.max(0, productionCost - investedProduction) / cityProductionPerTurn));
}

function cityProductionPerTurn(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const base = calculateProjectedCityYields(state, cityId);
  const multiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
  return Math.floor(base.production * multiplier);
}

export function getLegendaryWonderPresentationForCity(
  state: GameState,
  civId: string,
  cityId: string,
  maxEntries?: number,
): LegendaryWonderPresentationEntry[] {
  const seededState = initializeLegendaryWonderProjectsForCity(state, civId, cityId);
  const projectByWonder = new Map<string, LegendaryWonderProject>();
  for (const project of Object.values(seededState.legendaryWonderProjects ?? {})) {
    if (project.ownerId === civId && project.cityId === cityId && !projectByWonder.has(project.wonderId)) {
      projectByWonder.set(project.wonderId, project);
    }
  }

  const eligibleWonderIds = new Set(getEligibleLegendaryWonders(seededState, civId, cityId));

  const entries = getLegendaryWonderDefinitions().map(definition => {
    const project = projectByWonder.get(definition.id);
    const completedHere = seededState.completedLegendaryWonders?.[definition.id]?.ownerId === civId
      && seededState.completedLegendaryWonders?.[definition.id]?.cityId === cityId;
    const missingRequirements = getMissingRequirements(seededState, civId, cityId, definition.id);
    const canStartBuild = project?.phase === 'ready_to_build'
      && eligibleWonderIds.has(definition.id)
      && missingRequirements.length === 0;
    const visibleState = completedHere
      ? 'completed'
      : getVisibleState(seededState, project, missingRequirements, canStartBuild, definition.era);
    const questSteps = project?.questSteps ?? getDefaultQuestSteps(definition.id);
    const questCompleted = questSteps.filter(step => step.completed).length;
    const city = seededState.cities[cityId];
    const queueItemId = getLegendaryWonderQueueItemId(definition.id);
    const isActiveLegendaryBuild = project?.phase === 'building' && city?.productionQueue[0] === queueItemId;
    const investedProduction = completedHere
      ? definition.productionCost
      : isActiveLegendaryBuild
        ? city.productionProgress
        : project?.investedProduction ?? 0;
    const buildingProgress = visibleState === 'building' ? investedProduction : 0;

    return {
      wonderId: definition.id,
      queueItemId,
      name: definition.name,
      era: definition.era,
      productionCost: definition.productionCost,
      rewardSummary: definition.reward.summary,
      visibleState,
      eligibilityState: getEligibilityState(visibleState, canStartBuild),
      phase: completedHere ? 'completed' : project?.phase ?? 'unseeded',
      questCompleted,
      questTotal: questSteps.length,
      questSteps,
      investedProduction,
      transferableProduction: project?.transferableProduction ?? 0,
      missingRequirements,
      canStartBuild,
      startActionLabel: canStartBuild ? 'Start Construction' : null,
      progressPercent: progressPercent(investedProduction, definition.productionCost),
      turnsRemaining: visibleState === 'building'
        ? turnsRemaining(cityProductionPerTurn(seededState, cityId), buildingProgress, definition.productionCost)
        : null,
      milestoneLabel: visibleState === 'building'
        ? getLegendaryWonderConstructionMilestone(buildingProgress, definition.productionCost)
        : null,
      queueContinuityLabel: visibleState === 'building' && (city?.productionQueue.length ?? 0) > 1
        ? 'Queue resumes after this wonder.'
        : null,
      productionResumedLabel: visibleState === 'completed' || visibleState === 'recovered'
        ? 'Normal production has resumed.'
        : null,
      recoveryLabel: visibleState === 'recovered' && (project?.transferableProduction ?? 0) > 0
        ? `Effort recovered: ${project?.transferableProduction ?? 0} production carryover preserved.`
        : null,
      raceTensionLabel: visibleState === 'building' ? 'Construction underway' : null,
    } satisfies LegendaryWonderPresentationEntry;
  });

  const sorted = entries.sort((left, right) => {
    const stateOrder: Record<LegendaryWonderVisibleState, number> = {
      ready: 0,
      building: 1,
      recovered: 2,
      questing: 3,
      near: 4,
      blocked: 5,
      completed: 6,
    };
    return stateOrder[left.visibleState] - stateOrder[right.visibleState]
      || left.era - right.era
      || left.name.localeCompare(right.name);
  });

  return typeof maxEntries === 'number' ? sorted.slice(0, maxEntries) : sorted;
}

export function getCompactLegendaryWonderEntriesForCity(
  state: GameState,
  civId: string,
  cityId: string,
  maxEntries: number = 4,
): LegendaryWonderPresentationEntry[] {
  return getLegendaryWonderPresentationForCity(state, civId, cityId)
    .filter(entry => isCompactEligible(entry, state))
    .slice(0, maxEntries);
}
