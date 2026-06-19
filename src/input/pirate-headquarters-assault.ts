import type { GameState } from '@/core/types';
import {
  assaultPirateEnclave,
  getEnclaveAssaultPreview,
  type PirateActionResult,
  type PirateAssaultPreview,
} from '@/systems/pirate-actions';

export interface PendingPirateHeadquartersAssault {
  factionId: string;
  unitId: string;
  preview: PirateAssaultPreview;
}

export function preparePirateHeadquartersAssault(
  state: GameState,
  factionId: string,
  unitId: string,
): PendingPirateHeadquartersAssault {
  return { factionId, unitId, preview: getEnclaveAssaultPreview(state, factionId, unitId) };
}

export function confirmPirateHeadquartersAssault(
  state: GameState,
  pending: PendingPirateHeadquartersAssault,
): PirateActionResult {
  return assaultPirateEnclave(state, pending.factionId, pending.unitId);
}
