import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

export type FriendlyUnitStackTap =
  | { kind: 'none' }
  | { kind: 'select-unit'; unitId: string }
  | { kind: 'open-stack-picker'; unitIds: string[] };

export interface FriendlyUnitStackTapCallbacks {
  onSelectUnit: (unitId: string) => void;
  onOpenStackPicker: (coord: HexCoord, unitIds: string[]) => void;
}

export function getFriendlyUnitIdsAtHex(
  state: GameState,
  coord: HexCoord,
): string[] {
  const key = hexKey(coord);
  return Object.values(state.units)
    .filter(unit => unit.owner === state.currentPlayer && hexKey(unit.position) === key)
    .map(unit => unit.id)
    .sort((a, b) => a.localeCompare(b));
}

export function resolveFriendlyUnitStackTap(
  state: GameState,
  coord: HexCoord,
  selectedUnitId: string | null,
): FriendlyUnitStackTap {
  const unitIds = getFriendlyUnitIdsAtHex(state, coord);
  if (unitIds.length === 0) return { kind: 'none' };
  if (unitIds.length > 1) return { kind: 'open-stack-picker', unitIds };
  if (selectedUnitId && unitIds[0] === selectedUnitId) return { kind: 'select-unit', unitId: unitIds[0] };
  return { kind: 'select-unit', unitId: unitIds[0] };
}

export function handleFriendlyUnitStackTap(
  state: GameState,
  coord: HexCoord,
  selectedUnitId: string | null,
  callbacks: FriendlyUnitStackTapCallbacks,
): boolean {
  const friendlyTap = resolveFriendlyUnitStackTap(state, coord, selectedUnitId);
  if (friendlyTap.kind === 'open-stack-picker') {
    callbacks.onOpenStackPicker(coord, friendlyTap.unitIds);
    return true;
  }
  if (friendlyTap.kind === 'select-unit') {
    callbacks.onSelectUnit(friendlyTap.unitId);
    return true;
  }
  return false;
}
