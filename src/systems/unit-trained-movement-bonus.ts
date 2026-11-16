import type { GameState, Unit, UnitType } from '@/core/types';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { getCreationMovementBonus } from '@/systems/unit-lifecycle';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';

/**
 * The persistent `Unit.movementBonus` a unit of `unitType` trained by `civId` right now is given: the creation
 * bonus plus the owner's naval wonder and tech, Mongolia's mounted bonus and the air tech. One definition for
 * production (`completeUnitProduction`) and for an in-place upgrade, which changes the type the bonus depends on.
 */
export function getTrainedMovementBonus(state: GameState, civId: string, unitType: UnitType): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;
  const bonusEffect = resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect;
  const domain = UNIT_DEFINITIONS[unitType]?.domain;
  const completed = civ.techState?.completed ?? [];
  let bonus = getCreationMovementBonus(unitType, bonusEffect);
  if (domain === 'naval') {
    if (state.completedLegendaryWonders?.['navigators-compass']?.ownerId === civId) bonus += 1;
    if (completed.includes('trade-winds')) bonus += 1;
  }
  // Mongolia "Horse Lords" / the custom Expansionist trait (#1692 A2).
  if (bonusEffect?.type === 'mounted_movement' && UNIT_CLASS_BY_TYPE[unitType].includes('mounted')) {
    bonus += bonusEffect.bonus;
  }
  if (domain === 'air' && completed.includes('private-spaceflight')) bonus += 1;
  return bonus;
}

/**
 * `unit` handed to `ownerId` (a capture, a secession, a reabsorption), optionally as another type: the bonus is
 * the new owner's for that type, since every source of it (civ trait, wonder, tech) belongs to an owner. An owner
 * with no civilization record keeps the unit's bonus as it was.
 */
export function withNewOwner(state: GameState, unit: Unit, ownerId: string, type: UnitType = unit.type): Unit {
  if (!state.civilizations[ownerId]) return { ...unit, owner: ownerId, type };
  const movementBonus = getTrainedMovementBonus(state, ownerId, type);
  return { ...unit, owner: ownerId, type, movementBonus: movementBonus || undefined };
}
