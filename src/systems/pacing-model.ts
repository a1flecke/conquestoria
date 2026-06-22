import type { Building, PacingBand, PacingContentType, PacingMetadata, Tech } from '@/core/types';
import type { TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';

const BAND_WINDOWS: Record<PacingBand, { early: [number, number]; late: [number, number] }> = {
  starter: { early: [2, 4], late: [2, 5] },
  core: { early: [3, 5], late: [4, 7] },
  specialist: { early: [4, 6], late: [5, 8] },
  infrastructure: { early: [5, 8], late: [6, 10] },
  'power-spike': { early: [6, 9], late: [7, 11] },
  marquee: { early: [10, 12], late: [10, 16] },
};

const PRODUCTION_OUTPUT_BY_ERA: Record<number, number> = {
  1: 4,
  2: 6,
  3: 8,
  4: 10,
  5: 12,
  6: 14,
  7: 16,
  8: 18,
};

export function getProductionOutputProfileForEra(era: number): number {
  const numericEra = Number.isFinite(era) ? era : 1;
  const normalized = Math.max(1, Math.floor(numericEra));
  return PRODUCTION_OUTPUT_BY_ERA[Math.min(8, normalized)];
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
  name:
    | 'opening-baseline'
    | 'opening-science-invested'
    | 'era-2-established'
    | 'era-3-established'
    | 'era-4-established'
    | 'era-5-established'
    | 'era-6-established'
    | 'era-7-established'
    | 'era-8-established';
  outputPerTurn: number;
}

const RESEARCH_OUTPUT_BY_ERA: Record<number, ResearchOutputProfile> = {
  1: { name: 'opening-baseline', outputPerTurn: 1 },
  2: { name: 'era-2-established', outputPerTurn: 4 },
  3: { name: 'era-3-established', outputPerTurn: 7 },
  4: { name: 'era-4-established', outputPerTurn: 10 },
  5: { name: 'era-5-established', outputPerTurn: 13 },
  6: { name: 'era-6-established', outputPerTurn: 16 },
  7: { name: 'era-7-established', outputPerTurn: 19 },
  8: { name: 'era-8-established', outputPerTurn: 22 },
};

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

function normalizeEra(era: number): number {
  const numericEra = Number.isFinite(era) ? era : 1;
  const normalized = Math.max(1, Math.floor(numericEra));
  return Math.min(8, normalized);
}

function findTech(techId: string, techs: Tech[]): Tech | undefined {
  return techs.find(candidate => candidate.id === techId);
}

export function getResearchOutputProfileForEra(era: number): ResearchOutputProfile {
  return RESEARCH_OUTPUT_BY_ERA[normalizeEra(era)];
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
    return RESEARCH_OUTPUT_BY_ERA[1];
  }

  if (tech.era <= 1) {
    return RESEARCH_OUTPUT_BY_ERA[2];
  }

  return getResearchOutputProfileForEra(tech.era);
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

export function resolveTechPacingBand(tech: Tech): PacingBand {
  if (tech.pacing) {
    return tech.pacing.band;
  }

  if (tech.era >= 5 || tech.countsForEraAdvancement === false) {
    return 'marquee';
  }

  if (tech.era === 1 && tech.prerequisites.length === 0 && tech.cost <= 25) {
    return 'starter';
  }

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
