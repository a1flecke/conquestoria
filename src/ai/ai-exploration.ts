/**
 * #1064 -- which of a civilization's own units are genuinely idle, this round,
 * for the purpose of administrative auto-explore.
 *
 * Pure and independently testable, matching this codebase's existing pattern of
 * putting small AI-decision helpers in a dedicated module (road-network.ts's
 * chooseRoadBuilderUnit is the direct precedent) rather than an inline filter
 * chain buried in basic-ai.ts.
 */
import type { Civilization, Unit } from '@/core/types';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

/**
 * Combat-capable units (strength > 0) that no plan, health-driven recovery, or
 * upgrade route claims this round. Settlers/workers/missionaries (strength 0)
 * are excluded categorically -- they each already have their own dedicated
 * administrative or plan-driven dispatch elsewhere in basic-ai.ts and must
 * never be diverted into wandering.
 *
 * Excludes a unit already in `automation.mode === 'auto-explore'`: turn-manager.ts's
 * per-civ turn-start loop (the same generic mechanism the player's own auto-explore
 * button drives) already re-issues that unit's move every round with freshly-reset
 * movement, before the AI round scheduler ever calls into basic-ai.ts. This helper
 * only *initiates* exploration for a unit that isn't auto-exploring yet -- reprocessing
 * an already-exploring unit here would move it a second time in the same round
 * whenever its chosen destination didn't consume its full movement budget.
 */
export function getIdleExplorerUnitIds(
  civ: Civilization,
  units: Record<string, Unit>,
  preparedForTurn: PreparedMajorCivPlan,
): string[] {
  const unavailable = new Set([
    ...Object.values(preparedForTurn.assignments.assignmentsByPlanId).flat(),
    ...preparedForTurn.assignments.recoveryUnitIds,
  ]);
  return civ.units.filter(unitId => {
    const unit = units[unitId];
    if (!unit || unit.hasActed || unit.movementPointsLeft <= 0) return false;
    if (unit.automation?.mode === 'auto-explore') return false;
    if (UNIT_DEFINITIONS[unit.type].strength <= 0) return false;
    if (unavailable.has(unitId)) return false;
    if (unit.committedToRouteId) return false;
    if (preparedForTurn.portfolio.upgradeRoutesByUnitId[unitId]) return false;
    return true;
  });
}
