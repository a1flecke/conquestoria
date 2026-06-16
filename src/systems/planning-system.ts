import type { City, GameState, TechState } from '@/core/types';
import { BUILDINGS, getAvailableBuildings, getProductionCostForItem, getTrainableUnitsForCiv } from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getAvailableTechs } from '@/systems/tech-system';
import { resolveBuildingPacingBand, resolveUnitPacingBand } from '@/systems/pacing-model';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getQueueableResearchIds } from '@/systems/tech-progression';

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

  if (!getQueueableResearchIds(state).has(techId)) {
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
    .filter(city => !city.idleProduction)
    .filter(city => {
      const buildableBuildings = !!state.map && getAvailableBuildings(city, completedTechs, state.map).length > 0;
      const buildableUnits = getTrainableUnitsForCiv(completedTechs, civ.civType).length > 0;
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
  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  const productionPerTurn = Math.max(1, calculateProjectedCityYields(state, cityId, bonusEffect).production);
  const candidates = [
    ...(state.map ? getAvailableBuildings(city, completedTechs, state.map) : []).map(building => {
      const cost = getProductionCostForItem(building.id, { city, bonusEffect, era: state.era });
      return {
        itemId: building.id,
        label: building.name,
        cost,
        turns: Math.ceil(cost / productionPerTurn),
        priority: resolveBuildingPacingBand(building) === 'starter' ? 0 : 1,
      };
    }),
    ...getTrainableUnitsForCiv(completedTechs, civ.civType)
      .map(unit => {
        const cost = getProductionCostForItem(unit.type, { city, bonusEffect, era: state.era });
        return {
          itemId: unit.type,
          label: unit.name,
          cost,
          turns: Math.ceil(cost / productionPerTurn),
          priority: resolveUnitPacingBand(unit) === 'starter' ? 0 : 1,
        };
      }),
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

export function setIdleProduction(city: City, mode: 'gold' | 'science' | null): City {
  return { ...city, idleProduction: mode };
}
