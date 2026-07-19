import type { GameState } from '@/core/types';
import { isAtWar } from '@/systems/diplomacy-system';
import { hexDistance } from '@/systems/hex-utils';
import { usePropagandistAction } from '@/systems/propagandist-system';

/** One deterministic civic action per ready Propagandist. Enemy pressure comes
 * first; without a legal target, the unit relieves its most pressured nearby city. */
export function usePropagandistActionsForAI(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman || civ.isEliminated) return state;
  let next = state;
  const units = civ.units
    .map(unitId => next.units[unitId])
    .filter(unit => unit?.type === 'propagandist' && !unit.hasActed)
    .sort((left, right) => left!.id.localeCompare(right!.id));
  for (const unit of units) {
    if (!unit) continue;
    const nearby = Object.values(next.cities)
      .filter(city => hexDistance(unit.position, city.position) <= 1)
      .sort((left, right) => left.id.localeCompare(right.id));
    const enemy = nearby.find(city => {
      const targetCiv = next.civilizations[city.owner];
      return city.owner !== civId
        && targetCiv !== undefined
        && isAtWar(civ.diplomacy, city.owner)
        && isAtWar(targetCiv.diplomacy, civId);
    });
    const rally = nearby
      .filter(city => city.owner === civId && city.spyUnrestBonus > 0)
      .sort((left, right) => right.spyUnrestBonus - left.spyUnrestBonus || left.id.localeCompare(right.id))[0];
    const result = enemy
      ? usePropagandistAction(next, unit.id, 'undermine', enemy.id)
      : rally
        ? usePropagandistAction(next, unit.id, 'rally', rally.id)
        : null;
    if (result?.ok) next = result.state;
  }
  return next;
}
