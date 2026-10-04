import { fnv1a32 } from './deterministic-hash';
import type {
  Unit,
  CombatExchangeKind,
  CombatResult,
  CombatModifierFact,
  GameMap,
  CivBonusEffect,
  UnitAttackProfile,
  GameState,
  CombatSplashHit,
} from '@/core/types';
import { getRogueElephantCommandFact } from '@/systems/rogue-elephant-host-system';
import { hexDistance, hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { getWonderCombatBonus } from './wonder-system';
import { getVeterancyCombatModifier } from './combat-reward-system';
import { getTerrainDefenseBonus, getUnitCombatStrength } from './combat-defense-strength';
import { getRiverDefensePenalty, isRiverBetween } from './river-system';
import type { ModifierPart } from './unit-modifier-system';
import { COMBAT_EXCHANGE_RULES } from './unit-modifier-definitions';
import { isMilitaryUnitType } from './unit-modifier-definitions';
import { isHostileOwnerTo } from './owner-hostility';
import { isVisible } from './fog-of-war';

/** Returns deterministic secondary damage facts without mutating combat state. */
export function resolveBoundedSplash(
  state: Readonly<GameState>,
  attacker: Unit,
  defender: Unit,
  finalPrimaryDamage: number,
): CombatSplashHit[] {
  const splash = UNIT_DEFINITIONS[attacker.type]?.splash;
  if (!splash || finalPrimaryDamage <= 0) return [];
  const visibility = state.civilizations[attacker.owner]?.visibility;
  if (!visibility) return [];
  const damage = Math.round(finalPrimaryDamage * splash.damageFraction);
  if (damage <= 0) return [];
  return Object.values(state.units)
    .filter(candidate => candidate.id !== defender.id
      && !candidate.transportId
      && isMilitaryUnitType(candidate.type)
      && isHostileOwnerTo(state, attacker.owner, candidate.owner)
      && hexDistance(defender.position, candidate.position) === 1
      && isVisible(visibility, candidate.position))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, splash.maxTargets)
    .map(candidate => ({ unitId: candidate.id, damage }));
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
  /** Damage multiplier applied only by the city-siege bombardment resolver. */
  bombardmentDamageMultiplier: number;
  parts: CityDefensePart[];
}

export function getCityDefenseBreakdown(input: CityDefenseInput): CityDefenseBreakdown {
  const hasWalls = input.cityBuildings.includes('walls');
  const parts: CityDefensePart[] = [];
  let multiplier = 1;
  let flatBonus = 0;
  let bombardmentDamageMultiplier = 1;

  if (hasWalls) {
    multiplier *= 1.25;
    parts.push({ source: 'walls', label: 'Walls ×1.25', kind: 'mult', value: 1.25 });
  }

  const hasBunker = hasWalls && input.cityBuildings.includes('bunker');
  if (hasWalls && input.cityBuildings.includes('star_fort')) {
    if (hasBunker) {
      parts.push({ source: 'star_fort', label: 'Star Fort superseded by Bunker', kind: 'flat', value: 0 });
    } else {
      flatBonus += 5;
      parts.push({ source: 'star_fort', label: 'Star Fort +5', kind: 'flat', value: 5 });
    }
  }

  if (hasBunker) {
    flatBonus += 8;
    parts.push({ source: 'bunker', label: 'Bunker +8', kind: 'flat', value: 8 });
    if (input.attackerDomain === 'naval' || input.attackerDomain === 'air') {
      bombardmentDamageMultiplier = 0.85;
      parts.push({ source: 'bunker', label: 'Bunker bombardment −15%', kind: 'mult', value: 0.85 });
    }
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

  if (input.attackerDomain === 'naval' && input.cityBuildings.includes('coastal_battery')) {
    flatBonus += 8;
    parts.push({ source: 'coastal_battery', label: 'Coastal Battery +8 vs naval', kind: 'flat', value: 8 });
  }

  return { multiplier, flatBonus, bombardmentDamageMultiplier, parts };
}

export interface UnitModifierBreakdown {
  mult: number;
  flat: number;
  parts: ModifierPart[];
  facts?: CombatModifierFact[];
}

export interface CombatContext {
  attackerBonus?: CivBonusEffect;
  defenderBonus?: CivBonusEffect;
  defenderCity?: CityDefenseInput;
  airDefenseCoverage?: import('@/core/types').AirDefenseCoverageResult;
  // Precomputed by buildCombatContextForDefender (unit-modifier-system's getCombatModifier)
  // so combat-system.ts stays a pure function of its inputs.
  attackerModifiers?: UnitModifierBreakdown;
  defenderModifiers?: UnitModifierBreakdown;
  attackerPositioningMultiplier?: number;
  defenderPositioningMultiplier?: number;
  attackerPositioningPart?: ModifierPart;
  defenderPositioningPart?: ModifierPart;
  attackerAmphibiousMultiplier?: number;
  attackerAmphibiousParts?: ModifierPart[];
  attackerInterceptionStrengthMultiplier?: number;
  attackerInterceptionPart?: ModifierPart;
  attackerInterceptionFact?: CombatModifierFact;
  attackerCombinedArmsMultiplier?: number;
  defenderCombinedArmsMultiplier?: number;
  attackerCombinedArmsFact?: CombatModifierFact;
  defenderCombinedArmsFact?: CombatModifierFact;
  defenderFortificationMultiplier?: number;
  defenderFortificationFact?: CombatModifierFact;
  defenderTacticalCitadelMultiplier?: number;
  defenderTacticalCitadelFact?: CombatModifierFact;
  attackerLandSupplyMultiplier?: number;
  attackerLandSupplyFact?: CombatModifierFact;
  defenderLandSupplyMultiplier?: number;
  defenderLandSupplyFact?: CombatModifierFact;
  /** #883: a fleet's own operational endurance (naval-operations.ts). Same fact feeds preview and execution. */
  attackerNavalOperationsMultiplier?: number;
  attackerNavalOperationsFact?: CombatModifierFact;
  defenderNavalOperationsMultiplier?: number;
  defenderNavalOperationsFact?: CombatModifierFact;
  /** #884: aircraft readiness (air-readiness.ts); same fact feeds preview and execution. */
  attackerAirReadinessMultiplier?: number;
  attackerAirReadinessFact?: CombatModifierFact;
  defenderAirReadinessMultiplier?: number;
  defenderAirReadinessFact?: CombatModifierFact;
  defenderLastStandMultiplier?: number;
  defenderLastStandFact?: CombatModifierFact;
  attackerNetworkStrengthBonus?: number;
  defenderNetworkStrengthBonus?: number;
}

export interface CombatStrengthBreakdown {
  attackerStrength: number;
  defenderStrength: number;
  terrainDefenseBonus: number;
  riverAttackPenalty: number;
  cityDefense?: CityDefenseBreakdown;
  attackerModifierParts?: ModifierPart[];
  defenderModifierParts?: ModifierPart[];
  attackerModifierFacts?: CombatModifierFact[];
  defenderModifierFacts?: CombatModifierFact[];
  defenderDefendsPoorly?: boolean;
  exchange: CombatExchangeModifiers;
}

export interface CombatExchangeModifiers {
  kind: CombatExchangeKind;
  defenderCounterDamageMultiplier: number;
  defenderIncomingDamageMultiplier: number;
  label?: string;
}

export function defendsPoorly(profile: UnitAttackProfile | undefined): boolean {
  return profile?.kind === 'siege' || profile?.kind === 'bombard';
}

export function getCombatExchangeModifiers(attacker: Unit, defender: Unit): CombatExchangeModifiers {
  const attackerDefinition = UNIT_DEFINITIONS[attacker.type];
  const defenderDefinition = UNIT_DEFINITIONS[defender.type];
  const neutral: CombatExchangeModifiers = {
    kind: 'none',
    defenderCounterDamageMultiplier: 1,
    defenderIncomingDamageMultiplier: 1,
  };
  for (const rule of COMBAT_EXCHANGE_RULES) {
    if (rule.kind === 'shock') {
      if (!rule.attackerTypes.includes(attacker.type) || rule.excludedDefenderTypes.includes(defender.type)) continue;
      return {
        kind: rule.kind,
        defenderCounterDamageMultiplier: rule.defenderCounterDamageMultiplier,
        defenderIncomingDamageMultiplier: 1,
        label: rule.label,
      };
    }
    if (rule.kind === 'siege-anti-personnel') {
      if (!rule.attackerTypes.includes(attacker.type)) continue;
      return {
        kind: rule.kind,
        defenderCounterDamageMultiplier: 1,
        defenderIncomingDamageMultiplier: rule.defenderIncomingDamageMultiplier,
        label: rule.label,
      };
    }
    if (
      attackerDefinition.domain !== rule.attackerDomain
      || attackerDefinition.attackProfile?.kind !== rule.attackerAttackProfile
      || defenderDefinition.domain !== rule.defenderDomain
      || defenderDefinition.attackProfile?.kind !== rule.defenderAttackProfile
    ) continue;
    const doctrine = defenderDefinition.airInterceptionDefense;
    if (!doctrine) continue;
    if (doctrine.kind === 'turret-fire') {
      return {
        kind: 'turret-fire',
        defenderCounterDamageMultiplier: doctrine.counterDamageMultiplier,
        defenderIncomingDamageMultiplier: 1,
        label: `Bomber gunners fire back weakly: ${Math.round(doctrine.counterDamageMultiplier * 100)}% return fire`,
      };
    }
    return {
      kind: 'evasion',
      defenderCounterDamageMultiplier: 0,
      defenderIncomingDamageMultiplier: doctrine.incomingDamageMultiplier,
      label: `Stealth makes it harder to hit: −${Math.round((1 - doctrine.incomingDamageMultiplier) * 100)}% interceptor damage`,
    };
  }
  return neutral;
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
  let attackerStrength = getUnitCombatStrength(attacker)
    * (attacker.health / 100)
    * (1 + getVeterancyCombatModifier(attacker))
    * (1 + riverAttackPenalty);
  let defenderStrength = getUnitCombatStrength(defender)
    * (defender.health / 100)
    * (1 + getVeterancyCombatModifier(defender));

  attackerStrength *= context?.attackerPositioningMultiplier ?? 1;
  attackerStrength *= context?.attackerAmphibiousMultiplier ?? 1;
  attackerStrength *= context?.attackerInterceptionStrengthMultiplier ?? 1;
  attackerStrength *= context?.attackerCombinedArmsMultiplier ?? 1;
  attackerStrength *= context?.attackerLandSupplyMultiplier ?? 1;
  attackerStrength *= context?.attackerNavalOperationsMultiplier ?? 1;
  attackerStrength *= context?.attackerAirReadinessMultiplier ?? 1;
  defenderStrength *= context?.defenderPositioningMultiplier ?? 1;
  defenderStrength *= context?.defenderCombinedArmsMultiplier ?? 1;
  defenderStrength *= context?.defenderLandSupplyMultiplier ?? 1;
  defenderStrength *= context?.defenderNavalOperationsMultiplier ?? 1;
  defenderStrength *= context?.defenderAirReadinessMultiplier ?? 1;
  defenderStrength *= context?.defenderLastStandMultiplier ?? 1;
  attackerStrength += context?.attackerNetworkStrengthBonus ?? 0;
  defenderStrength += context?.defenderNetworkStrengthBonus ?? 0;

  // Bombard-kind units (catapult, cannon, artillery, grenadier, bomber, stealth_bomber)
  // defend poorly — classic "siege is terrible on defense" convention. Keyed off
  // attackProfile.kind rather than the 'siege' UnitClass because that class includes
  // ballista (kind 'ranged', more agile — no penalty) and excludes bomber/stealth_bomber
  // (which do need it, per the #537 counter-intercept fix).
  if (defendsPoorly(defenderDefinition.attackProfile)) {
    defenderStrength *= 0.5;
  }

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
  defenderStrength *= context?.defenderFortificationMultiplier ?? 1;
  defenderStrength *= context?.defenderTacticalCitadelMultiplier ?? 1;

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

  const airDefenseCoverage = context?.airDefenseCoverage;
  const airDefenseApplies = airDefenseCoverage !== undefined && attackerDefinition.domain === 'air';
  if (airDefenseApplies) {
    defenderStrength += airDefenseCoverage.flatDefenseModifier;
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
    attackerModifierParts: [...(context?.attackerModifiers?.parts ?? []), ...(context?.attackerPositioningPart ? [context.attackerPositioningPart] : []), ...(context?.attackerAmphibiousParts ?? []), ...(context?.attackerInterceptionPart ? [context.attackerInterceptionPart] : [])],
    defenderModifierParts: [...(context?.defenderModifiers?.parts ?? []), ...(context?.defenderPositioningPart ? [context.defenderPositioningPart] : [])],
    attackerModifierFacts: [...(context?.attackerModifiers?.facts ?? []), ...(context?.attackerInterceptionFact ? [context.attackerInterceptionFact] : []), ...(context?.attackerCombinedArmsFact ? [context.attackerCombinedArmsFact] : []), ...(context?.attackerLandSupplyFact ? [context.attackerLandSupplyFact] : []), ...(context?.attackerNavalOperationsFact ? [context.attackerNavalOperationsFact] : []), ...(context?.attackerAirReadinessFact ? [context.attackerAirReadinessFact] : [])],
    defenderModifierFacts: [...(context?.defenderModifiers?.facts ?? []), ...(airDefenseApplies ? airDefenseCoverage.facts : []), ...(context?.defenderCombinedArmsFact ? [context.defenderCombinedArmsFact] : []), ...(context?.defenderFortificationFact ? [context.defenderFortificationFact] : []), ...(context?.defenderTacticalCitadelFact ? [context.defenderTacticalCitadelFact] : []), ...(context?.defenderLandSupplyFact ? [context.defenderLandSupplyFact] : []), ...(context?.defenderNavalOperationsFact ? [context.defenderNavalOperationsFact] : []), ...(context?.defenderAirReadinessFact ? [context.defenderAirReadinessFact] : [])],
    defenderDefendsPoorly: defendsPoorly(defenderDefinition.attackProfile),
    exchange: getCombatExchangeModifiers(attacker, defender),
  };
}

function canCounterAttackAtDistance(defender: Unit, distance: number): boolean {
  const definition = UNIT_DEFINITIONS[defender.type];
  const profile = definition.attackProfile;
  if (!profile) return distance <= 1 && definition.strength > 0;
  if (profile.kind === 'melee') return distance <= 1;
  return profile.range >= distance;
}

export function deterministicCombatSeed(
  gameId: string | undefined,
  turn: number,
  attackerId: string,
  defenderId: string,
): number {
  const source = [gameId ?? 'legacy', turn, attackerId, defenderId].join(':');
  return Math.max(1, fnv1a32(source));
}

/**
 * The strengths a fight is actually resolved with: the canonical breakdown plus the state-scoped
 * crisis command facts. The one place those are applied, so `resolveCombat` and the battle forecast
 * (`battle-forecast.ts`) can never disagree about strength.
 */
export function resolveCombatStrengths(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  context?: CombatContext,
  state?: GameState,
): CombatStrengthBreakdown {
  const strengths = calculateCombatStrengths(attacker, defender, map, context);
  // Host coordination is a state-scoped crisis fact, not a unit-ID multiplier in callers.
  if (state && getRogueElephantCommandFact(state, attacker.id)) {
    strengths.attackerStrength *= 1.2;
    strengths.attackerModifierFacts = [...(strengths.attackerModifierFacts ?? []), {
      key: 'rogue-elephant-host:handler-command',
      label: 'Handler command ×1.20',
      sourceVisibility: 'public',
      operation: 'multiplier',
      value: 1.2,
      outcome: 'applied',
    }];
  }
  if (state && getRogueElephantCommandFact(state, defender.id)) {
    strengths.defenderStrength *= 1.2;
    strengths.defenderModifierFacts = [...(strengths.defenderModifierFacts ?? []), {
      key: 'rogue-elephant-host:handler-command',
      label: 'Handler command ×1.20',
      sourceVisibility: 'public',
      operation: 'multiplier',
      value: 1.2,
      outcome: 'applied',
    }];
  }
  return strengths;
}

export interface ExchangeDamageInput {
  atkStrength: number;
  defStrength: number;
  attacker: Unit;
  defender: Unit;
  context?: CombatContext;
  era?: number;
  exchange: CombatExchangeModifiers;
  /** Uniform [0,1): drives the +/-20% strength-ratio variance. */
  ratioRoll: number;
  /** Uniform [0,1): drives the 30-50 base damage. */
  baseRoll: number;
}

/**
 * The exchange damage formula for both sides, as a pure function of the two uniform rolls.
 * `resolveCombat` feeds it its seeded rolls; the battle forecast feeds it a fixed grid of rolls --
 * one formula, so a preview cannot drift from the fight.
 */
export function computeExchangeDamage(input: ExchangeDamageInput): { attackerDamage: number; defenderDamage: number } {
  const { atkStrength, defStrength, attacker, defender, context, era, exchange } = input;
  const totalStrength = atkStrength + defStrength;
  const atkRatio = atkStrength / totalStrength;

  // Add randomness (±20%)
  const randomFactor = 0.8 + input.ratioRoll * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));

  // Era-scaled base damage: early eras deal more for faster combat
  // Era 0-1 (Stone/Tribal): 45-70, Era 2 (Bronze): 36-60, Era 3+ (Iron+): 30-50
  const eraScale = era !== undefined && era <= 1 ? 1.5 : era === 2 ? 1.2 : 1.0;
  const baseDamage = (30 + input.baseRoll * 20) * eraScale;

  // Ottoman siege bonus
  let siegeMultiplier = 1;
  if (context?.attackerBonus?.type === 'siege_bonus' && context?.defenderCity) {
    siegeMultiplier = context.attackerBonus.damageMultiplier;
  }

  const defenderDamage = Math.round(
    baseDamage * adjustedRatio * siegeMultiplier * exchange.defenderIncomingDamageMultiplier,
  );
  const distance = hexDistance(attacker.position, defender.position);
  const attackerDamage = canCounterAttackAtDistance(defender, distance)
    ? Math.round(baseDamage * (1 - adjustedRatio) * exchange.defenderCounterDamageMultiplier)
    : 0;
  return { attackerDamage, defenderDamage };
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  seed: number,
  context?: CombatContext,
  era?: number,
  state?: GameState,
): CombatResult {
  // Seeded RNG for deterministic combat
  let rngState = seed;
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };
  const strengths = resolveCombatStrengths(attacker, defender, map, context, state);
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
      attackerStrength: atkStrength,
      defenderStrength: defStrength,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
      modifierFacts: { attacker: strengths.attackerModifierFacts ?? [], defender: strengths.defenderModifierFacts ?? [] },
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
      attackerStrength: atkStrength,
      defenderStrength: defStrength,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
      modifierFacts: { attacker: strengths.attackerModifierFacts ?? [], defender: strengths.defenderModifierFacts ?? [] },
    };
  }

  // The two seeded rolls are drawn in the same order as before (ratio first, then base damage).
  const ratioRoll = rng();
  const baseRoll = rng();
  const exchange = strengths.exchange;
  const { attackerDamage, defenderDamage } = computeExchangeDamage({
    atkStrength, defStrength, attacker, defender, context, era, exchange, ratioRoll, baseRoll,
  });

  const attackerHealthAfter = attacker.health - attackerDamage;
  const defenderHealthAfter = defender.health - defenderDamage;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerDamage,
    defenderDamage,
    attackerSurvived: attackerHealthAfter > 0,
    defenderSurvived: defenderHealthAfter > 0,
    attackerStrength: atkStrength,
    defenderStrength: defStrength,
    attackerPosition: attacker.position,
    defenderPosition: defender.position,
    modifierFacts: { attacker: strengths.attackerModifierFacts ?? [], defender: strengths.defenderModifierFacts ?? [] },
    ...(exchange.kind === 'none' ? {} : { exchange: { kind: exchange.kind, label: exchange.label! } }),
    ...(state ? { splashHits: resolveBoundedSplash(state, attacker, defender, defenderDamage) } : {}),
  };
}
