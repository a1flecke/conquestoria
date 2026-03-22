import type { GameMap, HexCoord, ResourceYield } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

export function generateRivers(
  map: GameMap,
  seed: string,
): Array<{ from: HexCoord; to: HexCoord }> {
  const rivers: Array<{ from: HexCoord; to: HexCoord }> = [];
  const riverTiles = new Set<string>();

  // Simple seeded RNG
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const rng = (): number => {
    hash = (hash * 1664525 + 1013904223) | 0;
    return (hash >>> 0) / 4294967296;
  };

  // Find potential river sources (highland/mountain tiles not ocean/coast)
  const sources: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (
      (tile.elevation === 'highland' || tile.elevation === 'mountain') &&
      tile.terrain !== 'ocean' &&
      tile.terrain !== 'coast'
    ) {
      sources.push(tile.coord);
    }
  }

  // Generate 3-6 rivers
  const riverCount = Math.min(sources.length, 3 + Math.floor(rng() * 4));

  // Shuffle sources
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  for (let r = 0; r < riverCount; r++) {
    const source = sources[r];
    if (!source) break;

    let current = source;
    const visited = new Set<string>();
    visited.add(hexKey(current));

    // Flow downhill toward ocean/coast
    for (let step = 0; step < 15; step++) {
      const neighbors = hexNeighbors(current);
      let bestNext: HexCoord | null = null;
      let bestScore = -Infinity;

      for (const neighbor of neighbors) {
        const key = hexKey(neighbor);
        if (visited.has(key)) continue;
        const tile = map.tiles[key];
        if (!tile) continue;

        let score = 0;
        if (tile.terrain === 'ocean' || tile.terrain === 'coast') score = 100;
        else if (tile.elevation === 'lowland') score = 3;
        else if (tile.elevation === 'highland') score = 1;
        else score = 0;

        if (riverTiles.has(key)) score -= 5;
        score += rng() * 2;

        if (score > bestScore) {
          bestScore = score;
          bestNext = neighbor;
        }
      }

      if (!bestNext) break;

      rivers.push({ from: current, to: bestNext });
      riverTiles.add(hexKey(current));
      riverTiles.add(hexKey(bestNext));

      const nextTile = map.tiles[hexKey(bestNext)];
      if (nextTile && (nextTile.terrain === 'ocean' || nextTile.terrain === 'coast')) {
        break;
      }

      visited.add(hexKey(bestNext));
      current = bestNext;
    }
  }

  return rivers;
}

export function applyRiversToMap(
  map: GameMap,
  rivers: Array<{ from: HexCoord; to: HexCoord }>,
): void {
  map.rivers = rivers;
  const riverHexes = new Set<string>();
  for (const r of rivers) {
    riverHexes.add(hexKey(r.from));
    riverHexes.add(hexKey(r.to));
  }
  for (const key of riverHexes) {
    const tile = map.tiles[key];
    if (tile) {
      tile.hasRiver = true;
    }
  }
}

export function getRiverYieldBonus(hasRiver: boolean): ResourceYield {
  if (hasRiver) {
    return { food: 0, production: 0, gold: 1, science: 0 };
  }
  return { food: 0, production: 0, gold: 0, science: 0 };
}

export function getRiverDefensePenalty(crossingRiver: boolean): number {
  return crossingRiver ? -0.2 : 0;
}

export function isRiverBetween(
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
): boolean {
  return map.rivers.some(
    r =>
      (hexKey(r.from) === hexKey(from) && hexKey(r.to) === hexKey(to)) ||
      (hexKey(r.from) === hexKey(to) && hexKey(r.to) === hexKey(from)),
  );
}
