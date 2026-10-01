import type { GameState, Unit } from '@/core/types';
import { getNavalOperationalState, type NavalOperationalStatus } from '@/systems/naval-operations';

/**
 * Selected-ship readout for #883 naval endurance. Owner-scoped: a viewer sees the operational state
 * of their own ships only -- it names a port and an ETA, which for a foreign ship would leak
 * infrastructure and logistics (same rule as the land-supply block in `selected-unit-info.ts`).
 * Status is always text plus an icon, never colour alone.
 */
export interface NavalOperationsPresentation {
  status: NavalOperationalStatus;
  icon: string;
  /** One plain-language line, safe to show always-visible. */
  headline: string;
  /** Expandable specifics. */
  details: string[];
}

const STATUS_LABEL: Record<NavalOperationalStatus, { icon: string; label: string }> = {
  ready: { icon: '⚓', label: 'Ready' },
  extended: { icon: '⚠️', label: 'Extended' },
  depleted: { icon: '🛑', label: 'Depleted' },
};

export function getNavalOperationsPresentation(state: GameState, unit: Unit): NavalOperationsPresentation | null {
  if (unit.owner !== state.currentPlayer) return null;
  const ops = getNavalOperationalState(state, unit);
  if (!ops.participates) return null;

  const { icon, label } = STATUS_LABEL[ops.status];
  let headline = `Operational: ${label}`;
  if (ops.supportSource) {
    headline += ops.supportSource.kind === 'in-port' ? ` — in port at ${ops.supportSource.cityName}` : ` — near ${ops.supportSource.cityName}`;
  } else if (ops.status !== 'ready') {
    headline += ops.etaToSupportTurns === null
      ? ' — no port to return to'
      : ` — ${ops.etaToSupportTurns} turn${ops.etaToSupportTurns === 1 ? '' : 's'} from support`;
  }

  const details = [...ops.reasons];
  if (ops.status !== 'ready' && ops.recoveryTurns !== null && ops.supportSource) {
    details.push(`Back to Ready in about ${ops.recoveryTurns} turn${ops.recoveryTurns === 1 ? '' : 's'} if it stays.`);
  }
  return { status: ops.status, icon, headline, details };
}
