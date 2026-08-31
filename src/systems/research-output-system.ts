import type { GameState } from '@/core/types';
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
import {
  calculateCoordinatedCityScience,
  FULL_CONTRIBUTION_RESEARCH_POLICY,
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

function getProjectedCityScience(state: GameState, civId: string): Record<string, number> {
  const civ = state.civilizations[civId];
  if (!civ) return {};
  const civDefinition = resolveCivDefinition(state, civ.civType ?? '');
  const resourceYieldBonus = getCivResourceYieldBonus(state, civId);
  const nationalProjectBonus = getNationalProjectCivYieldBonus(state, civId);
  const empireTechPercents = getEmpireTechPercents(civ.techState.completed);
  const empireFlatTechYields = getEmpireFlatTechYields(civ.techState.completed);
  const empireFlatTargetCityId = civ.cities.length > 0 ? [...civ.cities].sort()[0] : undefined;
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
        civDefinition?.bonusEffect,
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
    const cityBeforeFocus = projectedState.cities[cityId];
    if (!cityBeforeFocus) continue;
    const workResult = cityBeforeFocus.focus === 'custom'
      ? normalizeWorkedTilesForCity(projectedState, cityId)
      : assignCityFocus(projectedState, cityId, cityBeforeFocus.focus);
    projectedState = workResult.state;
    const city = projectedState.cities[cityId];
    if (!city) continue;

    const activeRouteCount = (projectedState.marketplace?.tradeRoutes ?? [])
      .filter(route => route.fromCityId === cityId || route.toCityId === cityId).length;
    const hostsCompletedLegendaryWonder = Object.values(projectedState.completedLegendaryWonders ?? {})
      .some(wonder => wonder.cityId === cityId);
    const baseYields = calculateCityYields(
      city,
      projectedState.map,
      civDefinition?.bonusEffect,
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
        + resourceYieldBonus.production
        + (nationalProjectBonus.production ?? 0)
        + (cityId === empireFlatTargetCityId ? empireFlatTechYields.production : 0)
        + ((city.resilienceBonusUntilTurn ?? 0) > projectedState.turn ? 1 : 0))
      * productionMultiplier
      * (1 + (empireTechPercents.production ?? 0) / 100),
    );
    const science = Math.floor(
      (baseYields.science
        + networkCityBonus.science
        + (wonderCityBonuses.science ?? 0)
        + resourceYieldBonus.science
        + (cityId === lowestScienceCityId ? networkGovernanceBonus : 0))
      * scienceMultiplier
      * (1 + (empireTechPercents.science ?? 0) / 100),
    );
    const idleScienceBonus = city.productionQueue.length === 0 && city.idleProduction === 'science'
      ? (isCityProductionLocked(city) ? 0 : production)
      : 0;
    cityScience[cityId] = science + idleScienceBonus;
  }

  return cityScience;
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
    options.policy ?? FULL_CONTRIBUTION_RESEARCH_POLICY,
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
