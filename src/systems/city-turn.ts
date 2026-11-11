import type { City, CivBonusEffect, DroppedProductionItem, GameMap, ProductionDropReason, UnitType } from '@/core/types';
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
/**
 * #1407: where one city's production went this turn, measured at the source (`processCity`), never reconstructed from
 * end-of-round state. Ephemeral -- reported to the round bus, never persisted. Conservation:
 * `produced = appliedToBuild + carriedOver + convertedGold + convertedScience + discarded` (all integers).
 *  - appliedToBuild: added to the queue head's progress (incl. an item queued and completed in the same turn).
 *  - carriedOver: this turn's output beyond a completed item's cost, kept as the next item's starting progress
 *    (`resolveCompletionCarry`, #1426). Since the kept amount is capped at this turn's output, all of it carries.
 *  - convertedGold / convertedScience: credited by `City.idleProduction` on an empty queue.
 *  - discarded: output that reached no sink -- an empty queue with no conversion mode, a queue whose every item was
 *    dequeued this turn, or a head waiting for materials.
 * A zero-yield city reports all zeros. Output suppressed by an unrest lock is zeroed by the caller before
 * `processCity` and is reported separately by the caller as `suppressedByLock`, not as discarded.
 *
 * `forfeitedStored` / `forfeitedGold` sit OUTSIDE the equation: they describe progress stored before this turn that
 * the one-turn carry cap removed at a completion, and the 3D Printing gold paid for it.
 */
export interface ProductionDisposition {
  produced: number;
  appliedToBuild: number;
  carriedOver: number;
  convertedGold: number;
  convertedScience: number;
  discarded: number;
  /**
   * #1506 MR09: the active hard recipe was not fully held, so this round's output was withheld —
   * it is counted in `discarded` and never applied, carried or converted. A separate reason flag so
   * the projection can say *why* without changing the conservation equation.
   */
  withheldByMaterials: boolean;
  /** Stored progress above the one-turn carry cap, removed when an item completed this turn (#1426). */
  forfeitedStored: number;
  /** Gold 3D Printing paid for `forfeitedStored` (also returned as `CityProcessResult.forfeitGoldBonus`). */
  forfeitedGold: number;
}

export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
  idleGoldBonus: number;
  idleScienceBonus: number;
  /** #1426: gold from forfeited stored progress (3D Printing). The caller credits it like `idleGoldBonus`. */
  forfeitGoldBonus: number;
  /** Every unit/building silently dequeued this turn, with why. Empty when nothing dropped. */
  droppedProductionItems: DroppedProductionItem[];
  production: ProductionDisposition;
}

export interface CityProductionCompletionResult {
  city: City;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
  /** What the completion kept and forfeited; all zeros when nothing completed. */
  carry: CompletionCarry;
}

export interface CompleteCityProductionItemOptions {
  /** Production cost of the completed item. Without it nothing carries (a purchase pays exactly what remains). */
  cost?: number;
  /** The city's production this turn: the cap on what a completion may keep (#1426). */
  productionThisTurn?: number;
  /** civ.techState.completed — read for 3D Printing's forfeited-production gold. */
  completedTechs?: readonly string[];
}

/** #1426: the technology that turns forfeited stored production into gold, and the rate it pays. */
export const FORFEITED_PRODUCTION_GOLD_TECH = '3d-printing';
export const FORFEITED_PRODUCTION_GOLD_RATE = 0.25;

export interface CompletionCarry {
  /** Becomes the city's stored progress: the next item's start, whether it is queued now or chosen later. */
  kept: number;
  /** Leftover above the one-turn cap; it is lost (it can only be progress stored before this turn). */
  forfeited: number;
  /** `floor(forfeited × FORFEITED_PRODUCTION_GOLD_RATE)` with 3D Printing, else 0. */
  forfeitedGold: number;
}

/**
 * #1426: the one statement of what survives a completion, for every civilization. The leftover beyond the finished
 * item's cost becomes the next item's starting progress, capped at the city's production this turn (one turn's
 * worth), so stored production can never bank up across turns. A city still completes at most one item per turn.
 * Exported so the player-facing production preview reads the rule instead of restating it.
 */
export function resolveCompletionCarry(
  leftover: number,
  productionThisTurn: number,
  completedTechs: readonly string[] | undefined,
): CompletionCarry {
  const surplus = Math.max(0, leftover);
  const kept = Math.min(surplus, Math.max(0, productionThisTurn));
  const forfeited = surplus - kept;
  const forfeitedGold = completedTechs?.includes(FORFEITED_PRODUCTION_GOLD_TECH)
    ? Math.floor(forfeited * FORFEITED_PRODUCTION_GOLD_RATE)
    : 0;
  return { kept, forfeited, forfeitedGold };
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
    return { city, completedBuilding, completedUnit, carry: { kept: 0, forfeited: 0, forfeitedGold: 0 } };
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

  // #1426: the leftover is kept for whatever is built next, queued or not, capped at one turn's output.
  const carry = options.cost !== undefined
    ? resolveCompletionCarry(city.productionProgress - options.cost, options.productionThisTurn ?? 0, options.completedTechs)
    : { kept: 0, forfeited: 0, forfeitedGold: 0 };

  let nextCity: City = {
    ...city,
    productionQueue: newQueue,
    productionProgress: carry.kept,
    buildings: newBuildings,
  };

  return {
    carry,
    city: nextCity,
    completedBuilding,
    completedUnit,
  };
}

/**
 * The food a city must bank to grow. India "Subcontinent" (#1692 A9) needs less; `city.foodNeeded` stays the
 * unreduced base so a captured city simply uses its new owner's rule.
 */
export function getCityGrowthThreshold(city: Pick<City, 'foodNeeded'>, bonusEffect: CivBonusEffect | undefined): number {
  if (bonusEffect?.type !== 'faster_growth') return city.foodNeeded;
  return Math.max(1, Math.floor(city.foodNeeded * bonusEffect.foodReduction));
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
  /** #1506 MR09: whether the active item's full hard recipe is held. `true` preserves the old behavior. */
  materialReady = true,
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

  const growthThreshold = getCityGrowthThreshold(city, productionCost.bonusEffect);
  if (newFood >= growthThreshold) {
    newPop++;
    newFood -= growthThreshold;
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
        // the only remaining dynamic reason it can stop being trainable is obsoletedByTech firing.
        // A loaded save, however, can already hold a queue item that predates a tech-tree rebalance —
        // its techRequired can be unmet with no dynamic reason applying (see the musketeer save-compat
        // test above) — so the honest fallback covers that residual case. Hard material access is no
        // longer a dequeue reason (#1506 MR09): unfunded work waits with its progress intact.
        const obsoleted = isUnitObsolete(unit, completedTechs, availableResources);
        const reason: ProductionDropReason = obsoleted ? 'obsoleted' : 'no-longer-available';
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

  let appliedToBuild = 0;
  let carriedOver = 0;
  let overflowDiscarded = 0;
  let forfeitedStored = 0;
  let forfeitGoldBonus = 0;
  let withheldByMaterials = false;
  if (newQueue.length > 0 && !materialReady) {
    // Waiting for materials keeps the item, its queue position and its stored progress. This round's
    // output reaches no sink: it is withheld (the conservation equation's `discarded`), never applied,
    // carried over or converted. Growth and every non-production yield already ran above.
    withheldByMaterials = true;
  } else if (newQueue.length > 0) {
    newProgress += productionYield;
    appliedToBuild = productionYield;
    const currentItem = newQueue[0];

    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const currentItemCost = getProductionCostForItem(currentItem, { ...productionCost, city });
    if ((BUILDINGS[currentItem] || unitDef) && newProgress >= currentItemCost) {
      const completion = completeCityProductionItem(
        { ...city, productionQueue: newQueue, productionProgress: newProgress, buildings: newBuildings },
        currentItem,
        { cost: currentItemCost, productionThisTurn: productionYield, completedTechs },
      );
      // Only this turn's output can be "overflow": whatever sat above the cost beyond it was stored earlier. The
      // one-turn cap keeps at least this turn's excess, so it all carries; stored progress above the cap is forfeited.
      const excessThisTurn = Math.min(productionYield, Math.max(0, newProgress - currentItemCost));
      carriedOver = Math.min(excessThisTurn, completion.carry.kept);
      overflowDiscarded = excessThisTurn - carriedOver;
      forfeitedStored = completion.carry.forfeited;
      forfeitGoldBonus = completion.carry.forfeitedGold;
      appliedToBuild = productionYield - excessThisTurn;
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

  const converted = idleGoldBonus + idleScienceBonus;
  const unsunk = productionYield - appliedToBuild - carriedOver - overflowDiscarded - converted;
  const production: ProductionDisposition = {
    produced: productionYield,
    appliedToBuild,
    carriedOver,
    convertedGold: idleGoldBonus,
    convertedScience: idleScienceBonus,
    discarded: overflowDiscarded + Math.max(0, unsunk),
    withheldByMaterials,
    forfeitedStored,
    forfeitedGold: forfeitGoldBonus,
  };

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
    forfeitGoldBonus,
    droppedProductionItems,
    production,
  };
}
