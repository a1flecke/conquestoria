import type { City, GameState, TechState } from '@/core/types';
import { BUILDINGS, getAvailableBuildings, TRAINABLE_UNITS } from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getAvailableTechs } from '@/systems/tech-system';
import { resolveBuildingPacingBand, resolveUnitPacingBand } from '@/systems/pacing-model';

const MAX_CITY_QUEUE_ITEMS = 4;
const MAX_RESEARCH_QUEUE_ITEMS = 3;

export function enqueueCityProduction(city: City, itemId: string): City {
  const isUniqueItem = Boolean(BUILDINGS[itemId]) || itemId.startsWith('legendary:');
  if (isUniqueItem && city.productionQueue.includes(itemId)) {
    return city;
  }

  if (city.productionQueue.length >= MAX_CITY_QUEUE_ITEMS) {
    throw new Error('Queue limit reached');
  }

  return {
    ...city,
    productionQueue: [...city.productionQueue, itemId],
  };
}

export function moveQueuedId<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= items.length
    || toIndex >= items.length
    || fromIndex === toIndex
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return [...items];
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderCityProduction(city: City, fromIndex: number, toIndex: number): City {
  const productionQueue = moveQueuedId(city.productionQueue, fromIndex, toIndex);
  const activeItemChanged = productionQueue[0] !== city.productionQueue[0];

  return {
    ...city,
    productionQueue,
    productionProgress: activeItemChanged ? 0 : city.productionProgress,
  };
}

export function removeQueuedId<T>(items: T[], index: number): T[] {
  return items.filter((_, currentIndex) => currentIndex !== index);
}

export function enqueueResearch(state: TechState, techId: string): TechState {
  if (state.completed.includes(techId) || state.currentResearch === techId || state.researchQueue.includes(techId)) {
    return state;
  }

  if (!state.currentResearch) {
    return {
      ...state,
      currentResearch: techId,
      researchProgress: 0,
    };
  }

  if (state.researchQueue.length >= MAX_RESEARCH_QUEUE_ITEMS) {
    throw new Error('Queue limit reached');
  }

  return {
    ...state,
    researchQueue: [...state.researchQueue, techId],
  };
}

export function getIdleCityIds(state: GameState, civId: string): string[] {
  const civ = state.civilizations[civId];
  if (!civ) {
    return [];
  }

  const completedTechs = civ.techState.completed ?? [];
  return Object.values(state.cities)
    .filter(city => city.owner === civId)
    .filter(city => city.productionQueue.length === 0)
    .filter(city => {
      const buildableBuildings = getAvailableBuildings(city, completedTechs).length > 0;
      const buildableUnits = TRAINABLE_UNITS.some(unit => !unit.techRequired || completedTechs.includes(unit.techRequired));
      return buildableBuildings || buildableUnits;
    })
    .map(city => city.id);
}

export function needsResearchChoice(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) {
    return false;
  }
  if (civ.techState.currentResearch) {
    return false;
  }
  return getAvailableTechs(civ.techState).length > 0;
}

export function getRecommendedIdleCityChoice(
  state: GameState,
  civId: string,
  cityId: string,
): { itemId: string; label: string; cost: number; turns: number } | null {
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city) {
    return null;
  }

  const completedTechs = civ.techState.completed ?? [];
  const productionPerTurn = Math.max(1, calculateProjectedCityYields(state, cityId).production);
  const candidates = [
    ...getAvailableBuildings(city, completedTechs).map(building => ({
      itemId: building.id,
      label: building.name,
      cost: building.productionCost,
      turns: Math.ceil(building.productionCost / productionPerTurn),
      priority: resolveBuildingPacingBand(building) === 'starter' ? 0 : 1,
    })),
    ...TRAINABLE_UNITS
      .filter(unit => !unit.techRequired || completedTechs.includes(unit.techRequired))
      .map(unit => ({
        itemId: unit.type,
        label: unit.name,
        cost: unit.cost,
        turns: Math.ceil(unit.cost / productionPerTurn),
        priority: resolveUnitPacingBand(unit) === 'starter' ? 0 : 1,
      })),
  ];

  const best = candidates
    .sort((left, right) => left.turns - right.turns || left.cost - right.cost || left.priority - right.priority)[0];

  if (!best) {
    return null;
  }

  return {
    itemId: best.itemId,
    label: best.label,
    cost: best.cost,
    turns: best.turns,
  };
}
