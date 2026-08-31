import type { Building, PacingBand, PacingContentType } from '@/core/types';
import { type TRAINABLE_UNITS } from '@/systems/city-system';
import {
  ERA_PACING_PROFILES,
  getFrontierPacingProfile,
  requireEraPacingProfile,
  type EraPacingProfile,
} from '@/systems/era-pacing-profiles';

export { ERA_PACING_PROFILES, getFrontierPacingProfile, requireEraPacingProfile, type EraPacingProfile };
export {
  OPENING_SCIENCE_INVESTED_PROFILE,
  getMetadataComplexityMultiplier,
  getRecommendedTechCost,
  getRecommendedTechTurnWindow,
  getResearchOutputProfileForEra,
  getResearchOutputProfileForTech,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
  resolveEraRelativeCostBand,
  resolveTechPacingBand,
  validateAuthoredResearchPacing as validateAuthoredEraPacing,
  type MetadataComplexityOptions,
  type ResearchOutputProfile,
} from '@/systems/research-pacing-model';

const BAND_WINDOWS: Record<PacingBand, { early: [number, number]; late: [number, number] }> = {
  starter: { early: [2, 4], late: [2, 5] }, core: { early: [3, 5], late: [4, 7] }, specialist: { early: [4, 6], late: [5, 8] }, infrastructure: { early: [5, 8], late: [6, 10] }, 'power-spike': { early: [6, 9], late: [7, 11] }, marquee: { early: [10, 12], late: [10, 16] },
};

export function getProductionOutputProfileForEra(era: number): number { return getFrontierPacingProfile(era).productionPerTurn; }
export function getTargetTurnWindow(input: { era: number; band: PacingBand; contentType: PacingContentType }): { min: number; max: number } {
  const [min, max] = input.era <= 1 ? BAND_WINDOWS[input.band].early : BAND_WINDOWS[input.band].late;
  return { min, max };
}
export function estimateTurnsToComplete(input: { cost: number; outputPerTurn: number }): number { return input.outputPerTurn <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(input.cost / input.outputPerTurn); }

type TrainableUnit = (typeof TRAINABLE_UNITS)[number];
export function resolveBuildingPacingBand(building: Building): PacingBand {
  if (building.pacing) return building.pacing.band;
  if (!building.techRequired && building.productionCost <= 18) return 'starter';
  if (building.category === 'food') return 'infrastructure';
  if (building.category === 'science' && building.productionCost >= 90) return 'power-spike';
  if (building.category === 'military' && building.techRequired) return 'power-spike';
  return building.productionCost >= 80 ? 'infrastructure' : 'core';
}
export function resolveUnitPacingBand(unit: TrainableUnit): PacingBand {
  if (unit.pacing) return unit.pacing.band;
  if (!unit.techRequired && unit.cost <= 12) return 'starter';
  if (unit.type === 'settler') return 'power-spike';
  if (unit.cost >= 80 || unit.techRequired === 'tactics') return 'power-spike';
  if (unit.techRequired && unit.cost >= 40) return 'specialist';
  return 'core';
}
