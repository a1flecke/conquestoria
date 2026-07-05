import type { GameState, Unit } from '@/core/types';
import type { CombatContext } from './combat-system';
import { resolveCivDefinition } from './civ-registry';
import { hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

// Shared by the human attack flow (main.ts), every AI attack path
// (ai-major-turn.ts, ai-tactics.ts), and the combat preview so the
// three can never diverge in what defense modifiers a defender receives.
export function buildCombatContextForDefender(
  state: GameState,
  attacker: Unit,
  defender: Unit,
): CombatContext {
  const defenderKey = hexKey(defender.position);
  const defenderCity = Object.values(state.cities).find(
    city => hexKey(city.position) === defenderKey,
  );

  return {
    attackerBonus: resolveCivDefinition(
      state,
      state.civilizations[attacker.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderBonus: resolveCivDefinition(
      state,
      state.civilizations[defender.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderCityHasAntiAir: Object.values(state.cities).some(city =>
      hexKey(city.position) === defenderKey
      && city.buildings.includes('anti_air_battery')),
    attackerHasAirForceCommand: Object.values(state.cities).some(city =>
      city.owner === attacker.owner
      && city.buildings.includes('air_force_command')),
    defenderCity: defenderCity
      ? {
          cityBuildings: defenderCity.buildings,
          defenderCompletedTechs: state.civilizations[defender.owner]?.techState.completed ?? [],
          attackerDomain: UNIT_DEFINITIONS[attacker.type]?.domain ?? 'land',
        }
      : undefined,
  };
}
