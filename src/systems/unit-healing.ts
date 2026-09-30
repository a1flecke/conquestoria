import type { Unit } from '@/core/types';

/**
 * Unit healing and resting (#1010). A pure leaf (types only).
 *
 * The inputs are deliberately plain booleans the CALLER derives
 * (`inFriendlyCity`, `inFriendlyTerritory`): "friendly" here means the civ's OWN
 * tile/city (`turn-manager.ts`: `tile.owner === civId`), never "a place this unit
 * may legally stand". Passage (`territorial-access.ts`, #871) and support (#870)
 * are different questions -- alliance or Open Borders land is NOT friendly for
 * healing, and this module must never import a treaty or territory reader
 * (pinned by `tests/app/architecture-boundaries.test.ts`).
 */

// --- Healing constants ---
export const HEAL_PASSIVE = 5;    // HP/turn when idle (didn't move or act)
export const HEAL_RESTING = 15;   // HP/turn when player explicitly rests
export const HEAL_IN_CITY = 20;   // HP/turn when in a friendly city
export const HEAL_IN_TERRITORY = 10; // HP/turn when in friendly territory

export function canHeal(unit: Unit): boolean {
  return unit.health < 100;
}

export function healUnit(
  unit: Unit,
  inFriendlyCity: boolean,
  inFriendlyTerritory: boolean,
  bonus?: { flat: number; mult: number },
): Unit {
  if (unit.health >= 100) return unit;

  let healAmount: number;
  if (inFriendlyCity) {
    healAmount = HEAL_IN_CITY;
  } else if (unit.isResting) {
    healAmount = HEAL_RESTING;
  } else if (inFriendlyTerritory) {
    healAmount = HEAL_IN_TERRITORY;
  } else if (!unit.hasMoved && !unit.hasActed) {
    healAmount = HEAL_PASSIVE;
  } else {
    return unit; // moved or acted without resting — no heal
  }

  if (bonus) {
    // Flat tech/NP bonuses stack first; the single multiplier (mindfulness-movement) applies last.
    healAmount = Math.round((healAmount + bonus.flat) * bonus.mult);
  }

  return { ...unit, health: Math.min(100, unit.health + healAmount) };
}

export function restUnit(unit: Unit): Unit {
  return {
    ...unit,
    isResting: true,
    hasActed: true,   // resting uses the action for the turn
    movementPointsLeft: 0,
  };
}
