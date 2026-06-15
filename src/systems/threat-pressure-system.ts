import type { GameState, GameMap, HexCoord } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

export const PIRATE_OWNER = 'pirate';

const NON_VIABLE_TERRAIN = new Set(['ocean', 'coast', 'mountain', 'snow']);

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function empireShare(state: GameState, civId: string, landmassId: string): number {
  const tiles = Object.values(state.map.tiles).filter(t => t.regionKey === landmassId);
  const viable = tiles.filter(t => !NON_VIABLE_TERRAIN.has(t.terrain));
  if (viable.length === 0) return 0;
  const owned = viable.filter(t => t.owner === civId).length;
  return Math.min(owned / viable.length, 1.0);
}

export function nearestLandmassId(position: HexCoord, map: GameMap): string | null {
  const visited = new Set<string>([hexKey(position)]);
  let frontier: HexCoord[] = [position];

  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const nextFrontier: HexCoord[] = [];
    for (const coord of frontier) {
      for (const nb of hexNeighbors(coord)) {
        const key = hexKey(nb);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles[key];
        if (!tile) continue;
        if (tile.regionKey) return tile.regionKey;
        nextFrontier.push(nb);
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

export function computeThreatScore(state: GameState, civId: string, landmassId: string): number {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return 0;

  // Only evaluate landmasses where civ has at least one city
  const hasCityOnLandmass = civ.cities.some(cityId => {
    const city = state.cities[cityId];
    if (!city) return false;
    const tile = state.map.tiles[hexKey(city.position)];
    return tile?.regionKey === landmassId;
  });
  if (!hasCityOnLandmass) return 0;

  const share = empireShare(state, civId, landmassId);
  const idleTurns = state.turn - (civ.lastCombatTurnByLandmass?.[landmassId] ?? state.turn);
  const idleFactor = Math.min(idleTurns / 10, 1.5);

  return state.era * (1.0 + share + idleFactor);
}

export function recordCombatForCiv(state: GameState, civId: string, position: HexCoord): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const tile = state.map.tiles[hexKey(position)];
  let landmassId: string | null = tile?.regionKey ?? null;
  if (!landmassId) {
    landmassId = nearestLandmassId(position, state.map);
  }
  if (!landmassId) return state;

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        lastCombatTurnByLandmass: {
          ...(civ.lastCombatTurnByLandmass ?? {}),
          [landmassId]: state.turn,
        },
      },
    },
  };
}
