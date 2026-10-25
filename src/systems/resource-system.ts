import type { City, GameMap, ResourceYield, CivBonusEffect } from '@/core/types';
import type { ResourceType } from '@/core/types/resources';
import { hexKey } from './hex-utils';
import { BUILDINGS } from './city-system';
import { canonicalizeCityCoord } from './city-territory-system';
import { RESOURCE_DEFINITIONS, type ResourceEffect } from './resource-definitions';
import { getTileYield, TERRAIN_YIELDS } from './tile-yield';
import { getCityTechYields, type CityTechYieldContext } from './tech-yield-system';

export { TERRAIN_YIELDS };

export interface WorkedResourceEffect {
  resource: ResourceType;
  effect: ResourceEffect;
  coord: { q: number; r: number };
}

/**
 * #1507 MR10: non-happiness resource effects belong to the city that actually works the tile.
 * The city center is always worked; every other tile needs its completed required improvement.
 * Happiness remains a separate, explicitly empire-wide access effect.
 */
export function getCityWorkedResourceEffects(
  city: City,
  map: GameMap,
  completedTechs: readonly string[] = [],
): WorkedResourceEffect[] {
  const center = canonicalizeCityCoord(city.position, map);
  const centerKey = hexKey(center);
  const coords = new Map<string, { q: number; r: number }>();
  coords.set(centerKey, center);
  for (const coord of city.workedTiles ?? []) {
    const canonical = canonicalizeCityCoord(coord, map);
    coords.set(hexKey(canonical), canonical);
  }

  const effects: WorkedResourceEffect[] = [];
  for (const [key, coord] of coords) {
    const tile = map.tiles[key];
    if (!tile?.resource) continue;
    const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === tile.resource);
    if (!definition?.effect || definition.effect.type === 'happiness') continue;
    if (!completedTechs.includes(definition.tech)) continue;
    const isCenter = key === centerKey;
    if (!isCenter && (tile.improvement !== definition.requiredImprovement || tile.improvementTurnsLeft !== 0)) {
      continue;
    }
    effects.push({ resource: definition.id, effect: definition.effect, coord });
  }
  return effects;
}

export function calculateCityYields(
  city: City,
  map: GameMap,
  bonusEffect?: CivBonusEffect,
  completedTechs: string[] = [],
  techYieldContext: CityTechYieldContext = {},
  currentTurn?: number,
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

    const tileYield = getTileYield(tile, map, coord, { completedTechs, currentTurn });
    yields.food += tileYield.food;
    yields.production += tileYield.production;
    yields.gold += tileYield.gold;
    yields.science += tileYield.science;
  }

  // Native worked-tile resource effects. Access alone never grants these to another city.
  for (const worked of getCityWorkedResourceEffects(city, map, completedTechs)) {
    switch (worked.effect.type) {
      case 'gold': yields.gold += worked.effect.amount; break;
      case 'production': yields.production += worked.effect.amount; break;
      case 'food': yields.food += worked.effect.amount; break;
      case 'science': yields.science += worked.effect.amount; break;
      case 'happiness': break;
    }
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
  const techYields = getCityTechYields(city, map, completedTechs, techYieldContext).total;
  yields.food += techYields.food;
  yields.production += techYields.production;
  yields.gold += techYields.gold;
  yields.science += techYields.science;

  // genomics: +1 food per 3 science this city generates per turn, evaluated on the pre-empire-percent
  // total (this function's own science output, before turn-manager applies civ-wide percent bonuses).
  if (completedTechs.includes('genomics')) {
    yields.food += Math.floor(yields.science / 3);
  }

  return yields;
}
