import type { GameState } from '@/core/types';
import {
  assaultPirateEnclave,
  getEnclaveAssaultPreview,
  type PirateActionResult,
  type PirateAssaultPreview,
} from '@/systems/pirate-actions';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';

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

export function findAvailablePirateHeadquartersAssault(
  state: GameState,
  viewerId: string,
  unitId: string,
): PendingPirateHeadquartersAssault | null {
  const presentation = getPirateWatersPresentation(state, viewerId);
  for (const faction of presentation.factions) {
    if (faction.headquarters?.kind !== 'coastal-enclave' || !faction.headquarters.current) continue;
    const pending = preparePirateHeadquartersAssault(state, faction.factionId, unitId);
    if (pending.preview.available) return pending;
  }
  return null;
}

export function confirmPirateHeadquartersAssault(
  state: GameState,
  pending: PendingPirateHeadquartersAssault,
): PirateActionResult {
  return assaultPirateEnclave(state, pending.factionId, pending.unitId);
}
