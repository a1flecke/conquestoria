import type { HexCoord, HexTile, ResourceType } from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS } from './resource-definitions';

const LATE_RESOURCE_DENSITIES: Readonly<Record<string, number>> = {
  coal: 0.04,
  oil: 0.04,
  aluminum: 0.04,
  uranium: 0.04,
  'rare-earth-elements': 0.02,
  'battery-minerals': 0.02,
};

function isEligible(tile: HexTile, terrains: readonly string[], protectedTileKeys: ReadonlySet<string>): boolean {
  return tile.resource === null
    && tile.improvement === 'none'
    && tile.wonder === null
    && !protectedTileKeys.has(hexKey(tile.coord))
    && terrains.includes(tile.terrain);
}

function chooseCandidates<T>(candidates: T[], count: number, rng: () => number): T[] {
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

/** Places late resources after the existing early resource pass without replacing map state. */
export function placeLateResources(
  tiles: Record<string, HexTile>,
  rng: () => number,
  protectedCoords: readonly HexCoord[] = [],
): void {
  const protectedTileKeys = new Set(protectedCoords.map(hexKey));
  const orderedTiles = Object.entries(tiles).sort(([left], [right]) => left.localeCompare(right));
  for (const definition of RESOURCE_DEFINITIONS) {
    const density = LATE_RESOURCE_DENSITIES[definition.id];
    if (!density) continue;
    const terrains = Array.isArray(definition.terrain) ? definition.terrain : [definition.terrain];
    const candidates = orderedTiles
      .map(([, tile]) => tile)
      .filter(tile => isEligible(tile, terrains, protectedTileKeys));
    const target = Math.max(1, Math.round(candidates.length * density));
    for (const tile of chooseCandidates(candidates, target, rng)) {
      tile.resource = definition.id as ResourceType;
    }
  }
}
