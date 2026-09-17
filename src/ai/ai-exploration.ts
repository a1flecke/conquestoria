/**
 * #1064 -- which of a civilization's own units are genuinely idle, this round,
 * for the purpose of administrative auto-explore.
 *
 * Pure and independently testable, matching this codebase's existing pattern of
 * putting small AI-decision helpers in a dedicated module (road-network.ts's
 * chooseRoadBuilderUnit is the direct precedent) rather than an inline filter
 * chain buried in basic-ai.ts.
 */
import type { Civilization, GameState, HexCoord, Unit } from '@/core/types';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';
import { EXPANSION_SEARCH_RADIUS } from '@/ai/ai-expansion-sites';
import type { AutoExploreLeash } from '@/systems/auto-explore-system';
import { hexDistance } from '@/systems/hex-utils';
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

/**
 * #1066 follow-up: this administrative loop only ever *starts* auto-explore for a
 * genuinely idle combat unit -- before #1066's bounded-BFS fix, the old recency-only
 * chooser reliably ran itself into a dead end (a local cycle, or every reachable tile
 * threat-blocked) within a few rounds, which cleared automation on its own and handed
 * the unit back to AI control while it was still near home. The BFS fix makes that
 * dead end almost never fire, so an administratively-exploring combat unit can now
 * genuinely march dozens of tiles away, in whatever direction its own local frontier
 * happens to lead -- verified against the `domination-ai-campaign` fixture, where four
 * tanks that start adjacent to each other scatter far enough within ~15 rounds that
 * `ai-tactics.ts`'s `supportRemainsCohesive` (a deliberate combat rule: a unit won't
 * advance without a friendly unit within one turn's move of its destination) can never
 * be satisfied again for any of them once a war plan needs them -- each is individually
 * too far from every other assigned unit to take even a first step, forever.
 *
 * `computeAdministrativeExploreLeash` bounds ONLY this AI-initiated case to
 * `EXPANSION_SEARCH_RADIUS` of the owning civ's nearest city -- the same horizon
 * `ai-expansion-sites.ts` already uses to decide how far this civ can usefully see for
 * settling, since discovering a legal expansion site is this mechanism's actual reason
 * to exist (see `.claude/rules/ai-simulation.md`'s "AI expansion (#1064)"). A player's
 * own auto-explore button never receives a leash and keeps #1066's unrestricted
 * behavior exactly as shipped. Returns null for a human-owned unit (no leash applies)
 * or a civ with no owned city to anchor to.
 */
export function computeAdministrativeExploreLeash(state: GameState, unitId: string): AutoExploreLeash | null {
  const unit = state.units[unitId];
  const civ = unit ? state.civilizations[unit.owner] : undefined;
  if (!unit || !civ || civ.isHuman) return null;

  let anchor: HexCoord | null = null;
  let anchorDistance = Number.POSITIVE_INFINITY;
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const distance = hexDistance(unit.position, city.position);
    if (distance < anchorDistance) {
      anchorDistance = distance;
      anchor = city.position;
    }
  }
  if (!anchor) return null;

  return { anchor, maxDistance: EXPANSION_SEARCH_RADIUS };
}
