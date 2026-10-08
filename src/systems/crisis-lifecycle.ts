// #1012: the reusable staged-lifecycle machinery — "how does a scheduled, staged,
// invalidatable thing progress and get cancelled," independent of what kind of thing it
// is. Deliberately holds NO archetype-specific policy (that lives in
// crisis-progression.ts, dispatched to generically here) and NO scheduling/eligibility
// policy (crisis-scheduling.ts).
//
// #990 generalized the turn-tick loop this module used to own directly into
// `staged-lifecycle-engine.ts`'s `runStagedLifecycleTurn` — crises are now a
// CONSUMER of that one shared engine (also used by `event-chain-lifecycle.ts`),
// not a copy of it. This module's remaining crisis-specific pieces:
//   - `processCrisisTurn` adapts `tickCrisisByArchetype`'s `{ crisis, state }`
//     return shape to the engine's generic `{ record, state }` contract and
//     supplies the `state.activeCrises` accessor — its only crisis-specific
//     coupling, same as #1012 already documented.
//   - `handleCityLeftCiv` is the existing precedent for dynamic invalidation
//     #990's `event-chain-lifecycle.ts` mirrors (not shares — see that file's
//     header comment for why a fully generic invalidation helper was rejected).
//   - `resolveCrisis` is direct/explicit resolution, crisis-specific only in its
//     `CrisisOutcome` parameter type.
//   - Prior choices / branching decision history is #990's `ActiveEventChain`
//     concept, deliberately not retrofitted onto `ActiveCrisis` — no crisis
//     archetype needs it, and the issue's own guardrail says not to erase type
//     safety in the name of premature generality.
import type { ActiveCrisis, GameState } from '@/core/types';
import type { CrisisOutcome } from '@/core/types/world';
import type { EventBus } from '@/core/event-bus';
import { tickCrisisByArchetype } from './crisis-progression';
import { runStagedLifecycleTurn } from './staged-lifecycle-engine';

export function processCrisisTurn(state: GameState, bus: EventBus): GameState {
  return runStagedLifecycleTurn(
    state,
    bus,
    { get: s => s.activeCrises, set: (s, activeCrises) => ({ ...s, activeCrises }) },
    (s, crisis, b) => {
      const { crisis: record, state: nextState } = tickCrisisByArchetype(s, crisis, b);
      return { record, state: nextState };
    },
  );
}

export function resolveCrisis(
  state: GameState,
  crisisId: string,
  outcome: CrisisOutcome,
  bus: EventBus,
): GameState {
  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return state;
  const { [crisisId]: _removed, ...rest } = state.activeCrises ?? {};
  bus.emit('crisis:resolved', { crisisId, flavorId: crisis.flavorId, civId: crisis.targetCivId, outcome });
  return { ...state, activeCrises: rest };
}

export function handleCityLeftCiv(state: GameState, cityId: string, bus: EventBus): GameState {
  let nextState = state;
  for (const [crisisId, crisis] of Object.entries(state.activeCrises ?? {})) {
    if (!crisis.cityIds.includes(cityId)) continue;
    const cityIds = crisis.cityIds.filter(id => id !== cityId);
    if (cityIds.length === 0) {
      nextState = resolveCrisis(nextState, crisisId, 'abandoned', bus);
    } else {
      const updated: ActiveCrisis = {
        ...crisis,
        cityIds,
        quarantinedCityIds: crisis.quarantinedCityIds?.filter(id => id !== cityId),
      };
      nextState = { ...nextState, activeCrises: { ...(nextState.activeCrises ?? {}), [crisisId]: updated } };
    }
  }
  return nextState;
}
