// #1012: the reusable staged-lifecycle machinery — "how does a scheduled, staged,
// invalidatable thing progress and get cancelled," independent of what kind of thing it
// is. Deliberately holds NO archetype-specific policy (that lives in
// crisis-progression.ts, dispatched to generically here) and NO scheduling/eligibility
// policy (crisis-scheduling.ts).
//
// This module is the candidate basis #990 generalizes into a reusable multi-turn chain
// engine, per #1012's acceptance criteria. Concretely:
//   - `processCrisisTurn`'s loop ("for each active instance, in stable id order, apply a
//     tick, then either replace it or drop it") is the reusable shape. Its ONE
//     crisis-specific assumption is calling `tickCrisisByArchetype`, which switches on
//     `ActiveCrisis.archetype` — a generalized engine would take a per-instance-kind
//     stage-handler lookup (or a handler carried on the instance/definition itself)
//     instead of a hardcoded archetype switch.
//   - `handleCityLeftCiv` is the existing precedent for dynamic invalidation the #990
//     issue explicitly calls out: a participating city changing owner mid-crisis either
//     drops that one city (crisis continues with the rest) or resolves the whole
//     instance 'abandoned' (no participants left). A generalized engine's invalidation
//     hook would need the same two shapes (partial invalidation vs. full cancellation),
//     generalized to more triggers (civ eliminated, war ended, faction gone — see #990).
//   - `resolveCrisis` is direct/explicit resolution (used when some other system, not a
//     tick, needs to end an instance outright). Its crisis-specific assumption is only
//     the `CrisisOutcome` type of its `outcome` parameter.
//   - Neither this module nor `tickCrisisByArchetype` carries any concept of "prior
//     choices" or a branching decision history — #990 must add that; `ActiveCrisis` has
//     no such field today.
import type { ActiveCrisis, CrisisOutcome, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { tickCrisisByArchetype } from './crisis-progression';

export function processCrisisTurn(state: GameState, bus: EventBus): GameState {
  let nextState = state;
  const crisisIds = Object.keys(state.activeCrises ?? {}).sort();
  for (const crisisId of crisisIds) {
    const crisis = nextState.activeCrises?.[crisisId];
    if (!crisis) continue;
    const { crisis: updated, state: tickedState } = tickCrisisByArchetype(nextState, crisis, bus);
    if (updated) {
      nextState = { ...tickedState, activeCrises: { ...(tickedState.activeCrises ?? {}), [crisisId]: updated } };
    } else {
      const { [crisisId]: _removed, ...rest } = tickedState.activeCrises ?? {};
      nextState = { ...tickedState, activeCrises: rest };
    }
  }
  return nextState;
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
