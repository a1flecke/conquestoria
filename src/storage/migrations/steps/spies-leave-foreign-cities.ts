import type { GameState, HexCoord } from '@/core/types';
import { getCapitalCity } from '@/systems/capital-system';
import { hexKey } from '@/systems/hex-utils';
import { isSpyUnitType } from '@/systems/spy-unit-types';
import { findSpyReturnTile } from '@/systems/unit-spawn-placement';

/**
 * Schema 39 — a spy never stands on a city it does not own.
 *
 * Before this, a spy could walk onto a foreign city to infiltrate it and stay there: idle, or
 * lying low after a failed attempt. It now infiltrates from the adjacent tile and is blocked from
 * every city its owner does not hold. A save written earlier can still hold such a spy, so each one
 * is moved, once:
 * - to a tile next to that city where it may stand, otherwise
 * - home to its own capital (beside its garrison) or a tile next to it.
 * A spy with nowhere legal to go stays put rather than being deleted. Cargo aboard a ship is not
 * on the map and is left alone. Spies are visited in id order, each seeing the moves before it, so
 * the result is deterministic. A save with no such spy is returned unchanged.
 */
export function migrateSpiesLeaveForeignCities(state: GameState): GameState {
  const cities = Object.values(state.cities ?? {});
  if (cities.length === 0) return state;
  const cityOwnerByKey = new Map(cities.map(city => [hexKey(city.position), city]));

  let next = state;
  for (const unitId of Object.keys(state.units ?? {}).sort()) {
    const unit = next.units[unitId];
    if (!unit || unit.transportId || !isSpyUnitType(unit.type)) continue;
    const city = cityOwnerByKey.get(hexKey(unit.position));
    if (!city || city.owner === unit.owner) continue;

    const capital = next.civilizations?.[unit.owner] ? getCapitalCity(next, unit.owner) : undefined;
    const destination: HexCoord | null =
      findSpyReturnTile(next, unit.owner, unit.type, city.position)
      ?? (capital ? findSpyReturnTile(next, unit.owner, unit.type, capital.position) : null);
    if (!destination) continue;
    next = { ...next, units: { ...next.units, [unitId]: { ...unit, position: { ...destination } } } };
  }
  return next;
}
