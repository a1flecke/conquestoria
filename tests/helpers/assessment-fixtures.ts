import type { City, GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { HUMAN_A, createTwoViewerWorld } from './viewer-knowledge-fixtures';

/**
 * #1236/#1237 — a hot-seat world whose first viewer owns exactly two cities, so a test can say
 * "the healthy one is first in the roster, the starving one second" and prove the Council names
 * the bottleneck, not the first city.
 */

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

/** Grassland sites at least `minGap` apart, in deterministic key order. */
export function pickSites(state: GameState, count: number, minGap = 7): Array<{ q: number; r: number }> {
  const sites: Array<{ q: number; r: number }> = [];
  for (const key of Object.keys(state.map.tiles).sort()) {
    const tile = state.map.tiles[key];
    if (tile.terrain !== 'grassland') continue;
    if (sites.every(site => hexDistance(site, tile.coord) >= minGap)) sites.push(tile.coord);
    if (sites.length === count) return sites;
  }
  throw new Error('fixture: map has too few grassland sites');
}

export function addCity(
  state: GameState,
  owner: string,
  at: { q: number; r: number },
  id: string,
  terrain: 'grassland' | 'desert',
): City {
  const city = foundCity(owner, at, state.map, counters());
  const placed: City = { ...city, id, name: id.replace('city-', '').toUpperCase(), population: terrain === 'desert' ? 4 : 1 };
  for (const coord of placed.ownedTiles) {
    const tile = state.map.tiles[hexKey(coord)];
    if (!tile) continue;
    tile.terrain = terrain;
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
    tile.resource = null as never;
  }
  state.cities[placed.id] = placed;
  state.civilizations[owner].cities.push(placed.id);
  return placed;
}

/** The two-viewer world with every civ's city roster cleared and the first viewer's units removed. */
export function emptyEmpire(owner = HUMAN_A): GameState {
  const state = createTwoViewerWorld();
  for (const civ of Object.values(state.civilizations)) civ.cities = [];
  state.cities = {};
  for (const unit of Object.values(state.units)) if (unit.owner === owner) delete state.units[unit.id];
  return state;
}

export function twoCityWorld(secondStarves: boolean): GameState {
  const state = emptyEmpire();
  const [first, second] = pickSites(state, 2);
  // A healthy baseline is researching: with no research chosen, science is discarded and the
  // assessment (correctly) reports it.
  state.civilizations[HUMAN_A].techState.currentResearch = 'pottery';
  // Ids are chosen so the HEALTHY city is first in every roster.
  addCity(state, HUMAN_A, first, 'city-a-first', 'grassland');
  addCity(state, HUMAN_A, second, 'city-b-second', secondStarves ? 'desert' : 'grassland');
  return state;
}
