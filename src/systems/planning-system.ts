import type { City, GameState, TechState } from '@/core/types';
import { getAvailableBuildings, TRAINABLE_UNITS } from '@/systems/city-system';
import { getAvailableTechs } from '@/systems/tech-system';

const MAX_QUEUE_ITEMS = 3;

export function enqueueCityProduction(city: City, itemId: string): City {
  if (city.productionQueue.includes(itemId)) {
    return city;
  }

  if (city.productionQueue.length >= MAX_QUEUE_ITEMS) {
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

  if (1 + state.researchQueue.length >= MAX_QUEUE_ITEMS) {
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
