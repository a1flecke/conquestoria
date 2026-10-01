import type { GameState } from '@/core/types';
import { removeUnits } from '@/systems/unit-removal-system';

export type CoastalBatterySource = 'player' | 'ai' | 'barbarian' | 'pirate';

export interface CoastalBatteryCounterfireInput {
  cityId: string;
  attackerUnitId: string;
  attackerDomain: 'land' | 'naval' | 'air';
  /** The resolved CitySiegeResult.hpLost, never raw pre-mitigation damage. */
  cityDamage: number;
  source: CoastalBatterySource;
}

export interface CoastalBatteryCounterfireEvent {
  cityId: string;
  attackerUnitId: string;
  recipientCivId: string;
  source: CoastalBatterySource;
  damage: number;
  attackerDied: boolean;
}

export interface CoastalBatteryCounterfireResult {
  state: GameState;
  damage: number;
  event?: CoastalBatteryCounterfireEvent;
}

const noCounterfire = (state: GameState): CoastalBatteryCounterfireResult => ({ state, damage: 0 });

/** Applies the once-per-city, per-global-turn Coastal Battery reaction after a naval city siege. */
export function resolveCoastalBatteryCounterfire(
  state: GameState,
  input: CoastalBatteryCounterfireInput,
): CoastalBatteryCounterfireResult {
  const city = state.cities[input.cityId];
  const attacker = state.units[input.attackerUnitId];
  if (
    !city
    || !attacker
    || !city.buildings.includes('coastal_battery')
    || input.attackerDomain !== 'naval'
    || input.cityDamage <= 0
    || city.coastalBatteryCounterfireTurn === state.turn
  ) return noCounterfire(state);

  const cities = {
    ...state.cities,
    [city.id]: { ...city, coastalBatteryCounterfireTurn: state.turn },
  };
  const damage = Math.min(12, Math.round(input.cityDamage * 0.2));
  // A 1–2 HP first hit rounds to zero retaliation, but it is still the first
  // damaging hit and must consume this turn's single Battery reaction.
  if (damage <= 0) return { state: { ...state, cities }, damage: 0 };

  const attackerDied = attacker.health <= damage;
  const nextState: GameState = attackerDied
    ? removeUnits({ ...state, cities }, [attacker.id], { reason: 'destroyed' }).state
    : { ...state, cities, units: { ...state.units, [attacker.id]: { ...attacker, health: attacker.health - damage } } };

  return {
    state: nextState,
    damage,
    event: {
      cityId: city.id,
      attackerUnitId: attacker.id,
      recipientCivId: city.owner,
      source: input.source,
      damage,
      attackerDied,
    },
  };
}
