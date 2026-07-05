import type { City, GameMap, ResourceYield, CivBonusEffect } from '@/core/types';
import { hexKey } from './hex-utils';
import { BUILDINGS } from './city-system';
import { canonicalizeCityCoord } from './city-territory-system';
import { getTileYield, TERRAIN_YIELDS } from './tile-yield';
import { getCityTechYields } from './tech-yield-system';

export { TERRAIN_YIELDS };

export function calculateCityYields(
  city: City,
  map: GameMap,
  bonusEffect?: CivBonusEffect,
  completedTechs: string[] = [],
): ResourceYield {
  const yields: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };

  // Base yield from city center
  yields.food += 1;
  yields.production += 1;
  yields.gold += 1;
  yields.science += 1;

  // Yields from explicitly worked citizen tiles. The city center is always base yield only.
  const centerKey = hexKey(canonicalizeCityCoord(city.position, map));
  const workedTiles = city.workedTiles
    .map(coord => canonicalizeCityCoord(coord, map))
    .filter(coord => hexKey(coord) !== centerKey)
    .slice(0, city.population);
  for (const coord of workedTiles) {
    const tile = map.tiles[hexKey(coord)];
    if (!tile) continue;

    const tileYield = getTileYield(tile, map, coord, { completedTechs });
    yields.food += tileYield.food;
    yields.production += tileYield.production;
    yields.gold += tileYield.gold;
    yields.science += tileYield.science;
  }

  // Russia tundra bonus
  if (bonusEffect?.type === 'tundra_bonus') {
    for (const coord of workedTiles) {
      const tile = map.tiles[hexKey(coord)];
      if (tile && (tile.terrain === 'tundra' || tile.terrain === 'snow')) {
        yields.food += bonusEffect.foodBonus;
        yields.production += bonusEffect.productionBonus;
      }
    }
  }

  if (bonusEffect?.type === 'coastal_science') {
    for (const coord of workedTiles) {
      const tile = map.tiles[hexKey(coord)];
      if (tile?.terrain === 'coast') {
        yields.science += bonusEffect.coastalScienceBonus;
      }
    }
  }

  if (bonusEffect?.type === 'forest_guardians') {
    for (const coord of workedTiles) {
      const tile = map.tiles[hexKey(coord)];
      if (tile?.terrain === 'forest') {
        yields.food += bonusEffect.forestYieldBonus;
      }
    }
  }

  // Shire food bonus
  if (bonusEffect?.type === 'peaceful_growth') {
    yields.food += bonusEffect.foodBonus;
  }

  // Building yields
  for (const buildingId of city.buildings) {
    const building = BUILDINGS[buildingId];
    if (building && !building.nationalProject) {
      yields.food += building.yields.food;
      yields.production += building.yields.production;
      yields.gold += building.yields.gold;
      yields.science += building.yields.science;
    }
  }

  // Tech-driven economy modifiers (cityFlat/conditional/perBuilding/perPopulation/perImprovement)
  const techYields = getCityTechYields(city, map, completedTechs).total;
  yields.food += techYields.food;
  yields.production += techYields.production;
  yields.gold += techYields.gold;
  yields.science += techYields.science;

  return yields;
}
