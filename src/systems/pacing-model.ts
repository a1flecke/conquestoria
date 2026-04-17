import type { PacingBand, PacingContentType } from '@/core/types';

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
