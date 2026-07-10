import type { GameMap, HexCoord, HexTile, ResourceYield } from '@/core/types';
import { hexKey, hexNeighbors, wrapHexCoord } from './hex-utils';
import { getImprovementYieldBonus } from './improvement-system';
import { getWonderYieldBonus } from './wonder-system';
import { getWonderDefinition } from './wonder-definitions';
import { getRiverYieldBonus } from './river-system';
import { getTerrainTechYieldBonus } from './tech-yield-system';

export const TERRAIN_YIELDS: Record<string, ResourceYield> = {
  grassland:  { food: 2, production: 0, gold: 0, science: 0 },
  plains:     { food: 1, production: 1, gold: 0, science: 0 },
  desert:     { food: 0, production: 0, gold: 0, science: 0 },
  tundra:     { food: 1, production: 0, gold: 0, science: 0 },
  snow:       { food: 0, production: 0, gold: 0, science: 0 },
  forest:     { food: 1, production: 1, gold: 0, science: 0 },
  hills:      { food: 0, production: 2, gold: 0, science: 0 },
  mountain:   { food: 0, production: 1, gold: 0, science: 0 },
  ocean:      { food: 1, production: 0, gold: 0, science: 0 },
  coast:      { food: 2, production: 0, gold: 1, science: 0 },
  jungle:     { food: 2, production: 0, gold: 0, science: 0 },
  swamp:      { food: 1, production: 0, gold: 0, science: 0 },
  volcanic:   { food: 0, production: 0, gold: 0, science: 0 },
};

function addYield(total: ResourceYield, bonus: Partial<ResourceYield>): void {
  total.food += bonus.food ?? 0;
  total.production += bonus.production ?? 0;
  total.gold += bonus.gold ?? 0;
  total.science += bonus.science ?? 0;
}

export interface TileYieldOptions {
  completedTechs?: string[];
  /** When provided, a tile with `devastatedUntilTurn > currentTurn` (catastrophe crisis) yields zero. */
  currentTurn?: number;
}

/**
 * Single source of truth for a tile's yield: terrain, river, river-farm
 * (+irrigation), improvement, wonder, and adjacent-wonder pieces.
 * Both `calculateCityYields` (turn truth) and `calculateWorkedTileYield`
 * (UI truth) delegate here so they can never diverge again.
 */
export function getTileYield(
  tile: HexTile,
  map: GameMap,
  coord: HexCoord,
  opts: TileYieldOptions = {},
): ResourceYield {
  const total: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  if (tile.devastatedUntilTurn !== undefined && opts.currentTurn !== undefined
      && tile.devastatedUntilTurn > opts.currentTurn) {
    return total; // catastrophe crisis: devastated tile yields zero from everything
  }
  const completedTechs = opts.completedTechs ?? [];

  addYield(total, TERRAIN_YIELDS[tile.terrain] ?? total);
  addYield(total, getRiverYieldBonus(tile.hasRiver));
  addYield(total, getTerrainTechYieldBonus(tile.terrain, completedTechs));

  if (tile.hasRiver && tile.improvement === 'farm' && tile.improvementTurnsLeft === 0) {
    total.food += 1;
    if (completedTechs.includes('irrigation')) {
      total.production += 1;
    }
  }

  if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
    addYield(total, getImprovementYieldBonus(tile.improvement));
  }

  if (tile.wonder) {
    addYield(total, getWonderYieldBonus(tile.wonder));
  }

  const seenNeighborKeys = new Set<string>();
  for (const rawNeighbor of hexNeighbors(coord)) {
    const neighbor = map.wrapsHorizontally ? wrapHexCoord(rawNeighbor, map.width) : rawNeighbor;
    const neighborKey = hexKey(neighbor);
    if (seenNeighborKeys.has(neighborKey)) continue;
    seenNeighborKeys.add(neighborKey);

    const neighborTile = map.tiles[neighborKey];
    if (!neighborTile?.wonder) continue;

    const wonder = getWonderDefinition(neighborTile.wonder);
    if (wonder?.effect.type === 'adjacent_yield_bonus') {
      addYield(total, wonder.effect.yields);
    }
  }

  return total;
}
