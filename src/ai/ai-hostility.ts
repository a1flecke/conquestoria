import { classifyOwner } from '@/core/owner-kind';
import type { GameState } from '@/core/types';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

export function isAIHostileOwner(
  state: Readonly<GameState>,
  actorId: string,
  ownerId: string,
): boolean {
  if (ownerId === actorId) return false;
  const ownerKind = classifyOwner(ownerId);
  if (ownerKind === 'beast') {
    return state.settings?.aiContestsBeasts === true;
  }
  if (ownerKind === 'pirate') {
    const faction = state.pirates?.factions[ownerId];
    if (
      faction?.contract?.employerId === actorId
      || (faction?.tributeByCiv[actorId]?.protectedUntilRound ?? 0)
        > state.turn
    ) {
      return false;
    }
    return true;
  }
  return isHostileOwnerTo(state, actorId, ownerId);
}

/**
 * The units that are the foe of a hunt crisis aimed at `actorId`: the beast of a beast hunt, the ship of a
 * pirate hunt. A hunt ends only when its foe dies, so the civ it targets must be able to fight it. Beasts are
 * otherwise off-limits to the AI unless `aiContestsBeasts` is on ("players keep the glory"); that applies to
 * every other beast, never to the one menacing the AI's own city. A camp hunt's foe is a camp, not a unit.
 */
export function getOwnHuntFoeUnitIds(state: Readonly<GameState>, actorId: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (crisis.archetype !== 'hunt' || crisis.targetCivId !== actorId || !crisis.huntEntityId) continue;
    const spawnKind = getCrisisFlavor(crisis.flavorId)?.hunt?.spawnKind;
    if (spawnKind === 'beast') ids.add(crisis.huntEntityId);
    else if (spawnKind === 'pirate') {
      const shipId = state.pirateFleets?.[crisis.huntEntityId]?.unitId;
      if (shipId) ids.add(shipId);
    }
  }
  return ids;
}

/** `isAIHostileOwner`, plus the foe of the civ's own hunt crisis (see `getOwnHuntFoeUnitIds`). */
export function isAIHostileUnit(
  state: Readonly<GameState>,
  actorId: string,
  unit: { readonly id: string; readonly owner: string },
): boolean {
  return isAIHostileOwner(state, actorId, unit.owner) || getOwnHuntFoeUnitIds(state, actorId).has(unit.id);
}
