import type { City, Building, HexCoord, GameMap, UnitType } from '@/core/types';
import { hexKey, hexesInRange } from './hex-utils';

let nextCityId = 1;
let cityNameIndex = 0;

export const CITY_NAMES = [
  'Alexandria', 'Thebes', 'Memphis', 'Carthage', 'Athens',
  'Sparta', 'Rome', 'Babylon', 'Persepolis', 'Chang\'an',
  'Kyoto', 'Delhi', 'Cusco', 'Tenochtitlan', 'London',
  'Paris', 'Constantinople', 'Samarkand', 'Timbuktu', 'Angkor',
];

export const BUILDINGS: Record<string, Building> = {
  granary: {
    id: 'granary', name: 'Granary',
    yields: { food: 2, production: 0, gold: 0, science: 0 },
    productionCost: 40, description: 'Stores food, +2 food per turn',
  },
  workshop: {
    id: 'workshop', name: 'Workshop',
    yields: { food: 0, production: 2, gold: 0, science: 0 },
    productionCost: 50, description: 'Improves crafting, +2 production',
  },
  library: {
    id: 'library', name: 'Library',
    yields: { food: 0, production: 0, gold: 0, science: 2 },
    productionCost: 60, description: 'Center of learning, +2 science',
  },
  marketplace: {
    id: 'marketplace', name: 'Marketplace',
    yields: { food: 0, production: 0, gold: 3, science: 0 },
    productionCost: 50, description: 'Trading hub, +3 gold',
  },
  barracks: {
    id: 'barracks', name: 'Barracks',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 40, description: 'Trains soldiers, new units start with bonus experience',
  },
  temple: {
    id: 'temple', name: 'Temple',
    yields: { food: 0, production: 0, gold: 0, science: 1 },
    productionCost: 45, description: 'Spiritual center, +1 science, +happiness',
  },
  herbalist: {
    id: 'herbalist', name: 'Herbalist',
    yields: { food: 1, production: 0, gold: 0, science: 0 },
    productionCost: 35, description: 'Heals and nurtures, +1 food, +health',
  },
};

export const TRAINABLE_UNITS: Array<{ type: UnitType; name: string; cost: number }> = [
  { type: 'warrior', name: 'Warrior', cost: 25 },
  { type: 'scout', name: 'Scout', cost: 20 },
  { type: 'worker', name: 'Worker', cost: 30 },
  { type: 'settler', name: 'Settler', cost: 50 },
];

export function foundCity(owner: string, position: HexCoord, map: GameMap): City {
  const name = CITY_NAMES[cityNameIndex % CITY_NAMES.length];
  cityNameIndex++;

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
  };
}

export function resetCityId(): void {
  nextCityId = 1;
  cityNameIndex = 0;
}

export function getAvailableBuildings(city: City, completedTechs: string[]): Building[] {
  return Object.values(BUILDINGS).filter(b => !city.buildings.includes(b.id));
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
): CityProcessResult {
  let grew = false;
  let completedBuilding: string | null = null;
  let completedUnit: UnitType | null = null;

  // Food and growth
  const foodSurplus = foodYield - city.population; // each pop eats 1 food
  let newFood = city.food + Math.max(0, foodSurplus);
  let newPop = city.population;
  let newFoodNeeded = city.foodNeeded;

  if (newFood >= city.foodNeeded) {
    newPop++;
    newFood -= city.foodNeeded;
    newFoodNeeded = Math.floor(city.foodNeeded * 1.3);
    grew = true;
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
    if (building && newProgress >= building.productionCost) {
      newBuildings.push(building.id);
      newQueue.shift();
      newProgress = 0;
      completedBuilding = building.id;
    }

    // Check if it's a unit
    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    if (unitDef && newProgress >= unitDef.cost) {
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
    },
    grew,
    completedBuilding,
    completedUnit,
  };
}
