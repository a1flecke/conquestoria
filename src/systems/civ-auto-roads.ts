import type { GameState, HexCoord } from '@/core/types';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { cityDistance } from '@/systems/city-territory-system';
import { hexKey } from '@/systems/hex-utils';
import { findPath } from '@/systems/unit-pathfinding';

/** A new Roman city is linked to the nearest Roman city no farther than this many tiles away. */
export const AUTO_ROAD_MAX_CITY_DISTANCE = 10;

/**
 * Rome "Roman Roads" (#1692 A1): founding a city lays a finished road along the land route to the nearest city
 * the same civilization already owns. No technology or worker is needed (that is the bonus), but the ordinary
 * placement rules still hold: never on a city centre and never on another owner's land, so a route that crosses
 * a neighbour simply has a gap there. Returns the input state when the owner has no such bonus, no other city in
 * range, or no land route.
 */
export function applyAutoRoadsForNewCity(state: GameState, cityId: string): { state: GameState; roadTiles: HexCoord[] } {
  const city = state.cities[cityId];
  const civ = city ? state.civilizations[city.owner] : undefined;
  if (!city || !civ) return { state, roadTiles: [] };
  if (resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect.type !== 'auto_roads') return { state, roadTiles: [] };

  const cityKeys = new Set(Object.values(state.cities).map(other => hexKey(other.position)));
  const neighbours = civ.cities
    .map(id => state.cities[id])
    .filter((other): other is NonNullable<typeof other> => Boolean(other) && other!.id !== city.id && other!.owner === city.owner)
    .map(other => ({ other, distance: cityDistance(city.position, other.position, state.map) }))
    .filter(entry => entry.distance <= AUTO_ROAD_MAX_CITY_DISTANCE)
    .sort((a, b) => a.distance - b.distance || a.other.id.localeCompare(b.other.id));

  for (const { other } of neighbours) {
    const path = findPath(city.position, other.position, state.map, 'land');
    if (!path) continue;
    const tiles = { ...state.map.tiles };
    const roadTiles: HexCoord[] = [];
    for (const coord of path) {
      const key = hexKey(coord);
      const tile = tiles[key];
      if (!tile || tile.hasRoad || cityKeys.has(key)) continue;
      if (tile.owner !== null && tile.owner !== undefined && tile.owner !== city.owner) continue;
      tiles[key] = { ...tile, hasRoad: true };
      roadTiles.push(coord);
    }
    if (roadTiles.length === 0) return { state, roadTiles };
    return { state: { ...state, map: { ...state.map, tiles } }, roadTiles };
  }
  return { state, roadTiles: [] };
}
