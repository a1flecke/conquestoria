import type { CombatResult, GameState, HexCoord, Unit } from '@/core/types';
import { isBeastConcealedFrom } from '@/systems/beast-system';
import { getVisibility, isForestConcealedUnit } from '@/systems/fog-of-war';

export interface ViewerMovePresentation {
  unit: Unit;
  visibleSegments: HexCoord[][];
}

export function getLivingHumanViewerIds(state: GameState): string[] {
  const configured = state.hotSeat?.players
    .filter(player => player.isHuman)
    .map(player => player.slotId);
  const candidates = configured?.length
    ? configured
    : Object.values(state.civilizations).filter(civ => civ.isHuman).map(civ => civ.id);
  return [...new Set(candidates)]
    .filter(civId => state.civilizations[civId] && !state.civilizations[civId].isEliminated)
    .sort();
}

function isUnitVisibleAt(
  state: GameState,
  viewerId: string,
  unit: Unit,
  position: HexCoord,
): boolean {
  if (unit.owner === viewerId) return true;
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility || getVisibility(visibility, position) !== 'visible') return false;
  const snapshot = { ...unit, position: { ...position } };
  if (isForestConcealedUnit(state, viewerId, snapshot)) return false;
  const viewerUnits = state.civilizations[viewerId].units
    .map(id => state.units[id])
    .filter((candidate): candidate is Unit => Boolean(candidate) && !candidate.transportId);
  return !isBeastConcealedFrom(snapshot, state.map, viewerUnits);
}

export function buildMovePresentationByViewer(
  state: GameState,
  unit: Unit,
  path: HexCoord[],
): Record<string, ViewerMovePresentation> {
  const result: Record<string, ViewerMovePresentation> = {};
  for (const viewerId of getLivingHumanViewerIds(state)) {
    const segments: HexCoord[][] = [];
    let current: HexCoord[] = [];
    for (const coord of path) {
      if (isUnitVisibleAt(state, viewerId, unit, coord)) {
        current.push({ ...coord });
      } else if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length > 0) segments.push(current);
    if (segments.length > 0) {
      result[viewerId] = {
        unit: structuredClone(unit),
        visibleSegments: segments,
      };
    }
  }
  return result;
}

export function buildCombatPresentation(
  state: GameState,
  result: CombatResult,
  attacker: Unit,
  defender: Unit,
): {
  visibleToViewerIds: string[];
  attackerType: Unit['type'];
  defenderType: Unit['type'];
  attackerOwnerId: string;
  defenderOwnerId: string;
} {
  return {
    visibleToViewerIds: getLivingHumanViewerIds(state).filter(viewerId =>
      isUnitVisibleAt(state, viewerId, attacker, result.attackerPosition)
      || isUnitVisibleAt(state, viewerId, defender, result.defenderPosition),
    ),
    attackerType: attacker.type,
    defenderType: defender.type,
    attackerOwnerId: attacker.owner,
    defenderOwnerId: defender.owner,
  };
}
