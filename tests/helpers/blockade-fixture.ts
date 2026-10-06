import type { GameState, HexCoord, UnitType } from '@/core/types';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { AI_A, HUMAN_A } from './viewer-knowledge-fixtures';

// #1355: shared fixture -- a hostile major civ's fleet around one of the viewer's coastal cities.
export function ring(state: GameState, center: HexCoord): { adjacent: HexCoord[]; outer: HexCoord[] } {
  const adjacent = mapNeighbors(state.map, center);
  const outer = adjacent.flatMap(n => mapNeighbors(state.map, n))
    .filter(c => !(c.q === center.q && c.r === center.r) && !adjacent.some(a => a.q === c.q && a.r === c.r));
  return { adjacent, outer };
}

export function addShip(state: GameState, owner: string, type: UnitType, position: HexCoord, id: string): void {
  state.map.tiles[hexKey(position)].terrain = 'ocean';
  state.units[id] = {
    id, type, owner, position, movementPointsLeft: 4, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  } as GameState['units'][string];
  state.civilizations[owner]?.units.push(id);
}

export function declareWar(state: GameState, a: string, b: string): void {
  state.civilizations[a].diplomacy.atWarWith = [b];
  state.civilizations[b].diplomacy.atWarWith = [a];
}

/** A major-civ blockade of `cityId` by AI_A: two frigates, one adjacent. */
export function blockadeByMajorCiv(state: GameState, cityId: string, prefix = 'ship'): void {
  const city = state.cities[cityId];
  const { adjacent, outer } = ring(state, city.position);
  addShip(state, AI_A, 'frigate', adjacent[0], `${prefix}-1`);
  addShip(state, AI_A, 'frigate', outer[0], `${prefix}-2`);
  declareWar(state, HUMAN_A, AI_A);
}
