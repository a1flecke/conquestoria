import type { City, Civilization, GameState, HexCoord, Unit } from '@/core/types';
import type { OpponentChallenge } from '@/core/types';
import { OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
import { getCityDefenseBreakdown } from '@/systems/combat-system';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import { isAtWar } from '@/systems/diplomacy-system';

export interface CitySiegeInput {
  city: City;
  ownerCiv: Civilization;
  rawDamage: number;
  attackerDomain: 'land' | 'naval' | 'air';
  hasGarrison: boolean;
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
  if (input.era > destructionEra) {
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
