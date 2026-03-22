import type { Unit, CombatResult, GameMap } from '@/core/types';
import { hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

export function getTerrainDefenseBonus(terrain: string): number {
  const bonuses: Record<string, number> = {
    hills: 0.25,
    forest: 0.25,
    mountain: 0.5,
    jungle: 0.15,
  };
  return bonuses[terrain] ?? 0;
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
): CombatResult {
  const atkDef = UNIT_DEFINITIONS[attacker.type];
  const defDef = UNIT_DEFINITIONS[defender.type];

  let atkStrength = atkDef.strength * (attacker.health / 100);
  let defStrength = defDef.strength * (defender.health / 100);

  // Terrain defense bonus
  const defTile = map.tiles[hexKey(defender.position)];
  if (defTile) {
    defStrength *= (1 + getTerrainDefenseBonus(defTile.terrain));
  }

  // Non-combat units auto-lose
  if (defStrength === 0) {
    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 0,
      defenderDamage: defender.health,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    };
  }

  if (atkStrength === 0) {
    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: attacker.health,
      defenderDamage: 0,
      attackerSurvived: false,
      defenderSurvived: true,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    };
  }

  // Combat formula: damage ratio based on strength comparison with randomness
  const totalStrength = atkStrength + defStrength;
  const atkRatio = atkStrength / totalStrength;

  // Add randomness (±20%)
  const randomFactor = 0.8 + Math.random() * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));

  // Base damage is 30-50
  const baseDamage = 30 + Math.random() * 20;

  const defenderDamage = Math.round(baseDamage * adjustedRatio);
  const attackerDamage = Math.round(baseDamage * (1 - adjustedRatio));

  const attackerHealthAfter = attacker.health - attackerDamage;
  const defenderHealthAfter = defender.health - defenderDamage;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerDamage,
    defenderDamage,
    attackerSurvived: attackerHealthAfter > 0,
    defenderSurvived: defenderHealthAfter > 0,
    attackerPosition: attacker.position,
    defenderPosition: defender.position,
  };
}
