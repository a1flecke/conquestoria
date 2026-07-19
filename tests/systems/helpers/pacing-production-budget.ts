import type { Building, BuildingCategory, Tech } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import {
  TECH_TREE,
  getEraAdvancementFraction,
  getEraAdvancementTechs,
  hasReachedEraThreshold,
  resolveCivilizationEra,
} from '@/systems/tech-definitions';
import { getResearchOutputProfileForTech } from '@/systems/pacing-model';
import { requireEraPacingProfile } from '@/systems/era-pacing-profiles';

export interface ResearchTimelineEntry {
  techId: string;
  era: number;
  eta: number;
  completionTurn: number;
}

export interface RepresentativeResearchTimeline {
  targetEra: number;
  entries: ResearchTimelineEntry[];
  completedTechIds: string[];
  arrivalTurnByEra: ReadonlyMap<number, number>;
}

export interface RepresentativeCohort {
  id: string;
  foundedEra: number;
}

export interface RepresentativeBuildingInput {
  completedTechs: readonly string[];
  completedBuildings: readonly string[];
}

export const REPRESENTATIVE_COHORTS: readonly RepresentativeCohort[] = [
  { id: 'capital', foundedEra: 1 },
  { id: 'expansion-1', foundedEra: 3 },
  { id: 'expansion-2', foundedEra: 5 },
  { id: 'expansion-3', foundedEra: 7 },
  { id: 'frontier', foundedEra: 9 },
];

const CATEGORY_ORDER: readonly BuildingCategory[] = [
  'food', 'production', 'science', 'economy', 'culture', 'military', 'espionage',
];

const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function techById(id: string): Tech {
  const tech = TECH_TREE.find(candidate => candidate.id === id);
  if (!tech) throw new Error(`Missing technology prerequisite: ${id}`);
  return tech;
}

function collectMissingClosure(
  tech: Tech,
  completed: ReadonlySet<string>,
  visiting: ReadonlySet<string> = new Set(),
): Tech[] {
  if (completed.has(tech.id)) return [];
  if (visiting.has(tech.id)) throw new Error(`Technology prerequisite cycle at ${tech.id}`);

  const nextVisiting = new Set(visiting);
  nextVisiting.add(tech.id);
  return [
    ...tech.prerequisites.flatMap(id => collectMissingClosure(techById(id), completed, nextVisiting)),
    tech,
  ];
}

function uniqueTopologicalClosure(tech: Tech, completed: ReadonlySet<string>): Tech[] {
  const seen = new Set<string>();
  return collectMissingClosure(tech, completed)
    .filter(candidate => !completed.has(candidate.id))
    .filter(candidate => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    });
}

export function getRequiredAdvancementCount(era: number): number {
  const qualifying = getEraAdvancementTechs(era);
  if (qualifying.length === 0) throw new Error(`Era ${era} has no advancement technologies`);
  return Math.ceil(qualifying.length * getEraAdvancementFraction(era));
}

export function buildRepresentativeResearchTimeline(targetEra: number): RepresentativeResearchTimeline {
  if (!Number.isInteger(targetEra) || targetEra < 1) {
    throw new Error(`Unsupported representative era: ${targetEra}`);
  }
  requireEraPacingProfile(targetEra);

  const completed = new Set<string>();
  const entries: ResearchTimelineEntry[] = [];
  const arrivalTurnByEra = new Map<number, number>([[1, 0]]);
  let turn = 0;

  for (let era = 2; era <= targetEra; era++) {
    const required = getRequiredAdvancementCount(era);
    while (!hasReachedEraThreshold([...completed], era)) {
      const candidates = getEraAdvancementTechs(era)
        .filter(tech => !completed.has(tech.id))
        .map(tech => ({ tech, closure: uniqueTopologicalClosure(tech, completed) }))
        .filter(candidate => candidate.closure.length > 0)
        .sort((left, right) => {
          const leftCost = left.closure.reduce((sum, tech) => sum + tech.cost, 0);
          const rightCost = right.closure.reduce((sum, tech) => sum + tech.cost, 0);
          return leftCost - rightCost || left.tech.cost - right.tech.cost || compareIds(left.tech.id, right.tech.id);
        });
      const selected = candidates[0];
      if (!selected) throw new Error(`Era ${era} cannot satisfy ${required} advancement technologies`);

      for (const tech of selected.closure) {
        if (completed.has(tech.id)) continue;
        const output = getResearchOutputProfileForTech(tech).outputPerTurn;
        if (!Number.isFinite(output) || output <= 0) {
          throw new Error(`Non-positive research output for ${tech.id}`);
        }
        const eta = Math.ceil(tech.cost / output);
        turn += eta;
        completed.add(tech.id);
        entries.push({ techId: tech.id, era: tech.era, eta, completionTurn: turn });
        if (hasReachedEraThreshold([...completed], era)) break;
      }
    }
    if (resolveCivilizationEra([...completed]) !== era) {
      throw new Error(`Representative route failed to reach contiguous era ${era}`);
    }
    arrivalTurnByEra.set(era, turn);
  }

  return {
    targetEra,
    entries,
    completedTechIds: [...completed],
    arrivalTurnByEra,
  };
}

export function getRepresentativeCohorts(era: number): RepresentativeCohort[] {
  return REPRESENTATIVE_COHORTS.filter(cohort => cohort.foundedEra <= era);
}

function buildingValue(building: Building): number {
  return building.yields.food
    + building.yields.production * 1.25
    + building.yields.gold * 1.5
    + building.yields.science * 1.25
    + (building.happiness ?? 0) * 1.5;
}

function isNeutralBuilding(building: Building, completedTechs: ReadonlySet<string>): boolean {
  return !building.nationalProject
    && !building.uniquePerEmpire
    && !building.coastalRequired
    && !(building.resourceRequired?.length)
    && (!building.techRequired || completedTechs.has(building.techRequired))
    && (!building.obsoletedByTech || !completedTechs.has(building.obsoletedByTech));
}

export function getEligibleRepresentativeBuildings(input: RepresentativeBuildingInput): Building[] {
  const completedTechs = new Set(input.completedTechs);
  const completedBuildings = new Set(input.completedBuildings);
  return Object.values(BUILDINGS)
    .filter(building => !completedBuildings.has(building.id))
    .filter(building => isNeutralBuilding(building, completedTechs))
    .sort((left, right) => compareIds(left.id, right.id));
}

export function getMissingRepresentativeBuildingClosure(
  terminal: Building,
  input: RepresentativeBuildingInput,
): string[] {
  const completedTechs = new Set(input.completedTechs);
  const completedBuildings = new Set(input.completedBuildings);
  const visiting = new Set<string>();
  const result: string[] = [];

  const visit = (buildingId: string): void => {
    if (completedBuildings.has(buildingId)) return;
    if (visiting.has(buildingId)) throw new Error(`Building prerequisite cycle at ${buildingId}`);
    const building = BUILDINGS[buildingId];
    if (!building) throw new Error(`Missing building prerequisite: ${buildingId}`);
    if (!isNeutralBuilding(building, completedTechs)) throw new Error(`Unavailable building prerequisite: ${buildingId}`);
    visiting.add(buildingId);
    for (const prerequisite of building.requiresBuildings ?? []) visit(prerequisite);
    visiting.delete(buildingId);
    result.push(buildingId);
  };

  visit(terminal.id);
  return result;
}

export function selectRepresentativeBuilding(input: RepresentativeBuildingInput): Building | null {
  const completedBuildings = new Set(input.completedBuildings);
  const builtCategories = new Set(
    input.completedBuildings
      .map(id => BUILDINGS[id]?.category)
      .filter((category): category is BuildingCategory => category !== undefined),
  );
  const candidates = getEligibleRepresentativeBuildings(input)
    .flatMap(terminal => {
      try {
        const closureIds = getMissingRepresentativeBuildingClosure(terminal, input);
        const closure = closureIds.map(id => BUILDINGS[id]);
        const value = closure.reduce((sum, building) => sum + buildingValue(building), 0);
        const cost = closure.reduce((sum, building) => sum + building.productionCost, 0);
        if (value <= 0 || cost <= 0) return [];
        return [{ terminal, closure, value, cost }];
      } catch {
        return [];
      }
    })
    .sort((left, right) => {
      const leftCoverage = left.terminal.category && !builtCategories.has(left.terminal.category) ? 0 : 1;
      const rightCoverage = right.terminal.category && !builtCategories.has(right.terminal.category) ? 0 : 1;
      const leftEfficiency = left.value / left.cost;
      const rightEfficiency = right.value / right.cost;
      const leftCategory = left.terminal.category ? CATEGORY_RANK.get(left.terminal.category) ?? CATEGORY_ORDER.length : CATEGORY_ORDER.length;
      const rightCategory = right.terminal.category ? CATEGORY_RANK.get(right.terminal.category) ?? CATEGORY_ORDER.length : CATEGORY_ORDER.length;
      return leftCoverage - rightCoverage
        || rightEfficiency - leftEfficiency
        || left.cost - right.cost
        || leftCategory - rightCategory
        || compareIds(left.terminal.id, right.terminal.id);
    });

  const selected = candidates[0];
  if (!selected) return null;
  return selected.closure.find(building => !completedBuildings.has(building.id)) ?? null;
}
