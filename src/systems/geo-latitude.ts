import type { GeographicMapScript } from './geo-map-data';

/**
 * Latitude extent of each geographic map script: the one source shared by the map generator
 * (`scripts/generate-earth-maps.ts`) and start placement, so a start's "is this polar?" answer uses the same
 * projection the terrain was generated with. Row centre latitude is
 * `latMax - (r + 0.5) / height * (latMax - latMin)`, the generator's own formula.
 */
export const GEO_LATITUDE_BOUNDS: Record<GeographicMapScript, { latMin: number; latMax: number }> = {
  earth: { latMin: -80, latMax: 80 },
  'old-world': { latMin: -40, latMax: 70 },
  'new-world': { latMin: -60, latMax: 75 },
};

/** A start beyond this absolute latitude is polar (design 2026-11-25, B1). */
export const POLAR_LATITUDE_CUTOFF = 62;

export interface PolarRowBand {
  topRows: number;
  bottomRows: number;
}

function rowLatitude(script: GeographicMapScript, r: number, height: number): number {
  const { latMin, latMax } = GEO_LATITUDE_BOUNDS[script];
  return latMax - ((r + 0.5) / height) * (latMax - latMin);
}

/** How many rows at the top and bottom of a geographic map lie beyond the polar cut-off. */
export function getPolarRowBand(script: GeographicMapScript, height: number): PolarRowBand {
  let topRows = 0;
  while (topRows < height && rowLatitude(script, topRows, height) > POLAR_LATITUDE_CUTOFF) topRows++;
  let bottomRows = 0;
  while (bottomRows < height && rowLatitude(script, height - 1 - bottomRows, height) < -POLAR_LATITUDE_CUTOFF) {
    bottomRows++;
  }
  return { topRows, bottomRows };
}

export function isPolarRow(band: PolarRowBand, r: number, height: number): boolean {
  return r < band.topRows || r >= height - band.bottomRows;
}
