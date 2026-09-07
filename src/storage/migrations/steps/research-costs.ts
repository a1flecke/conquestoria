import type { GameState } from '@/core/types';
import { getEffectiveTechCost, getTechById } from '@/systems/tech-system';
import { PRE_V24_TECH_COST_BY_ID } from '../../research-cost-migration-v24';

/**
 * Schema 24 (#917) — the research-cost retune. Retimes only *active* research,
 * preserving invested progress as a percentage without emitting completion events
 * on load. The pre-retune cost table lives in `research-cost-migration-v24.ts`.
 */

/**
 * Retimes only active research. A save migration must preserve invested progress without
 * emitting completion events or replaying the completion sound while the game loads.
 */
export function migrateResearchCostsV24(state: GameState): GameState {
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => {
    const techState = civilization.techState;
    const techId = techState?.currentResearch;
    if (!techState || !techId) return [civId, civilization];

    const oldBaseCost = PRE_V24_TECH_COST_BY_ID[techId];
    const tech = getTechById(techId);
    if (oldBaseCost === undefined || !tech) return [civId, civilization];

    const oldEffectiveCost = getEffectiveTechCost({ ...tech, cost: oldBaseCost }, techState.completed);
    const newEffectiveCost = getEffectiveTechCost(tech, techState.completed);
    const oldProgress = Number.isFinite(techState.researchProgress) ? Math.max(0, techState.researchProgress) : 0;
    const completionFraction = Math.min(1, oldProgress / oldEffectiveCost);

    if (completionFraction >= 1) {
      const queue = techState.researchQueue.filter(id => id !== techId && !techState.completed.includes(id));
      const [nextResearch, ...remainingQueue] = queue;
      return [civId, {
        ...civilization,
        techState: {
          ...techState,
          completed: techState.completed.includes(techId) ? techState.completed : [...techState.completed, techId],
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
