import type { GameMap, HexTile, HexCoord, TerrainType, Elevation } from '@/core/types';
import { hexKey, hexDistance, hexesInRange } from './hex-utils';

// Simple seeded PRNG (mulberry32)
function createRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0; h = h + 0x6D2B79F5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple 2D value noise for terrain generation
function createNoise(rng: () => number) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  function grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise2d(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[(perm[X] + Y) & 255];
    const ab = perm[(perm[X] + Y + 1) & 255];
    const ba = perm[(perm[(X + 1) & 255] + Y) & 255];
    const bb = perm[(perm[(X + 1) & 255] + Y + 1) & 255];

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

function getElevation(noiseVal: number): Elevation {
  if (noiseVal > 0.6) return 'mountain';
  if (noiseVal > 0.3) return 'highland';
  return 'lowland';
}

function getTerrain(
  landNoise: number,
  moistureNoise: number,
  tempNoise: number,
  elevation: Elevation,
  r: number,
  height: number,
): TerrainType {
  // Polar regions
  const polarDistance = Math.min(r, height - 1 - r) / (height * 0.15);
  if (polarDistance < 1) {
    const temp = tempNoise + polarDistance;
    if (temp < 0.3) return 'snow';
    if (temp < 0.7) return 'tundra';
  }

  // Ocean
  if (landNoise < -0.1) return 'ocean';
  if (landNoise < 0.0) return 'coast';

  // Mountains
  if (elevation === 'mountain') return 'mountain';

  // Land terrain based on moisture and temperature
  if (moistureNoise > 0.4) return 'forest';
  if (moistureNoise > 0.2 && tempNoise > 0.3) return 'grassland';
  if (tempNoise > 0.5) return 'desert';
  if (moistureNoise > 0.0) return 'plains';
  if (elevation === 'highland') return 'hills';
  return 'plains';
}

export function generateMap(width: number, height: number, seed: string): GameMap {
  const rng = createRng(seed);
  const landNoise = createNoise(rng);
  const moistureNoise = createNoise(rng);
  const elevationNoise = createNoise(rng);
  const tempNoise = createNoise(rng);

  const tiles: Record<string, HexTile> = {};

  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const nx = q / width * 4;
      const ny = r / height * 4;

      const land = landNoise(nx, ny) + 0.5 * landNoise(nx * 2, ny * 2);
      const moisture = moistureNoise(nx + 100, ny + 100);
      const elev = elevationNoise(nx + 200, ny + 200);
      const temp = (tempNoise(nx + 300, ny + 300) + 1) / 2;

      const elevation = getElevation(elev);
      const terrain = getTerrain(land, moisture, temp, elevation, r, height);

      const key = hexKey({ q, r });

      tiles[key] = {
        coord: { q, r },
        terrain,
        elevation: terrain === 'mountain' ? 'mountain' : terrain === 'hills' ? 'highland' : elevation === 'mountain' ? 'highland' : elevation,
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
      };
    }
  }

  return { width, height, tiles, wrapsHorizontally: true, rivers: [] };
}

function isLandTerrain(terrain: TerrainType): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain' && terrain !== 'snow';
}

export function findStartPositions(map: GameMap, count: number): HexCoord[] {
  // Collect all suitable land tiles (not at edges)
  const candidates: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (
      isLandTerrain(tile.terrain) &&
      tile.coord.r > 3 &&
      tile.coord.r < map.height - 4
    ) {
      // Check that there's enough land nearby
      const nearby = hexesInRange(tile.coord, 2);
      const landCount = nearby.filter(n => {
        const t = map.tiles[hexKey(n)];
        return t && isLandTerrain(t.terrain);
      }).length;
      if (landCount >= 10) {
        candidates.push(tile.coord);
      }
    }
  }

  if (candidates.length < count) {
    // Fallback: relax constraints
    for (const tile of Object.values(map.tiles)) {
      if (isLandTerrain(tile.terrain)) {
        candidates.push(tile.coord);
      }
    }
  }

  // Pick positions that are far apart using greedy algorithm
  const positions: HexCoord[] = [];
  const used = new Set<string>();

  // First position: near center of map
  const centerQ = Math.floor(map.width / 2);
  const centerR = Math.floor(map.height / 2);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = hexDistance(c, { q: centerQ, r: centerR });
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  positions.push(best);
  used.add(hexKey(best));

  // Remaining positions: maximize minimum distance to existing positions
  for (let i = 1; i < count; i++) {
    let bestCandidate = candidates[0];
    let bestMinDist = -1;

    for (const c of candidates) {
      if (used.has(hexKey(c))) continue;
      const minDist = Math.min(...positions.map(p => hexDistance(c, p)));
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestCandidate = c;
      }
    }

    positions.push(bestCandidate);
    used.add(hexKey(bestCandidate));
  }

  return positions;
}
