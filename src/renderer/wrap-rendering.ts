import type { HexCoord } from '@/core/types';

const EDGE_MARGIN = 3;

export function getHorizontalWrapRenderCoords(coord: HexCoord, mapWidth: number): HexCoord[] {
  const coords = [{ ...coord }];

  if (coord.q < EDGE_MARGIN) {
    coords.push({ q: coord.q + mapWidth, r: coord.r });
  }

  if (coord.q >= mapWidth - EDGE_MARGIN) {
    coords.push({ q: coord.q - mapWidth, r: coord.r });
  }

  return coords;
}
