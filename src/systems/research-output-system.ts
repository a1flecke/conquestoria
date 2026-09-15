import type { CivBonusEffect, GameState } from '@/core/types';
import { resolveCivDefinition } from './civ-registry';
import { assignCityFocus, normalizeWorkedTilesForCity } from './city-work-system';
import { isCityProductionLocked, getUnrestYieldMultiplier } from './faction-system';
import { getLegendaryWonderCivYieldBonus } from './legendary-wonder-system';
import { getLegendaryWonderCityYieldBonus } from './legendary-wonder-system';
import { getNetworkCityYieldBonus } from './network-infrastructure-plans';
import { getNationalProjectCivYieldBonus } from './national-project-system';
import { getOccupiedCityYieldMultiplier } from './city-occupation-system';
import { getCrisisYieldMultiplier } from './crisis-system';
import { getCivResourceYieldBonus } from './resource-acquisition-system';
import { calculateCityYields } from './resource-system';
import { BUILDINGS } from './city-system';
import { resolveCivilizationEra } from './tech-definitions';
import {
  calculateCoordinatedCityScience,
  DIMINISHING_RESEARCH_POLICY,
  type CoordinatedResearchCityContribution,
  type ResearchCoordinationPolicy,
} from './research-coordination-system';
import { getEmpireFlatTechYields, getEmpireTechPercents, getLowestCityScienceBonus } from './tech-yield-system';

export type ResearchOutputDisplayRowKind = 'city-gross' | 'coordination' | 'empire-bonus' | 'temporary-penalty' | 'final';

export interface ResearchOutputDisplayRow {
  kind: ResearchOutputDisplayRowKind;
  science: number;
}

export interface ResearchOutputBreakdown {
  civId: string;
  cityContributions: CoordinatedResearchCityContribution[];
  grossCityScience: number;
  coordinatedCityScience: number;
  empireBonusScience: number;
  penaltyMultiplier: number;
  finalScience: number;
  rows: ResearchOutputDisplayRow[];
}

export interface CalculateCivResearchOutputOptions {
  authoritativeCityScience?: Record<string, number>;
  policy?: ResearchCoordinationPolicy;
}

/**
 * Civ-level inputs to a single city's science projection -- everything `projectOneCityScience`
 * needs besides the city itself, all derived once from `state`/`civId` and unaffected by which
 * building/city is being scored. #1069 caches these across an entire building-candidate loop
 * instead of re-deriving them per candidate; see `computeResearchScoringBaseline` below.
 */
interface CivResearchProjectionInputs {
  readonly civDefinitionBonusEffect: CivBonusEffect | undefined;
  readonly resourceYieldBonus: ReturnType<typeof getCivResourceYieldBonus>;
  readonly nationalProjectBonus: ReturnType<typeof getNationalProjectCivYieldBonus>;
  readonly empireTechPercents: ReturnType<typeof getEmpireTechPercents>;
  readonly empireFlatTechYields: ReturnType<typeof getEmpireFlatTechYields>;
  readonly empireFlatTargetCityId: string | undefined;
}

function civResearchProjectionInputs(state: GameState, civId: string): CivResearchProjectionInputs {
  const civ = state.civilizations[civId];
  const completedTechs = civ?.techState.completed ?? [];
  return {
    civDefinitionBonusEffect: resolveCivDefinition(state, civ?.civType ?? '')?.bonusEffect,
    resourceYieldBonus: getCivResourceYieldBonus(state, civId),
    nationalProjectBonus: getNationalProjectCivYieldBonus(state, civId),
    empireTechPercents: getEmpireTechPercents(completedTechs),
    empireFlatTechYields: getEmpireFlatTechYields(completedTechs),
    empireFlatTargetCityId: civ && civ.cities.length > 0 ? [...civ.cities].sort()[0] : undefined,
  };
}

/**
 * One city's contribution to `getProjectedCityScience`'s result. Pulled out so #1069's
 * incremental "after" path (`getMarginalCivResearchGain`) can project a SINGLE city without
 * rescanning the whole civ -- see
 * docs/superpowers/specs/2026-09-15-issue-1069-ai-round-perf-design.md §5b for the exact proof
 * this is safe. `lowestScienceCityId`/`networkGovernanceBonus` are only ever non-trivial from the
 * full-scan caller below; the incremental caller always passes `networkGovernanceBonus: 0` (the
 * fast path is never taken when it's nonzero -- see `computeResearchScoringBaseline` /
 * `getMarginalCivResearchGain`). Returns the possibly-updated state (from
 * `assignCityFocus`/`normalizeWorkedTilesForCity`) alongside the score so a caller iterating
 * multiple cities can thread it forward exactly as the original inline loop did; a single-city
 * caller may discard the returned state.
 */
function projectOneCityScience(
  state: GameState,
  civId: string,
  cityId: string,
  inputs: CivResearchProjectionInputs,
  lowestScienceCityId: string | undefined,
  networkGovernanceBonus: number,
): { state: GameState; science: number } {
  const civ = state.civilizations[civId];
  const cityBeforeFocus = state.cities[cityId];
  if (!civ || !cityBeforeFocus) return { state, science: 0 };
  const workResult = cityBeforeFocus.focus === 'custom'
    ? normalizeWorkedTilesForCity(state, cityId)
    : assignCityFocus(state, cityId, cityBeforeFocus.focus);
  const projectedState = workResult.state;
  const city = projectedState.cities[cityId];
  if (!city) return { state: projectedState, science: 0 };

  const activeRouteCount = (projectedState.marketplace?.tradeRoutes ?? [])
    .filter(route => route.fromCityId === cityId || route.toCityId === cityId).length;
  const hostsCompletedLegendaryWonder = Object.values(projectedState.completedLegendaryWonders ?? {})
    .some(wonder => wonder.cityId === cityId);
  const baseYields = calculateCityYields(
    city,
    projectedState.map,
    inputs.civDefinitionBonusEffect,
    civ.techState.completed,
    { activeRouteCount, hostsCompletedLegendaryWonder },
    projectedState.turn,
  );
  const networkCityBonus = getNetworkCityYieldBonus(projectedState, cityId, baseYields);
  const wonderCityBonuses = getLegendaryWonderCityYieldBonus(projectedState, civId, cityId);
  const baseYieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
  const crisisMultiplier = getCrisisYieldMultiplier(projectedState, cityId);
  const scienceMultiplier = baseYieldMultiplier * crisisMultiplier.science;
  const productionMultiplier = baseYieldMultiplier * crisisMultiplier.production;
  const production = Math.floor(
    (baseYields.production
      + networkCityBonus.production
      + (wonderCityBonuses.production ?? 0)
      + inputs.resourceYieldBonus.production
      + (inputs.nationalProjectBonus.production ?? 0)
      + (cityId === inputs.empireFlatTargetCityId ? inputs.empireFlatTechYields.production : 0)
      + ((city.resilienceBonusUntilTurn ?? 0) > projectedState.turn ? 1 : 0))
    * productionMultiplier
    * (1 + (inputs.empireTechPercents.production ?? 0) / 100),
  );
  const science = Math.floor(
    (baseYields.science
      + networkCityBonus.science
      + (wonderCityBonuses.science ?? 0)
      + inputs.resourceYieldBonus.science
      + (cityId === lowestScienceCityId ? networkGovernanceBonus : 0))
    * scienceMultiplier
    * (1 + (inputs.empireTechPercents.science ?? 0) / 100),
  );
  const idleScienceBonus = city.productionQueue.length === 0 && city.idleProduction === 'science'
    ? (isCityProductionLocked(city) ? 0 : production)
    : 0;
  return { state: projectedState, science: science + idleScienceBonus };
}

function getProjectedCityScience(state: GameState, civId: string): Record<string, number> {
  const civ = state.civilizations[civId];
  if (!civ) return {};
  const inputs = civResearchProjectionInputs(state, civId);
  const networkGovernanceBonus = getLowestCityScienceBonus(civ.techState.completed);
  let lowestScienceCityId: string | undefined;

  if (networkGovernanceBonus > 0) {
    let lowestScience = Infinity;
    for (const cityId of [...civ.cities].sort()) {
      const city = state.cities[cityId];
      if (!city) continue;
      const science = calculateCityYields(
        city,
        state.map,
        inputs.civDefinitionBonusEffect,
        civ.techState.completed,
        {},
        state.turn,
      ).science;
      if (science < lowestScience) {
        lowestScience = science;
        lowestScienceCityId = cityId;
      }
    }
  }

  let projectedState = state;
  const cityScience: Record<string, number> = {};
  for (const cityId of civ.cities) {
    const result = projectOneCityScience(projectedState, civId, cityId, inputs, lowestScienceCityId, networkGovernanceBonus);
    projectedState = result.state;
    cityScience[cityId] = result.science;
  }

  return cityScience;
}

export interface ResearchScoringBaseline {
  readonly cityScience: Readonly<Record<string, number>>;
  readonly networkGovernanceBonusActive: boolean;
  readonly inputs: CivResearchProjectionInputs;
}

/**
 * #1069 -- computed once per city-scoring pass (see `ai-production.ts`'s `generateWithResidual`)
 * and reused across every building candidate evaluated in that pass, instead of each candidate
 * re-deriving the whole civ's projected science from scratch. See design doc §5.
 */
export function computeResearchScoringBaseline(state: GameState, civId: string): ResearchScoringBaseline {
  const civ = state.civilizations[civId];
  return {
    cityScience: getProjectedCityScience(state, civId),
    networkGovernanceBonusActive: civ ? getLowestCityScienceBonus(civ.techState.completed) > 0 : false,
    inputs: civResearchProjectionInputs(state, civId),
  };
}

function getEmpireBonusScience(state: GameState, civId: string): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;

  const wonderScience = getLegendaryWonderCivYieldBonus(state, civId).science ?? 0;
  const nationalProjectScience = getNationalProjectCivYieldBonus(state, civId).science ?? 0;
  const techScience = getEmpireFlatTechYields(civ.techState.completed).science;
  const civBonus = resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect;
  const allianceScience = civBonus?.type === 'allied_kingdoms'
    ? civ.diplomacy.treaties.filter(treaty => treaty.type === 'alliance').length * civBonus.allianceYieldBonus
    : 0;

  return wonderScience + nationalProjectScience + techScience + allianceScience;
}

export function calculateCivResearchOutput(
  state: GameState,
  civId: string,
  options: CalculateCivResearchOutputOptions = {},
): ResearchOutputBreakdown {
  const cityScience = options.authoritativeCityScience ?? getProjectedCityScience(state, civId);
  const coordinated = calculateCoordinatedCityScience(
    Object.entries(cityScience).map(([cityId, science]) => ({ cityId, science })),
    options.policy ?? DIMINISHING_RESEARCH_POLICY,
  );
  const empireBonusScience = getEmpireBonusScience(state, civId);
  const penaltyMultiplier = state.civilizations[civId]?.researchPenaltyTurns && state.civilizations[civId]!.researchPenaltyTurns! > 0
    ? state.civilizations[civId]!.researchPenaltyMultiplier ?? 0
    : 0;
  const scienceBeforePenalty = coordinated.final + empireBonusScience;
  const finalScience = Math.max(0, Math.floor(scienceBeforePenalty * (1 - penaltyMultiplier)));
  const rows: ResearchOutputDisplayRow[] = [
    { kind: 'city-gross', science: coordinated.gross },
    { kind: 'coordination', science: coordinated.final - coordinated.gross },
  ];
  if (empireBonusScience !== 0) rows.push({ kind: 'empire-bonus', science: empireBonusScience });
  if (finalScience !== scienceBeforePenalty) {
    rows.push({ kind: 'temporary-penalty', science: finalScience - scienceBeforePenalty });
  }
  rows.push({ kind: 'final', science: finalScience });

  return {
    civId,
    cityContributions: coordinated.contributions,
    grossCityScience: coordinated.gross,
    coordinatedCityScience: coordinated.final,
    empireBonusScience,
    penaltyMultiplier,
    finalScience,
    rows,
  };
}

/**
 * Returns the player/AI-visible final-science increase from constructing a
 * city building. This deliberately projects through the canonical output
 * path: a raw building yield is not necessarily spendable research once city
 * coordination, empire bonuses, and temporary penalties are applied.
 */
export function getMarginalCivResearchGain(
  state: GameState,
  civId: string,
  cityId: string,
  buildingId: string,
  baseline?: ResearchScoringBaseline,
): number {
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city || city.owner !== civId || city.buildings.includes(buildingId)) return 0;

  const before = baseline
    ? calculateCivResearchOutput(state, civId, { authoritativeCityScience: baseline.cityScience }).finalScience
    : calculateCivResearchOutput(state, civId).finalScience;

  const building = BUILDINGS[buildingId];
  const projectKey = `${civId}:${buildingId}`;
  const isUniqueNationalProject = Boolean(building?.nationalProject && building.uniquePerEmpire);
  const projectedState: GameState = {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
    },
    ...(isUniqueNationalProject
      ? {
          builtNationalProjects: {
            ...(state.builtNationalProjects ?? {}),
            [projectKey]: { civId, cityId, eraBuilt: resolveCivilizationEra(civ.techState.completed) },
          },
        }
      : {}),
  };

  // #1069: when a precomputed baseline is available and provably still valid for this candidate
  // (no active network-governance bonus that could shift WHICH city is "lowest science" if this
  // one city's raw science changes; not itself a unique national project, whose civ-level
  // `nationalProjectBonus` feeds EVERY city's production/idleScienceBonus, not just this one) --
  // patch just the modified city's science into the cached baseline instead of rescanning the
  // whole civ. See design doc §5b for the full proof.
  if (baseline && !baseline.networkGovernanceBonusActive && !isUniqueNationalProject) {
    const { science: afterCityOwnScience } = projectOneCityScience(projectedState, civId, cityId, baseline.inputs, undefined, 0);
    const afterCityScience = {
      ...baseline.cityScience,
      [cityId]: afterCityOwnScience,
    };
    return Math.max(
      0,
      calculateCivResearchOutput(projectedState, civId, { authoritativeCityScience: afterCityScience }).finalScience - before,
    );
  }

  return Math.max(0, calculateCivResearchOutput(projectedState, civId).finalScience - before);
}
