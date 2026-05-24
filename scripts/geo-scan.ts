/**
 * Scan valid land tiles in key geographic zones.
 * bash scripts/run-with-mise.sh yarn tsx scripts/geo-scan.ts
 */
import {
  EARTH_TILES, EARTH_START_POSITIONS, EARTH_RIVERS,
} from '../src/systems/earth-map-data.js';
import { loadGeoMap } from '../src/systems/geo-map-loader.js';

const MAP_DIMS = {
  small:  { width: 30, height: 30 },
  medium: { width: 50, height: 50 },
  large:  { width: 80, height: 80 },
} as const;

type Size = 'small' | 'medium' | 'large';

const INVALID = new Set(['ocean', 'coast', 'mountain', 'snow', 'volcanic']);
const UNWORKABLE = new Set(['ocean', 'mountain', 'volcanic', 'desert', 'snow']);

function hexNeighbors(q: number, r: number): Array<[number, number]> {
  return [[q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]];
}

function workableCount(q: number, r: number, tiles: Record<string, {terrain: string}>): number {
  return hexNeighbors(q, r).filter(([nq, nr]) => {
    const t = tiles[`${nq},${nr}`];
    return t && !UNWORKABLE.has(t.terrain);
  }).length;
}

// For each region box: [name, qMin, qMax, rMin, rMax]
const REGIONS: Record<Size, Array<[string, number, number, number, number]>> = {
  small: [
    ['N-Europe',       15, 22,  3,  8],
    ['Med/Balkan',     17, 24,  8, 13],
    ['MiddleEast',     21, 27,  8, 13],
    ['CentralAsia',    21, 27,  5,  9],
    ['EastAsia',       23, 29,  5, 12],
    ['SouthAsia',      22, 28, 10, 16],
    ['Africa-S',       14, 22, 12, 18],
    ['Americas',        3, 14,  5, 16],
  ],
  medium: [
    ['N-Europe',       24, 34,  5, 12],
    ['W-Europe',       24, 32, 10, 18],
    ['E-Europe',       30, 38,  8, 15],
    ['Med-Italy',      26, 35, 12, 18],
    ['MiddleEast',     30, 40, 12, 20],
    ['CentralAsia',    33, 44,  8, 14],
    ['EastAsia',       37, 47, 10, 20],
    ['SouthAsia',      34, 44, 15, 25],
    ['Africa-E',       26, 36, 18, 35],
    ['Americas',        6, 18, 10, 25],
  ],
  large: [
    ['N-Europe',       38, 52,  9, 16],
    ['W-Europe',       38, 48, 14, 22],
    ['E-Europe',       46, 58, 10, 18],
    ['Iberia-SW',      38, 46, 17, 24],
    ['Med-Italy',      42, 52, 17, 25],
    ['MiddleEast',     47, 60, 18, 28],
    ['CentralAsia',    52, 65,  9, 20],
    ['EastAsia',       60, 76, 14, 26],
    ['SouthAsia',      55, 70, 22, 34],
    ['Africa-E',       44, 56, 30, 55],
    ['Africa-W',       36, 48, 20, 45],
    ['Americas-N',      8, 28, 12, 24],
    ['Americas-S',      7, 22, 24, 40],
    ['N-Siberia',      44, 68,  5, 13],
  ],
};

for (const size of ['small', 'medium', 'large'] as Size[]) {
  const map = loadGeoMap(EARTH_TILES[size], EARTH_RIVERS[size], MAP_DIMS[size], true);
  const tiles = map.tiles as Record<string, { terrain: string }>;
  const currentPositions = EARTH_START_POSITIONS[size];
  const occupied = new Set(
    Object.values(currentPositions).map(c => `${c.q},${c.r}`)
  );

  console.log(`\n${'='.repeat(80)}`);
  console.log(`SIZE: ${size.toUpperCase()} — Valid land tiles by region (wc≥2, not occupied)`);
  console.log('='.repeat(80));

  for (const [region, qMin, qMax, rMin, rMax] of REGIONS[size]) {
    const valid: string[] = [];
    for (let q = qMin; q <= qMax; q++) {
      for (let r = rMin; r <= rMax; r++) {
        const key = `${q},${r}`;
        if (occupied.has(key)) continue;
        const tile = tiles[key];
        if (!tile || INVALID.has(tile.terrain)) continue;
        const wc = workableCount(q, r, tiles);
        if (wc < 2) continue;
        valid.push(`(${q},${r})${tile.terrain.slice(0,3)}w${wc}`);
      }
    }
    console.log(`\n${region} (q=${qMin}-${qMax}, r=${rMin}-${rMax}) — ${valid.length} valid tiles:`);
    // Print in grid-like rows for readability
    for (let i = 0; i < valid.length; i += 10) {
      console.log('  ' + valid.slice(i, i+10).join('  '));
    }
  }
}
