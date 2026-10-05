// src/systems/combat-defense-strength.ts
// #1248: how strong a defender is where it stands, and which unit of a stack defends — pure functions of
// the unit, the map and the wonder bonus. Attack targeting, the map presentation, input and the barbarian
// turn all need "who defends this tile?" without the combat *resolver* (modifier facts, exchanges, rewards).
// Moved verbatim from combat-system.ts, which now imports them from here.
import type { GameMap, Unit } from '@/core/types';
import { hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { getWonderCombatBonus } from './wonder-system';

export function getTerrainDefenseBonus(terrain: string): number {
  const bonuses: Record<string, number> = {
    hills: 0.25,
    forest: 0.25,
    mountain: 0.5,
    jungle: 0.15,
  };
  return bonuses[terrain] ?? 0;
}

/** Scenario units can carry a save-safe strength override without mutating the global catalog. */
export function getUnitCombatStrength(unit: Unit): number {
  return unit.combatStrengthOverride ?? UNIT_DEFINITIONS[unit.type].strength;
}

export function getEffectiveDefenseStrength(defender: Unit, map: GameMap): number {
  let strength = getUnitCombatStrength(defender) * (defender.health / 100);
  const tile = map.tiles[hexKey(defender.position)];
  if (tile) {
    strength *= (1 + getTerrainDefenseBonus(tile.terrain));
    if (tile.wonder) {
      strength *= (1 + getWonderCombatBonus(tile.wonder));
    }
  }
  return strength;
}

export function selectDefenderForAttack(defenders: Unit[], map: GameMap): Unit | undefined {
  return [...defenders].sort((a, b) => {
    const aStrength = getEffectiveDefenseStrength(a, map);
    const bStrength = getEffectiveDefenseStrength(b, map);
    const aCanFight = aStrength > 0;
    const bCanFight = bStrength > 0;
    if (aCanFight !== bCanFight) return aCanFight ? -1 : 1;
    if (aStrength !== bStrength) return bStrength - aStrength;
    if (a.health !== b.health) return b.health - a.health;
    return a.id.localeCompare(b.id);
  })[0];
}
