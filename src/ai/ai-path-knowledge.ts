import type { GameMap, GameState } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { parseHexKey } from '@/systems/hex-utils';
import { isTrustedObservedLastSeenTile } from '@/systems/last-seen-presentation';

/** Terrain and ownership actually observed by this actor, shared by planning and tactics. */
export function buildKnownPathMap(state: Readonly<GameState>, civId: string): GameMap {
  const actor = state.civilizations[civId];
  const knownMap: GameMap = { ...state.map, tiles: {}, rivers: [] };
  if (!actor) return knownMap;
  // Last-seen tiles remember the presence of a river, not its exact edge. Never
  // consult a hidden live edge to optimize a belief route.
  knownMap.rivers = state.map.rivers.filter(edge =>
    getVisibility(actor.visibility, edge.from) === 'visible'
    || getVisibility(actor.visibility, edge.to) === 'visible');
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    const coord = tile.coord ?? parseHexKey(key);
    const visibility = getVisibility(actor.visibility, coord);
    if (visibility === 'visible') {
      knownMap.tiles[key] = structuredClone(tile);
      continue;
    }
    const snapshot = actor.visibility.lastSeen?.[key];
    if (visibility !== 'fog' || !isTrustedObservedLastSeenTile(snapshot)) continue;
    knownMap.tiles[key] = {
      coord: { ...snapshot.coord },
      terrain: snapshot.terrain,
      elevation: snapshot.elevation,
      resource: snapshot.resource,
      improvement: snapshot.improvement,
      improvementTurnsLeft: snapshot.improvementTurnsLeft,
      owner: snapshot.owner,
      hasRiver: snapshot.hasRiver,
      wonder: snapshot.wonder,
      hasRoad: snapshot.hasRoad,
    };
  }
  return knownMap;
}
