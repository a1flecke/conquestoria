import type { GameState, Unit } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { resolveCivilizationEra } from './tech-definitions';

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
