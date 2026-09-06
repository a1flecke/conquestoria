import type { GameState, Unit } from '@/core/types';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import { getUnitAttackProfile } from '@/systems/attack-targeting';
import { getVisibility } from '@/systems/fog-of-war';
import { isPirateOwner } from '@/core/owner-kind';
import { isHostileOwnerTo } from '@/systems/owner-hostility';
import { resolveCoastalBatteryCounterfire, type CoastalBatteryCounterfireEvent } from '@/systems/coastal-defense-system';
import {
  applyCitySiegeOutcome,
  CITY_BOMBARDMENT_GARRISON_MITIGATION,
  getCityCounterFireDamage,
  getCityGarrisonUnit,
  getRemainingBombardmentCap,
  recordBombardment,
  resolveCitySiegeDamage,
} from '@/systems/city-siege-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type CityBombardmentSource = 'player' | 'ai';

/**
 * #974: damage coefficient shared by every domain. Inherited unchanged from the naval-only
 * predecessor so naval bombardment damage stays bit-identical to pre-#974 behaviour.
 */
export const CITY_BOMBARDMENT_COEFFICIENT = 0.4;

/**
 * A walled city returns fire on a bombardier standing right next to it. Beyond this the
 * attacker is safe -- which is precisely what makes a slow, expensive, longer-ranged siege
 * unit worth its cost over a cheap adjacent one.
 */
export const CITY_COUNTERFIRE_RANGE = 1;

export interface CityBombardmentInput {
  attackerUnitId: string;
  cityId: string;
  source: CityBombardmentSource;
}

export interface CityBombardmentEvent {
  cityId: string;
  recipientCivId: string;
  source: CityBombardmentSource;
  hpLost: number;
  domain: 'land' | 'naval' | 'air';
}

export type CityBombardmentFailure =
  | 'missing-attacker-or-city'
  | 'missing-city-owner'
  | 'not-bombard-capable'
  | 'no-action-points'
  | 'out-of-range'
  | 'not-hostile'
  | 'not-visible'
  | 'no-damage';

export type CityBombardmentLegality =
  | { ok: true; distance: number }
  | { ok: false; reason: Exclude<CityBombardmentFailure, 'missing-attacker-or-city' | 'missing-city-owner' | 'no-damage'> };

/**
 * Whether `attacker` may bombard `city` right now.
 *
 * Deliberately NOT built on `canUnitAttackTarget`: that helper resolves a coordinate, and a
 * garrisoned city tile resolves to the garrison UNIT, never the city. Reusing it would have
 * made a defended city un-bombardable -- which defeats the whole "bombard through the
 * garrison" rule (#974). Bombarding a city and attacking the unit standing in it are two
 * different actions on the same tile, so they need two different legality checks.
 */
export function canUnitBombardCity(
  state: GameState,
  attacker: Unit,
  city: { owner: string; position: { q: number; r: number } },
  options: { requireVisibility?: boolean } = {},
): CityBombardmentLegality {
  const definition = UNIT_DEFINITIONS[attacker.type];
  const profile = getUnitAttackProfile(attacker.type);

  if (definition.strength <= 0) return { ok: false, reason: 'not-bombard-capable' };
  if (profile.kind !== 'ranged' && profile.kind !== 'bombard') return { ok: false, reason: 'not-bombard-capable' };
  if (!profile.targets.includes('city')) return { ok: false, reason: 'not-bombard-capable' };
  // Pirates raid shipping and coastlines; they never attack cities (pirate-factions design).
  if (isPirateOwner(attacker.owner)) return { ok: false, reason: 'not-bombard-capable' };
  if (attacker.hasActed || attacker.movementPointsLeft <= 0) return { ok: false, reason: 'no-action-points' };
  if (!isHostileOwnerTo(state, attacker.owner, city.owner)) return { ok: false, reason: 'not-hostile' };

  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(attacker.position, city.position, state.map.width)
    : hexDistance(attacker.position, city.position);
  if (distance <= 0 || distance > profile.range) return { ok: false, reason: 'out-of-range' };

  if (options.requireVisibility) {
    const visibility = state.civilizations[attacker.owner]?.visibility;
    if (!visibility || getVisibility(visibility, city.position) !== 'visible') {
      return { ok: false, reason: 'not-visible' };
    }
  }
  return { ok: true, distance };
}

export type CityBombardmentResult =
  | {
      ok: true;
      state: GameState;
      hpLost: number;
      counterFireDamage: number;
      attackerDied: boolean;
      cityEvent?: CityBombardmentEvent;
      batteryEvent?: CoastalBatteryCounterfireEvent;
    }
  | { ok: false; state: GameState; reason: CityBombardmentFailure };

function consumeAttackAction(state: GameState, attackerId: string): GameState {
  const current = state.units[attackerId];
  if (!current) return state;
  return {
    ...state,
    units: { ...state.units, [attackerId]: { ...current, hasActed: true, movementPointsLeft: 0 } },
  };
}

/** Raw damage before any city defense mitigation. */
export function getCityBombardmentRawDamage(attacker: Unit): number {
  return Math.max(
    1,
    Math.round(UNIT_DEFINITIONS[attacker.type].strength * (attacker.health / 100) * CITY_BOMBARDMENT_COEFFICIENT),
  );
}

/**
 * Resolves a non-capturing bombardment against a hostile city, for land, naval, or air
 * attackers alike (#974).
 *
 * This is the single mutation seam shared by player input and AI tactics. Before #974 its
 * naval-only predecessor was fully built and unit-tested but **unreachable from the
 * player's seat** -- the one route to it required `targetType === 'unit'`, which a city
 * never is -- so only the AI could bombard a city.
 *
 * Never captures, razes, or destroys: `preventDestruction` floors the city at 1 HP, and
 * ownership changes only through the land capture flow.
 */
export function resolveUnitCityBombardment(
  state: GameState,
  input: CityBombardmentInput,
): CityBombardmentResult {
  const attacker = state.units[input.attackerUnitId];
  const city = state.cities[input.cityId];
  if (!attacker || !city) return { ok: false, state, reason: 'missing-attacker-or-city' };

  const legality = canUnitBombardCity(state, attacker, city);
  if (!legality.ok) return { ok: false, state, reason: legality.reason };

  const ownerCiv = state.civilizations[city.owner];
  if (!ownerCiv) return { ok: false, state, reason: 'missing-city-owner' };

  const domain = UNIT_DEFINITIONS[attacker.type].domain ?? 'land';
  const hasGarrison = getCityGarrisonUnit(state.units, city) !== undefined;

  const siege = resolveCitySiegeDamage({
    city,
    ownerCiv,
    rawDamage: getCityBombardmentRawDamage(attacker),
    attackerDomain: domain,
    hasGarrison,
    // A unit deliberately spending its action fires through a garrison, at half effect.
    // Ambient barbarian/pirate siege ticks keep the hard block (#974).
    ignoreGarrison: true,
    garrisonMitigation: CITY_BOMBARDMENT_GARRISON_MITIGATION,
    maxHpLoss: getRemainingBombardmentCap(city, state.turn),
    isOwnersLastCity: ownerCiv.cities.length <= 1,
    preventDestruction: true,
    era: resolveCivilizationEra(ownerCiv.techState.completed),
    challenge: resolveChallengeForCiv(state, city.owner),
  });

  // A shot that cannot scratch the city (fortifications absorb it, a garrison halves it
  // below 1, or this city's per-turn cap is already spent) must never burn the unit's turn.
  // The caller surfaces the reason instead -- see resolveCityInteraction's `denied`.
  if (siege.hpLost <= 0) return { ok: false, state, reason: 'no-damage' };

  const battery = resolveCoastalBatteryCounterfire(state, {
    cityId: city.id,
    attackerUnitId: attacker.id,
    attackerDomain: domain,
    cityDamage: siege.hpLost,
    source: input.source,
  });

  let nextState = applyCitySiegeOutcome(battery.state, city.id, siege);
  const bombardedCity = nextState.cities[city.id];
  if (bombardedCity) {
    nextState = {
      ...nextState,
      cities: {
        ...nextState.cities,
        [city.id]: { ...bombardedCity, bombardment: recordBombardment(city, state.turn, siege.hpLost) },
      },
    };
  }

  // Walls answer an adjacent bombardier regardless of garrison: `hasGarrison: false` is
  // passed deliberately so standing next to a walled city is risky whether or not it is
  // defended, while standing off at range 2-3 stays safe.
  let counterFireDamage = 0;
  let attackerDied = false;
  if (legality.distance <= CITY_COUNTERFIRE_RANGE) {
    counterFireDamage = getCityCounterFireDamage(
      city,
      ownerCiv,
      domain,
      UNIT_DEFINITIONS[attacker.type].strength,
      false,
      Math.abs(state.turn * 7919) ^ 0x5a5a,
    );
  }
  if (counterFireDamage > 0) {
    const current = nextState.units[attacker.id];
    if (current) {
      const healthAfter = current.health - counterFireDamage;
      if (healthAfter <= 0) {
        attackerDied = true;
        const units = { ...nextState.units };
        delete units[attacker.id];
        const civ = nextState.civilizations[attacker.owner];
        nextState = {
          ...nextState,
          units,
          ...(civ
            ? { civilizations: { ...nextState.civilizations, [attacker.owner]: { ...civ, units: civ.units.filter(id => id !== attacker.id) } } }
            : {}),
        };
      } else {
        nextState = {
          ...nextState,
          units: { ...nextState.units, [attacker.id]: { ...current, health: healthAfter } },
        };
      }
    }
  }

  if (!attackerDied) nextState = consumeAttackAction(nextState, attacker.id);

  return {
    ok: true,
    state: nextState,
    hpLost: siege.hpLost,
    counterFireDamage,
    attackerDied,
    cityEvent: { cityId: city.id, recipientCivId: city.owner, source: input.source, hpLost: siege.hpLost, domain },
    batteryEvent: battery.event,
  };
}
