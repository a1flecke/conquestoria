// #990: the chain-side consumer of the shared staged-lifecycle engine
// (staged-lifecycle-engine.ts) — crises are the other consumer
// (crisis-lifecycle.ts). This module is intentionally the SAME SHAPE as
// crisis-lifecycle.ts (turn-tick loop / direct resolution / dynamic
// invalidation), not the SAME CODE: `ActiveEventChain` and `ActiveCrisis` stay
// distinct types (per #990's own "do not erase useful type safety" guardrail),
// so `handleCityLeftForEventChains` below is structurally parallel to
// `handleCityLeftCiv` rather than a shared generic function — each domain
// still owns its own cityIds-trim-or-cancel policy and its own resolved event
// shape (`eventchain:resolved` carries `priorChoices`; `crisis:resolved` has
// no equivalent). The one genuinely shared piece is the turn-tick LOOP itself.
//
// Civ-elimination invalidation is NOT handled here: like `activeCrises`, a
// dead civ's `activeEventChains` entries are scrubbed directly by
// `civilization-elimination-system.ts` (see `ELIMINATED_CIV_AREAS.
// activeEventChains`), the same one-time full-state teardown path crises use
// — no separate per-turn sweep needed.
//
// War-ended and faction-gone invalidation triggers are NOT exercised by this
// module: the one shipped chain (`financial-panic`) has no war or faction
// dependency, so nothing here currently calls into them. A future chain that
// does would add its own domain-specific invalidation call alongside this
// one, following the same city-lost/civ-eliminated pattern rather than
// inventing a third shape.
import type { ActiveEventChain, EventChainCancellationReason, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { runStagedLifecycleTurn } from './staged-lifecycle-engine';
import { tickEventChainByKind } from './event-chain-progression';

export function processEventChainTurn(state: GameState, bus: EventBus): GameState {
  return runStagedLifecycleTurn(
    state,
    bus,
    { get: s => s.activeEventChains, set: (s, activeEventChains) => ({ ...s, activeEventChains }) },
    tickEventChainByKind,
  );
}

export function resolveEventChain(
  state: GameState,
  chainId: string,
  outcome: EventChainCancellationReason,
  bus: EventBus,
): GameState {
  const chain = state.activeEventChains?.[chainId];
  if (!chain) return state;
  const { [chainId]: _removed, ...rest } = state.activeEventChains ?? {};
  bus.emit('eventchain:resolved', {
    chainId, kind: chain.kind, civId: chain.targetCivId, outcome, priorChoices: chain.priorChoices,
  });
  return { ...state, activeEventChains: rest };
}

/** Dynamic invalidation precedent: mirrors `handleCityLeftCiv`'s two shapes
 * (trim the lost city and continue, or cancel outright once no participants
 * remain). Called from the same city-capture call site as `handleCityLeftCiv`. */
export function handleCityLeftForEventChains(state: GameState, cityId: string, bus: EventBus): GameState {
  let nextState = state;
  for (const [chainId, chain] of Object.entries(state.activeEventChains ?? {})) {
    if (!chain.cityIds.includes(cityId)) continue;
    const cityIds = chain.cityIds.filter(id => id !== cityId);
    if (cityIds.length === 0) {
      nextState = resolveEventChain(nextState, chainId, 'city-lost', bus);
    } else {
      const updated: ActiveEventChain = { ...chain, cityIds };
      nextState = { ...nextState, activeEventChains: { ...(nextState.activeEventChains ?? {}), [chainId]: updated } };
    }
  }
  return nextState;
}
