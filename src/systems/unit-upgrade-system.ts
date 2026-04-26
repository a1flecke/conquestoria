import type { Unit, UnitType, City } from '@/core/types';
import { TRAINABLE_UNITS } from './city-system';
import { UNIT_DEFINITIONS } from './unit-system';

export function getUpgradeCost(targetType: UnitType): number {
  const entry = TRAINABLE_UNITS.find(u => u.type === targetType);
  return entry ? Math.ceil(entry.cost * 0.5) : 0;
}

export function canUpgradeUnit(
  unit: Unit,
  cityId: string,
  cities: Record<string, City>,
  completedTechs: string[],
): { canUpgrade: boolean; targetType: UnitType | null; cost: number } {
  const city = cities[cityId];
  if (!city || city.owner !== unit.owner) return { canUpgrade: false, targetType: null, cost: 0 };
  if (unit.position.q !== city.position.q || unit.position.r !== city.position.r) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const currentEntry = TRAINABLE_UNITS.find(u => u.type === unit.type);
  if (!currentEntry?.obsoletedByTech || !completedTechs.includes(currentEntry.obsoletedByTech)) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  // Find next unit in this upgrade chain: requires the same tech that obsoleted us,
  // and is not itself already obsoleted by a further tech.
  const nextEntry = TRAINABLE_UNITS.find(u =>
    u.techRequired === currentEntry.obsoletedByTech &&
    (!u.obsoletedByTech || !completedTechs.includes(u.obsoletedByTech))
  );
  if (!nextEntry) return { canUpgrade: false, targetType: null, cost: 0 };
  return { canUpgrade: true, targetType: nextEntry.type, cost: getUpgradeCost(nextEntry.type) };
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
