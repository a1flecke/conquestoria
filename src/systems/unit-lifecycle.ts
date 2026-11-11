import type { UnitType, Unit, HexCoord, CivBonusEffect } from '@/core/types';
import type { IdCounters } from '@/core/types/ids';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { getNavalOperationsMovementPenalty } from './naval-endurance';

/**
 * Unit creation and per-turn reset (#1010). Depends only on the catalog leaf.
 * Deliberately does NOT own the low-level position movers (`moveUnit`,
 * `moveUnitWithZoneOfControl`): those are a guarded primitive that only the
 * canonical executor may reach -- see `unit-low-level-move.ts`.
 */

const VIKING_MOBILITY_UNITS = new Set<UnitType>(['scout', 'warrior', 'archer', 'swordsman']);

export function createUnit(
  type: UnitType,
  owner: string,
  position: HexCoord,
  counters: IdCounters,
  bonusEffect?: CivBonusEffect,
): Unit {
  const movementBonus =
    bonusEffect?.type === 'naval_raiding' && VIKING_MOBILITY_UNITS.has(type)
      ? bonusEffect.movementBonus
      : 0;
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `unit-${counters.nextUnitId++}`,
    type,
    owner,
    position: { ...position },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints + movementBonus,
    movementBonus: movementBonus || undefined,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    chargesRemaining: type === 'worker' ? 2 : undefined,
    isResting: false,
    cargoUnitIds: definition.cargoCapacity !== undefined ? [] : undefined,
  };
}

export function resetUnitTurn(unit: Unit): Unit {
  // revealedThisTurn (#542 reveal-on-fire), generalNoCommandThisTurn (#544
  // MR3: "operational next owner turn"), rallyProtectedThisRound (#544 MR4:
  // "prevent worsening again until next owner turn"), and
  // hasCapturedCityThisTurn (#544 MR4: "no chained captures in one turn")
  // must all clear here alongside skippedTurn/interceptedTurn -- this is the
  // one place every other per-owner-turn transient flag already resets.
  const {
    skippedTurn: _skippedTurn,
    interceptedTurn: _interceptedTurn,
    revealedThisTurn: _revealedThisTurn,
    generalNoCommandThisTurn: _generalNoCommandThisTurn,
    rallyProtectedThisRound: _rallyProtectedThisRound,
    hasCapturedCityThisTurn: _hasCapturedCityThisTurn,
    // #887 MR1: Seize's recording-only battle-influence marker is per-owner-turn,
    // like rallyProtectedThisRound above.
    seizeGrantedBy: _seizeGrantedBy,
    ...rest
  } = unit;
  // #544: severe overextension reduces movement by 1, never below 1 (contract §3.3/§29).
  const severeSupplyPenalty = unit.landSupply?.state === 'severe' ? 1 : 0;
  // #883: a depleted fleet loses one movement point the same way, from the same one allowance.
  const navalPenalty = getNavalOperationsMovementPenalty(unit);
  const base: Unit = {
    ...rest,
    movementPointsLeft: Math.max(
      1,
      UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0) - severeSupplyPenalty - navalPenalty,
    ),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
  if (base.workerTask) {
    return { ...base, movementPointsLeft: 0, hasActed: true };
  }
  return base;
}
