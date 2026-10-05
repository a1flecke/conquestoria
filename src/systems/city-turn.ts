import type { City, DroppedProductionItem, GameMap, ProductionDropReason, UnitType } from '@/core/types';
import { BUILDINGS } from './city-building-catalog';
import { TRAINABLE_UNITS } from './city-unit-catalog';
import { getTrainableUnitsForCiv, isBuildingObsolete, isUnitObsolete } from './city-availability';
import { getProductionCostForItem, type ProductionCostContext } from './city-production-cost';
import { isCityCoastal } from './city-lifecycle';

/**
 * City production completion and per-turn orchestration (#1008).
 *
 * `processCity` preserves the original ordering of growth, queue filtering,
 * national-project/world-race dequeues, coastal guards, completion and idle
 * production. Orchestration may consume the domain transitions above it; no
 * domain module may import this one.
 */
export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
  idleGoldBonus: number;
  idleScienceBonus: number;
  /** Every unit/building silently dequeued this turn, with why. Empty when nothing dropped. */
  droppedProductionItems: DroppedProductionItem[];
}

export interface CityProductionCompletionResult {
  city: City;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
}

export interface CompleteCityProductionItemOptions {
  /** Production cost of the completed item — required to compute 3d-printing overflow. */
  cost?: number;
  /** civ.techState.completed — when it includes '3d-printing', leftover progress carries to the next queue item. */
  completedTechs?: string[];
}

export function completeCityProductionItem(
  city: City,
  itemId: string,
  options: CompleteCityProductionItemOptions = {},
): CityProductionCompletionResult {
  const newQueue = [...city.productionQueue];
  const newBuildings = [...city.buildings];
  let completedBuilding: string | null = null;
  let completedUnit: UnitType | null = null;

  if (newQueue[0] !== itemId) {
    return { city, completedBuilding, completedUnit };
  }
  newQueue.shift();

  const building = BUILDINGS[itemId];
  if (building) {
    // #545: a consumedOnCompletion building (e.g. warhead) fires completedBuilding
    // for turn-manager.ts's completion hook every time, but is never persisted --
    // that's what makes it immediately re-buildable instead of a one-time addition.
    if (building.consumedOnCompletion) {
      completedBuilding = building.id;
    } else if (!newBuildings.includes(building.id)) {
      newBuildings.push(building.id);
      completedBuilding = building.id;
    }
  } else {
    const unitDef = TRAINABLE_UNITS.find(u => u.type === itemId);
    if (unitDef) {
      completedUnit = unitDef.type;
    }
  }

  // 3d-printing: overflow production beyond the completed item's cost carries to the next
  // queue item instead of being discarded. Only applies when a next item is actually queued —
  // there's nothing to carry overflow into otherwise, and productionProgress must stay 0.
  const hasOverflow = Boolean(options.completedTechs?.includes('3d-printing')) && newQueue.length > 0;
  const overflow = hasOverflow && options.cost !== undefined
    ? Math.max(0, city.productionProgress - options.cost)
    : 0;

  let nextCity: City = {
    ...city,
    productionQueue: newQueue,
    productionProgress: overflow,
    buildings: newBuildings,
  };

  return {
    city: nextCity,
    completedBuilding,
    completedUnit,
  };
}

/**
 * #984: the cost inputs arrive as one `ProductionCostContext` rather than seven
 * positional arguments. `era`, `completedTechs` and `availableResources` are
 * read back out of it for queue eligibility too, so the threshold this function
 * completes at and the cost every other consumer displays cannot diverge.
 *
 * `productionCost` is deliberately required and un-defaulted: a defaulted
 * context would silently price every item at era 1 with no discounts, which is
 * the exact class of omission #984 exists to remove.
 */
export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number,
  productionCost: ProductionCostContext,
  civType?: string,
  builtNationalProjectKeys?: Set<string>,
  unitCompletionBlocker?: (type: UnitType) => ProductionDropReason | null,
): CityProcessResult {
  const { era, completedTechs, availableResources } = productionCost;
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
  const legacyResourceGrace = new Set(city.legacyResourceGrace ?? []);
  const legacyTechGrace = Array.isArray(city.legacyTechGrace)
    ? city.legacyTechGrace.filter(item => item === 'cavalry' || item === 'knight')
    : [];
  const droppedProductionItems: DroppedProductionItem[] = [];

  // Drop queued items that are no longer available (tech lost, resource lost)
  if ((completedTechs.length > 0 || availableResources) && newQueue.length > 0) {
    const trainable = getTrainableUnitsForCiv(completedTechs, civType, availableResources);
    const trainableTypes = new Set([
      ...trainable.map(u => u.type),
      ...[...legacyResourceGrace].filter(item => TRAINABLE_UNITS.some(unit => unit.type === item)),
    ]);
    const legacyTechGraceCounts = new Map<UnitType, number>();
    for (const item of legacyTechGrace) {
      if (!TRAINABLE_UNITS.some(unit => unit.type === item)) continue;
      const type = item as UnitType;
      legacyTechGraceCounts.set(type, (legacyTechGraceCounts.get(type) ?? 0) + 1);
    }
    const BUILDING_IDS = new Set(Object.keys(BUILDINGS));
    const filtered = newQueue.filter(item => {
      if (item.startsWith('legendary:')) return true;
      if (BUILDING_IDS.has(item)) {
        const building = BUILDINGS[item];
        if (isBuildingObsolete(building, completedTechs)) {
          droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'obsoleted' });
          return false;
        }
        if (building.requiresBuildings?.some(required => !city.buildings.includes(required)) ?? false) {
          droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'no-longer-available' });
          return false;
        }
        if (building?.resourceRequired?.length && availableResources !== undefined && !legacyResourceGrace.has(item)) {
          if (!building.resourceRequired.every(r => availableResources!.has(r))) {
            droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'resource-lost' });
            return false;
          }
        }
        return true;
      }
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      if (unit && !trainableTypes.has(unit.type)) {
        const remainingGrace = legacyTechGraceCounts.get(unit.type) ?? 0;
        if (remainingGrace > 0) {
          legacyTechGraceCounts.set(unit.type, remainingGrace - 1);
          return true;
        }
        // Within one continuous session, a validly-queued unit's techRequired/civTypeRequired
        // can never later become false (completedTechs never shrinks; civType never changes) —
        // the only two dynamic reasons it can stop being trainable are obsoletedByTech firing or
        // a resource becoming unavailable. Check obsoleted first to match the building branch's
        // precedence above; both conditions can be true in the same turn (e.g. a tech completes
        // the same turn a resource is lost), so this order is the deterministic tie-breaker, not
        // a guess. A loaded save, however, can already hold a queue item that predates a
        // tech-tree rebalance — its techRequired can be unmet with neither of the two dynamic
        // reasons applying (see the musketeer save-compat test above) — so a third, honest
        // fallback reason covers that residual case instead of misreporting it as resource-lost.
        const obsoleted = isUnitObsolete(unit, completedTechs, availableResources);
        const resourceLost = !legacyResourceGrace.has(unit.type)
          && (unit.resourceRequired?.length ?? 0) > 0
          && availableResources !== undefined
          && !unit.resourceRequired!.every(r => availableResources.has(r));
        const reason: ProductionDropReason = obsoleted
          ? 'obsoleted'
          : resourceLost
            ? 'resource-lost'
            : 'no-longer-available';
        droppedProductionItems.push({ itemId: unit.type, itemKind: 'unit', reason });
        return false;
      }
      return trainableTypes.has(item as UnitType);
    });
    if (filtered.length !== newQueue.length) {
      newQueue.length = 0;
      newQueue.push(...filtered);
      if (filtered.length === 0) newProgress = 0;
    }
  }

  // Belt-and-suspenders: dequeue NPs outside their build window
  if (era > 1) {
    const beforeNP = newQueue.length;
    const filteredNP = newQueue.filter((item: string) => {
      const bldg = BUILDINGS[item];
      if (!bldg?.nationalProject) return true;
      const inWindow = era >= bldg.nationalProject.homeEra
        && (bldg.nationalProject.milestone || era <= bldg.nationalProject.homeEra + 1);
      if (!inWindow) {
        droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'build-window-expired' });
      }
      return inWindow;
    });
    if (filteredNP.length !== beforeNP) {
      newQueue.length = 0;
      newQueue.push(...filteredNP);
      if (filteredNP.length === 0) newProgress = 0;
    }
  }

  // Belt-and-suspenders: dequeue a uniquePerEmpire national project this civ already
  // completed in a different city (#1080). `builtNationalProjectKeys` was already computed
  // and passed in by the caller for `getAvailableBuildings`' candidate-exclusion check, but
  // was never consulted here — so a stale queue entry (most commonly a captured city that
  // inherited a queued item for something the capturing civ already finished elsewhere)
  // could keep accumulating production and eventually complete a second time.
  if (builtNationalProjectKeys && newQueue.length > 0) {
    const beforeDup = newQueue.length;
    const filteredDup = newQueue.filter((item: string) => {
      const bldg = BUILDINGS[item];
      if (!bldg?.nationalProject || !bldg.uniquePerEmpire) return true;
      const alreadyBuiltElsewhere = builtNationalProjectKeys.has(`${city.owner}:${item}`);
      if (alreadyBuiltElsewhere) {
        droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'already-built-elsewhere' });
      }
      return !alreadyBuiltElsewhere;
    });
    if (filteredDup.length !== beforeDup) {
      newQueue.length = 0;
      newQueue.push(...filteredDup);
      if (filteredDup.length === 0) newProgress = 0;
    }
  }

  // Coastal guard: drop the queue head BEFORE accumulating production so no yield is wasted.
  // A building with coastalRequired cannot be built in an inland city; if this city
  // lost coastal access (e.g. map-script edge case), remove the item silently.
  if (newQueue.length > 0) {
    const headBuilding = BUILDINGS[newQueue[0]];
    if (headBuilding?.coastalRequired && !isCityCoastal(city, map)) {
      const dropped = newQueue.shift()!;
      droppedProductionItems.push({ itemId: dropped, itemKind: 'building', reason: 'coastal-access-lost' });
      newProgress = 0;
    }
    const headUnit = TRAINABLE_UNITS.find(unit => unit.type === newQueue[0]);
    if (headUnit?.coastalRequired && !isCityCoastal(city, map)) {
      const dropped = newQueue.shift() as UnitType;
      droppedProductionItems.push({ itemId: dropped, itemKind: 'unit', reason: 'coastal-access-lost' });
      newProgress = 0;
    } else if (headUnit?.trainedFromBuilding && !(city.buildings ?? []).includes(headUnit.trainedFromBuilding)) {
      const dropped = newQueue.shift() as UnitType;
      droppedProductionItems.push({ itemId: dropped, itemKind: 'unit', reason: 'training-building-missing' });
      newProgress = 0;
    } else if (headUnit) {
      const blocker = unitCompletionBlocker?.(headUnit.type);
      if (blocker) {
        const dropped = newQueue.shift() as UnitType;
        droppedProductionItems.push({ itemId: dropped, itemKind: 'unit', reason: blocker });
        newProgress = 0;
      }
    }
  }

  if (newQueue.length > 0) {
    newProgress += productionYield;
    const currentItem = newQueue[0];

    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const currentItemCost = getProductionCostForItem(currentItem, { ...productionCost, city });
    if ((BUILDINGS[currentItem] || unitDef) && newProgress >= currentItemCost) {
      const completion = completeCityProductionItem(
        { ...city, productionQueue: newQueue, productionProgress: newProgress, buildings: newBuildings },
        currentItem,
        { cost: currentItemCost, completedTechs },
      );
      newQueue.length = 0;
      newQueue.push(...completion.city.productionQueue);
      newBuildings.length = 0;
      newBuildings.push(...completion.city.buildings);
      newProgress = completion.city.productionProgress;
      legacyResourceGrace.delete(currentItem);
      const graceIndex = (currentItem === 'cavalry' || currentItem === 'knight')
        ? legacyTechGrace.indexOf(currentItem)
        : -1;
      if (graceIndex >= 0) legacyTechGrace.splice(graceIndex, 1);
      completedBuilding = completion.completedBuilding;
      completedUnit = completion.completedUnit;
    }
  }

  let idleGoldBonus = 0;
  let idleScienceBonus = 0;
  if (city.productionQueue.length === 0 && city.idleProduction) {
    if (city.idleProduction === 'gold') {
      idleGoldBonus = productionYield;
    } else if (city.idleProduction === 'science') {
      idleScienceBonus = productionYield;
    }
  }

  let nextCity: City = {
    ...city,
    food: newFood,
    foodNeeded: newFoodNeeded,
    population: newPop,
    productionProgress: newProgress,
    productionQueue: newQueue,
    buildings: newBuildings,
    ...(legacyResourceGrace.size > 0 ? { legacyResourceGrace: [...legacyResourceGrace] } : { legacyResourceGrace: undefined }),
    ...(legacyTechGrace.length > 0 ? { legacyTechGrace } : { legacyTechGrace: undefined }),
  };

  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
    idleGoldBonus,
    idleScienceBonus,
    droppedProductionItems,
  };
}
