// #990: the ONE reusable staged-lifecycle turn loop, generalized from
// crisis-lifecycle.ts's pre-#990 `processCrisisTurn` (see #1012). Deliberately
// domain-free — no import of ActiveCrisis, ActiveEventChain, or any other
// concrete record shape — so this is genuinely one engine with two consumers
// (`crisis-lifecycle.ts` and `event-chain-lifecycle.ts`), not a copy-pasted
// twin. Do not add a third, parallel "iterate active X, tick, keep-or-drop"
// loop anywhere else in the codebase; extend this one's callers instead.
//
// What is NOT generalized here, deliberately (per #990's own "do not erase
// useful crisis-specific type safety" guardrail): the record shape itself
// (`ActiveCrisis` and `ActiveEventChain` stay distinct types), scheduling/
// eligibility policy, and dynamic-invalidation policy (each domain's own
// `handleCityLeftCiv`-shaped helper decides what "invalidated" means for its
// own records — see event-chain-lifecycle.ts's header comment).
import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';

export interface StagedLifecycleAccessor<TRecord> {
  get: (state: GameState) => Record<string, TRecord> | undefined;
  set: (state: GameState, records: Record<string, TRecord>) => GameState;
}

export type StagedLifecycleTick<TRecord> = (
  state: GameState,
  record: TRecord,
  bus: EventBus,
) => { record: TRecord | null; state: GameState };

/**
 * Iterates every active record in stable (sorted-id) order, ticks each one,
 * and either replaces it or drops it based on the tick's result. Sorted
 * iteration is load-bearing for determinism: two records ticking in the same
 * turn must always evaluate in the same order regardless of `Object.keys`
 * insertion order (which is not itself a determinism guarantee across a
 * save/reload boundary).
 */
export function runStagedLifecycleTurn<TRecord>(
  state: GameState,
  bus: EventBus,
  accessor: StagedLifecycleAccessor<TRecord>,
  tick: StagedLifecycleTick<TRecord>,
): GameState {
  let nextState = state;
  const ids = Object.keys(accessor.get(state) ?? {}).sort();
  for (const id of ids) {
    const record = accessor.get(nextState)?.[id];
    if (!record) continue;
    const { record: updated, state: tickedState } = tick(nextState, record, bus);
    const records: Record<string, TRecord> = { ...(accessor.get(tickedState) ?? {}) };
    if (updated) {
      records[id] = updated;
    } else {
      delete records[id];
    }
    nextState = accessor.set(tickedState, records);
  }
  return nextState;
}
