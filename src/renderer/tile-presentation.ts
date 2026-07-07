import type { GameMap, HexCoord, HexTile, LastSeenTilePresentation, VisibilityMap } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, wrapHexCoord } from '@/systems/hex-utils';
import { resolveTileHasRail } from '@/systems/road-network';

export type TilePresentationKind = 'live' | 'last-seen' | 'unknown-fog' | 'unexplored';

export interface TilePresentation {
  kind: TilePresentationKind;
  tile: HexTile;
  hasRail: boolean;
}

function unknownTile(coord: HexCoord): HexTile {
  return {
    coord,
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function lastSeenToTile(snapshot: LastSeenTilePresentation): HexTile {
  return {
    coord: { ...snapshot.coord },
    terrain: snapshot.terrain,
    elevation: snapshot.elevation,
    resource: snapshot.resource,
    improvement: snapshot.improvement,
    owner: snapshot.owner,
    improvementTurnsLeft: snapshot.improvementTurnsLeft,
    hasRiver: snapshot.hasRiver,
    wonder: snapshot.wonder,
    hasRoad: snapshot.hasRoad,
  };
}

export function resolveTilePresentationForViewer(
  map: GameMap,
  visibility: VisibilityMap | undefined,
  renderCoord: HexCoord,
  completedTechsByCiv: Record<string, string[]> = {},
): TilePresentation {
  const coord = map.wrapsHorizontally ? wrapHexCoord(renderCoord, map.width) : renderCoord;
  const key = hexKey(coord);
  const liveTile = map.tiles[key] ?? unknownTile(coord);
  const state = visibility ? getVisibility(visibility, coord) : 'visible';

  if (state === 'visible') {
    const hasRail = resolveTileHasRail(
      Boolean(liveTile.hasRoad),
      liveTile.owner,
      liveTile.owner ? completedTechsByCiv[liveTile.owner] : undefined,
    );
    return { kind: 'live', tile: liveTile, hasRail };
  }
  if (state === 'unexplored') return { kind: 'unexplored', tile: unknownTile(coord), hasRail: false };

  const snapshot = visibility?.lastSeen?.[key];
  if (snapshot) return { kind: 'last-seen', tile: lastSeenToTile(snapshot), hasRail: snapshot.hasRail ?? false };
  return { kind: 'unknown-fog', tile: unknownTile(coord), hasRail: false };
}
