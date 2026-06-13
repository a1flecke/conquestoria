import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { RESOURCE_TECH } from '@/systems/trade-system';
import { resolveTilePresentationForViewer } from '@/renderer/tile-presentation';

export interface TerrainLabelSuppressionOptions {
  state: GameState;
  viewerId: string;
  visibleUnitCoords: readonly HexCoord[];
  villagePositions: ReadonlySet<string>;
  beastLairPositions: ReadonlySet<string>;
  viewerTechs: ReadonlySet<string>;
}

function coordKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function buildTerrainLabelSuppressionSet(
  options: TerrainLabelSuppressionOptions,
): Set<string> {
  const { state, viewerId, visibleUnitCoords, villagePositions, beastLairPositions, viewerTechs } = options;
  const visibility = state.civilizations[viewerId]?.visibility;
  const suppressed = new Set<string>();
  if (!visibility) return suppressed;

  for (const city of Object.values(state.cities)) {
    if (getVisibility(visibility, city.position) === 'visible') suppressed.add(coordKey(city.position));
  }
  for (const snapshot of Object.values(visibility.lastSeen ?? {})) {
    if (snapshot.city && getVisibility(visibility, snapshot.coord) === 'fog') {
      suppressed.add(coordKey(snapshot.coord));
    }
  }
  for (const coord of visibleUnitCoords) suppressed.add(coordKey(coord));

  for (const tile of Object.values(state.map.tiles)) {
    const key = coordKey(tile.coord);
    const presentation = resolveTilePresentationForViewer(state.map, visibility, tile.coord);
    if (presentation.kind !== 'live' && presentation.kind !== 'last-seen') continue;
    const presentedTile = presentation.tile;

    if (presentedTile.improvement !== 'none') suppressed.add(key);
    if (presentedTile.wonder) suppressed.add(key);
    if (
      presentedTile.resource
      && !presentedTile.wonder
      && viewerTechs.has(RESOURCE_TECH[presentedTile.resource] ?? '')
    ) {
      suppressed.add(key);
    }
    if (presentation.kind === 'live' && villagePositions.has(key)) suppressed.add(key);
    if (presentation.kind === 'live' && beastLairPositions.has(key)) suppressed.add(key);
  }

  return suppressed;
}
