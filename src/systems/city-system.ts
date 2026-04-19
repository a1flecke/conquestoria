import type { City, Building, HexCoord, GameMap, UnitType, CivBonusEffect, TrainableUnitEntry } from '@/core/types';
import { hexKey, hexesInRange } from './hex-utils';
import { drawNextCityName, DEFAULT_CITY_NAMES } from './city-name-system';

let nextCityId = 1;
export const CITY_NAMES = DEFAULT_CITY_NAMES;

export interface FoundCityOptions {
  civType?: string;
  namingPool?: string[];
  usedNames?: Set<string>;
  civName?: string;
}

export const BUILDINGS: Record<string, Building> = {
  // Food
  granary: { id: 'granary', name: 'Granary', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 40, description: 'Stores food for growth', techRequired: 'granary-design', adjacencyBonuses: [] },
  herbalist: { id: 'herbalist', name: 'Herbalist', category: 'food', yields: { food: 1, production: 0, gold: 0, science: 0 }, productionCost: 35, description: 'Herbal medicine boosts health', techRequired: null, adjacencyBonuses: [] },
  aqueduct: { id: 'aqueduct', name: 'Aqueduct', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 80, description: 'Brings fresh water for growth', techRequired: 'engineering', adjacencyBonuses: [] },

  // Production
  workshop: { id: 'workshop', name: 'Workshop', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 12, description: 'Tools boost production', techRequired: null, adjacencyBonuses: [], pacing: { band: 'starter', role: 'early-production', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
  forge: { id: 'forge', name: 'Forge', category: 'production', yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 70, description: 'Metalworking facility', techRequired: 'engineering', adjacencyBonuses: [] },
  lumbermill: { id: 'lumbermill', name: 'Lumbermill', category: 'production', yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 50, description: 'Processes timber efficiently', techRequired: 'state-workforce', adjacencyBonuses: [] },
  'quarry-building': { id: 'quarry-building', name: 'Quarry', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 55, description: 'Cuts stone for construction', techRequired: 'state-workforce', adjacencyBonuses: [] },

  // Science
  library: { id: 'library', name: 'Library', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 16, description: 'Knowledge repository', techRequired: 'writing', adjacencyBonuses: [] },
  archive: { id: 'archive', name: 'Archive', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 75, description: 'Preserves ancient knowledge', techRequired: 'mathematics', adjacencyBonuses: [] },
  observatory: { id: 'observatory', name: 'Observatory', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 100, description: 'Studies the stars', techRequired: 'astronomy', adjacencyBonuses: [] },

  // Economy
  marketplace: { id: 'marketplace', name: 'Marketplace', category: 'economy', yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 50, description: 'Center of trade', techRequired: 'currency', adjacencyBonuses: [] },
  harbor: { id: 'harbor', name: 'Harbor', category: 'economy', yields: { food: 1, production: 0, gold: 3, science: 0 }, productionCost: 80, description: 'Enables sea trade', techRequired: 'harbor-tech', adjacencyBonuses: [] },

  // Military
  barracks: { id: 'barracks', name: 'Barracks', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10, description: 'A training ground. Required by future military doctrines.', techRequired: null, adjacencyBonuses: [], pacing: { band: 'starter', role: 'military-enabler', impact: 1, scope: 'city', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1.05 } },
  walls: { id: 'walls', name: 'Walls', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 60, description: 'Defends the city', techRequired: 'fortification', adjacencyBonuses: [] },
  stable: { id: 'stable', name: 'Stable', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 55, description: 'Trains mounted units', techRequired: 'horseback-riding', adjacencyBonuses: [] },

  // Culture
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center', techRequired: 'philosophy', adjacencyBonuses: [] },
  monument: { id: 'monument', name: 'Monument', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 30, description: 'Commemorates your civilization', techRequired: 'code-of-laws', adjacencyBonuses: [] },
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture', techRequired: 'drama-poetry', adjacencyBonuses: [] },
  shrine: { id: 'shrine', name: 'Shrine', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 8, description: 'Place of worship', techRequired: null, adjacencyBonuses: [], pacing: { band: 'starter', role: 'early-science', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  forum: { id: 'forum', name: 'Forum', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 70, description: 'Public gathering place', techRequired: 'civil-service', adjacencyBonuses: [] },
};

export const TRAINABLE_UNITS: Array<TrainableUnitEntry & { pacing?: Building['pacing'] }> = [
  { type: 'warrior', name: 'Warrior', cost: 8, pacing: { band: 'starter', role: 'early-military', impact: 1, scope: 'military', snowball: 1, urgency: 1.2, situationality: 1, unlockBreadth: 1 } },
  { type: 'archer', name: 'Archer', cost: 35, techRequired: 'archery' },
  { type: 'scout', name: 'Scout', cost: 6, pacing: { band: 'starter', role: 'early-exploration', impact: 1, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  { type: 'worker', name: 'Worker', cost: 12 },
  { type: 'settler', name: 'Settler', cost: 50 },
  { type: 'swordsman', name: 'Swordsman', cost: 50, techRequired: 'bronze-working' },
  { type: 'pikeman', name: 'Pikeman', cost: 70, techRequired: 'fortification' },
  { type: 'musketeer', name: 'Musketeer', cost: 90, techRequired: 'tactics' },
  { type: 'galley', name: 'Galley', cost: 40, techRequired: 'galleys' },
  { type: 'trireme', name: 'Trireme', cost: 70, techRequired: 'triremes' },
  { type: 'spy_scout', name: 'Scout Agent', cost: 30, techRequired: 'espionage-scouting', obsoletedByTech: 'espionage-informants' },
  { type: 'spy_informant', name: 'Informant', cost: 50, techRequired: 'espionage-informants', obsoletedByTech: 'spy-networks' },
  { type: 'spy_agent', name: 'Field Agent', cost: 70, techRequired: 'spy-networks', obsoletedByTech: 'cryptography' },
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'cyber-warfare' },
  { type: 'spy_hacker', name: 'Cyber Operative', cost: 110, techRequired: 'cyber-warfare' },
  { type: 'scout_hound', name: 'Scout Hound', cost: 55, techRequired: 'lookouts' },
];

export function getTrainableUnitsForCiv(completedTechs: string[]): TrainableUnitEntry[] {
  return TRAINABLE_UNITS.filter(u => {
    if (u.techRequired && !completedTechs.includes(u.techRequired)) return false;
    if (u.obsoletedByTech && completedTechs.includes(u.obsoletedByTech)) return false;
    return true;
  });
}

export function foundCity(owner: string, position: HexCoord, map: GameMap, options: FoundCityOptions = {}): City {
  const name = drawNextCityName(options.civType ?? owner, options.usedNames ?? new Set<string>(), {
    namingPool: options.namingPool,
    civName: options.civName,
  });

  // Claim nearby land tiles (radius 1)
  const nearby = hexesInRange(position, 1);
  const ownedTiles = nearby.filter(coord => {
    const tile = map.tiles[hexKey(coord)];
    return tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain';
  });

  // Initialize 5x5 grid (all null), place city center in the middle
  const grid: (string | null)[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => null),
  );
  grid[2][2] = 'city-center';

  return {
    id: `city-${nextCityId++}`,
    name,
    owner,
    position: { ...position },
    population: 1,
    food: 0,
    foodNeeded: 15,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles,
    grid,
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  };
}

export function resetCityId(): void {
  nextCityId = 1;
}

export function getAvailableBuildings(city: City, completedTechs: string[]): Building[] {
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.techRequired && !completedTechs.includes(b.techRequired)) return false;
    return true;
  });
}

export function checkGridExpansion(city: City): boolean {
  if (city.population >= 6 && city.gridSize < 5) {
    city.gridSize = 5;
    return true;
  }
  if (city.population >= 3 && city.gridSize < 4) {
    city.gridSize = 4;
    return true;
  }
  return false;
}

export function purchaseGridExpansion(city: City, currentGold: number): number {
  if (city.gridSize >= 5) return 0;
  const cost = city.gridSize < 4 ? 50 : 150;
  if (currentGold < cost) return 0;
  city.gridSize = city.gridSize < 4 ? 4 : 5;
  return cost;
}

export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
}

export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
  bonusEffect?: CivBonusEffect,
): CityProcessResult {
  let grew = false;
  let completedBuilding: string | null = null;
  let completedUnit: UnitType | null = null;

  // Food and growth
  const foodSurplus = foodYield - city.population; // each pop eats 1 food
  let newFood = city.food + Math.max(0, foodSurplus);
  let newPop = city.population;
  let newFoodNeeded = city.foodNeeded;

  let newGridSize = city.gridSize;

  if (newFood >= city.foodNeeded) {
    newPop++;
    newFood -= city.foodNeeded;
    newFoodNeeded = Math.floor(city.foodNeeded * 1.3);
    grew = true;

    // Check grid expansion thresholds
    if (newPop >= 6 && newGridSize < 5) newGridSize = 5;
    else if (newPop >= 3 && newGridSize < 4) newGridSize = 4;
  }

  // Production
  let newProgress = city.productionProgress;
  const newQueue = [...city.productionQueue];
  const newBuildings = [...city.buildings];

  if (newQueue.length > 0) {
    newProgress += productionYield;
    const currentItem = newQueue[0];

    // Check if it's a building
    const building = BUILDINGS[currentItem];
    const buildingCostMult = building ? applyProductionBonus(currentItem, bonusEffect) : 1;
    if (building && newProgress >= Math.round(building.productionCost * buildingCostMult)) {
      newBuildings.push(building.id);
      newQueue.shift();
      newProgress = 0;
      completedBuilding = building.id;
    }

    // Check if it's a unit
    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const unitCostMult = unitDef ? applyProductionBonus(currentItem, bonusEffect) : 1;
    if (unitDef && newProgress >= Math.round(unitDef.cost * unitCostMult)) {
      newQueue.shift();
      newProgress = 0;
      completedUnit = unitDef.type;
    }
  }

  return {
    city: {
      ...city,
      food: newFood,
      foodNeeded: newFoodNeeded,
      population: newPop,
      productionProgress: newProgress,
      productionQueue: newQueue,
      buildings: newBuildings,
      gridSize: newGridSize,
    },
    grew,
    completedBuilding,
    completedUnit,
  };
}

const WONDER_BUILDINGS = ['monument', 'amphitheater'];

export function applyProductionBonus(
  itemId: string,
  bonusEffect: CivBonusEffect | undefined,
): number {
  if (!bonusEffect) return 1;

  if (bonusEffect.type === 'faster_wonders' && WONDER_BUILDINGS.includes(itemId)) {
    return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'faster_military') {
    const isMilitary = ['warrior', 'scout'].includes(itemId) ||
      ['barracks', 'walls', 'stable'].includes(itemId);
    if (isMilitary) return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'coastal_science') {
    const isNaval = ['galley', 'trireme'].includes(itemId);
    if (isNaval) return 1 - bonusEffect.navalProductionBonus;
  }

  // Shire: military units cost 25% more
  if (bonusEffect.type === 'peaceful_growth') {
    const militaryTypes = ['warrior', 'swordsman', 'pikeman', 'musketeer', 'scout', 'archer'];
    if (militaryTypes.includes(itemId)) {
      return 1 + bonusEffect.militaryPenalty; // e.g. 1.25
    }
  }

  return 1;
}

export function razeForestForProduction(
  city: City,
  map: GameMap,
  tileCoord: HexCoord,
): { city: City; map: GameMap } | null {
  const key = `${tileCoord.q},${tileCoord.r}`;
  const tile = map.tiles[key];
  if (!tile || tile.terrain !== 'forest') return null;

  const isOwned = city.ownedTiles.some(t => t.q === tileCoord.q && t.r === tileCoord.r);
  if (!isOwned) return null;

  const newTile = { ...tile, terrain: 'plains' as const, improvement: 'none' as const, improvementTurnsLeft: 0 };
  const newMap = { ...map, tiles: { ...map.tiles, [key]: newTile } };
  const newCity = { ...city, productionProgress: city.productionProgress + 30 };
  return { city: newCity, map: newMap };
}
