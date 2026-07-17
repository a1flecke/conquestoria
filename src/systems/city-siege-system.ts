import type { City, Civilization, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import type { OpponentChallenge } from '@/core/types';
import { OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
import { getCityDefenseBreakdown } from '@/systems/combat-system';
import { getVeterancyCombatModifier } from '@/systems/combat-reward-system';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import { isAtWar } from '@/systems/diplomacy-system';
import { getRiverDefensePenalty, isRiverBetween } from '@/systems/river-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

// Retuned from the design doc's original 5/3 (#522 pre-merge review): a population-1
// unwalled outpost at 5+1*3=8 put a warrior (strength 10, the cheapest and most common
// early-capture unit) at only a ~55-57% win rate against the "trivially weak" reference
// case the design explicitly called out -- a near coin-flip for the single most common
// early-expansion action, not the "reliably favors an era-appropriate attacker" the
// spec required. 2/2 keeps a population-1 outpost's warrior win rate around ~70%
// (strongly favorable, matching intent) while a fully walled/teched/high-population
// city still meaningfully contests even a late-game tank (~48% win rate) via the
// multiplier chain, not the linear base.
export const CITY_BASE_STRENGTH = 2;
export const CITY_STRENGTH_PER_POPULATION = 2;

// A city's intrinsic combat strength — used both for a player's single-exchange assault
// (#522, city-capture-system.ts) and for naval/land counter-fire (below). Population
// always contributes a baseline (an unwalled city is not defenseless, just weak); walls
// and defensive techs multiply on top via the SAME getCityDefenseBreakdown a garrisoned
// defender already uses, so a city's own defense and its garrison's defense never
// diverge in formula.
export function getCityIntrinsicStrength(
  city: City,
  ownerCiv: Civilization,
  attackerDomain: 'land' | 'naval' | 'air',
): number {
  const base = CITY_BASE_STRENGTH + city.population * CITY_STRENGTH_PER_POPULATION;
  const breakdown = getCityDefenseBreakdown({
    cityBuildings: city.buildings ?? [],
    defenderCompletedTechs: ownerCiv.techState.completed ?? [],
    attackerDomain,
  });
  return base * breakdown.multiplier + breakdown.flatBonus;
}

export interface CityAssaultStrengthBreakdown {
  attackerStrength: number;
  intrinsicStrength: number;
  winProbability: number;
}

export interface CityAssaultOptions {
  /** Applied after normal health, veterancy, and river calculations. */
  attackerMultiplier?: number;
}

// Mirrors calculateCombatStrengths' attacker-side formula exactly (combat-system.ts) --
// health-scaled, veterancy-modified, river-penalized -- so the odds shown to the player
// (and used by resolveCityAssault below) are computed the same way real combat odds are.
export function calculateCityAssaultStrengths(
  attacker: Unit,
  city: City,
  ownerCiv: Civilization,
  map: GameMap,
  options: CityAssaultOptions = {},
): CityAssaultStrengthBreakdown {
  const attackerDefinition = UNIT_DEFINITIONS[attacker.type];
  const riverAttackPenalty = getRiverDefensePenalty(
    isRiverBetween(map, attacker.position, city.position),
  );
  const attackerStrength = attackerDefinition.strength
    * (attacker.health / 100)
    * (1 + getVeterancyCombatModifier(attacker))
    * (1 + riverAttackPenalty)
    * (options.attackerMultiplier ?? 1);
  const intrinsicStrength = getCityIntrinsicStrength(city, ownerCiv, 'land');
  const winProbability = attackerStrength / (attackerStrength + intrinsicStrength);
  return { attackerStrength, intrinsicStrength, winProbability };
}

function createSeededRng(seed: number): () => number {
  // Same LCG resolveCombat uses (combat-system.ts), but as a proper CHAINED stream --
  // each call advances rngState and returns the new value, exactly like resolveCombat's
  // own rng() closure. A single-shot `seededRatio(seed)` / `seededRatio(seed + 1)` pair
  // (an earlier draft of this function) is NOT equivalent: evaluating the LCG once at
  // seed and once at seed+1 differs by the constant `48271` (mod 2147483647) every
  // time, so the two "independent" draws are actually correlated by a fixed offset.
  // Chaining through one closure avoids that entirely.
  let rngState = seed;
  return () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };
}

// Win/lose only -- deliberately does not compute damage. Damage is
// getCityCounterFireDamage's responsibility (unconditional on win/lose, applied by the
// caller) so the same formula serves the player, barbarian, and pirate paths uniformly.
export function resolveCityAssault(
  attackerStrength: number,
  intrinsicStrength: number,
  seed: number,
): { attackerWins: boolean } {
  const totalStrength = attackerStrength + intrinsicStrength;
  if (totalStrength === 0) return { attackerWins: true };
  const atkRatio = attackerStrength / totalStrength;
  const rng = createSeededRng(seed);
  const randomFactor = 0.8 + rng() * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));
  return { attackerWins: rng() < adjustedRatio };
}

// Counter-fire damage to a hostile unit attacking a walled, ungarrisoned city (#522) --
// applies uniformly to player, barbarian, and pirate attackers (three call sites: this
// helper, city-capture-system.ts, turn-manager.ts, pirate-system.ts). Deliberately
// scales INVERSELY with attacker strength, mirroring resolveCombat's own
// baseDamage * (1 - adjustedRatio) counter-damage formula -- a much stronger attacker
// already takes proportionally less retaliation there; a flat fraction of intrinsic
// strength would have ignored that convention (caught in design review).
export function getCityCounterFireDamage(
  city: City,
  ownerCiv: Civilization,
  attackerDomain: 'land' | 'naval' | 'air',
  attackerStrength: number,
  hasGarrison: boolean,
  seed: number,
): number {
  if (hasGarrison) return 0;
  if (!(city.buildings ?? []).includes('walls')) return 0;

  const intrinsicStrength = getCityIntrinsicStrength(city, ownerCiv, attackerDomain);
  const totalStrength = attackerStrength + intrinsicStrength;
  if (totalStrength === 0) return 0;
  const atkRatio = attackerStrength / totalStrength;
  const rng = createSeededRng(seed);
  const randomFactor = 0.8 + rng() * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));
  const baseDamage = 30 + rng() * 20; // same range as resolveCombat's baseDamage (era 3+ band)
  return Math.round(baseDamage * (1 - adjustedRatio));
}

export interface CitySiegeInput {
  city: City;
  ownerCiv: Civilization;
  rawDamage: number;
  attackerDomain: 'land' | 'naval' | 'air';
  hasGarrison: boolean;
  // A siege never eliminates a civilization — the last city sacks, never destroys (#522).
  // A civ is only ever ended by another civ's conquest. Optional/defaults false so
  // existing direct-construction call sites keep their current destroy behavior.
  isOwnersLastCity?: boolean;
  era: number;
  challenge: OpponentChallenge;
}

export type CitySiegeOutcome = 'blocked' | 'damaged' | 'sacked' | 'destroyed';

export interface CitySiegeResult {
  hpLost: number;
  newHp: number;
  outcome: CitySiegeOutcome;
  goldLost: number;
}

const SACK_GOLD_LOSS_FRACTION = 0.15;

// A garrisoned defender fully blocks city-HP damage — the barbarian/pirate equivalent
// of beginMajorCityAssault's "city-defended" gate for player-vs-player capture. This
// also means HP can only ever reach 0 on an undefended city, so no separate
// "destroy only if ungarrisoned" check is needed below.
export function resolveCitySiegeDamage(input: CitySiegeInput): CitySiegeResult {
  const currentHp = input.city.hp ?? 100;

  if (input.hasGarrison) {
    return { hpLost: 0, newHp: currentHp, outcome: 'blocked', goldLost: 0 };
  }

  const breakdown = getCityDefenseBreakdown({
    cityBuildings: input.city.buildings ?? [],
    defenderCompletedTechs: input.ownerCiv.techState.completed ?? [],
    attackerDomain: input.attackerDomain,
  });
  const mitigatedDamage = Math.max(
    0,
    Math.round(input.rawDamage / breakdown.multiplier) - breakdown.flatBonus,
  );
  const newHp = Math.max(0, currentHp - mitigatedDamage);

  if (newHp > 0) {
    return { hpLost: currentHp - newHp, newHp, outcome: 'damaged', goldLost: 0 };
  }

  const destructionEra = OPPONENT_CHALLENGE_PROFILES[input.challenge].citySiegeDestructionEra;
  if (input.era > destructionEra && !input.isOwnersLastCity) {
    return { hpLost: currentHp, newHp: 0, outcome: 'destroyed', goldLost: 0 };
  }

  const goldLost = Math.round(input.ownerCiv.gold * SACK_GOLD_LOSS_FRACTION);
  return { hpLost: currentHp - 1, newHp: 1, outcome: 'sacked', goldLost };
}

// Immutable state transform for a resolveCitySiegeDamage result. 'blocked' never
// reaches here from a real caller (no HP change to apply) but is a documented no-op
// for callers that don't special-case it.
export function applyCitySiegeOutcome(state: GameState, cityId: string, result: CitySiegeResult): GameState {
  if (result.outcome === 'blocked') return state;

  const city = state.cities[cityId];
  if (!city) return state;

  if (result.outcome === 'destroyed') {
    const { [cityId]: _removed, ...remainingCities } = state.cities;
    const ownerCiv = state.civilizations[city.owner];
    return {
      ...state,
      cities: remainingCities,
      civilizations: ownerCiv
        ? {
          ...state.civilizations,
          [city.owner]: { ...ownerCiv, cities: ownerCiv.cities.filter(id => id !== cityId) },
        }
        : state.civilizations,
    };
  }

  const ownerCiv = state.civilizations[city.owner];
  return {
    ...state,
    cities: { ...state.cities, [cityId]: { ...city, hp: result.newHp } },
    civilizations: ownerCiv && result.goldLost > 0
      ? {
        ...state.civilizations,
        [city.owner]: { ...ownerCiv, gold: Math.max(0, ownerCiv.gold - result.goldLost) },
      }
      : state.civilizations,
  };
}

// A city tile is "garrisoned" if any living unit owned by the city's owner occupies it.
export function getCityGarrisonUnit(units: Record<string, Unit>, city: Pick<City, 'owner' | 'position'>): Unit | undefined {
  const cityKey = hexKey(city.position);
  return Object.values(units).find(unit => unit.owner === city.owner && hexKey(unit.position) === cityKey);
}

export function hasCityGarrison(units: Record<string, Unit>, city: Pick<City, 'owner' | 'position'>): boolean {
  return getCityGarrisonUnit(units, city) !== undefined;
}

// Any unit hostile to the city's owner (barbarian, pirate, or a civ at war) within
// `range` hexes blocks passive HP regeneration — mirrors HEAL_PASSIVE's "idle" gate
// for units, applied to cities instead.
export function hasHostileUnitNearCity(
  units: Record<string, Unit>,
  city: Pick<City, 'owner' | 'position'>,
  isHostile: (unitOwner: string) => boolean,
  range: number,
  distanceFn: (a: HexCoord, b: HexCoord) => number,
): boolean {
  return Object.values(units).some(unit =>
    unit.owner !== city.owner
    && isHostile(unit.owner)
    && distanceFn(unit.position, city.position) <= range);
}

const CITY_HP_REGEN_PER_TURN = 5;
const CITY_HP_MAX = 100;
const CITY_HP_REGEN_HOSTILE_RANGE = 1;

// True when a city below max HP has no hostile unit within regen range — shared by
// applyCityHpRegeneration (turn processing) and the city panel (UI status label) so
// the two never drift apart on what counts as "under siege" vs "recovering".
export function isCityHpRegenerating(state: GameState, city: City): boolean {
  const hp = city.hp ?? CITY_HP_MAX;
  if (hp >= CITY_HP_MAX || hp <= 0) return false;

  const ownerCiv = state.civilizations[city.owner];
  const distanceFn = state.map.wrapsHorizontally
    ? (a: HexCoord, b: HexCoord) => wrappedHexDistance(a, b, state.map.width)
    : hexDistance;
  return !hasHostileUnitNearCity(
    state.units,
    city,
    unitOwner => isAlwaysHostilePair(unitOwner, city.owner) || (ownerCiv ? isAtWar(ownerCiv.diplomacy, unitOwner) : false),
    CITY_HP_REGEN_HOSTILE_RANGE,
    distanceFn,
  );
}

// +5 HP/turn (same rate as unit HEAL_PASSIVE) for any city below max HP, as long as
// no hostile unit is within 1 hex. A city at 0 HP does not regenerate on its own —
// it only reaches 0 via the 'sacked' outcome, which already floors it at 1.
export function applyCityHpRegeneration(state: GameState): GameState {
  let nextCities: GameState['cities'] | null = null;

  for (const city of Object.values(state.cities)) {
    const hp = city.hp ?? CITY_HP_MAX;
    if (hp >= CITY_HP_MAX || hp <= 0) continue;
    if (!isCityHpRegenerating(state, city)) continue;

    if (!nextCities) nextCities = { ...state.cities };
    nextCities[city.id] = { ...city, hp: Math.min(CITY_HP_MAX, hp + CITY_HP_REGEN_PER_TURN) };
  }

  return nextCities ? { ...state, cities: nextCities } : state;
}
