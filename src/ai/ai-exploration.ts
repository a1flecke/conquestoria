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
    if (UNIT_DEFINITIONS[unit.type].strength <= 0) return false;
    if (unavailable.has(unitId)) return false;
    if (unit.committedToRouteId) return false;
    if (preparedForTurn.portfolio.upgradeRoutesByUnitId[unitId]) return false;
    return true;
  });
}
