import type { Unit, UnitType, City, GameState, ResourceType } from '@/core/types';
import { TRAINABLE_UNITS, getCatalogProductionCost } from './city-system';
import { getCivAvailableResources } from './resource-acquisition-system';

export function getUpgradeCost(targetType: UnitType): number {
  const cost = getCatalogProductionCost(targetType, 1);
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
      return { canUpgrade: false, targetType: null, cost: getUpgradeCost(targetInPrinciple), reason: 'missing-building' };
    }
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const cost = getUpgradeCost(targetType);
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

// Returns a new Unit with the upgraded type, full health, and action consumed.
// Caller is responsible for deducting civ.gold by getUpgradeCost(targetType).
export function applyUpgrade(unit: Unit, targetType: UnitType): Unit {
  return {
    ...unit,
    type: targetType,
    health: 100,
    movementPointsLeft: 0,
    hasActed: true,
  };
}

export interface ApplyUnitUpgradeToStateResult {
  state: GameState;
  upgraded: boolean;
  reason?: string;
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
  const city = civ.cities
    .map(cityId => state.cities[cityId])
    .filter((candidate): candidate is City => Boolean(candidate))
    .sort((left, right) => left.id.localeCompare(right.id))
    .find(candidate =>
      candidate.owner === unit.owner
      && candidate.position.q === unit.position.q
      && candidate.position.r === unit.position.r);
  if (!city) {
    return { state, upgraded: false, reason: 'not-in-friendly-city' };
  }
  const canonicalTarget = getCanonicalUpgradeTarget(
    unit,
    civ.techState.completed,
    city.buildings,
    getCivAvailableResources(state, unit.owner),
  );
  if (!canonicalTarget) {
    return { state, upgraded: false, reason: 'tech-unavailable' };
  }
  if (canonicalTarget !== targetType) {
    return { state, upgraded: false, reason: 'invalid-target' };
  }
  const cost = getUpgradeCost(targetType);
  if (civ.gold < cost) {
    return { state, upgraded: false, reason: 'insufficient-gold' };
  }
  const next = structuredClone(state);
  next.civilizations[unit.owner] = {
    ...next.civilizations[unit.owner],
    gold: next.civilizations[unit.owner].gold - cost,
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
