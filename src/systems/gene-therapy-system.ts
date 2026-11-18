import type { GameState, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-definitions';

/**
 * Gene Therapy's promise: a unit survives "a lethal hit once per cooldown". The one answer for any lethal damage
 * outside the primary attacker/defender exchange (splash, city and battery counter-fire, flak, an enclave
 * assault): the unit left at 1 HP with the charge spent and its turn used, exactly as the primary branches leave
 * it, or `null` when it has no charge and dies.
 */
export function surviveLethalHitWithGeneTherapy(unit: Unit): Unit | null {
  if (unit.geneTherapyReady !== true) return null;
  return { ...unit, health: 1, movementPointsLeft: 0, hasMoved: true, hasActed: true, geneTherapyReady: false };
}

// Charges every combat unit (strength > 0) owned by civId on gene-therapy research completion.
// Strength-0 civilians (settler, worker, caravan, expedition, cyber_unit, transports) are left
// undefined — UNIT_DESCRIPTIONS.cyber_unit explicitly says Gene Therapy does not apply.
export function chargeUnitsOnGeneTherapyResearch(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  let units = state.units;
  for (const unitId of civ.units) {
    const unit = units[unitId];
    if (!unit) continue;
    if ((UNIT_DEFINITIONS[unit.type]?.strength ?? 0) <= 0) continue;
    if (units === state.units) units = { ...state.units };
    units[unitId] = { ...unit, geneTherapyReady: true };
  }

  return units === state.units ? state : { ...state, units };
}

// Resets geneTherapyReady from false back to true for units that rested a full turn
// (did not move or act) in a friendly city. Must run before hasMoved/hasActed are cleared.
//
// unitIds, if provided, overrides which unit ids are eligible (defaults to civ.units).
// Callers must pass a snapshot taken before this turn's production runs — civ.units is
// mutated in place as newly trained units are pushed onto it, so without this override a
// unit trained this very turn (hasMoved:false, hasActed:false by construction) would be
// wrongly swept into the "rested a full turn" recharge before it ever existed.
export function applyGeneTherapyRecharge(
  state: GameState,
  civId: string,
  unitIds?: readonly string[],
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const cityPositionsSet = new Set(
    civ.cities
      .map(id => state.cities[id])
      .filter(Boolean)
      .map(c => `${c!.position.q},${c!.position.r}`),
  );

  let units = state.units;
  for (const unitId of unitIds ?? civ.units) {
    const unit = units[unitId];
    if (!unit || unit.geneTherapyReady !== false) continue;
    const posKey = `${unit.position.q},${unit.position.r}`;
    const tile = state.map.tiles[posKey];
    if (!cityPositionsSet.has(posKey) || tile?.owner !== civId) continue;
    if (unit.hasMoved || unit.hasActed) continue;
    if (units === state.units) units = { ...state.units };
    units[unitId] = { ...unit, geneTherapyReady: true };
  }

  return units === state.units ? state : { ...state, units };
}
