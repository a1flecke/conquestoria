/**
 * #1704 (A2): stationing the home guard.
 *
 * The AI trains one land combat unit per city (`HOME_GUARD_SOFT_CAP`, ai-prepared-turn.ts), but every
 * idle combat unit was handed to administrative auto-explore and never came back: measured at turn 90,
 * most AI cities had no defender within a hex and some units stood 13-20 hexes from home. A city with
 * no unit in it can be captured outright.
 *
 * This decides, from the civilization's own units and cities only, which unit should stand in which
 * city. It is pure; basic-ai.ts turns each order into the existing `journey` standing order.
 */
import type { HexCoord } from '@/core/types/hex';
import { getAIStrategicRoles } from '@/ai/ai-unit-roles';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

type GuardUnitType = Parameters<typeof getAIStrategicRoles>[0];

/** The slice of the world this decision reads: the civilization's own roster, cities and units,
 *  plus the map geometry "nearest" is measured against. */
export interface HomeGuardWorld {
  /** Width and horizontal wrapping only — every generated map wraps, so guard distances must
   *  cross the seam like every other world distance. (A structural field, not the `GameMap`
   *  contract, so this slice does not import the compatibility barrel.) */
  map: { width: number; wrapsHorizontally: boolean };
  civilizations: Record<string, { cities: string[]; units: string[] } | undefined>;
  cities: Record<string, { id: string; owner: string; position: HexCoord } | undefined>;
  units: Record<string, {
    type: GuardUnitType;
    position: HexCoord;
    transportId?: string;
    airBase?: unknown;
    committedToRouteId?: string;
    automation?: { mode: string; destination?: HexCoord };
  } | undefined>;
}

/** Land combat units left free to explore rather than stand guard. The demand asks for this many extra. */
export const HOME_GUARD_ROAMERS = 1;

export interface HomeGuardStations {
  /** Units that already stand in one of their owner's cities as its guard. They do not explore. */
  stationedUnitIds: string[];
  /** A unit to send, and the city it should stand in. At most one per unguarded city. */
  orders: Array<{ unitId: string; cityId: string }>;
}

function canGuard(state: HomeGuardWorld, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.transportId || unit.airBase || unit.committedToRouteId) return false;
  const definition = UNIT_DEFINITIONS[unit.type];
  if (!definition || definition.strength <= 0 || (definition.domain ?? 'land') !== 'land') return false;
  const roles = getAIStrategicRoles(unit.type);
  return roles.includes('frontline') || roles.includes('capture');
}

/**
 * `unavailableUnitIds` are units a plan, recovery or an upgrade route already claims this round; they
 * are neither counted as a guard nor sent. Deterministic: cities in roster order (capital first),
 * nearest unit first, ties broken by unit id.
 */
export function planHomeGuardStations(
  state: HomeGuardWorld,
  civId: string,
  unavailableUnitIds: ReadonlySet<string>,
): HomeGuardStations {
  const civ = state.civilizations[civId];
  if (!civ) return { stationedUnitIds: [], orders: [] };
  const cities = civ.cities
    .map(cityId => state.cities[cityId])
    .filter((city): city is NonNullable<typeof city> => city != null && city.owner === civId);
  const guards = civ.units.filter(unitId => !unavailableUnitIds.has(unitId) && canGuard(state, unitId)).sort();

  const stationedUnitIds: string[] = [];
  const unguarded: typeof cities = [];
  for (const city of cities) {
    const key = hexKey(city.position);
    const standing = guards.find(unitId =>
      !stationedUnitIds.includes(unitId) && hexKey(state.units[unitId]!.position) === key);
    // The roamer comes first: with no unit to spare, one standing in a city is free to go exploring.
    if (standing && stationedUnitIds.length < guards.length - HOME_GUARD_ROAMERS) stationedUnitIds.push(standing);
    else unguarded.push(city);
  }

  const free = guards.filter(unitId => !stationedUnitIds.includes(unitId));
  const orders: HomeGuardStations['orders'] = [];
  const guardDistance = (from: HexCoord, to: HexCoord): number =>
    state.map.wrapsHorizontally
      ? wrappedHexDistance(from, to, state.map.width)
      : hexDistance(from, to);
  for (const city of unguarded) {
    // A unit already walking to this city keeps the job; otherwise the nearest free one takes it.
    const enRoute = free.find(unitId => {
      const automation = state.units[unitId]!.automation;
      return automation?.mode === 'journey' && automation.destination !== undefined
        && hexKey(automation.destination) === hexKey(city.position);
    });
    // Keep one unit roaming: exploration is what finds the next city site (ai-simulation.md, #1064),
    // and a civ whose only soldier stood guard stopped expanding.
    if (!enRoute && free.length <= HOME_GUARD_ROAMERS) break;
    const chosen = enRoute ?? [...free].sort((left, right) =>
      guardDistance(state.units[left]!.position, city.position) - guardDistance(state.units[right]!.position, city.position)
      || left.localeCompare(right))[0];
    if (!chosen) break;
    free.splice(free.indexOf(chosen), 1);
    orders.push({ unitId: chosen, cityId: city.id });
  }
  return { stationedUnitIds, orders };
}
