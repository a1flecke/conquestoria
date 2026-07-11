import type { GameMap, HexCoord } from '@/core/types';
import { getLandTerrain, placeResources, createRng, createNoise } from './map-generator';
import { hexKey } from './hex-utils';
import { generateRivers, applyRiversToMap } from './river-system';
import { tagLandmassRegions } from './landmass-tagger';

const ISLAND_RESOURCES = ['gems', 'ivory', 'spices'] as const;

export function generateContinentMap(
  width: number,
  height: number,
  seed: string,
): { map: GameMap; continentHexes: Set<string> } {
  const rng = createRng(seed);

  const landNoiseFn    = createNoise(createRng(seed + '-land'));
  const moistureNoiseFn   = createNoise(createRng(seed + '-moisture'));
  const elevationNoiseFn  = createNoise(createRng(seed + '-elevation'));
  const tempNoiseFn    = createNoise(createRng(seed + '-temp'));

  function evalNoise(fn: (x: number, y: number) => number, q: number, r: number, offX: number, offY: number): number {
    return fn((q / width) * 4 + offX, (r / height) * 4 + offY);
  }

  // Flood-fill continent from center
  const center: HexCoord = { q: Math.floor(width / 2), r: Math.floor(height / 2) };
  const TARGET_LAND_RATIO = 0.55;
  const nonEdgeTotal = (width - 6) * (height - 6);
  const targetLand = Math.floor(nonEdgeTotal * TARGET_LAND_RATIO);

  let landSet = new Set<string>();
  let threshold = 0.1;
  for (let attempt = 0; attempt < 10; attempt++) {
    landSet = new Set<string>();
    const queue: HexCoord[] = [center];
    const visited = new Set<string>([hexKey(center)]);
    landSet.add(hexKey(center));

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
        const nb: HexCoord = { q: cur.q + dq, r: cur.r + dr };
        if (nb.q < 0 || nb.q >= width || nb.r < 0 || nb.r >= height) continue;
        const nbk = hexKey(nb);
        if (visited.has(nbk)) continue;
        visited.add(nbk);
        const noiseVal = evalNoise(landNoiseFn, nb.q, nb.r, 0, 0);
        if (noiseVal > threshold) {
          landSet.add(nbk);
          queue.push(nb);
        }
      }
    }
    if (landSet.size >= targetLand) break;
    threshold -= 0.05;
  }

  // Force 3-hex ocean border at edges
  for (const key of [...landSet]) {
    const [q, r] = key.split(',').map(Number);
    if (q < 3 || q >= width - 3 || r < 3 || r >= height - 3) {
      landSet.delete(key);
    }
  }
  const continentHexes = new Set(landSet);

  // Scatter 3-5 island clusters
  const islandClusterCount = 3 + Math.floor(rng() * 3);
  const islandHexes = new Set<string>();

  for (let c = 0; c < islandClusterCount; c++) {
    let anchor: HexCoord | null = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const q = 3 + Math.floor(rng() * (width - 6));
      const r = 3 + Math.floor(rng() * (height - 6));
      if (continentHexes.has(hexKey({ q, r }))) continue;
      let minDist = Infinity;
      for (const ck of continentHexes) {
        const [cq, cr] = ck.split(',').map(Number);
        const d = Math.abs(q - cq) + Math.abs(r - cr);
        if (d < minDist) minDist = d;
      }
      if (minDist >= 5) {
        anchor = { q, r };
        break;
      }
    }
    if (!anchor) continue;

    const targetSize = 8 + Math.floor(rng() * 8);
    const islandQueue: HexCoord[] = [anchor];
    const islandVisited = new Set<string>([hexKey(anchor)]);
    let added = 0;

    while (islandQueue.length > 0 && added < targetSize) {
      const cur = islandQueue.shift()!;
      if (!continentHexes.has(hexKey(cur))) {
        islandHexes.add(hexKey(cur));
        added++;
      }
      for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
        const nb: HexCoord = { q: cur.q + dq, r: cur.r + dr };
        if (nb.q < 3 || nb.q >= width - 3 || nb.r < 3 || nb.r >= height - 3) continue;
        const nbk = hexKey(nb);
        if (islandVisited.has(nbk) || continentHexes.has(nbk)) continue;
        islandVisited.add(nbk);
        islandQueue.push(nb);
      }
    }
  }

  // Build tiles
  const allLand = new Set([...continentHexes, ...islandHexes]);
  const tiles: Record<string, import('@/core/types').HexTile> = {};

  function hasOceanNeighbor(q: number, r: number): boolean {
    for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
      const nbk = hexKey({ q: q + dq, r: r + dr });
      if (!allLand.has(nbk)) return true;
    }
    return false;
  }

  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const key = hexKey({ q, r });
      if (!allLand.has(key)) {
        tiles[key] = {
          coord: { q, r }, terrain: 'ocean', elevation: 'lowland',
          resource: null, improvement: 'none', owner: null,
          improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        };
        continue;
      }

      if (hasOceanNeighbor(q, r)) {
        tiles[key] = {
          coord: { q, r }, terrain: 'coast', elevation: 'lowland',
          resource: null, improvement: 'none', owner: null,
          improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        };
        continue;
      }

      const moisture  = evalNoise(moistureNoiseFn, q, r, 100, 100);
      const elev      = evalNoise(elevationNoiseFn, q, r, 200, 200);
      const temp      = (evalNoise(tempNoiseFn, q, r, 300, 300) + 1) / 2;
      const terrain   = getLandTerrain(moisture, elev, temp, r, height);
      const elevation = terrain === 'mountain' ? 'mountain' as const
                      : terrain === 'hills' || terrain === 'volcanic' ? 'highland' as const
                      : 'lowland' as const;

      tiles[key] = {
        coord: { q, r }, terrain, elevation,
        resource: null, improvement: 'none', owner: null,
        improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }

  // Resources on continent
  const continentTiles: Record<string, import('@/core/types').HexTile> = {};
  for (const key of continentHexes) {
    if (tiles[key]) continentTiles[key] = tiles[key];
  }
  const resourceRng = createRng(seed + '-resources');
  placeResources(continentTiles, resourceRng);

  // Island bonus resources
  for (const key of islandHexes) {
    const tile = tiles[key];
    if (!tile || tile.terrain === 'ocean' || tile.terrain === 'coast') continue;
    if (rng() < 0.15) {
      tile.resource = ISLAND_RESOURCES[Math.floor(rng() * ISLAND_RESOURCES.length)];
    }
  }

  const mapWithRivers: GameMap = { width, height, tiles, wrapsHorizontally: true, rivers: [] };
  const rivers = generateRivers(mapWithRivers, seed);
  applyRiversToMap(mapWithRivers, rivers);

  const taggedTiles = tagLandmassRegions(mapWithRivers);
  const map: GameMap = { ...mapWithRivers, tiles: taggedTiles };
  return { map, continentHexes };
}
