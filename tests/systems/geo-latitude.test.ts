import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GEO_LATITUDE_BOUNDS, POLAR_LATITUDE_CUTOFF, getPolarRowBand, isPolarRow } from '@/systems/geo-latitude';

describe('geographic latitude bands', () => {
  it('uses a 62 degree polar cut-off', () => {
    expect(POLAR_LATITUDE_CUTOFF).toBe(62);
  });

  it('gives Earth (80 rows, -80..80) symmetric nine-row polar bands', () => {
    // row centre latitude = 79 - 2r, so rows 0..8 (lat 79..63) are beyond 62
    expect(getPolarRowBand('earth', 80)).toEqual({ topRows: 9, bottomRows: 9 });
  });

  it('marks the reported Arctic islet row (r 6 on large Earth) as polar and the tropics as not', () => {
    const band = getPolarRowBand('earth', 80);
    expect(isPolarRow(band, 6, 80)).toBe(true);
    expect(isPolarRow(band, 40, 80)).toBe(false);
    expect(isPolarRow(band, 79, 80)).toBe(true);
  });

  it('gives Old World (-40..70) no southern polar band', () => {
    const band = getPolarRowBand('old-world', 80);
    expect(band.bottomRows).toBe(0);
    expect(band.topRows).toBe(6);
  });

  it('is the single source of the generator bounds', () => {
    expect(GEO_LATITUDE_BOUNDS.earth).toEqual({ latMin: -80, latMax: 80 });
    expect(GEO_LATITUDE_BOUNDS['old-world']).toEqual({ latMin: -40, latMax: 70 });
    expect(GEO_LATITUDE_BOUNDS['new-world']).toEqual({ latMin: -60, latMax: 75 });
    const script = readFileSync(resolve(__dirname, '../../scripts/generate-earth-maps.ts'), 'utf8');
    expect(script).toContain('GEO_LATITUDE_BOUNDS');
    // the three map-script bounds no longer carry their own latitude literals
    for (const literal of ['latMin: -80, latMax: 80', 'latMin: -40, latMax: 70', 'latMin: -60, latMax: 75']) {
      expect(script).not.toContain(literal);
    }
  });
});
