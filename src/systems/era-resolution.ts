import type { GameState, HexCoord, Unit } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { resolveCivilizationEra } from './tech-definitions';
import { mapDistance } from './hex-utils';

export const NEUTRAL_PRESSURE_LOCAL_RADIUS = 7;

function ownerEra(state: GameState, ownerId: string, opposingOwnerId: string): number {
  if (classifyOwner(ownerId) === 'major') {
    return resolveCivilizationEra(state.civilizations[ownerId]?.techState.completed ?? []);
  }
  if (classifyOwner(opposingOwnerId) === 'major') {
    return resolveCivilizationEra(state.civilizations[opposingOwnerId]?.techState.completed ?? []);
  }
  return state.era;
}

export function resolveCombatEra(state: GameState, attacker: Unit, defender: Unit): number {
  return Math.min(
    ownerEra(state, attacker.owner, defender.owner),
    ownerEra(state, defender.owner, attacker.owner),
  );
}

/**
 * Resolves a neutral actor's safe pressure tier without allowing a distant
 * civilization's research to upgrade a local threat. A known intended target
 * always wins; otherwise nearby major-civilization eras use the lower median
 * so even-sized groups cannot round a neutral upward.
 */
export function resolveNeutralPressureEra(
  state: GameState,
  position: HexCoord,
  intendedTargetId?: string | null,
): number | null {
  const target = intendedTargetId ? state.civilizations[intendedTargetId] : undefined;
  if (target && !target.isEliminated) {
    return resolveCivilizationEra(target.techState.completed);
  }

  const nearbyOwnerIds = new Set(
    Object.values(state.cities)
      .filter(city => classifyOwner(city.owner) === 'major')
      .filter(city => !state.civilizations[city.owner]?.isEliminated)
      .filter(city => mapDistance(state.map, position, city.position) <= NEUTRAL_PRESSURE_LOCAL_RADIUS)
      .map(city => city.owner),
  );
  const candidates = [...nearbyOwnerIds]
    .map(civId => ({ civId, era: resolveCivilizationEra(state.civilizations[civId]!.techState.completed) }))
    .sort((left, right) => left.era - right.era || left.civId.localeCompare(right.civId));
  if (candidates.length === 0) return null;
  return candidates[Math.floor((candidates.length - 1) / 2)]!.era;
}
