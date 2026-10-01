import type { GameState, Unit } from '@/core/types';
import { getAirReadinessState, type AirMissionDenial, type AirReadinessStatus } from '@/systems/air-readiness';

/**
 * Selected-aircraft readout for #884. Owner-scoped (a foreign aircraft's readiness, base condition
 * and recovery are logistics the viewer has not earned) and always text plus icon.
 */
export interface AirReadinessPresentation {
  status: AirReadinessStatus;
  icon: string;
  headline: string;
  details: string[];
  strikeDenial: AirMissionDenial | null;
}

const STATUS: Record<AirReadinessStatus, { icon: string; label: string }> = {
  ready: { icon: '✈️', label: 'Ready' },
  worn: { icon: '⚠️', label: 'Worn' },
  spent: { icon: '🛑', label: 'Spent' },
};

export function getAirReadinessPresentation(state: GameState, unit: Unit): AirReadinessPresentation | null {
  if (unit.owner !== state.currentPlayer) return null;
  const readiness = getAirReadinessState(state, unit);
  if (!readiness.participates) return null;
  const { icon, label } = STATUS[readiness.status];
  const base = readiness.support.baseName ? ` — based at ${readiness.support.baseName}` : '';
  return {
    status: readiness.status,
    icon,
    headline: `Readiness: ${label}${base}`,
    details: readiness.reasons,
    strikeDenial: readiness.strikeDenial,
  };
}
