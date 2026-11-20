import type { CombatResult, GameState, HexCoord, Unit } from '@/core/types';
import type { CombatSpyIdentifications } from '@/core/types/combat';
import { getVisibility } from '@/systems/fog-of-war';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { projectUnitForPlayer } from './espionage-stealth';
import { isSpyUnitType } from './spy-unit-types';

function identifiedSpyDisguiseOwner(
  before: GameState, after: GameState, unit: Unit, opponentId: string,
): string | undefined {
  if (!before.civilizations[opponentId]?.isHuman || !isSpyUnitType(unit.type)) return;
  const survivor = after.units[unit.id];
  if (!survivor || survivor.owner !== unit.owner || survivor.health <= 0) return;
  const apparent = projectUnitForPlayer(unit, before, opponentId);
  if (apparent && (apparent.type !== unit.type || apparent.owner !== unit.owner)) return apparent.owner;
}

/** Actual exchanges identify surviving disguised spies to their direct opponents. */
export function buildCombatSpyIdentifications(
  before: GameState, after: GameState, attacker: Unit, defender: Unit,
): CombatSpyIdentifications | undefined {
  const attackerApparentOwnerId = identifiedSpyDisguiseOwner(before, after, attacker, defender.owner);
  const defenderIdentified = identifiedSpyDisguiseOwner(before, after, defender, attacker.owner);
  if (attackerApparentOwnerId || defenderIdentified) {
    return { attackerApparentOwnerId, defenderIdentified: defenderIdentified ? true : undefined };
  }
}

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
    .filter(civId => getCivilizationLiveness(state, civId).living)
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
  return !isUnitConcealedFrom(state, snapshot, viewerId);
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
