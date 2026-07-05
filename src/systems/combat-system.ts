import type { Unit, CombatResult, GameMap, CivBonusEffect } from '@/core/types';
import { hexDistance, hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { getWonderCombatBonus } from './wonder-system';
import { getVeterancyCombatModifier } from './combat-reward-system';
import { getRiverDefensePenalty, isRiverBetween } from './river-system';
import type { ModifierPart } from './unit-modifier-system';

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

export interface CityDefenseInput {
  cityBuildings: readonly string[];
  defenderCompletedTechs: readonly string[];
  attackerDomain: 'land' | 'naval' | 'air';
}

export interface CityDefensePart {
  source: string;
  label: string;
  kind: 'mult' | 'flat';
  value: number;
}

export interface CityDefenseBreakdown {
  multiplier: number;
  flatBonus: number;
  parts: CityDefensePart[];
}

export function getCityDefenseBreakdown(input: CityDefenseInput): CityDefenseBreakdown {
  const hasWalls = input.cityBuildings.includes('walls');
  const parts: CityDefensePart[] = [];
  let multiplier = 1;
  let flatBonus = 0;

  if (hasWalls) {
    multiplier *= 1.25;
    parts.push({ source: 'walls', label: 'Walls ×1.25', kind: 'mult', value: 1.25 });
  }

  if (hasWalls && input.cityBuildings.includes('star_fort')) {
    flatBonus += 5;
    parts.push({ source: 'star_fort', label: 'Star Fort +5', kind: 'flat', value: 5 });
  }

  if (hasWalls && input.defenderCompletedTechs.includes('fortification-engineering')) {
    flatBonus += 5;
    parts.push({
      source: 'fortification-engineering',
      label: 'Fortification Engineering +5',
      kind: 'flat',
      value: 5,
    });
  }

  if (input.defenderCompletedTechs.includes('professional-army')) {
    multiplier *= 1.10;
    parts.push({ source: 'professional-army', label: 'Professional Army ×1.10', kind: 'mult', value: 1.10 });
  }

  if (input.attackerDomain === 'naval' && input.defenderCompletedTechs.includes('torpedo-warfare')) {
    flatBonus += 5;
    parts.push({ source: 'torpedo-warfare', label: 'Torpedo Warfare +5', kind: 'flat', value: 5 });
  }

  return { multiplier, flatBonus, parts };
}

export interface UnitModifierBreakdown {
  mult: number;
  flat: number;
  parts: ModifierPart[];
}

export interface CombatContext {
  attackerBonus?: CivBonusEffect;
  defenderBonus?: CivBonusEffect;
  defenderCity?: CityDefenseInput;
  defenderCityHasAntiAir?: boolean;
  // Precomputed by buildCombatContextForDefender (unit-modifier-system's getCombatModifier)
  // so combat-system.ts stays a pure function of its inputs.
  attackerModifiers?: UnitModifierBreakdown;
  defenderModifiers?: UnitModifierBreakdown;
}

export interface CombatStrengthBreakdown {
  attackerStrength: number;
  defenderStrength: number;
  terrainDefenseBonus: number;
  riverAttackPenalty: number;
  cityDefense?: CityDefenseBreakdown;
  attackerModifierParts?: ModifierPart[];
  defenderModifierParts?: ModifierPart[];
}

export function calculateCombatStrengths(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  context?: CombatContext,
): CombatStrengthBreakdown {
  const attackerDefinition = UNIT_DEFINITIONS[attacker.type];
  const defenderDefinition = UNIT_DEFINITIONS[defender.type];
  const riverAttackPenalty = getRiverDefensePenalty(
    isRiverBetween(map, attacker.position, defender.position),
  );
  let attackerStrength = attackerDefinition.strength
    * (attacker.health / 100)
    * (1 + getVeterancyCombatModifier(attacker))
    * (1 + riverAttackPenalty);
  let defenderStrength = defenderDefinition.strength
    * (defender.health / 100)
    * (1 + getVeterancyCombatModifier(defender));
  const defenderTile = map.tiles[hexKey(defender.position)];
  const terrainDefenseBonus = defenderTile ? getTerrainDefenseBonus(defenderTile.terrain) : 0;

  if (defenderTile) {
    defenderStrength *= 1 + terrainDefenseBonus;
    if (defenderTile.wonder) {
      defenderStrength *= 1 + getWonderCombatBonus(defenderTile.wonder);
    }
    if (context?.defenderBonus?.type === 'homeland_defense' && defenderTile.owner === defender.owner) {
      defenderStrength *= 1 + context.defenderBonus.defenseBonus;
    }
    if (context?.defenderBonus?.type === 'forest_guardians' && defenderTile.terrain === 'forest') {
      defenderStrength *= 1 + context.defenderBonus.defenseBonus;
    }
  }

  if (defender.isFortified) {
    defenderStrength *= 1.25;
  }

  // Unit-modifier engine (MR4): tech/national-project combat modifiers + class counters.
  // Order: after terrain/fortify/civ-bonus multipliers above, before MR3 city-defense below.
  if (context?.attackerModifiers) {
    attackerStrength = attackerStrength * context.attackerModifiers.mult + context.attackerModifiers.flat;
  }
  if (context?.defenderModifiers) {
    defenderStrength = defenderStrength * context.defenderModifiers.mult + context.defenderModifiers.flat;
  }

  let cityDefense: CityDefenseBreakdown | undefined;
  if (context?.defenderCity) {
    cityDefense = getCityDefenseBreakdown(context.defenderCity);
    defenderStrength = defenderStrength * cityDefense.multiplier + cityDefense.flatBonus;
  }

  // Anti-air battery: +8 flat defense against air attacker domain
  if (context?.defenderCityHasAntiAir && UNIT_DEFINITIONS[attacker.type]?.domain === 'air') {
    defenderStrength += 8;
  }

  if (
    context?.attackerBonus?.type === 'coastal_science'
    && (attacker.type === 'galley' || attacker.type === 'trireme')
  ) {
    attackerStrength *= 1 + context.attackerBonus.navalCombatBonus;
  }

  return {
    attackerStrength,
    defenderStrength,
    terrainDefenseBonus,
    riverAttackPenalty,
    cityDefense,
    attackerModifierParts: context?.attackerModifiers?.parts,
    defenderModifierParts: context?.defenderModifiers?.parts,
  };
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
  const strengths = calculateCombatStrengths(attacker, defender, map, context);
  const atkStrength = strengths.attackerStrength;
  const defStrength = strengths.defenderStrength;

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
  if (context?.attackerBonus?.type === 'siege_bonus' && context?.defenderCity) {
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
