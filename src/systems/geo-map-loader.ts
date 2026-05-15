import type { GameMap, HexTile, TerrainType, Elevation } from '@/core/types';
import { hexKey } from './hex-utils';
import { applyRiversToMap } from './river-system';

export type GeoTile = {
  q: number;
  r: number;
  terrain: TerrainType;
  resource: string | null;
};

type RiverSegment = { from: { q: number; r: number }; to: { q: number; r: number } };

function elevationFromTerrain(terrain: TerrainType): Elevation {
  if (terrain === 'mountain') return 'mountain';
  if (terrain === 'hills' || terrain === 'volcanic') return 'highland';
  return 'lowland';
}

export function loadGeoMap(
  tiles: GeoTile[],
  rivers: RiverSegment[],
  dims: { width: number; height: number },
  wrapsHorizontally: boolean,
): GameMap {
  const hexTiles: Record<string, HexTile> = {};

  for (const geo of tiles) {
    const key = hexKey({ q: geo.q, r: geo.r });
    hexTiles[key] = {
      coord: { q: geo.q, r: geo.r },
      terrain: geo.terrain,
      elevation: elevationFromTerrain(geo.terrain),
      resource: geo.resource,
      improvement: 'none',
      owner: null,
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };
  }

  const map: GameMap = {
    width: dims.width,
    height: dims.height,
    tiles: hexTiles,
    wrapsHorizontally,
    rivers,
  };

  applyRiversToMap(map, rivers);
  return map;
}
