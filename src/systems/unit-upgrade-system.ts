import type { Unit, UnitType, City, GameState, ResourceType, TrainableUnitEntry } from '@/core/types';
import type { TradeGoodId } from '@/core/types/commerce';
import type { ReserveLedger } from '@/core/types/commerce';
import { createEmptyReserveLedger } from './resource-reserve-system';
import { TRAINABLE_UNITS } from './city-system';
import {
  buildProductionCostContext,
  getContextualProductionCost,
  type ProductionCostContext,
} from './production-cost-context';
import { getCivAvailableResources } from './resource-acquisition-system';
import { baseNewAirUnit, canCompleteAirUnitProduction } from './air-operations-system';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { evaluateProductionPrerequisites } from './production-prerequisites';
import {
  aggregateMaterialRows,
  consumeMaterialRecipe,
  evaluateMaterialFunding,
  getMaterialRecipe,
  type MaterialFundingRow,
} from './resource-material-costs';
import { getCivMaterialLedger } from './resource-material-state';
import { selectSoftMaterialTerms } from './soft-material-terms';

export type UpgradeMissingRequirement =
  | { kind: 'friendly-city' }
  | { kind: 'technology'; techId: string }
  | { kind: 'building'; buildingId: string }
  | { kind: 'resource'; resource: ResourceType }
  | { kind: 'material'; goodId: TradeGoodId; required: number; available: number; missing: number }
  | { kind: 'gold'; required: number; available: number }
  | { kind: 'action-already-spent' }
  | { kind: 'air-base'; reason: 'base-missing' | 'incompatible-base' | 'base-full' }
  | { kind: 'invalid-target' };

export interface UpgradeEvaluation {
  canUpgrade: boolean;
  sourceType: UnitType;
  targetType: UnitType | null;
  cost: number;
  cityId: string | null;
  preserved: {
    health: number;
    experience: number;
    movementPointsLeft: 0;
    hasActed: true;
  };
  missing: UpgradeMissingRequirement[];
}

function findFriendlyHostCity(state: GameState, unit: Unit): City | undefined {
  return Object.values(state.cities)
    .filter(city => city.owner === unit.owner)
    .sort((left, right) => left.id.localeCompare(right.id))
    .find(city => city.position.q === unit.position.q && city.position.r === unit.position.r);
}

export function evaluateUnitUpgrade(
  state: GameState,
  unitId: string,
  requestedTarget: UnitType,
  definitions: readonly TrainableUnitEntry[] = TRAINABLE_UNITS,
): UpgradeEvaluation {
  const unit = state.units[unitId];
  const fallback = {
    canUpgrade: false,
    sourceType: unit?.type ?? requestedTarget,
    targetType: null,
    cost: 0,
    cityId: null,
    preserved: {
      health: unit?.health ?? 0,
      experience: unit?.experience ?? 0,
      movementPointsLeft: 0 as const,
      hasActed: true as const,
    },
  };
  if (!unit) return { ...fallback, missing: [{ kind: 'invalid-target' }] };

  const source = definitions.find(candidate => candidate.type === unit.type);
  const target = source?.upgradesTo === requestedTarget
    ? definitions.find(candidate => candidate.type === requestedTarget)
    : undefined;
  if (!source || !target) return { ...fallback, missing: [{ kind: 'invalid-target' }] };

  const civ = state.civilizations[unit.owner];
  const city = findFriendlyHostCity(state, unit);
  const resources = getCivAvailableResources(state, unit.owner);
  // #1507 MR10: the upgrade is an immediate purchase, so it selects its finite soft term now and
  // prices with that exact snapshot; without enough stock the normal cost applies.
  const softTerms = selectSoftMaterialTerms(state, unit.owner, target.type);
  const baseContext = buildProductionCostContext(state, unit.owner, city?.id ?? null);
  const cost = getUpgradeCost(target.type, {
    ...baseContext,
    activeItemId: target.type,
    activeSoftDiscount: softTerms.multiplier,
  });
  const missing: UpgradeMissingRequirement[] = [];
  if (!city) missing.push({ kind: 'friendly-city' });
  if (source.obsoletedByTech && !civ?.techState.completed.includes(source.obsoletedByTech)) {
    missing.push({ kind: 'technology', techId: source.obsoletedByTech });
  }
  for (const techId of evaluateProductionPrerequisites(target, civ?.techState.completed ?? []).missing) {
    if (!missing.some(requirement => requirement.kind === 'technology' && requirement.techId === techId)) {
      missing.push({ kind: 'technology', techId });
    }
  }
  if (target.trainedFromBuilding && !city?.buildings.includes(target.trainedFromBuilding)) {
    missing.push({ kind: 'building', buildingId: target.trainedFromBuilding });
  }
  for (const resource of target.resourceRequired ?? []) {
    if (!resources.has(resource)) missing.push({ kind: 'resource', resource });
  }
  // #1506 MR09: the upgrade pays the target's full recipe. Report exact missing rows rather than
  // collapsing a material shortage into a generic tech failure. Soft rows join the hard recipe
  // only when their finite allotment could be selected.
  const ledger = getCivMaterialLedger(state, unit.owner);
  const recipe = getMaterialRecipe(target.type);
  const requiredRows = aggregateMaterialRows([
    ...(recipe.known ? recipe.recipe.rows : []),
    ...softTerms.rows,
  ]);
  if (requiredRows.length > 0) {
    const funding = evaluateMaterialFunding(ledger, {
      itemId: target.type,
      kind: recipe.known ? recipe.recipe.kind : 'unit',
      rows: requiredRows,
    });
    for (const row of funding.rows) {
      if (row.missing > 0) {
        missing.push({
          kind: 'material',
          goodId: row.goodId,
          required: row.required,
          available: row.available,
          missing: row.missing,
        });
      }
    }
  }
  if (!civ || civ.gold < cost) {
    missing.push({ kind: 'gold', required: cost, available: civ?.gold ?? 0 });
  }
  if (city && UNIT_DEFINITIONS[target.type].airOperation) {
    const airBase = canCompleteAirUnitProduction(state, city.id, target.type);
    if (!airBase.ok && airBase.reason !== 'not-based-aircraft') {
      missing.push({ kind: 'air-base', reason: airBase.reason });
    }
  }
  if (unit.hasActed) missing.push({ kind: 'action-already-spent' });

  return {
    canUpgrade: missing.length === 0,
    sourceType: unit.type,
    targetType: target.type,
    cost,
    cityId: city?.id ?? null,
    preserved: {
      health: unit.health,
      experience: unit.experience,
      movementPointsLeft: 0,
      hasActed: true,
    },
    missing,
  };
}

export const UPGRADE_COST_FRACTION = 0.5;

/**
 * An upgrade costs half of what training the target unit would cost the owning
 * civilization right now -- so it must be priced from that civilization's full
 * production context (#984), not from a bare resource set. Before #984 this
 * omitted the host city, the completed techs, the civ bonus, active national
 * projects and the era, which defaulted to 1; a ballista -> cannon upgrade
 * ignored the Cannon Casting discount the same civ already gets when training
 * a cannon outright.
 */
export function getUpgradeCost(targetType: UnitType, context: ProductionCostContext): number {
  const cost = getContextualProductionCost(targetType, context);
  return cost > 0 ? Math.ceil(cost * UPGRADE_COST_FRACTION) : 0;
}

/**
 * The city panel's "Upgradeable Units" list. Takes the owning civilization's
 * `ProductionCostContext` rather than a hand-picked set of civ fields, so the
 * cost it quotes is built exactly the way `evaluateUnitUpgrade` -- the path
 * that actually charges the player -- builds it (#984). The two used to price
 * upgrades independently and would have drifted the moment either gained a
 * modifier the other lacked.
 */
export function canUpgradeUnit(
  unit: Unit,
  cityId: string,
  cities: Record<string, City>,
  productionCost: ProductionCostContext,
  civGold?: number,
  materialLedger?: ReserveLedger,
): {
  canUpgrade: boolean;
  targetType: UnitType | null;
  cost: number;
  reason?: 'missing-building' | 'missing-materials';
  missingMaterials: readonly MaterialFundingRow[];
} {
  const city = cities[cityId];
  if (!city || city.owner !== unit.owner) return { canUpgrade: false, targetType: null, cost: 0, missingMaterials: [] };
  if (unit.position.q !== city.position.q || unit.position.r !== city.position.r) {
    return { canUpgrade: false, targetType: null, cost: 0, missingMaterials: [] };
  }
  // #984: eligibility and price read the same context, so the techs that decide
  // *whether* a unit upgrades can never disagree with the techs that decide what
  // the upgrade costs.
  const { completedTechs, availableResources } = productionCost;
  const hostContext: ProductionCostContext = { ...productionCost, city };
  const targetType = getCanonicalUpgradeTarget(unit, completedTechs, city.buildings, availableResources);
  if (!targetType) {
    const targetInPrinciple = getCanonicalUpgradeTarget(unit, completedTechs, undefined, availableResources);
    if (targetInPrinciple) {
      return { canUpgrade: false, targetType: null, cost: getUpgradeCost(targetInPrinciple, hostContext), reason: 'missing-building', missingMaterials: [] };
    }
    return { canUpgrade: false, targetType: null, cost: 0, missingMaterials: [] };
  }
  const cost = getUpgradeCost(targetType, hostContext);
  // #1506 MR09: an upgrade pays the target's full recipe; carry the exact shortage so the panel
  // can explain it instead of hiding the row or calling it a tech problem.
  const recipe = getMaterialRecipe(targetType);
  const missingMaterials = recipe.known && recipe.recipe.rows.length > 0
    ? evaluateMaterialFunding(materialLedger ?? createEmptyReserveLedger(), recipe.recipe).rows.filter(row => row.missing > 0)
    : [];
  if (missingMaterials.length > 0) {
    return { canUpgrade: false, targetType, cost, reason: 'missing-materials', missingMaterials };
  }
  if (civGold !== undefined && civGold < cost) return { canUpgrade: false, targetType: null, cost, missingMaterials: [] };
  return { canUpgrade: true, targetType, cost, missingMaterials: [] };
}

export function getCanonicalUpgradeTarget(
  unit: Unit,
  completedTechs: readonly string[],
  cityBuildings?: readonly string[],
  availableResources?: ReadonlySet<ResourceType>,
): UnitType | null {
  const currentEntry = TRAINABLE_UNITS.find(candidate => candidate.type === unit.type);
  if (
    !currentEntry?.obsoletedByTech
    || !currentEntry.upgradesTo
    || !completedTechs.includes(currentEntry.obsoletedByTech)
  ) {
    return null;
  }
  const target = TRAINABLE_UNITS.find(candidate =>
    candidate.type === currentEntry.upgradesTo);
  if (
    !target
    || evaluateProductionPrerequisites(target, completedTechs).missing.length > 0
    || (
      target.obsoletedByTech
      && completedTechs.includes(target.obsoletedByTech)
    )
  ) {
    return null;
  }
  if (target.trainedFromBuilding && cityBuildings && !cityBuildings.includes(target.trainedFromBuilding)) {
    return null;
  }
  if (
    target.resourceRequired?.length
    && availableResources
    && !target.resourceRequired.every(resource => availableResources.has(resource))
  ) {
    return null;
  }
  return target.type;
}

// Returns a new Unit with the upgraded type and action consumed. NOT exported (#1014): it
// does not take the gold, and it used to be an exported function whose comment asked the caller
// to deduct `getUpgradeCost(targetType)` itself. `applyUnitUpgradeToState` is the one command
// that validates, pays and upgrades together.
function applyUpgrade(unit: Unit, targetType: UnitType): Unit {
  return {
    ...unit,
    type: targetType,
    movementPointsLeft: 0,
    hasActed: true,
  };
}

export interface ApplyUnitUpgradeToStateResult {
  state: GameState;
  upgraded: boolean;
  reason?: string;
}

function upgradeFailureReason(evaluation: UpgradeEvaluation): string {
  const first = evaluation.missing[0]?.kind;
  if (first === 'material') return 'missing-materials';
  if (first === 'building' || first === 'technology' || first === 'resource') return 'tech-unavailable';
  if (first === 'gold') return 'insufficient-gold';
  if (first === 'friendly-city') return 'not-in-friendly-city';
  return first ?? 'tech-unavailable';
}

export function applyUnitUpgradeToState(
  state: GameState,
  unitId: string,
  targetType: UnitType,
): ApplyUnitUpgradeToStateResult {
  const unit = state.units[unitId];
  if (!unit) return { state, upgraded: false, reason: 'invalid-unit' };
  const civ = state.civilizations[unit.owner];
  if (!civ) return { state, upgraded: false, reason: 'invalid-owner' };
  const city = findFriendlyHostCity(state, unit);
  if (!city) {
    return { state, upgraded: false, reason: 'not-in-friendly-city' };
  }
  const evaluation = evaluateUnitUpgrade(state, unitId, targetType);
  if (evaluation.targetType !== targetType) return { state, upgraded: false, reason: 'invalid-target' };
  if (!evaluation.canUpgrade) return { state, upgraded: false, reason: upgradeFailureReason(evaluation) };
  const next = structuredClone(state);
  // #1506 MR09: spend the target's full recipe on the candidate before gold and placement. A
  // refusal returns the original state, so a failed upgrade consumes neither gold nor materials.
  // #1507 MR10: a selected soft term is part of that same atomic spend.
  const recipe = getMaterialRecipe(targetType);
  const softTerms = selectSoftMaterialTerms(state, unit.owner, targetType);
  const rows = aggregateMaterialRows([
    ...(recipe.known ? recipe.recipe.rows : []),
    ...softTerms.rows,
  ]);
  if (rows.length > 0) {
    const ledger = getCivMaterialLedger(next, unit.owner);
    const spent = consumeMaterialRecipe(ledger, {
      itemId: targetType,
      kind: recipe.known ? recipe.recipe.kind : 'unit',
      rows,
    });
    if (!spent.ok) return { state, upgraded: false, reason: 'missing-materials' };
    next.materialReservesByCiv = { ...(next.materialReservesByCiv ?? {}), [unit.owner]: spent.ledger };
  }
  next.civilizations[unit.owner] = {
    ...next.civilizations[unit.owner],
    gold: next.civilizations[unit.owner].gold - evaluation.cost,
  };
  next.units[unitId] = applyUpgrade(next.units[unitId], targetType);
  if (UNIT_DEFINITIONS[targetType].airOperation) {
    const based = baseNewAirUnit(next, city.id, next.units[unitId]);
    if (!based.ok) return { state, upgraded: false, reason: based.reason };
    Object.assign(next, based.state);
  }
  const espionage = next.espionage?.[unit.owner];
  if (espionage?.spies[unitId]) {
    next.espionage![unit.owner] = {
      ...espionage,
      spies: {
        ...espionage.spies,
        [unitId]: {
          ...espionage.spies[unitId],
          unitType: targetType,
        },
      },
    };
  }
  return { state: next, upgraded: true };
}
