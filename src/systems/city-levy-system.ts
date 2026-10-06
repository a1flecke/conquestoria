import type { City, GameState } from '@/core/types';
import { CONQUEST_UNREST_DURATION } from './faction-unrest-model';
import { FEDERALISM_TECH_ID } from './faction-federalism';

/**
 * #1338: the light-only Imperial Levy.
 *
 * A conqueror may place one flat, capped gold levy on a city it holds by recent
 * conquest. The city pays extra gold and gains its own unrest-pressure row; the
 * trade is visible before confirmation. V1 ships LIGHT ONLY (no none/light/heavy
 * ladder) and adds no governance-capacity cost -- the unrest cost plus the toggle
 * lock are the counterweights.
 *
 * One canonical owner: `setCityLevy` is the only mutation, used by the city panel
 * and the AI. Gold, unrest and presentation all read the one definition here, so
 * they can never drift from separate constants.
 */

/** Flat gold per turn a levied city pays. Capped, never a percentage of city gold. */
export const CITY_LEVY_GOLD_BONUS = 5;
/** Base unrest pressure the levy adds to its host city. */
export const CITY_LEVY_UNREST = 8;
/** Ordinary relief can soften but never erase the levy; the cost floors here. */
export const CITY_LEVY_RESIDUAL_FLOOR = 2;
/** Local Autonomy Writ devolves rule and eases the levy by this much. */
export const CITY_LEVY_LOCAL_AUTONOMY_RELIEF = 3;
/** Decolonization (the Federal Autonomy tech) materially eases the levy. */
export const CITY_LEVY_DECOLONIZATION_RELIEF = 4;
/**
 * Anti-thrash lock, deliberately the same duration as GOVERNANCE_POLICY_LOCK_TURNS
 * (5). Kept as a local constant so the economy's import graph does not pull the
 * governance-capacity chain; `city-levy-system.test.ts` pins the two equal.
 */
export const CITY_LEVY_LOCK_TURNS = 5;

export type CityLevyLevel = 'light';

export function isCityHeldByRecentConquest(city: City, state: Pick<GameState, 'turn'>): boolean {
  if (city.conquestTurn === undefined) return false;
  return state.turn - city.conquestTurn < CONQUEST_UNREST_DURATION;
}

/** The one definition of the levy's flat gold bonus; economy, UI and AI read it. */
export function getCityLevyGoldBonus(city: City): number {
  return city.levy === 'light' ? CITY_LEVY_GOLD_BONUS : 0;
}

/**
 * The unrest the levy WOULD add to this city, independent of whether it is
 * currently active. Used for pre-confirmation projections (UI and AI).
 */
export function getProjectedCityLevyUnrestAmount(state: GameState, city: City): number {
  const civ = state.civilizations[city.owner];
  let amount = CITY_LEVY_UNREST;
  if (civ?.governancePolicies?.['local-autonomy-writ'] === true) amount -= CITY_LEVY_LOCAL_AUTONOMY_RELIEF;
  if (civ?.techState.completed.includes(FEDERALISM_TECH_ID) === true) amount -= CITY_LEVY_DECOLONIZATION_RELIEF;
  return Math.max(CITY_LEVY_RESIDUAL_FLOOR, amount);
}

/**
 * The levy's own unrest row. Ordinary relief never targets this row; the only
 * deliberate eases are the Local Autonomy Writ governance policy and
 * decolonization (the Federal Autonomy tech). The residual floor keeps a levied
 * city meaningfully costly even under both.
 */
export function getCityLevyUnrestAmount(state: GameState, city: City): number {
  return city.levy === 'light' ? getProjectedCityLevyUnrestAmount(state, city) : 0;
}

export function getCityLevyLockedUntilTurn(city: City): number {
  return city.levyChangedTurn === undefined ? -Infinity : city.levyChangedTurn + CITY_LEVY_LOCK_TURNS;
}

export type SetCityLevyFailureReason =
  | 'not-owner'
  | 'not-conquered'
  | 'locked'
  | 'already-set'
  | 'not-set';

export interface SetCityLevyCommand {
  cityId: string;
  actorId: string;
  enabled: boolean;
}

export type SetCityLevyResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: SetCityLevyFailureReason };

/**
 * The one eligibility source: the panel's affordance and `setCityLevy` both ask
 * it, so "offered" cannot drift from "executable". Returns null when legal.
 */
export function getSetCityLevyDenial(
  state: GameState,
  command: SetCityLevyCommand,
): SetCityLevyFailureReason | null {
  const city = state.cities[command.cityId];
  if (!city || city.owner !== command.actorId) return 'not-owner';
  if (command.enabled && !isCityHeldByRecentConquest(city, state)) return 'not-conquered';
  const isSet = city.levy === 'light';
  if (isSet === command.enabled) return command.enabled ? 'already-set' : 'not-set';
  if (state.turn < getCityLevyLockedUntilTurn(city)) return 'locked';
  return null;
}

export function setCityLevy(state: GameState, command: SetCityLevyCommand): SetCityLevyResult {
  const denial = getSetCityLevyDenial(state, command);
  if (denial) return { ok: false, state, reason: denial };
  const city = state.cities[command.cityId];
  return {
    ok: true,
    state: {
      ...state,
      cities: {
        ...state.cities,
        [command.cityId]: {
          ...city,
          levy: command.enabled ? 'light' : undefined,
          levyChangedTurn: state.turn,
        },
      },
    },
  };
}

/**
 * Clear any levy a city may no longer legitimately carry (its conquest window
 * ended, or it changed hands). Returns the same state object when nothing
 * changed, so callers can thread it through a turn cheaply.
 */
export function normalizeCityLevies(state: GameState): GameState {
  let changed = false;
  const cities = Object.fromEntries(Object.entries(state.cities).map(([cityId, city]) => {
    if (city.levy !== 'light') return [cityId, city];
    if (isCityHeldByRecentConquest(city, state)) return [cityId, city];
    changed = true;
    return [cityId, { ...city, levy: undefined, levyChangedTurn: undefined }];
  }));
  return changed ? { ...state, cities } : state;
}
