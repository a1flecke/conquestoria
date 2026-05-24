/**
 * Geographic diagnostic for earth map start positions.
 * Run with: bash scripts/run-with-mise.sh yarn tsx scripts/geo-diagnostic.ts
 *
 * Outputs terrain at current positions and candidate positions,
 * highlighting historical accuracy issues and clumping.
 */

import {
  EARTH_TILES,
  EARTH_START_POSITIONS,
  EARTH_RIVERS,
} from '../src/systems/earth-map-data.js';
import { loadGeoMap } from '../src/systems/geo-map-loader.js';
import { hexKey } from '../src/systems/hex-utils.js';

const MAP_DIMS = {
  small:  { width: 30, height: 30 },
  medium: { width: 50, height: 50 },
  large:  { width: 80, height: 80 },
} as const;

type Size = 'small' | 'medium' | 'large';

// Geographic notes for each civ:
// lat/lon of historical starting region (approximate)
const HISTORY: Record<string, { lat: number; lon: number; region: string }> = {
  egypt:    { lat: 30, lon: 31,  region: 'Nile Delta / Lower Egypt' },
  rome:     { lat: 42, lon: 12,  region: 'Italian peninsula' },
  greece:   { lat: 38, lon: 24,  region: 'Aegean coast / Attica' },
  babylon:  { lat: 32, lon: 44,  region: 'Mesopotamia (Iraq)' },
  persia:   { lat: 30, lon: 53,  region: 'Fars province / Persepolis (Iran)' },
  india:    { lat: 25, lon: 76,  region: 'Gangetic plain / Indus Valley' },
  china:    { lat: 35, lon: 114, region: 'Yellow River Valley' },
  mongolia: { lat: 48, lon: 105, region: 'Mongolian steppe / Karakorum' },
  japan:    { lat: 35, lon: 136, region: 'Honshu (Kyoto/Nara area)' },
  zulu:     { lat: -28, lon: 31, region: 'KwaZulu-Natal, South Africa' },
  england:  { lat: 52, lon: -1,  region: 'England (midlands)' },
  france:   { lat: 47, lon: 2,   region: 'Île-de-France / Loire' },
  spain:    { lat: 40, lon: -4,  region: 'Castile / Iberian plateau' },
  viking:   { lat: 62, lon: 10,  region: 'Scandinavia (Norway)' },
  germany:  { lat: 51, lon: 10,  region: 'Central Germany' },
  russia:   { lat: 56, lon: 38,  region: 'Moscow / Novgorod region' },
  ottoman:  { lat: 40, lon: 29,  region: 'Constantinople / Anatolia' },
  aztec:    { lat: 20, lon: -99, region: 'Central Mexico / Valley of Mexico' },
};

// Candidate coordinates to probe (in addition to current positions)
// Format: { size: [ [q,r, label], ... ] }
const CANDIDATES: Record<string, Record<Size, Array<[number, number, string]>>> = {
  // Key geographic problem areas to probe
  persia_region: {
    small:  [[24,10,'persia-east-1'],[24,11,'persia-east-2'],[25,10,'persia-far-e'],[23,9,'persia-alt']],
    medium: [[36,14,'persia-e1'],[37,14,'persia-e2'],[37,15,'persia-e3'],[36,15,'persia-e4']],
    large:  [[57,23,'p-e1'],[58,23,'p-e2'],[57,22,'p-e3'],[59,23,'p-e4']],
  },
  india_region: {
    small:  [[24,12,'india-s1'],[25,12,'india-s2'],[25,13,'india-s3'],[24,13,'india-s4']],
    medium: [[38,18,'india-m1'],[39,18,'india-m2'],[38,19,'india-m3'],[37,18,'india-m4']],
    large:  [[60,28,'india-l1'],[61,28,'india-l2'],[60,27,'india-l3'],[62,28,'india-l4']],
  },
  japan_region: {
    small:  [[26,7,'japan-e1'],[27,7,'japan-e2'],[27,8,'japan-e3'],[26,8,'japan-e4'],[28,7,'japan-e5'],[25,6,'japan-e6'],[26,6,'japan-e7']],
    medium: [[43,12,'japan-m1'],[44,12,'japan-m2'],[43,13,'japan-m3'],[44,13,'japan-m4'],[45,12,'japan-m5'],[42,11,'japan-m6']],
    large:  [[70,19,'japan-l1'],[71,19,'japan-l2'],[70,20,'japan-l3'],[71,20,'japan-l4'],[69,18,'japan-l5'],[72,19,'japan-l6']],
  },
  mongolia_region: {
    small:  [[24,5,'mong-1'],[25,5,'mong-2'],[25,6,'mong-3'],[23,5,'mong-4'],[24,4,'mong-5']],
    medium: [[39,8,'mong-m1'],[40,8,'mong-m2'],[41,8,'mong-m3'],[41,9,'mong-m4']],
    large:  [[63,13,'mong-l1'],[64,13,'mong-l2'],[65,13,'mong-l3'],[65,14,'mong-l4']],
  },
  china_region: {
    small:  [[24,8,'china-s1'],[25,8,'china-s2'],[25,9,'china-s3'],[24,9,'china-s4']],
    medium: [[41,14,'china-m1'],[42,14,'china-m2'],[41,13,'china-m3'],[40,14,'china-m4']],
    large:  [[65,22,'china-l1'],[66,22,'china-l2'],[65,21,'china-l3'],[66,21,'china-l4']],
  },
  // European separation probes
  england_region: {
    small:  [[16,5,'eng-w1'],[17,5,'eng-w2'],[16,4,'eng-w3'],[17,4,'eng-w4'],[16,6,'eng-w5']],
    medium: [[25,8,'eng-m1'],[26,8,'eng-m2'],[25,9,'eng-m3'],[25,7,'eng-m4'],[24,8,'eng-m5'],[26,7,'eng-m6']],
    large:  [[38,13,'eng-l1'],[39,13,'eng-l2'],[38,14,'eng-l3'],[40,13,'eng-l4'],[39,14,'eng-l5']],
  },
  france_region: {
    small:  [[17,7,'fra-s1'],[18,7,'fra-s2'],[17,8,'fra-s3'],[17,6,'fra-s4'],[16,7,'fra-s5']],
    medium: [[26,11,'fra-m1'],[27,11,'fra-m2'],[26,12,'fra-m3'],[28,11,'fra-m4'],[26,10,'fra-m5']],
    large:  [[40,16,'fra-l1'],[41,16,'fra-l2'],[40,17,'fra-l3'],[42,16,'fra-l4']],
  },
  russia_region: {
    small:  [[21,5,'rus-e1'],[22,5,'rus-e2'],[21,4,'rus-e3'],[22,4,'rus-e4'],[20,4,'rus-e5']],
    medium: [[34,7,'rus-m1'],[35,7,'rus-m2'],[33,7,'rus-m3'],[34,8,'rus-m4'],[36,8,'rus-m5']],
    large:  [[53,11,'rus-l1'],[54,11,'rus-l2'],[55,11,'rus-l3'],[53,12,'rus-l4'],[52,11,'rus-l5']],
  },
  spain_region: {
    small:  [[16,9,'sp-s1'],[16,8,'sp-s2'],[15,9,'sp-s3'],[17,9,'sp-s4']],
    medium: [[25,14,'sp-m1'],[26,14,'sp-m2'],[25,15,'sp-m3'],[24,14,'sp-m4']],
    large:  [[40,20,'sp-l1'],[41,20,'sp-l2'],[40,19,'sp-l3'],[41,21,'sp-l4']],
  },
  rome_region: {
    small:  [[17,8,'rom-s1'],[18,8,'rom-s2'],[18,9,'rom-s3'],[17,9,'rom-s4']],
    medium: [[27,12,'rom-m1'],[28,12,'rom-m2'],[28,13,'rom-m3'],[29,12,'rom-m4']],
    large:  [[43,19,'rom-l1'],[44,18,'rom-l2'],[44,19,'rom-l3'],[45,19,'rom-l4']],
  },
  ottoman_region: {
    small:  [[20,9,'ott-s1'],[20,10,'ott-s2'],[21,9,'ott-s3'],[21,10,'ott-s4'],[20,8,'ott-s5']],
    medium: [[32,13,'ott-m1'],[31,13,'ott-m2'],[32,14,'ott-m3'],[33,13,'ott-m4'],[31,14,'ott-m5']],
    large:  [[49,22,'ott-l1'],[50,22,'ott-l2'],[50,21,'ott-l3'],[51,22,'ott-l4']],
  },
  // Fantasy civs - probing geographic anchors
  // Gondor: Middle-earth analog of Mediterranean/western civilization → southern Europe/Anatolia area
  gondor_region: {
    small:  [[18,8,'gond-s1'],[17,9,'gond-s2'],[20,8,'gond-s3'],[21,8,'gond-s4']],
    medium: [[28,12,'gond-m1'],[29,12,'gond-m2'],[30,12,'gond-m3'],[31,12,'gond-m4']],
    large:  [[44,20,'gond-l1'],[45,20,'gond-l2'],[46,20,'gond-l3'],[47,20,'gond-l4']],
  },
  // Rohan: Horse people of the plains → Central Asian steppe / eastern Europe plains
  rohan_region: {
    small:  [[20,6,'roh-s1'],[21,6,'roh-s2'],[21,7,'roh-s3'],[22,6,'roh-s4']],
    medium: [[31,9,'roh-m1'],[32,9,'roh-m2'],[33,9,'roh-m3'],[33,10,'roh-m4']],
    large:  [[50,15,'roh-l1'],[51,15,'roh-l2'],[52,15,'roh-l3'],[51,14,'roh-l4']],
  },
  // The Shire: Pastoral/idyllic → British Isles / pastoral northwest Europe
  shire_region: {
    small:  [[16,5,'shi-s1'],[16,4,'shi-s2'],[15,5,'shi-s3'],[17,4,'shi-s4']],
    medium: [[25,8,'shi-m1'],[24,8,'shi-m2'],[25,7,'shi-m3'],[24,9,'shi-m4']],
    large:  [[38,13,'shi-l1'],[38,12,'shi-l2'],[37,13,'shi-l3'],[39,12,'shi-l4']],
  },
  // Isengard: Industrial/treacherous fortress → industrial heartland, like northern England/Wales or Rhine
  isengard_region: {
    small:  [[17,5,'ise-s1'],[18,6,'ise-s2'],[17,6,'ise-s3'],[19,5,'ise-s4']],
    medium: [[26,9,'ise-m1'],[27,8,'ise-m2'],[27,9,'ise-m3'],[28,8,'ise-m4']],
    large:  [[41,14,'ise-l1'],[42,14,'ise-l2'],[43,13,'ise-l3'],[44,13,'ise-l4']],
  },
  // Prydain: Celtic/Welsh fantasy → Celtic fringe / Iberia / Gaul
  prydain_region: {
    small:  [[15,7,'pry-s1'],[16,6,'pry-s2'],[15,6,'pry-s3'],[14,7,'pry-s4'],[16,7,'pry-s5']],
    medium: [[24,11,'pry-m1'],[25,11,'pry-m2'],[24,12,'pry-m3'],[23,11,'pry-m4']],
    large:  [[38,17,'pry-l1'],[39,17,'pry-l2'],[38,18,'pry-l3'],[37,17,'pry-l4']],
  },
  // Annuvin: Dark/evil → barren/northern region, like northern Scandinavia / Siberia
  annuvin_region: {
    small:  [[17,3,'ann-s1'],[18,3,'ann-s2'],[19,3,'ann-s3'],[20,3,'ann-s4'],[21,3,'ann-s5']],
    medium: [[28,5,'ann-m1'],[29,5,'ann-m2'],[30,5,'ann-m3'],[31,5,'ann-m4'],[32,5,'ann-m5']],
    large:  [[44,8,'ann-l1'],[45,8,'ann-l2'],[46,8,'ann-l3'],[47,8,'ann-l4'],[48,8,'ann-l5']],
  },
  // Wakanda: Advanced African civilization → Central/East Africa highland
  wakanda_region: {
    small:  [[18,14,'wak-s1'],[19,14,'wak-s2'],[19,13,'wak-s3'],[18,13,'wak-s4'],[20,14,'wak-s5']],
    medium: [[30,20,'wak-m1'],[31,20,'wak-m2'],[30,21,'wak-m3'],[31,21,'wak-m4'],[32,20,'wak-m5']],
    large:  [[48,32,'wak-l1'],[49,32,'wak-l2'],[48,33,'wak-l3'],[49,33,'wak-l4'],[50,32,'wak-l5']],
  },
  // Avalon: Arthurian British → British Isles / west coast
  avalon_region: {
    small:  [[15,5,'ava-s1'],[16,6,'ava-s2'],[15,4,'ava-s3'],[14,6,'ava-s4'],[14,5,'ava-s5']],
    medium: [[23,9,'ava-m1'],[24,10,'ava-m2'],[23,10,'ava-m3'],[22,9,'ava-m4'],[24,9,'ava-m5']],
    large:  [[36,15,'ava-l1'],[37,15,'ava-l2'],[36,16,'ava-l3'],[37,16,'ava-l4'],[35,15,'ava-l5']],
  },
  // Lothlórien: Elvish forest → central/eastern Europe forest region
  lothlorien_region: {
    small:  [[20,7,'loth-s1'],[21,7,'loth-s2'],[20,8,'loth-s3'],[22,8,'loth-s4'],[21,8,'loth-s5']],
    medium: [[30,11,'loth-m1'],[31,11,'loth-m2'],[32,11,'loth-m3'],[30,12,'loth-m4'],[31,12,'loth-m5']],
    large:  [[47,17,'loth-l1'],[48,17,'loth-l2'],[49,17,'loth-l3'],[48,18,'loth-l4'],[49,18,'loth-l5']],
  },
  // Narnia: Magical northern land → Northern Europe / Scandinavia / Russia
  narnia_region: {
    small:  [[19,4,'nar-s1'],[20,4,'nar-s2'],[21,4,'nar-s3'],[22,4,'nar-s4'],[22,3,'nar-s5']],
    medium: [[30,7,'nar-m1'],[31,7,'nar-m2'],[32,7,'nar-m3'],[33,7,'nar-m4'],[33,6,'nar-m5']],
    large:  [[47,11,'nar-l1'],[48,11,'nar-l2'],[49,11,'nar-l3'],[50,11,'nar-l4'],[51,11,'nar-l5']],
  },
  // Atlantis: Legendary island civilization → Atlantic coast / Mediterranean
  atlantis_region: {
    small:  [[13,10,'atl-s1'],[12,10,'atl-s2'],[13,9,'atl-s3'],[14,9,'atl-s4'],[14,10,'atl-s5']],
    medium: [[20,14,'atl-m1'],[21,14,'atl-m2'],[20,15,'atl-m3'],[21,15,'atl-m4'],[22,14,'atl-m5'],[19,14,'atl-m6']],
    large:  [[31,21,'atl-l1'],[32,21,'atl-l2'],[31,22,'atl-l3'],[33,21,'atl-l4'],[30,21,'atl-l5']],
  },
};

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

for (const size of ['small', 'medium', 'large'] as Size[]) {
  const map = loadGeoMap(EARTH_TILES[size], EARTH_RIVERS[size], MAP_DIMS[size], true);
  const positions = EARTH_START_POSITIONS[size];

  console.log(`\n${'='.repeat(70)}`);
  console.log(`MAP SIZE: ${size.toUpperCase()} (${MAP_DIMS[size].width}×${MAP_DIMS[size].height})`);
  console.log('='.repeat(70));

  console.log('\n--- CURRENT POSITIONS ---');
  const civIds = Object.keys(positions) as Array<keyof typeof positions>;
  for (const civ of civIds) {
    const coord = positions[civ];
    const tile = map.tiles[hexKey(coord)];
    const wc = workableCount(coord.q, coord.r, map.tiles as any);
    const valid = tile && !INVALID.has(tile.terrain);
    const hist = HISTORY[civ];
    const flag = valid ? (wc >= 2 ? '✅' : '⚠️  (low workable)') : '❌';
    console.log(`  ${civ.padEnd(10)} (${String(coord.q).padStart(2)},${String(coord.r).padStart(2)}) ${flag}  terrain=${tile?.terrain ?? 'MISSING'}  workable=${wc}  [hist: ${hist?.region ?? '?'}]`);
  }

  // Detect clumping: any two civs within 3 hex distance
  console.log('\n--- CLUMPING CHECK (civs within 3 tiles of each other) ---');
  const civList = civIds.map(c => ({ id: c, ...positions[c as keyof typeof positions] }));
  const clumps: string[] = [];
  for (let i = 0; i < civList.length; i++) {
    for (let j = i+1; j < civList.length; j++) {
      const a = civList[i], b = civList[j];
      const dist = Math.max(
        Math.abs(a.q - b.q),
        Math.abs(a.r - b.r),
        Math.abs((a.q + a.r) - (b.q + b.r)),
      );
      if (dist <= 3) {
        clumps.push(`  ⚠️  ${a.id}(${a.q},${a.r}) ↔ ${b.id}(${b.q},${b.r}) dist=${dist}`);
      }
    }
  }
  if (clumps.length === 0) console.log('  No clumping detected.');
  else clumps.forEach(c => console.log(c));

  // Probe candidate positions for geographic accuracy improvements
  console.log('\n--- CANDIDATE POSITIONS FOR IMPROVEMENT ---');
  for (const [region, sizeMap] of Object.entries(CANDIDATES)) {
    const candidates = sizeMap[size];
    if (!candidates || candidates.length === 0) continue;
    const validOnes = candidates.filter(([q, r]) => {
      const tile = map.tiles[`${q},${r}`];
      const wc = workableCount(q, r, map.tiles as any);
      return tile && !INVALID.has(tile.terrain) && wc >= 2;
    });
    if (validOnes.length > 0) {
      const top = validOnes.slice(0, 3).map(([q, r, label]) => {
        const tile = map.tiles[`${q},${r}`];
        const wc = workableCount(q, r, map.tiles as any);
        return `(${q},${r})=${tile?.terrain},wc=${wc}`;
      }).join('  ');
      console.log(`  ${region.padEnd(20)} valid: ${top}`);
    } else {
      const all = candidates.map(([q, r, label]) => {
        const tile = map.tiles[`${q},${r}`];
        return `(${q},${r})=${tile?.terrain ?? 'MISS'}`;
      }).join('  ');
      console.log(`  ${region.padEnd(20)} NONE VALID (${all})`);
    }
  }
}
