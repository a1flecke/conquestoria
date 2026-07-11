import type { Building, PacingBand, PacingContentType, PacingMetadata, Tech } from '@/core/types';
import { BUILDINGS, type TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  ERA_PACING_PROFILES,
  getFrontierPacingProfile,
  requireEraPacingProfile,
  type EraPacingProfile,
} from '@/systems/era-pacing-profiles';

export { ERA_PACING_PROFILES, getFrontierPacingProfile, requireEraPacingProfile, type EraPacingProfile };

const BAND_WINDOWS: Record<PacingBand, { early: [number, number]; late: [number, number] }> = {
  starter: { early: [2, 4], late: [2, 5] },
  core: { early: [3, 5], late: [4, 7] },
  specialist: { early: [4, 6], late: [5, 8] },
  infrastructure: { early: [5, 8], late: [6, 10] },
  'power-spike': { early: [6, 9], late: [7, 11] },
  marquee: { early: [10, 12], late: [10, 16] },
};

export function getProductionOutputProfileForEra(era: number): number {
  return getFrontierPacingProfile(era).productionPerTurn;
}

export function getTargetTurnWindow(input: { era: number; band: PacingBand; contentType: PacingContentType }): { min: number; max: number } {
  const [min, max] = input.era <= 1 ? BAND_WINDOWS[input.band].early : BAND_WINDOWS[input.band].late;
  return { min, max };
}

export function estimateTurnsToComplete(input: { cost: number; outputPerTurn: number }): number {
  if (input.outputPerTurn <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.ceil(input.cost / input.outputPerTurn);
}

export interface ResearchOutputProfile {
  name: string;
  outputPerTurn: number;
}

function researchOutputProfile(profile: EraPacingProfile): ResearchOutputProfile {
  return profile.era === 1
    ? { name: 'opening-baseline', outputPerTurn: profile.completionistSciencePerTurn }
    : { name: `era-${profile.era}-established`, outputPerTurn: profile.completionistSciencePerTurn };
}

export const OPENING_SCIENCE_INVESTED_PROFILE: ResearchOutputProfile = {
  name: 'opening-science-invested',
  outputPerTurn: 2,
};

export interface MetadataComplexityOptions {
  min?: number;
  max?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findTech(techId: string, techs: Tech[]): Tech | undefined {
  return techs.find(candidate => candidate.id === techId);
}

export function getResearchOutputProfileForEra(era: number): ResearchOutputProfile {
  return researchOutputProfile(getFrontierPacingProfile(era));
}

export function isStarterPrerequisiteTech(tech: Tech): boolean {
  return tech.era === 1
    && tech.prerequisites.length === 0
    && resolveTechPacingBand(tech) === 'starter';
}

export function isFirstRealUnlockTech(tech: Tech, techs: Tech[] = TECH_TREE): boolean {
  if (tech.era > 2 || tech.prerequisites.length !== 1) return false;
  const prerequisite = findTech(tech.prerequisites[0], techs);
  return Boolean(prerequisite && isStarterPrerequisiteTech(prerequisite));
}

export function getResearchOutputProfileForTech(tech: Tech, techs: Tech[] = TECH_TREE): ResearchOutputProfile {
  if (isStarterPrerequisiteTech(tech) || isFirstRealUnlockTech(tech, techs)) {
    return researchOutputProfile(requireEraPacingProfile(1));
  }

  if (tech.era <= 1) {
    return researchOutputProfile(requireEraPacingProfile(2));
  }

  return researchOutputProfile(requireEraPacingProfile(tech.era));
}

export function validateAuthoredEraPacing(techs: readonly Tech[] = TECH_TREE): void {
  for (const tech of techs) requireEraPacingProfile(tech.era);
}

export function getRecommendedTechTurnWindow(tech: Tech, techs: Tech[] = TECH_TREE): { min: number; max: number } {
  if (tech.id === 'bronze-working') {
    return { min: 9, max: 11 };
  }
  if (isStarterPrerequisiteTech(tech)) {
    return { min: 2, max: 5 };
  }
  if (isFirstRealUnlockTech(tech, techs)) {
    return { min: 8, max: 12 };
  }

  return getTargetTurnWindow({
    era: tech.era,
    band: resolveTechPacingBand(tech),
    contentType: 'tech',
  });
}

function inferTechScope(tech: Tech): PacingMetadata['scope'] {
  const unlockText = tech.unlocks.join(' ').toLowerCase();
  if (unlockText.includes('unit') || unlockText.includes('warrior') || unlockText.includes('swordsman')) {
    return 'military';
  }
  if (unlockText.includes('building') || unlockText.includes('library') || unlockText.includes('monument')) {
    return 'city';
  }
  return 'empire';
}

function metadataForTech(tech: Tech): PacingMetadata {
  return tech.pacing ?? {
    band: resolveTechPacingBand(tech),
    role: 'inferred',
    impact: 1,
    scope: inferTechScope(tech),
    snowball: 1,
    urgency: 1,
    situationality: 1,
    unlockBreadth: 1,
  };
}

export function getMetadataComplexityMultiplier(
  metadata: PacingMetadata,
  options: MetadataComplexityOptions = {},
): number {
  const min = options.min ?? 0.75;
  const max = options.max ?? 1.35;
  const scopeFactor = metadata.scope === 'empire'
    ? 1.08
    : metadata.scope === 'city'
      ? 0.96
      : 1;
  const impactFactor = metadata.impact;
  const snowballFactor = 1 + ((metadata.snowball - 1) * 0.5);
  const unlockBreadthFactor = 1 + ((metadata.unlockBreadth - 1) * 0.4);
  const urgencyFactor = clamp(1 - ((metadata.urgency - 1) * 0.25), 0.5, 1.25);
  const situationalityFactor = clamp(1 - ((metadata.situationality - 1) * 0.2), 0.5, 1.25);

  return Number(clamp(
    scopeFactor
      * impactFactor
      * snowballFactor
      * unlockBreadthFactor
      * urgencyFactor
      * situationalityFactor,
    min,
    max,
  ).toFixed(2));
}

function roundRecommendedTechCost(cost: number): number {
  if (cost < 20) return Math.max(1, Math.round(cost));
  return Math.max(5, Math.round(cost / 5) * 5);
}

export function getRecommendedTechCost(tech: Tech, techs: Tech[] = TECH_TREE): number {
  const profile = getResearchOutputProfileForTech(tech, techs);
  const window = getRecommendedTechTurnWindow(tech, techs);
  const targetTurns = Math.round((window.min + window.max) / 2);
  const metadata = metadataForTech(tech);
  return roundRecommendedTechCost(profile.outputPerTurn * targetTurns * getMetadataComplexityMultiplier(metadata));
}

type TrainableUnit = (typeof TRAINABLE_UNITS)[number];

export function resolveBuildingPacingBand(building: Building): PacingBand {
  if (building.pacing) {
    return building.pacing.band;
  }

  if (!building.techRequired && building.productionCost <= 18) {
    return 'starter';
  }

  if (building.category === 'food') {
    return 'infrastructure';
  }

  if (building.category === 'science' && building.productionCost >= 90) {
    return 'power-spike';
  }

  if (building.category === 'military' && building.techRequired) {
    return 'power-spike';
  }

  if (building.productionCost >= 80) {
    return 'infrastructure';
  }

  return 'core';
}

export function resolveUnitPacingBand(unit: TrainableUnit): PacingBand {
  if (unit.pacing) {
    return unit.pacing.band;
  }

  if (!unit.techRequired && unit.cost <= 12) {
    return 'starter';
  }

  if (unit.type === 'settler') {
    return 'power-spike';
  }

  if (unit.cost >= 80 || unit.techRequired === 'tactics') {
    return 'power-spike';
  }

  if (unit.techRequired && unit.cost >= 40) {
    return 'specialist';
  }

  return 'core';
}

let chainedBuildingIdsCache: Set<string> | null = null;

function buildingChainsFrom(buildingId: string): boolean {
  if (!chainedBuildingIdsCache) {
    chainedBuildingIdsCache = new Set(
      Object.values(BUILDINGS)
        .filter(building => (building.requiresBuildings?.length ?? 0) > 0)
        .flatMap(building => building.requiresBuildings ?? []),
    );
  }
  return chainedBuildingIdsCache.has(buildingId);
}

/**
 * Cost percentile of `tech` within all techs of its own era. Used so a "cheap" tech in a
 * late era (where absolute costs are much higher than early eras) still resolves to a low
 * band, instead of every era-5+ tech being forced upward by absolute-cost thresholds tuned
 * for eras 1-4. Fixes F1 (#481): previously every era>=5 tech short-circuited to 'marquee'.
 */
export function resolveEraRelativeCostBand(tech: Tech, techs: Tech[] = TECH_TREE): PacingBand {
  const eraPeers = techs.filter(candidate => candidate.era === tech.era);
  const sortedCosts = eraPeers.map(candidate => candidate.cost).sort((a, b) => a - b);
  const rank = sortedCosts.filter(cost => cost <= tech.cost).length;
  const percentile = eraPeers.length > 0 ? rank / eraPeers.length : 1;
  const prereqCount = tech.prerequisites.length;

  const unlocksUnit = (tech.unlocksUnits?.length ?? 0) > 0;
  const unlocksChainedBuilding = (tech.unlocksBuildings ?? []).some(buildingId => buildingChainsFrom(buildingId));

  if (tech.countsForEraAdvancement === false || unlocksUnit) {
    return 'marquee';
  }
  if (prereqCount >= 2 && percentile >= 0.85) {
    return 'marquee';
  }
  if (unlocksChainedBuilding || (prereqCount >= 2 && percentile >= 0.6)) {
    return 'power-spike';
  }
  if (prereqCount >= 2 || percentile >= 0.6) {
    return 'specialist';
  }
  if (percentile >= 0.35) {
    return 'infrastructure';
  }
  if (percentile >= 0.15) {
    return 'core';
  }
  return 'starter';
}

export function resolveTechPacingBand(tech: Tech): PacingBand {
  if (tech.pacing) {
    return tech.pacing.band;
  }

  if (tech.era === 1 && tech.prerequisites.length === 0 && tech.cost <= 25) {
    return 'starter';
  }

  if (tech.era <= 4) {
    // Preserve the existing, already-tuned era 1-4 heuristic exactly as-is.
    if (tech.prerequisites.length >= 2 && tech.cost >= 90) {
      return 'power-spike';
    }

    if (tech.prerequisites.length >= 2 || tech.cost >= 80) {
      return 'specialist';
    }

    if (tech.era >= 4 && tech.cost >= 70) {
      return 'power-spike';
    }

    if (tech.cost >= 55) {
      return 'infrastructure';
    }

    return 'core';
  }

  return resolveEraRelativeCostBand(tech, TECH_TREE);
}
