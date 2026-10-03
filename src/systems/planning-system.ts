import type { City, GameState, TechState } from '@/core/types';
import { BUILDINGS, TRAINABLE_UNITS, getAvailableBuildings, getTrainableUnitsForCiv } from '@/systems/city-system';
import { getQueueableProductionForCity } from '@/systems/city-production-eligibility';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getAvailableTechs, startResearch, TECH_TREE } from '@/systems/tech-system';
import { resolveBuildingPacingBand, resolveUnitPacingBand } from '@/systems/pacing-model';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { buildProductionCostContext, getContextualProductionCost } from '@/systems/production-cost-context';
import { getQueueableResearchIds } from '@/systems/tech-progression';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getArsenalStatus } from '@/systems/strategic-arsenal-system';
import { getCapitalCityId } from '@/systems/capital-system';

const MAX_CITY_QUEUE_ITEMS = 4;
const MAX_RESEARCH_QUEUE_ITEMS = 3;

/** Why a production enqueue did nothing. Copy never names another civilization. */
export type EnqueueDenialReason =
  | 'city-not-found'
  | 'legendary-wonder'
  | 'unknown-item'
  | 'duplicate'
  | 'not-available'
  | 'queue-full';

export const ENQUEUE_DENIAL_MESSAGES: Record<EnqueueDenialReason, string> = {
  'city-not-found': 'That city is no longer available.',
  'legendary-wonder': 'Legendary wonders are started from the wonders panel.',
  'unknown-item': 'That cannot be built.',
  'duplicate': 'That is already in the queue.',
  'not-available': 'That cannot be built here right now.',
  'queue-full': 'Queue limit reached.',
};

export type EnqueueResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: EnqueueDenialReason };

/**
 * Appends `itemId` to a city's production queue, after re-running the eligibility the Build tab is built from (#1220).
 *
 * `ok: false` returns the input state untouched with a typed reason (`ENQUEUE_DENIAL_MESSAGES`). The player's
 * panel, the idle-city required choice and the AI's idle-city fill all call this, so an item the list withholds
 * cannot be queued by a caller that forgot to filter. `processCity`'s dequeue stays as the backstop for state that
 * changes while an item waits.
 */
export function enqueueCityProduction(state: GameState, cityId: string, itemId: string): EnqueueResult {
  const refuse = (reason: EnqueueDenialReason): EnqueueResult => ({ ok: false, state, reason });
  const city = state.cities[cityId];
  if (!city || !state.civilizations[city.owner]) return refuse('city-not-found');
  // Legendary wonders enter a queue only through `startLegendaryWonderBuild`, which runs the wonder system's own
  // eligibility; a bare `legendary:` string has none.
  if (itemId.startsWith('legendary:')) return refuse('legendary-wonder');

  const building = BUILDINGS[itemId];
  // #545: a consumedOnCompletion building (e.g. warhead) never persists into city.buildings on completion, so it's
  // repeatable like a unit -- the dedup rule exists to stop double-queuing a genuinely one-time building.
  if (building && !building.consumedOnCompletion && city.productionQueue.includes(itemId)) return refuse('duplicate');

  const queueable = getQueueableProductionForCity(state, cityId);
  if (!queueable) return refuse('city-not-found');
  const known = Boolean(building) || TRAINABLE_UNITS.some(unit => unit.type === itemId);
  if (!known) return refuse('unknown-item');
  const offered = building
    ? queueable.buildings.some(candidate => candidate.id === itemId)
    : queueable.units.some(unit => unit.type === itemId);
  if (!offered) return refuse('not-available');

  if (city.productionQueue.length >= MAX_CITY_QUEUE_ITEMS) return refuse('queue-full');

  return {
    ok: true,
    state: {
      ...state,
      cities: {
        ...state.cities,
        [cityId]: { ...city, productionQueue: [...city.productionQueue, itemId] },
      },
    },
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
    return startResearch(state, techId);
  }

  if (state.researchQueue.length >= MAX_RESEARCH_QUEUE_ITEMS) {
    throw new Error('Queue limit reached');
  }

  return {
    ...state,
    researchQueue: [...state.researchQueue, techId],
  };
}

export function activateNextQueuedResearch(state: TechState): TechState {
  if (state.currentResearch) return state;
  const completed = new Set(state.completed);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const techId of state.researchQueue) {
    if (completed.has(techId) || seen.has(techId)) continue;
    const tech = TECH_TREE.find(candidate => candidate.id === techId);
    if (!tech || !tech.prerequisites.every(prerequisite => completed.has(prerequisite))) {
      continue;
    }
    normalized.push(tech.id);
    seen.add(tech.id);
    completed.add(tech.id);
  }

  const [currentResearch, ...researchQueue] = normalized;
  if (!currentResearch) {
    return state.researchQueue.length === 0
      ? state
      : { ...state, researchQueue: [] };
  }
  return {
    ...startResearch(state, currentResearch),
    researchQueue,
  };
}

export function getIdleCityIds(state: GameState, civId: string): string[] {
  const civ = state.civilizations[civId];
  if (!civ) {
    return [];
  }

  const completedTechs = civ.techState.completed ?? [];
  const civEra = resolveCivilizationEra(completedTechs);
  const reservedNationalProjects = getReservedNationalProjectKeys(state, civId);
  const availableResources = getCivAvailableResources(state, civId);
  const arsenalStatus = getArsenalStatus(state, civId);
  return Object.values(state.cities)
    .filter(city => city.owner === civId)
    .filter(city => city.productionQueue.length === 0)
    .filter(city => !city.idleProduction)
    .filter(city => {
      const buildableBuildings = !!state.map && getAvailableBuildings(
        city,
        completedTechs,
        state.map,
        availableResources,
        civEra,
        reservedNationalProjects,
        civId,
        arsenalStatus,
        getCapitalCityId(state, civId),
      ).length > 0;
      const buildableUnits = getTrainableUnitsForCiv(completedTechs, civ.civType, availableResources).length > 0;
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

  // #1220: the recommendation draws from the very list `enqueueCityProduction` validates against, so it can
  // never recommend something (a coastal unit for an inland city, an unreachable missionary) the queue refuses.
  const queueable = getQueueableProductionForCity(state, cityId) ?? { buildings: [], units: [] };
  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  const productionCostContext = buildProductionCostContext(state, civId, cityId);
  const productionPerTurn = Math.max(1, calculateProjectedCityYields(state, cityId, bonusEffect).production);
  const candidates = [
    ...queueable.buildings.map(building => {
      const cost = getContextualProductionCost(building.id, productionCostContext);
      return {
        itemId: building.id,
        label: building.name,
        cost,
        turns: Math.ceil(cost / productionPerTurn),
        priority: resolveBuildingPacingBand(building) === 'starter' ? 0 : 1,
      };
    }),
    ...queueable.units
      .map(unit => {
        const cost = getContextualProductionCost(unit.type, productionCostContext);
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
