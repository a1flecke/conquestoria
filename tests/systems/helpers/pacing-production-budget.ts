import type { Building, BuildingCategory, City, CityMaturity, GameMap, HexCoord, HexTile, Tech } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { resolveCityMaturity } from '@/systems/city-maturity-system';
import { calculateCityYields } from '@/systems/resource-system';
import { getProductionOutputProfileForEra, getResearchOutputProfileForTech } from '@/systems/pacing-model';
import { applyEmpireTechPercents, getEmpireTechPercents } from '@/systems/tech-yield-system';
import {
  TECH_TREE,
  getEraAdvancementFraction,
  getEraAdvancementTechs,
  hasReachedEraThreshold,
  resolveCivilizationEra,
} from '@/systems/tech-definitions';
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
// Long representative timelines accumulate fractional production; allow only
// rounding noise, not a meaningful budget discrepancy.
const EPSILON = 1e-8;
const REFERENCE_MAP_SIZE = 8;

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
  const resolved = new Set<string>();
  const result: string[] = [];

  const visit = (buildingId: string): void => {
    if (completedBuildings.has(buildingId) || resolved.has(buildingId)) return;
    if (visiting.has(buildingId)) throw new Error(`Building prerequisite cycle at ${buildingId}`);
    const building = BUILDINGS[buildingId];
    if (!building) throw new Error(`Missing building prerequisite: ${buildingId}`);
    if (!isNeutralBuilding(building, completedTechs)) throw new Error(`Unavailable building prerequisite: ${buildingId}`);
    visiting.add(buildingId);
    for (const prerequisite of building.requiresBuildings ?? []) visit(prerequisite);
    visiting.delete(buildingId);
    resolved.add(buildingId);
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
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Unavailable building prerequisite:')) {
          return [];
        }
        throw error;
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

export interface RepresentativeCityYieldOutput {
  science: number;
  production: number;
}

export interface SimulatedRepresentativeCity {
  cohortId: string;
  foundedEra: number;
  maturity: CityMaturity;
  population: number;
  completedBuildings: string[];
  activeBuilding: { id: string; progress: number } | null;
  actualProductionEarned: number;
  cappedProductionEarned: number;
  infrastructureProductionAllocated: number;
  infrastructureProductionSpent: number;
  completedBuildingCost: number;
  activeBuildingProgress: number;
  activeBuildingCount: 0 | 1;
  discardedObsoleteProgress: number;
  unspentInfrastructureProduction: number;
  yieldsBeforeEmpireFlat: RepresentativeCityYieldOutput;
}

export interface SimulateRepresentativeCityInput {
  cohort: RepresentativeCohort;
  targetEra: number;
  timeline: RepresentativeResearchTimeline;
  infrastructureShare: 0.5 | 0.6 | 0.7;
}

export function makeRepresentativeMap(): GameMap {
  const tiles: Record<string, HexTile> = {};
  for (let q = 0; q < REFERENCE_MAP_SIZE; q++) {
    for (let r = 0; r < REFERENCE_MAP_SIZE; r++) {
      const terrain = q % 3 === 0 ? 'hills' : q % 3 === 1 ? 'grassland' : 'plains';
      tiles[`${q},${r}`] = {
        coord: { q, r },
        terrain,
        elevation: terrain === 'hills' ? 'highland' : 'lowland',
        resource: null,
        improvement: 'none',
        owner: 'reference-civ',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }
  return { width: REFERENCE_MAP_SIZE, height: REFERENCE_MAP_SIZE, tiles, wrapsHorizontally: false, rivers: [] };
}

function workedTilesForPopulation(population: number, position: HexCoord): HexCoord[] {
  const workedTiles: HexCoord[] = [position];
  for (let index = 0; index < population && workedTiles.length <= population; index++) {
    const q = 3 + (index % 4);
    const r = 3 + Math.floor(index / 4);
    if (q === position.q && r === position.r) continue;
    workedTiles.push({ q, r });
  }
  return workedTiles;
}

export function makeRepresentativeCity(input: {
  cohort: RepresentativeCohort;
  completedBuildings: readonly string[];
  completedTechs: readonly string[];
}): City {
  const position: HexCoord = { q: 4, r: 4 };
  const population = Math.min(12, 2 + Math.floor(input.completedBuildings.length / 4));
  const workedTiles = workedTilesForPopulation(population, position);
  return {
    id: `representative-${input.cohort.id}`,
    name: input.cohort.id,
    owner: 'reference-civ',
    position,
    population,
    food: 0,
    foodNeeded: 9999,
    buildings: [...input.completedBuildings],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: workedTiles,
    workedTiles,
    focus: 'balanced',
    maturity: resolveCityMaturity(population, [...input.completedTechs]),
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  };
}

function assertInfrastructureShare(share: number): asserts share is 0.5 | 0.6 | 0.7 {
  if (share !== 0.5 && share !== 0.6 && share !== 0.7) {
    throw new Error(`Unsupported infrastructure share: ${share}`);
  }
}

export function simulateRepresentativeCity(input: SimulateRepresentativeCityInput): SimulatedRepresentativeCity {
  if (!Number.isInteger(input.targetEra) || input.targetEra < 1) {
    throw new Error(`Unsupported representative era: ${input.targetEra}`);
  }
  assertInfrastructureShare(input.infrastructureShare);
  const foundedTurn = input.timeline.arrivalTurnByEra.get(input.cohort.foundedEra);
  const targetTurn = input.timeline.arrivalTurnByEra.get(input.targetEra);
  if (foundedTurn === undefined || targetTurn === undefined || input.cohort.foundedEra > input.targetEra) {
    throw new Error(`Cohort ${input.cohort.id} is not active in representative era ${input.targetEra}`);
  }

  const map = makeRepresentativeMap();
  const completedBuildings: string[] = [];
  let activeBuilding: { id: string; progress: number } | null = null;
  let actualProductionEarned = 0;
  let cappedProductionEarned = 0;
  let infrastructureProductionAllocated = 0;
  let completedBuildingCost = 0;
  let discardedObsoleteProgress = 0;
  let unspentInfrastructureProduction = 0;

  for (let turn = foundedTurn; turn < targetTurn; turn++) {
    const completedTechs = input.timeline.entries
      .filter(entry => entry.completionTurn <= turn)
      .map(entry => entry.techId);
    if (activeBuilding?.id && BUILDINGS[activeBuilding.id].obsoletedByTech
      && completedTechs.includes(BUILDINGS[activeBuilding.id].obsoletedByTech!)) {
      discardedObsoleteProgress += activeBuilding.progress;
      activeBuilding = null;
    }

    const city = makeRepresentativeCity({ cohort: input.cohort, completedBuildings, completedTechs });
    const baseYields = calculateCityYields(city, map, undefined, completedTechs, {});
    const yields = applyEmpireTechPercents(baseYields, getEmpireTechPercents(completedTechs));
    const personalEra = resolveCivilizationEra(completedTechs);
    const cappedProduction = Math.min(yields.production, getProductionOutputProfileForEra(personalEra));
    if (!Number.isFinite(cappedProduction) || cappedProduction <= 0) {
      throw new Error(`Non-positive representative production for ${input.cohort.id} on turn ${turn}`);
    }
    actualProductionEarned += yields.production;
    cappedProductionEarned += cappedProduction;
    let remaining = cappedProduction * input.infrastructureShare;
    infrastructureProductionAllocated += remaining;

    while (remaining > EPSILON) {
      if (!activeBuilding) {
        const selected = selectRepresentativeBuilding({ completedTechs, completedBuildings });
        if (!selected) {
          unspentInfrastructureProduction += remaining;
          break;
        }
        activeBuilding = { id: selected.id, progress: 0 };
      }
      const building = BUILDINGS[activeBuilding.id];
      const needed = building.productionCost - activeBuilding.progress;
      const invested = Math.min(remaining, needed);
      activeBuilding.progress += invested;
      remaining -= invested;
      if (activeBuilding.progress + EPSILON >= building.productionCost) {
        completedBuildings.push(building.id);
        completedBuildingCost += building.productionCost;
        activeBuilding = null;
      }
    }
  }

  const finalTechs = input.timeline.completedTechIds;
  const finalCity = makeRepresentativeCity({ cohort: input.cohort, completedBuildings, completedTechs: finalTechs });
  const finalBaseYields = calculateCityYields(finalCity, map, undefined, finalTechs, {});
  const finalYields = applyEmpireTechPercents(finalBaseYields, getEmpireTechPercents(finalTechs));
  const activeBuildingProgress = activeBuilding?.progress ?? 0;
  const infrastructureProductionSpent = completedBuildingCost + activeBuildingProgress + discardedObsoleteProgress;
  const accounted = infrastructureProductionSpent + unspentInfrastructureProduction;
  if (Math.abs(accounted - infrastructureProductionAllocated) > EPSILON) {
    throw new Error(`Representative production accounting mismatch for ${input.cohort.id}`);
  }

  return {
    cohortId: input.cohort.id,
    foundedEra: input.cohort.foundedEra,
    maturity: finalCity.maturity,
    population: finalCity.population,
    completedBuildings,
    activeBuilding,
    actualProductionEarned,
    cappedProductionEarned,
    infrastructureProductionAllocated,
    infrastructureProductionSpent,
    completedBuildingCost,
    activeBuildingProgress,
    activeBuildingCount: activeBuilding ? 1 : 0,
    discardedObsoleteProgress,
    unspentInfrastructureProduction,
    yieldsBeforeEmpireFlat: { science: finalYields.science, production: finalYields.production },
  };
}
