/**
 * Scan medium map Levant/Anatolia area for valid ottoman start tiles.
 * bash scripts/run-with-mise.sh yarn tsx scripts/ottoman-scan.ts
 */
import { EARTH_TILES, EARTH_RIVERS } from '../src/systems/earth-map-data.js';
import { loadGeoMap } from '../src/systems/geo-map-loader.js';

const map = loadGeoMap(EARTH_TILES.medium, EARTH_RIVERS.medium, { width: 50, height: 50 }, true);
const tiles = map.tiles as Record<string, { terrain: string }>;
const INVALID = new Set(['ocean', 'coast', 'mountain', 'snow', 'volcanic']);
const UNWORKABLE = new Set(['ocean', 'mountain', 'volcanic', 'desert', 'snow']);

function hexNeighbors(q: number, r: number): Array<[number, number]> {
  return [[q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]];
}
function wc(q: number, r: number): number {
  return hexNeighbors(q,r).filter(([nq,nr]) => {
    const t = tiles[`${nq},${nr}`];
    return t && !UNWORKABLE.has(t.terrain);
  }).length;
}
function hexDist(aq: number, ar: number, bq: number, br: number): number {
  return Math.max(Math.abs(aq-bq), Math.abs(ar-br), Math.abs((aq+ar)-(bq+br)));
}

const egypt = [31,17];
const rome  = [32,13];

console.log("Valid land tiles in medium map q=30-40, r=13-22 (dist from egypt shown):");
for (let r = 13; r <= 22; r++) {
  const row: string[] = [];
  for (let q = 30; q <= 40; q++) {
    const t = tiles[`${q},${r}`];
    if (!t || INVALID.has(t.terrain)) continue;
    const w = wc(q, r);
    if (w < 2) continue;
    const dEg = hexDist(q,r, egypt[0],egypt[1]);
    const dRo = hexDist(q,r, rome[0],rome[1]);
    row.push(`(${q},${r})${t.terrain.slice(0,3)} dEg=${dEg} dRo=${dRo}`);
  }
  if (row.length > 0) console.log(`  r=${r}: ` + row.join('  |  '));
}
