import type { GameState } from '@/core/types';
import { getEffectiveTechCost, getTechById } from '@/systems/tech-system';

/**
 * Schema 30 (#986) — Interstellar Launch Program's `requiresBuildings:
 * ['mars_robotics_initiative']` makes Mars Robotics Initiative a "chained-from"
 * building for the first time, which flips `mars-mission-architecture`'s
 * automatic pacing band from 'specialist' to 'power-spike'
 * (`resolveEraRelativeCostBand`, research-pacing-model.ts) and moves its
 * research-pacing-formula recommended cost from 2150 to 2975. Retimes only
 * *active* research, preserving invested progress as a percentage, without
 * emitting completion events on load -- the same pattern as migration 24
 * (`migrateResearchCostsV24`), scoped to this one tech.
 */
const PRE_V30_MARS_MISSION_ARCHITECTURE_COST = 2150;
const MARS_MISSION_ARCHITECTURE_TECH_ID = 'mars-mission-architecture';

export function migrateMarsMissionArchitectureCostV30(state: GameState): GameState {
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => {
    const techState = civilization.techState;
    if (!techState || techState.currentResearch !== MARS_MISSION_ARCHITECTURE_TECH_ID) return [civId, civilization];

    const tech = getTechById(MARS_MISSION_ARCHITECTURE_TECH_ID);
    if (!tech) return [civId, civilization];

    const oldEffectiveCost = getEffectiveTechCost({ ...tech, cost: PRE_V30_MARS_MISSION_ARCHITECTURE_COST }, techState.completed);
    const newEffectiveCost = getEffectiveTechCost(tech, techState.completed);
    const oldProgress = Number.isFinite(techState.researchProgress) ? Math.max(0, techState.researchProgress) : 0;
    const completionFraction = Math.min(1, oldProgress / oldEffectiveCost);

    if (completionFraction >= 1) {
      const queue = techState.researchQueue.filter(id => id !== MARS_MISSION_ARCHITECTURE_TECH_ID && !techState.completed.includes(id));
      const [nextResearch, ...remainingQueue] = queue;
      return [civId, {
        ...civilization,
        techState: {
          ...techState,
          completed: techState.completed.includes(MARS_MISSION_ARCHITECTURE_TECH_ID)
            ? techState.completed
            : [...techState.completed, MARS_MISSION_ARCHITECTURE_TECH_ID],
          currentResearch: nextResearch ?? null,
          researchQueue: remainingQueue,
          researchProgress: 0,
        },
      }];
    }

    return [civId, {
      ...civilization,
      techState: {
        ...techState,
        researchProgress: Math.min(newEffectiveCost - 1, Math.round(completionFraction * newEffectiveCost)),
      },
    }];
  }));
  return { ...state, civilizations };
}
