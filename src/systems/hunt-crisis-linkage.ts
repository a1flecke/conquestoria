import type { GameState } from '@/core/types';
import { classifyOwner, isMajorCivOwner } from '@/core/owner-kind';

// Shared by combat-reward-system.ts (beast/pirate kills) and barbarian-system.ts (camp
// destruction) to record which civ actually slew a Hunt crisis's foe — "any civilization
// may claim the hunt" per the crisis design. Deliberately its own leaf module (only
// depends on core/types + owner-kind) so both of those systems can call it without
// creating an import cycle through crisis-system.ts, which already depends on both.
//
// killerCivId must be an actual major-civ id (isMajorCivOwner) or we deliberately leave
// lastHuntKillerCivId untouched. Hostility rules allow barbarians/beasts/pirates/minor
// civs to fight each other, so a hunt's foe can in principle be killed by a non-major
// entity; recording that id here would make `state.civilizations[lastHuntKillerCivId]`
// undefined in crisis-system.ts's resolution step, silently dropping BOTH the feast
// reward and the "fall back to the target civ" rule (the fallback only triggers when
// lastHuntKillerCivId is `undefined`, not when it's set to something invalid).

export function recordHuntKillerIfApplicable(
  state: GameState,
  defeatedUnitId: string,
  defeatedOwnerId: string,
  killerCivId: string,
): GameState {
  const kind = classifyOwner(defeatedOwnerId);
  if (kind !== 'beast' && kind !== 'pirate') return state;
  if (!isMajorCivOwner(killerCivId)) return state;
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
  if (!isMajorCivOwner(killerCivId)) return state;
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
