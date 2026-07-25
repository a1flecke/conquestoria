import type { Unit, UnitType, City, GameState, ResourceType, TrainableUnitEntry } from '@/core/types';
import { TRAINABLE_UNITS, getProductionCostForItem } from './city-system';
import { getCivAvailableResources } from './resource-acquisition-system';

export type UpgradeMissingRequirement =
  | { kind: 'friendly-city' }
  | { kind: 'technology'; techId: string }
  | { kind: 'building'; buildingId: string }
  | { kind: 'resource'; resource: ResourceType }
  | { kind: 'gold'; required: number; available: number }
  | { kind: 'action-already-spent' }
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
  const cost = getUpgradeCost(target.type, resources);
  const missing: UpgradeMissingRequirement[] = [];
  if (!city) missing.push({ kind: 'friendly-city' });
  if (source.obsoletedByTech && !civ?.techState.completed.includes(source.obsoletedByTech)) {
    missing.push({ kind: 'technology', techId: source.obsoletedByTech });
  }
  if (target.techRequired && !civ?.techState.completed.includes(target.techRequired)) {
    missing.push({ kind: 'technology', techId: target.techRequired });
  }
  if (target.trainedFromBuilding && !city?.buildings.includes(target.trainedFromBuilding)) {
    missing.push({ kind: 'building', buildingId: target.trainedFromBuilding });
  }
  for (const resource of target.resourceRequired ?? []) {
    if (!resources.has(resource)) missing.push({ kind: 'resource', resource });
  }
  if (!civ || civ.gold < cost) {
    missing.push({ kind: 'gold', required: cost, available: civ?.gold ?? 0 });
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

export function getUpgradeCost(targetType: UnitType, availableResources?: ReadonlySet<ResourceType>): number {
  const cost = getProductionCostForItem(targetType, { availableResources });
  return cost > 0 ? Math.ceil(cost * 0.5) : 0;
}

export function canUpgradeUnit(
  unit: Unit,
  cityId: string,
  cities: Record<string, City>,
  completedTechs: string[],
  civGold?: number,
  availableResources?: Set<ResourceType>,
): { canUpgrade: boolean; targetType: UnitType | null; cost: number; reason?: 'missing-building' } {
  const city = cities[cityId];
  if (!city || city.owner !== unit.owner) return { canUpgrade: false, targetType: null, cost: 0 };
  if (unit.position.q !== city.position.q || unit.position.r !== city.position.r) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const targetType = getCanonicalUpgradeTarget(unit, completedTechs, city.buildings, availableResources);
  if (!targetType) {
    const targetInPrinciple = getCanonicalUpgradeTarget(unit, completedTechs, undefined, availableResources);
    if (targetInPrinciple) {
      return { canUpgrade: false, targetType: null, cost: getUpgradeCost(targetInPrinciple, availableResources), reason: 'missing-building' };
    }
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const cost = getUpgradeCost(targetType, availableResources);
  if (civGold !== undefined && civGold < cost) return { canUpgrade: false, targetType: null, cost };
  return { canUpgrade: true, targetType, cost };
}

export function getCanonicalUpgradeTarget(
  unit: Unit,
  completedTechs: readonly string[],
  cityBuildings?: readonly string[],
  availableResources?: Set<ResourceType>,
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
    || (target.techRequired && !completedTechs.includes(target.techRequired))
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

// Returns a new Unit with the upgraded type and action consumed.
// Caller is responsible for deducting civ.gold by getUpgradeCost(targetType).
export function applyUpgrade(unit: Unit, targetType: UnitType): Unit {
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
  next.civilizations[unit.owner] = {
    ...next.civilizations[unit.owner],
    gold: next.civilizations[unit.owner].gold - evaluation.cost,
  };
  next.units[unitId] = applyUpgrade(next.units[unitId], targetType);
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
