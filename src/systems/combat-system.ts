import type { Unit, CombatResult, GameMap, CivBonusEffect } from '@/core/types';
import { hexDistance, hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { getWonderCombatBonus } from './wonder-system';
import { getVeterancyCombatModifier } from './combat-reward-system';

export function getTerrainDefenseBonus(terrain: string): number {
  const bonuses: Record<string, number> = {
    hills: 0.25,
    forest: 0.25,
    mountain: 0.5,
    jungle: 0.15,
  };
  return bonuses[terrain] ?? 0;
}

export function getEffectiveDefenseStrength(defender: Unit, map: GameMap): number {
  const def = UNIT_DEFINITIONS[defender.type];
  let strength = def.strength * (defender.health / 100);
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

export interface CombatContext {
  attackerBonus?: CivBonusEffect;
  defenderBonus?: CivBonusEffect;
  defenderInFortifiedCity?: boolean;
}

function canCounterAttackAtDistance(defender: Unit, distance: number): boolean {
  const definition = UNIT_DEFINITIONS[defender.type];
  const profile = definition.attackProfile;
  if (!profile) return distance <= 1 && definition.strength > 0;
  if (profile.kind === 'melee') return distance <= 1;
  return profile.range >= distance;
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  seed: number,
  context?: CombatContext,
  era?: number,
): CombatResult {
  // Seeded RNG for deterministic combat
  let rngState = seed;
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };
  const atkDef = UNIT_DEFINITIONS[attacker.type];
  const defDef = UNIT_DEFINITIONS[defender.type];

  let atkStrength = atkDef.strength * (attacker.health / 100) * (1 + getVeterancyCombatModifier(attacker));
  let defStrength = defDef.strength * (defender.health / 100) * (1 + getVeterancyCombatModifier(defender));

  // Terrain defense bonus
  const defTile = map.tiles[hexKey(defender.position)];
  if (defTile) {
    defStrength *= (1 + getTerrainDefenseBonus(defTile.terrain));
    // Wonder defense bonus
    if (defTile.wonder) {
      defStrength *= (1 + getWonderCombatBonus(defTile.wonder));
    }
    if (context?.defenderBonus?.type === 'homeland_defense' && defTile.owner === defender.owner) {
      defStrength *= (1 + context.defenderBonus.defenseBonus);
    }
    if (context?.defenderBonus?.type === 'forest_guardians' && defTile.terrain === 'forest') {
      defStrength *= (1 + context.defenderBonus.defenseBonus);
    }
  }

  if (defender.isFortified) {
    defStrength *= 1.25;
  }

  if (
    context?.attackerBonus?.type === 'coastal_science'
    && (attacker.type === 'galley' || attacker.type === 'trireme')
  ) {
    atkStrength *= (1 + context.attackerBonus.navalCombatBonus);
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
  const randomFactor = 0.8 + rng() * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));

  // Era-scaled base damage: early eras deal more for faster combat
  // Era 0-1 (Stone/Tribal): 45-70, Era 2 (Bronze): 36-60, Era 3+ (Iron+): 30-50
  const eraScale = era !== undefined && era <= 1 ? 1.5 : era === 2 ? 1.2 : 1.0;
  const baseDamage = (30 + rng() * 20) * eraScale;

  // Ottoman siege bonus
  let siegeMultiplier = 1;
  if (context?.attackerBonus?.type === 'siege_bonus' && context?.defenderInFortifiedCity) {
    siegeMultiplier = context.attackerBonus.damageMultiplier;
  }

  const defenderDamage = Math.round(baseDamage * adjustedRatio * siegeMultiplier);
  const distance = hexDistance(attacker.position, defender.position);
  const attackerDamage = canCounterAttackAtDistance(defender, distance)
    ? Math.round(baseDamage * (1 - adjustedRatio))
    : 0;

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
