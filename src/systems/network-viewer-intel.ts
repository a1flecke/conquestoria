import type { GameState, HexCoord } from '@/core/types';

export interface NetworkViewerWarning {
  planId: string;
  targetCityId: string;
  effectLabel: 'Exploit';
  counterLabel: 'Cyber Defense Center or Harden';
  source?: {
    unitId?: string;
    position?: HexCoord;
  };
}

export function getNetworkWarningForViewer(
  state: GameState,
  viewerId: string,
  planId: string,
): NetworkViewerWarning | null {
  const ownerEntry = Object.values(state.autonomyByCiv ?? {})
    .map(autonomy => autonomy.plans[planId])
    .find(Boolean);
  if (!ownerEntry || ownerEntry.definitionId !== 'exploit' || ownerEntry.target.kind !== 'city') return null;

  const warning: NetworkViewerWarning = {
    planId,
    targetCityId: ownerEntry.target.cityId,
    effectLabel: 'Exploit',
    counterLabel: 'Cyber Defense Center or Harden',
  };
  const detection = state.autonomyByCiv?.[viewerId]?.detections[planId];
  if (!detection || (!detection.sourceIdentityKnown && !detection.sourcePositionKnown)) return warning;

  const sourceUnitId = ownerEntry.source?.kind === 'unit' ? ownerEntry.source.unitId : ownerEntry.sourceUnitId;
  const source = sourceUnitId ? state.units[sourceUnitId] : undefined;
  warning.source = {
    ...(detection.sourceIdentityKnown && source ? { unitId: source.id } : {}),
    ...(detection.sourcePositionKnown && source ? { position: { ...source.position } } : {}),
  };
  return warning;
}
