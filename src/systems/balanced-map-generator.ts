import type { GameMap, HexTile, HexCoord } from '@/core/types';
import {
  generateBaseTerrain,
  findStartPositions,
  placeResources,
  createRng,
} from './map-generator';
import { hexKey, hexDistance } from './hex-utils';
import { generateRivers, applyRiversToMap } from './river-system';

// S2a: extended with all 10 luxury resources so the hotspot/equalization passes
// treat new luxuries the same as the original 6.
const LUXURY_RESOURCES = ['silk', 'wine', 'spices', 'gems', 'ivory', 'incense', 'gold', 'silver', 'furs', 'sheep'] as const;

function terrainQualityScore(terrain: string): number {
  if (terrain === 'grassland' || terrain === 'plains') return 3;
  if (terrain === 'forest' || terrain === 'hills') return 2;
  if (terrain === 'coast') return 1;
  return 0;
}

function isUsableLand(terrain: string): boolean {
  return !['ocean', 'coast', 'mountain', 'snow', 'tundra'].includes(terrain);
}

export function generateBalancedMap(
  width: number,
  height: number,
  seed: string,
  civCount: number,
): { map: GameMap; startPositions: HexCoord[] } {
  const tiles = generateBaseTerrain(width, height, seed);
  const mapBase: GameMap = { width, height, tiles, wrapsHorizontally: true, rivers: [] };

  const civIds = Array.from({ length: civCount }, (_, i) => `balanced-civ-${i}`);
  const size = width === 30 ? 'small' : width === 50 ? 'medium' : 'large';
  const startPositions = findStartPositions(mapBase, civIds, 'balanced', size);

  // Voronoi — assign each hex to nearest start
  const tileKeys = Object.keys(tiles);
  const zones: number[] = tileKeys.map(key => {
    const tile = tiles[key];
    let nearestZone = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < startPositions.length; i++) {
      const d = hexDistance(tile.coord, startPositions[i]);
      if (d < nearestDist) { nearestDist = d; nearestZone = i; }
    }
    return nearestZone;
  });

  // Audit zones
  const zoneResourceCounts = new Array(civCount).fill(0);
  const zoneQualityScores  = new Array(civCount).fill(0);
  const zoneTiles: HexTile[][] = Array.from({ length: civCount }, () => []);

  for (let i = 0; i < tileKeys.length; i++) {
    const tile = tiles[tileKeys[i]];
    const z = zones[i];
    zoneTiles[z].push(tile);
    if (tile.resource) zoneResourceCounts[z]++;
    zoneQualityScores[z] += terrainQualityScore(tile.terrain);
  }

  const rng = createRng(seed + '-balance');

  // Terrain quality leveling (zones with too much desert/tundra get upgraded)
  const meanQuality = zoneQualityScores.reduce((s, c) => s + c, 0) / civCount;
  for (let z = 0; z < civCount; z++) {
    if (zoneQualityScores[z] < meanQuality) {
      const poorTiles = zoneTiles[z].filter(
        t => t.terrain === 'desert' || t.terrain === 'tundra',
      ).slice(0, 2);
      for (const t of poorTiles) {
        t.terrain = 'plains';
        zoneQualityScores[z] += terrainQualityScore('plains');
      }
    }
  }

  // Luxury hotspot at centroid of starts
  const centroidQ = Math.round(startPositions.reduce((s, p) => s + p.q, 0) / startPositions.length);
  const centroidR = Math.round(startPositions.reduce((s, p) => s + p.r, 0) / startPositions.length);

  let anchor: HexCoord | null = null;
  const visited = new Set<string>();
  const queue: HexCoord[] = [{ q: centroidQ, r: centroidR }];
  while (queue.length > 0 && !anchor) {
    const cur = queue.shift()!;
    const k = hexKey(cur);
    if (visited.has(k)) continue;
    visited.add(k);
    const tile = tiles[k];
    if (tile && isUsableLand(tile.terrain)) {
      anchor = cur;
      break;
    }
    for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
      const nb = { q: cur.q + dq, r: cur.r + dr };
      if (nb.q >= 0 && nb.q < width && nb.r >= 0 && nb.r < height) {
        queue.push(nb);
      }
    }
  }

  if (anchor) {
    const luxuryCount = 3 + Math.floor(rng() * 3);
    const luxuryTypes = [
      LUXURY_RESOURCES[Math.floor(rng() * LUXURY_RESOURCES.length)],
      LUXURY_RESOURCES[Math.floor(rng() * LUXURY_RESOURCES.length)],
    ];
    let placed = 0;
    const hotspotQueue = [anchor];
    const hotspotVisited = new Set<string>([hexKey(anchor)]);
    while (hotspotQueue.length > 0 && placed < luxuryCount) {
      const cur = hotspotQueue.shift()!;
      if (hexDistance(cur, anchor) > 4) break;
      const tile = tiles[hexKey(cur)];
      if (tile && isUsableLand(tile.terrain)) {
        tile.resource = luxuryTypes[placed % luxuryTypes.length];
        placed++;
      }
      for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
        const nb = { q: cur.q + dq, r: cur.r + dr };
        const nbk = hexKey(nb);
        if (!hotspotVisited.has(nbk) && nb.q >= 0 && nb.q < width && nb.r >= 0 && nb.r < height) {
          hotspotVisited.add(nbk);
          hotspotQueue.push(nb);
        }
      }
    }
  }

  // Standard resource placement (skips tiles with existing resources)
  const resourceRng = createRng(seed + '-resources');
  placeResources(tiles, resourceRng);

  // Post-placement zone equalization: bring under-served zones up to 75% of mean density
  const postCounts = new Array(civCount).fill(0);
  const postLandCounts = new Array(civCount).fill(0);
  for (let i = 0; i < tileKeys.length; i++) {
    const tile = tiles[tileKeys[i]];
    if (isUsableLand(tile.terrain)) {
      postLandCounts[zones[i]]++;
      if (tile.resource) postCounts[zones[i]]++;
    }
  }
  const densities = postCounts.map((c, z) => postLandCounts[z] > 0 ? c / postLandCounts[z] : 0);
  const meanDensity = densities.reduce((s, d) => s + d, 0) / civCount;
  const targetDensity = meanDensity * 0.75;
  for (let z = 0; z < civCount; z++) {
    const target = Math.floor(postLandCounts[z] * targetDensity);
    while (postCounts[z] < target) {
      const candidates = zoneTiles[z].filter(t => !t.resource && isUsableLand(t.terrain));
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(rng() * candidates.length)];
      pick.resource = LUXURY_RESOURCES[Math.floor(rng() * LUXURY_RESOURCES.length)];
      postCounts[z]++;
    }
  }

  const map: GameMap = { width, height, tiles, wrapsHorizontally: true, rivers: [] };
  const rivers = generateRivers(map, seed);
  applyRiversToMap(map, rivers);

  return { map, startPositions };
}
