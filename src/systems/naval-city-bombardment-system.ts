import type { GameState, Unit } from '@/core/types';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { resolveCoastalBatteryCounterfire, type CoastalBatteryCounterfireEvent } from '@/systems/coastal-defense-system';
import { applyCitySiegeOutcome, getCityGarrisonUnit, resolveCitySiegeDamage } from '@/systems/city-siege-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type NavalCityBombardmentSource = 'player' | 'ai';

export interface NavalCityBombardmentInput {
  attackerUnitId: string;
  cityId: string;
  source: NavalCityBombardmentSource;
}

export interface NavalCityBombardmentEvent {
  cityId: string;
  recipientCivId: string;
  source: NavalCityBombardmentSource;
  hpLost: number;
}

export type NavalCityBombardmentResult =
  | { ok: true; state: GameState; cityEvent?: NavalCityBombardmentEvent; batteryEvent?: CoastalBatteryCounterfireEvent }
  | { ok: false; state: GameState; reason: string };

function consumeAttackAction(state: GameState, attacker: Unit): GameState {
  const current = state.units[attacker.id];
  if (!current) return state;
  return {
    ...state,
    units: {
      ...state.units,
      [attacker.id]: { ...current, hasActed: true, movementPointsLeft: 0 },
    },
  };
}

/**
 * Resolves a non-capturing naval siege against a hostile city. This is the single
 * mutation seam shared by player input and major-AI tactics; pirates retain their
 * separate blockade cadence but use the same defense and Battery helpers.
 */
export function resolveNavalCityBombardment(
  state: GameState,
  input: NavalCityBombardmentInput,
): NavalCityBombardmentResult {
  const attacker = state.units[input.attackerUnitId];
  const city = state.cities[input.cityId];
  if (!attacker || !city) return { ok: false, state, reason: 'missing-attacker-or-city' };
  if (UNIT_DEFINITIONS[attacker.type].domain !== 'naval') {
    return { ok: false, state, reason: 'non-naval-attacker' };
  }

  const legality = canUnitAttackTarget(state, attacker, city.position, { requireVisibility: false });
  if (!legality.ok || legality.targetType !== 'city' || legality.cityId !== city.id) {
    return { ok: false, state, reason: legality.ok ? 'invalid-city-target' : legality.reason };
  }

  const ownerCiv = state.civilizations[city.owner];
  if (!ownerCiv) return { ok: false, state, reason: 'missing-city-owner' };

  const rawDamage = Math.max(1, Math.round(UNIT_DEFINITIONS[attacker.type].strength * (attacker.health / 100) * 0.4));
  const siege = resolveCitySiegeDamage({
    city,
    ownerCiv,
    rawDamage,
    attackerDomain: 'naval',
    hasGarrison: getCityGarrisonUnit(state.units, city) !== undefined,
    isOwnersLastCity: ownerCiv.cities.length <= 1,
    preventDestruction: true,
    era: resolveCivilizationEra(ownerCiv.techState.completed),
    challenge: resolveChallengeForCiv(state, city.owner),
  });
  const battery = resolveCoastalBatteryCounterfire(state, {
    cityId: city.id,
    attackerUnitId: attacker.id,
    attackerDomain: 'naval',
    cityDamage: siege.hpLost,
    source: input.source,
  });
  const afterSiege = applyCitySiegeOutcome(battery.state, city.id, siege);
  const nextState = consumeAttackAction(afterSiege, attacker);

  return {
    ok: true,
    state: nextState,
    cityEvent: siege.hpLost > 0
      ? { cityId: city.id, recipientCivId: city.owner, source: input.source, hpLost: siege.hpLost }
      : undefined,
    batteryEvent: battery.event,
  };
}
