import type { ActiveCrisis, GameState } from '@/core/types';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { normalizeCrisisForces } from '@/systems/crisis-force-system';
import { normalizeStampedes } from '@/systems/stampede-system';
import { normalizeRogueElephantHosts } from '@/systems/rogue-elephant-host-system';

/**
 * Schemas 15-19 — the world-pressure crisis containers, added one subsystem at a
 * time: crisis forces, stampedes, then rogue-elephant hosts. Plus
 * `normalizeCrisisArchetypes`, which re-derives a crisis's archetype from its
 * flavor definition and is compatibility normalization rather than a schema step.
 */

// #590 MR3: defensive re-derivation of stored crisis archetype from its flavorId. Not a
// versioned migration (this MR doesn't bump CURRENT_SAVE_SCHEMA_VERSION — the change is
// additive), so it must run unconditionally on every load, not just saves passing
// through the numbered migration loop above. A save written before crop-blight/
// locust-swarm's re-home to 'famine' would have `archetype: 'outbreak'` baked in for
// those flavor ids; recompute from the current flavor roster so stale saves don't
// silently misfire the outbreak-only code paths (remedy wording, AI response filter).
export function normalizeCrisisArchetypes(state: GameState): GameState {
  if (!state.activeCrises) return state;
  const activeCrises: Record<string, ActiveCrisis> = {};
  for (const [id, crisis] of Object.entries(state.activeCrises)) {
    const flavor = getCrisisFlavor(crisis.flavorId);
    activeCrises[id] = flavor ? { ...crisis, archetype: flavor.archetype } : crisis;
  }
  return { ...state, activeCrises };
}

/** Schema 15: introduce the crisis-force container, then normalize it. */
export function migrateCrisisForceContainer(state: GameState): GameState {
  return normalizeCrisisForces({ ...state, crisisForces: state.crisisForces ?? {} });
}

/** Schema 16: re-normalize crisis forces after their record shape changed. */
export function migrateCrisisForceRecords(state: GameState): GameState {
  return normalizeCrisisForces(state);
}

/** Schema 17: introduce the Beast Stampede container alongside crisis forces. */
export function migrateStampedeContainer(state: GameState): GameState {
  return normalizeStampedes(normalizeCrisisForces({ ...state, stampedes: state.stampedes ?? {} }));
}

/** Schema 18: introduce the Rogue Elephant Host container alongside the two above. */
export function migrateRogueElephantHostContainer(state: GameState): GameState {
  return normalizeRogueElephantHosts(normalizeStampedes(normalizeCrisisForces({
    ...state,
    rogueElephantHosts: state.rogueElephantHosts ?? {},
  })));
}

/** Schema 19: re-normalize host and crisis-force records after their shape changed. */
export function migrateRogueElephantHostRecords(state: GameState): GameState {
  return normalizeRogueElephantHosts(normalizeCrisisForces(state));
}
