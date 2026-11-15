import type { City, GameState, Unit } from '@/core/types';
import { mapDistance } from './hex-utils';
import { isSpyUnitType } from './spy-unit-types';

/**
 * The city a spy unit on the map can infiltrate from where it stands: a city of another major
 * civilization on an adjacent tile. A spy never enters a foreign city (`getBlockingMapEntitiesByHex`
 * blocks every city its owner does not hold), so infiltration is an adjacent action. City-states
 * have no espionage of their own and are not targets.
 *
 * The one answer for the selected-unit panel's Infiltrate button, the player's command and the AI.
 * Cities stand at least four tiles apart, so at most one city is ever adjacent; the id order only
 * makes the answer deterministic if that ever changed.
 */
export function getInfiltrationTargetCity(
  state: GameState,
  spy: Pick<Unit, 'owner' | 'type' | 'position'>,
): City | null {
  if (!isSpyUnitType(spy.type)) return null;
  const candidates = Object.values(state.cities)
    .filter(city => city.owner !== spy.owner
      && state.civilizations[city.owner] !== undefined
      && !state.civilizations[city.owner].isEliminated
      && mapDistance(state.map, city.position, spy.position) === 1)
    .sort((left, right) => left.id.localeCompare(right.id));
  return candidates[0] ?? null;
}
