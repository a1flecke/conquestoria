import type { GameState } from '@/core/types';
import { isAtWar } from '@/systems/diplomacy-queries';
import { mapDistance } from '@/systems/hex-utils';

export type PropagandistAction = 'rally' | 'undermine';
export type PropagandistActionFailure =
  | 'missing-unit'
  | 'invalid-unit'
  | 'already-acted'
  | 'used-this-turn'
  | 'missing-city'
  | 'out-of-range'
  | 'wrong-owner'
  | 'not-at-war';

export type PropagandistActionResult =
  | { ok: true; state: GameState; message: string }
  | { ok: false; state: GameState; reason: PropagandistActionFailure };

const ACTION_RANGE = 1;
const PRESSURE_DELTA = 10;
const DIGITAL_DEMOCRACY_RALLY_BONUS = 5;
const CONTEMPLATIVE_TECHNOLOGY_UNDERMINE_REDUCTION = 5;
const MAX_SPY_UNREST = 50;

/**
 * Shared Rally/Undermine mutation for UI and AI. Both actions are deliberately
 * visible, one-use-per-turn, range-limited civic pressure tools; they never
 * create hidden information or bypass diplomacy.
 */
export function usePropagandistAction(
  state: GameState,
  unitId: string,
  action: PropagandistAction,
  cityId: string,
): PropagandistActionResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit' };
  if (unit.type !== 'propagandist') return { ok: false, state, reason: 'invalid-unit' };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };
  // #544 contract §19 item 67: "no refresh of once-per-turn special abilities". Seize the
  // Moment grants its extra action by clearing `hasActed`, and this ability has no charge or
  // cooldown of its own, so the once-per-turn gate needs an independent marker -- otherwise
  // one Command Charge buys a second Rally/Undermine in the same turn.
  if (unit.specialActionUsedTurn === state.turn) return { ok: false, state, reason: 'used-this-turn' };
  const city = state.cities[cityId];
  if (!city) return { ok: false, state, reason: 'missing-city' };
  if (mapDistance(state.map, unit.position, city.position) > ACTION_RANGE) return { ok: false, state, reason: 'out-of-range' };

  const owner = state.civilizations[unit.owner];
  const targetOwner = state.civilizations[city.owner];
  if (action === 'rally') {
    if (city.owner !== unit.owner) return { ok: false, state, reason: 'wrong-owner' };
    const rallyDelta = PRESSURE_DELTA
      + (owner?.techState.completed.includes('digital-democracy') ? DIGITAL_DEMOCRACY_RALLY_BONUS : 0);
    const nextCity = { ...city, spyUnrestBonus: Math.max(0, city.spyUnrestBonus - rallyDelta) };
    return {
      ok: true,
      state: {
        ...state,
        cities: { ...state.cities, [cityId]: nextCity },
        // The action is spent like every other in-place action (fortify, rest, worker
        // action, spy disguise): movement legality never re-reads hasActed, so the
        // executor must consume the unit's remaining movement together with its action
        // or the unit gets to act and then still move this turn.
        units: { ...state.units, [unitId]: { ...unit, hasActed: true, movementPointsLeft: 0, specialActionUsedTurn: state.turn } },
      },
      message: `${city.name} rallies against unrest.`,
    };
  }
  if (city.owner === unit.owner) return { ok: false, state, reason: 'wrong-owner' };
  if (!owner || !targetOwner || !isAtWar(owner.diplomacy, city.owner) || !isAtWar(targetOwner.diplomacy, unit.owner)) {
    return { ok: false, state, reason: 'not-at-war' };
  }
  const targetHasContemplativeTechnology = targetOwner.techState.completed.includes('contemplative-technology');
  const undermineDelta = Math.max(0, PRESSURE_DELTA
    - (targetHasContemplativeTechnology ? CONTEMPLATIVE_TECHNOLOGY_UNDERMINE_REDUCTION : 0));
  const nextCity = { ...city, spyUnrestBonus: Math.min(MAX_SPY_UNREST, city.spyUnrestBonus + undermineDelta) };
  return {
    ok: true,
    state: {
      ...state,
      cities: { ...state.cities, [cityId]: nextCity },
      units: { ...state.units, [unitId]: { ...unit, hasActed: true, movementPointsLeft: 0, specialActionUsedTurn: state.turn } },
    },
    message: `${city.name} faces a visible misinformation campaign.`,
  };
}
