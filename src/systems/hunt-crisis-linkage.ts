import type { GameState } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';

// Shared by combat-reward-system.ts (beast/pirate kills) and barbarian-system.ts (camp
// destruction) to record which civ actually slew a Hunt crisis's foe — "any civilization
// may claim the hunt" per the crisis design. Deliberately its own leaf module (only
// depends on core/types + owner-kind) so both of those systems can call it without
// creating an import cycle through crisis-system.ts, which already depends on both.

export function recordHuntKillerIfApplicable(
  state: GameState,
  defeatedUnitId: string,
  defeatedOwnerId: string,
  killerCivId: string,
): GameState {
  const kind = classifyOwner(defeatedOwnerId);
  if (kind !== 'beast' && kind !== 'pirate') return state;
  for (const [crisisId, crisis] of Object.entries(state.activeCrises ?? {})) {
    if (crisis.archetype !== 'hunt' || !crisis.huntEntityId) continue;
    const isMatch = kind === 'beast'
      ? crisis.huntEntityId === defeatedUnitId
      : state.pirateFleets?.[crisis.huntEntityId]?.unitId === defeatedUnitId;
    if (!isMatch) continue;
    return {
      ...state,
      activeCrises: { ...state.activeCrises, [crisisId]: { ...crisis, lastHuntKillerCivId: killerCivId } },
    };
  }
  return state;
}

export function recordHuntCampKillerIfApplicable(
  state: GameState,
  campId: string,
  killerCivId: string,
): GameState {
  for (const [crisisId, crisis] of Object.entries(state.activeCrises ?? {})) {
    if (crisis.archetype === 'hunt' && crisis.huntEntityId === campId) {
      return {
        ...state,
        activeCrises: { ...state.activeCrises, [crisisId]: { ...crisis, lastHuntKillerCivId: killerCivId } },
      };
    }
  }
  return state;
}
