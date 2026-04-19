import type { Building, PacingBand, PacingContentType, Tech } from '@/core/types';
import type { TRAINABLE_UNITS } from '@/systems/city-system';

const BAND_WINDOWS: Record<PacingBand, { early: [number, number]; late: [number, number] }> = {
  starter: { early: [2, 4], late: [2, 5] },
  core: { early: [3, 5], late: [4, 7] },
  specialist: { early: [4, 6], late: [5, 8] },
  infrastructure: { early: [5, 8], late: [6, 10] },
  'power-spike': { early: [6, 9], late: [7, 11] },
  marquee: { early: [10, 12], late: [10, 16] },
};

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
