import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { healUnit } from '@/systems/unit-healing';
import { resetUnitTurn } from '@/systems/unit-lifecycle';
import { getLocalCityHealingBonus } from '@/systems/city-system';
import { getRestAvailability } from '@/systems/supply-combat';
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import {
  getHealingBonus,
  isWithinRangeOfNeuralRehabilitationCenter,
  isWithinRangeOfTelemedicineHub,
} from '@/systems/unit-modifier-system';
import { applyGeneTherapyRecharge } from '@/systems/gene-therapy-system';
import { getTacticalFortOccupantHealingBonus } from '@/systems/legendary-wonder-tactical-effects';
import { retireGeneralsAtTurnEnd } from '@/systems/great-general-system';
import type { CivTurn } from './types';

/**
 * Heals the civ's wounded units. Runs BEFORE movement is reset because healing checks `hasMoved`/`hasActed`.
 */
export function healCivUnits(state: GameState, turn: CivTurn, completedTechs: string[]): void {
  const { civId, civ } = turn;

  // Heal units BEFORE resetting hasMoved/hasActed (healing checks those flags)
  const friendlyCitiesByPosition = new Map(
    civ.cities.map(id => state.cities[id]).filter(Boolean).map(city => [`${city!.position.q},${city!.position.r}`, city!] as const),
  );
  const healActiveNPs = getActiveNationalProjectsForCiv(state, civId);
  for (const unitId of civ.units) {
    const unit = state.units[unitId];
    if (!unit || unit.health >= 100) continue;
    if (unit.committedToRouteId) continue; // committed caravans do not heal
    const posKey = `${unit.position.q},${unit.position.r}`;
    const tile = state.map.tiles[posKey];
    const friendlyCity = friendlyCitiesByPosition.get(posKey as `${number},${number}`);
    const inFriendlyCity = Boolean(friendlyCity) && (tile?.owner === civId);
    const inFriendlyTerritory = !inFriendlyCity && (tile?.owner === civId);
    const withinRangeOfFriendlyCity3 = isWithinRangeOfTelemedicineHub(state, civId, unit.position, 3);
    const nearNeuralRehabilitationCenter = isWithinRangeOfNeuralRehabilitationCenter(state, civId, unit.position, 1);
    const healingBonus = getHealingBonus({
      completedTechs: completedTechs,
      activeNationalProjects: healActiveNPs,
      inFriendlyCity,
      inFriendlyTerritory,
      withinRangeOfFriendlyCity3,
      withinRangeOfNeuralRehabilitationCenter: nearNeuralRehabilitationCenter,
      localCityHealingBonus: inFriendlyCity && friendlyCity
        ? getLocalCityHealingBonus(unit.type, friendlyCity.buildings)
        : 0,
      tacticalFortHealingBonus: getTacticalFortOccupantHealingBonus(state, unit),
    });
    if (getRestAvailability(unit.landSupply).canRest) {
      state.units[unitId] = healUnit(unit, inFriendlyCity, inFriendlyTerritory, healingBonus);
    }
  }
}

/**
 * Gene-therapy recharge for units that rested, then retirement of Generals that spent their charges.
 */
export function recoverUnitsAtTurnEnd(state: GameState, turn: CivTurn, bus: EventBus): GameState {
  let newState = state;
  const { civId, unitIdsAtTurnStart } = turn;

  // Reset geneTherapyReady cooldown for units that rested a full turn in a friendly city
  newState = applyGeneTherapyRecharge(newState, civId, unitIdsAtTurnStart);

  // #544 MR4 contract §21: retire any General who has spent all 3
  // Command Charges, before resetting movement for this civ's remaining
  // units -- the General "remains for rest of owner turn" (already true,
  // nothing removed it earlier this round) and "retires at end of turn"
  // (this is that end-of-turn point). bus is passed through so the
  // retirement notification actually reaches the player.
  newState = retireGeneralsAtTurnEnd(newState, civId, bus);
  return newState;
}

/**
 * Restores every unit's movement for the new turn; a committed caravan stays put.
 */
export function resetCivUnitMovement(state: GameState, turn: CivTurn): void {
  const { civ } = turn;

  // Reset unit movement
  for (const unitId of civ.units) {
    const unit = state.units[unitId];
    if (unit) {
      let reset = resetUnitTurn(unit);
      // Committed caravans cannot move — zero restored movement so they don't appear in unmoved cycling
      if (reset.committedToRouteId) {
        reset = { ...reset, movementPointsLeft: 0, hasActed: true };
      }
      state.units[unitId] = reset;
    }
  }
}
