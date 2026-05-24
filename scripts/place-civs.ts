/**
 * Compute improved start positions for historical civs + place fantasy civs.
 * bash scripts/run-with-mise.sh yarn tsx scripts/place-civs.ts
 *
 * Output: paste-ready JSON for EARTH_START_POSITIONS.
 */
import {
  EARTH_TILES, EARTH_RIVERS,
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
function wc(q: number, r: number, tiles: Record<string, {terrain: string}>): number {
  return hexNeighbors(q, r).filter(([nq, nr]) => {
    const t = tiles[`${nq},${nr}`];
    return t && !UNWORKABLE.has(t.terrain);
  }).length;
}
function hexDist(aq: number, ar: number, bq: number, br: number): number {
  return Math.max(Math.abs(aq-bq), Math.abs(ar-br), Math.abs((aq+ar)-(bq+br)));
}
function isValid(q: number, r: number, tiles: Record<string, {terrain: string}>): boolean {
  const t = tiles[`${q},${r}`];
  return !!t && !INVALID.has(t.terrain) && wc(q, r, tiles) >= 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Improved historical positions (only changes from current for each map size).
// Primary goals: fix directional errors, reduce extreme adjacency.
// ─────────────────────────────────────────────────────────────────────────────

const HISTORICAL: Record<Size, Record<string, [number, number]>> = {
  small: {
    // Fixed: germany off rome/england stack; russia more eastern;
    //        ottoman off rome stack.
    // Limitations: persia/india/japan can't be moved east (ocean east of Babylon);
    //              mongolia stays at (24,6) — (24,5) would be adj to japan.
    egypt:    [18,11],
    rome:     [19, 7],
    greece:   [19, 9],
    babylon:  [23,10],
    persia:   [22, 7],  // can't go east of babylon — ocean in all eastward tiles
    india:    [23, 7],  // same resolution limitation
    china:    [24, 7],
    mongolia: [24, 6],  // keep original — (24,5) adj to japan(23,6)
    japan:    [23, 6],  // can't go east of china at this map scale
    zulu:     [17,14],
    england:  [19, 5],
    france:   [18, 5],
    spain:    [15,10],
    viking:   [18, 4],
    germany:  [20, 6],  // was (19,6) — breaks 3× dist-1 clumps with rome+england
    russia:   [22, 5],  // was (20,5) — more eastern (Moscow/Novgorod direction)
    ottoman:  [21, 7],  // was (19,8) — away from rome(19,7)
    aztec:    [ 6, 9],
  },
  medium: {
    // Fixed: rome moved to Italian peninsula; ottoman south of rome;
    //        mongolia north (steppe); japan one tile east.
    egypt:    [31,17],
    rome:     [32,13],  // was (28,10) — Italian peninsula, south of Europe cluster
    greece:   [30,13],
    babylon:  [33,14],
    persia:   [35,13],
    india:    [36,17],
    china:    [40,13],
    mongolia: [40, 8],  // was (40,10) — Mongolian steppe (north of China)
    japan:    [42,11],  // was (41,12) — one tile more east
    zulu:     [28,33],
    england:  [27, 9],
    france:   [27,10],
    spain:    [26,16],
    viking:   [29, 6],
    germany:  [29, 9],
    russia:   [35, 8],  // was (34,8) — slightly more eastern
    ottoman:  [34,16],  // was (33,13) → (32,16) → (34,16) Levant/N.Syria desert, dEg=3 dRo=5 (confirmed valid)
    aztec:    [10,15],
  },
  large: {
    // Fixed: viking north to Scandinavia; germany east to Rhine; russia east;
    //        ottoman east to Anatolia (away from Greece).
    egypt:    [49,25],
    rome:     [44,17],
    greece:   [49,21],
    babylon:  [52,23],
    persia:   [55,22],
    india:    [58,27],
    china:    [64,21],
    mongolia: [64,14],  // was (64,16) — Mongolian plateau (north of China)
    japan:    [68,17],  // was (68,18) — slightly north (central Honshu)
    zulu:     [46,52],
    england:  [41,15],
    france:   [42,15],
    spain:    [43,16],
    viking:   [46,11],  // was (43,14) — Scandinavia proper (much more north)
    germany:  [46,14],  // was (44,15) — Rhine/central Europe (away from rome)
    russia:   [55,11],  // was (52,12) — more eastern Russia
    ottoman:  [53,20],  // was (48,21) — eastern Anatolia, away from greece(49,21)
    aztec:    [17,25],
  },
};

// Fantasy civs: for each, we specify candidate geographic boxes [qMin,qMax,rMin,rMax]
// ordered by preference. The script picks the best valid tile in each box.
// These reflect thematic/geographic rationale.
const FANTASY_BOXES: Record<Size, Record<string, Array<[number, number, number, number]>>> = {
  small: {
    // Gondor: Mediterranean/Levant coastal plain (south of Greece/Egypt)
    gondor:     [[17,18,10,12]],
    // Rohan: Horse plains ~ N.Africa/Saharan plains; European steppe is fully occupied at 30×30
    rohan:      [[13,16,11,14],[12,16,10,15]],
    // Shire: Pastoral far-NW ~ polar fringe above Viking (r=2-3 has valid forest tiles)
    shire:      [[20,22,2,3]],
    // Isengard: Industrial fortress ~ NE Europe/Baltic, r=4-6 — separated from shire by distance
    isengard:   [[21,23,4,6]],
    // Prydain: Celtic Atlantic ~ N.Americas interior (away from Aztec at q=6)
    prydain:    [[8,13,5,8],[7,12,6,9]],
    // Annuvin: Dark far north ~ N.Siberia far east
    annuvin:    [[22,25,2,3]],
    // Wakanda: African super-civ ~ Central/East Africa highlands
    wakanda:    [[15,18,12,16]],
    // Avalon: Arthurian isle ~ Caribbean/C.Americas; valid tiles are at q=5-9 (NOT q=9-14 which is ocean)
    avalon:     [[5,9,6,9],[5,10,7,10]],
    // Lothlorien: Elvish forest ~ wide N.Africa/Middle East belt (r=8-15); smaller EU boxes are all ocean at 30×30
    lothlorien: [[17,24,11,15],[16,25,9,14]],
    // Narnia: Magical north ~ Far N.Siberia east
    narnia:     [[24,27,2,4]],
    // Atlantis: Legendary island ~ S.Americas/Caribbean (south of Avalon)
    atlantis:   [[7,11,11,16],[6,10,12,17]],
  },
  medium: {
    // Gondor ~ southern seas / Arabian belt (r=17-20); every tile in q=30-36 is adjacent to rome/babylon/ottoman/egypt at this scale
    gondor:     [[36,42,17,20]],
    // Rohan ~ Eastern European steppe / Great Hungarian Plain
    rohan:      [[31,35,9,12]],
    // Shire ~ NW Europe pastoral, close to English Channel analog
    shire:      [[30,32,7,9]],
    // Isengard ~ Rhine-Ruhr / northern industrial heartland
    isengard:   [[30,32,8,11]],
    // Prydain ~ Celtic Atlantic fringe → S. Americas or Atlantic coast
    prydain:    [[11,15,10,14],[12,16,12,16]],
    // Annuvin ~ Far northern dark land → Siberia / Scandinavia north
    annuvin:    [[32,36,5,8]],
    // Wakanda ~ Central/East Africa highlands
    wakanda:    [[28,32,20,27],[27,33,22,30]],
    // Avalon ~ Western Atlantic / Americas east coast
    avalon:     [[11,14,13,17],[10,14,14,18]],
    // Lothlorien ~ European forest heartland
    lothlorien: [[30,34,10,13]],
    // Narnia ~ Northern Scandinavia/Russia
    narnia:     [[30,34,5,8]],
    // Atlantis ~ Caribbean / Central Americas
    atlantis:   [[10,13,13,17],[10,14,14,19]],
  },
  large: {
    // Gondor ~ Eastern Med / Levant coastal area
    gondor:     [[52,56,22,26],[53,57,21,26]],
    // Rohan ~ Great Eurasian steppe / Kazakh plains
    rohan:      [[52,58,14,18]],
    // Shire ~ NW European pastoral
    shire:      [[45,50,12,16]],
    // Isengard ~ Rhine/N.Germany industrial heartland
    isengard:   [[45,50,13,17]],
    // Prydain ~ Celtic Atlantic fringe → Americas east or W. Europe coast
    prydain:    [[18,23,14,20],[17,22,13,20]],
    // Annuvin ~ Siberian far north
    annuvin:    [[58,66,6,10]],
    // Wakanda ~ Central/East Africa highlands
    wakanda:    [[47,53,32,40],[45,55,35,44]],
    // Avalon ~ Caribbean / Atlantic Americas
    avalon:     [[18,23,20,28],[17,22,18,28]],
    // Lothlorien ~ European/Russian forest
    lothlorien: [[48,55,12,18]],
    // Narnia ~ Northern Russia/Siberia
    narnia:     [[58,68,7,12]],
    // Atlantis ~ Central Americas / Caribbean
    atlantis:   [[13,21,22,32],[14,22,20,30]],
  },
};

function placeFantasyCivs(
  size: Size,
  tiles: Record<string, {terrain: string}>,
  historical: Record<string, [number, number]>,
): Record<string, [number, number]> {
  // Build "claimed" list (historical + already placed fantasy)
  const claimed: Array<[number, number]> = Object.values(historical).map(([q,r]) => [q,r]);

  const fantasy = FANTASY_BOXES[size];
  const result: Record<string, [number, number]> = {};

  const civOrder = [
    'gondor','rohan','shire','isengard','prydain',
    'annuvin','wakanda','avalon','lothlorien','narnia','atlantis',
  ];

  for (const civ of civOrder) {
    const boxes = fantasy[civ] ?? [];
    let best: [number, number] | null = null;
    let bestMinDist = -1;

    for (const [qMin, qMax, rMin, rMax] of boxes) {
      for (let q = qMin; q <= qMax; q++) {
        for (let r = rMin; r <= rMax; r++) {
          if (!isValid(q, r, tiles)) continue;
          const minD = Math.min(...claimed.map(([cq,cr]) => hexDist(q, r, cq, cr)));
          if (minD > bestMinDist) {
            bestMinDist = minD;
            best = [q, r];
          }
        }
      }
      // If we found a tile with minDist>=3, stop early (good enough)
      if (best && bestMinDist >= 3) break;
    }

    if (!best) {
      console.error(`  WARNING: No valid tile found for ${civ} on ${size} map!`);
      continue;
    }

    result[civ] = best;
    claimed.push(best);
    console.log(`  ${civ.padEnd(12)} → (${best[0]},${best[1]}) minDist=${bestMinDist} terrain=${tiles[`${best[0]},${best[1]}`]?.terrain}`);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate and output
// ─────────────────────────────────────────────────────────────────────────────

const ALL_SIZES: Size[] = ['small', 'medium', 'large'];
const finalPositions: Record<Size, Record<string, { q: number; r: number }>> = {
  small: {}, medium: {}, large: {},
};

for (const size of ALL_SIZES) {
  const map = loadGeoMap(EARTH_TILES[size], EARTH_RIVERS[size], MAP_DIMS[size], true);
  const tiles = map.tiles as Record<string, { terrain: string }>;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SIZE: ${size.toUpperCase()}`);
  console.log('='.repeat(70));

  // Validate historical positions
  console.log('\n[Historical positions]');
  const hist = HISTORICAL[size];
  for (const [civ, [q, r]] of Object.entries(hist)) {
    const valid = isValid(q, r, tiles);
    const w = wc(q, r, tiles);
    const terrain = tiles[`${q},${r}`]?.terrain ?? 'MISSING';
    console.log(`  ${civ.padEnd(12)} (${q},${r}) ${valid ? '✅' : '❌'} ${terrain} wc=${w}`);
    if (!valid) throw new Error(`Historical civ ${civ} at (${q},${r}) is INVALID on ${size} map!`);
    finalPositions[size][civ] = { q, r };
  }

  // Place fantasy civs
  console.log('\n[Fantasy civs — greedy placement]');
  const fantasy = placeFantasyCivs(size, tiles, hist);
  for (const [civ, [q, r]] of Object.entries(fantasy)) {
    finalPositions[size][civ] = { q, r };
  }

  // Clumping check for ALL civs
  console.log('\n[Clumping check — all 29 civs]');
  const allCivs = Object.entries(finalPositions[size]);
  let clumps = 0;
  for (let i = 0; i < allCivs.length; i++) {
    for (let j = i+1; j < allCivs.length; j++) {
      const [na, ca] = allCivs[i], [nb, cb] = allCivs[j];
      const d = hexDist(ca.q, ca.r, cb.q, cb.r);
      if (d <= 1) {
        console.log(`  ⛔ ADJACENT: ${na}(${ca.q},${ca.r}) ↔ ${nb}(${cb.q},${cb.r}) dist=${d}`);
        clumps++;
      } else if (d <= 2) {
        console.log(`  ⚠️  close: ${na}(${ca.q},${ca.r}) ↔ ${nb}(${cb.q},${cb.r}) dist=${d}`);
      }
    }
  }
  if (clumps === 0) console.log('  No adjacent pairs.');
}

// Output JSON for copy-paste
console.log('\n\n' + '='.repeat(70));
console.log('FINAL JSON (paste into EARTH_START_POSITIONS):');
console.log('='.repeat(70));
console.log(JSON.stringify(finalPositions, null, 2));
