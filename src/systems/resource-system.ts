import type { City, GameMap, ResourceYield } from '@/core/types';
import { hexKey } from './hex-utils';
import { getImprovementYieldBonus } from './improvement-system';
import { BUILDINGS } from './city-system';
import { getTotalAdjacencyYields } from './adjacency-system';

export const TERRAIN_YIELDS: Record<string, ResourceYield> = {
  grassland:  { food: 2, production: 0, gold: 0, science: 0 },
  plains:     { food: 1, production: 1, gold: 0, science: 0 },
  desert:     { food: 0, production: 0, gold: 0, science: 0 },
  tundra:     { food: 1, production: 0, gold: 0, science: 0 },
  snow:       { food: 0, production: 0, gold: 0, science: 0 },
  forest:     { food: 1, production: 1, gold: 0, science: 0 },
  hills:      { food: 0, production: 2, gold: 0, science: 0 },
  mountain:   { food: 0, production: 0, gold: 0, science: 0 },
  ocean:      { food: 1, production: 0, gold: 0, science: 0 },
  coast:      { food: 2, production: 0, gold: 1, science: 0 },
  jungle:     { food: 2, production: 0, gold: 0, science: 0 },
  swamp:      { food: 1, production: 0, gold: 0, science: 0 },
  volcanic:   { food: 0, production: 0, gold: 0, science: 0 },
};

export function calculateCityYields(city: City, map: GameMap): ResourceYield {
  const yields: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };

  // Base yield from city center
  yields.food += 1;
  yields.production += 1;

  // Yields from worked tiles (up to population count)
  const workedTiles = city.ownedTiles.slice(0, city.population);
  for (const coord of workedTiles) {
    const tile = map.tiles[hexKey(coord)];
    if (!tile) continue;

    const terrainYield = TERRAIN_YIELDS[tile.terrain] ?? { food: 0, production: 0, gold: 0, science: 0 };
    yields.food += terrainYield.food;
    yields.production += terrainYield.production;
    yields.gold += terrainYield.gold;
    yields.science += terrainYield.science;

    // River bonus
    if (tile.hasRiver) {
      yields.gold += 1;
      if (tile.improvement === 'farm' && tile.improvementTurnsLeft === 0) {
        yields.food += 1;
      }
    }

    // Improvement bonuses
    if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
      const bonus = getImprovementYieldBonus(tile.improvement);
      yields.food += bonus.food;
      yields.production += bonus.production;
      yields.gold += bonus.gold;
      yields.science += bonus.science;
    }
  }

  // Building yields
  for (const buildingId of city.buildings) {
    const building = BUILDINGS[buildingId];
    if (building) {
      yields.food += building.yields.food;
      yields.production += building.yields.production;
      yields.gold += building.yields.gold;
      yields.science += building.yields.science;
    }
  }

  // Adjacency bonuses from city grid
  if (city.grid) {
    const adjYields = getTotalAdjacencyYields(city.grid, city.gridSize);
    yields.food += adjYields.food;
    yields.production += adjYields.production;
    yields.gold += adjYields.gold;
    yields.science += adjYields.science;
  }

  return yields;
}
