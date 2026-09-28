// #1012: crisis-system.ts is now a stable barrel over five modules split along the
// "what a crisis is" (policy) vs. "how a staged/scheduled/invalidatable thing progresses"
// (reusable lifecycle) seam:
//
//   crisis-scheduling.ts     — onset eligibility, flavor/target selection, per-civ/AI caps
//   crisis-effects.ts        — severity math and yield-multiplier projections (queries)
//   crisis-progression.ts    — archetype-specific per-turn tick bodies (outbreak/famine/
//                               catastrophe/hunt) + the dispatch point between them
//   crisis-lifecycle.ts      — the reusable staged-lifecycle machinery: the turn-tick
//                               loop, direct resolution, and dynamic invalidation. This
//                               is the module #990 generalizes into a multi-turn chain
//                               engine — see its header comment for the exact seam.
//   crisis-interventions.ts  — player-facing commands (quarantine, remedy, containment)
//
// This barrel exists so the 7 existing importers (turn-manager, city-panel,
// panel-actions-controller, city-capture-system, research-output-system,
// stampede-system, ai-crisis-response) and the crisis test suites do not need to know
// about the split. Import from the specific module directly in new code where it's
// clear which one you need; the barrel is compatibility surface, not the preferred
// import path going forward.
export {
  CRISIS_PRESSURE_FLOOR,
  EXTERNAL_THREAT_RECENCY_TURNS,
  CONTAGION_GROUP_RANGE,
  countUnrestGroups,
  countActiveCrisesForCiv,
  AI_CRISIS_WORLD_CAP,
  processCrisisScheduler,
  getFamineFragility,
} from './crisis-scheduling';

export {
  OUTBREAK_CURE_IMMUNITY_TURNS,
  OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL,
  cureImmunityWindow,
  getOutbreakSeverityMultiplier,
  getCatastropheRecoveryMultiplier,
  getCrisisYieldMultiplier,
} from './crisis-effects';
export type { CrisisYieldMultiplier } from './crisis-effects';

export {
  FAMINE_CONTAINMENT_SURPLUS_TURNS,
} from './crisis-progression';

export {
  processCrisisTurn,
  resolveCrisis,
  handleCityLeftCiv,
} from './crisis-lifecycle';

export {
  applyQuarantine,
  applyRemedy,
  applyEmpireContainment,
} from './crisis-interventions';
