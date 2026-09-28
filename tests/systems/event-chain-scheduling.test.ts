import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processEventChainScheduler, countActiveEventChainsForCiv } from '@/systems/event-chain-scheduling';
import { getFinancialPanicGoldThreshold } from '@/systems/event-chain-definitions';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { GameState } from '@/core/types';

function withGold(state: GameState, civId: string, gold: number): GameState {
  return { ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], gold } } };
}

describe('event-chain-scheduling (#990)', () => {
  it('starts a financial-panic chain for a human civ below the gold threshold, with a pending choice', () => {
    const { state: base, civId } = makeCrisisFixture({ era: 3, turn: 50 });
    const state = withGold(base, civId, 1);
    const bus = new EventBus();
    const events: string[] = [];
    bus.on('eventchain:started', () => events.push('started'));

    const next = processEventChainScheduler(state, bus);

    expect(countActiveEventChainsForCiv(next, civId)).toBe(1);
    const chain = Object.values(next.activeEventChains ?? {})[0];
    expect(chain.kind).toBe('financial-panic');
    expect(chain.targetCivId).toBe(civId);
    expect(chain.cityIds).toEqual(['c1']); // capital, per getCapitalCityId
    expect(chain.pendingChoice?.optionIds).toEqual(['bailout', 'austerity-reform', 'do-nothing']);
    expect(events).toEqual(['started']);
  });

  it('does not start a chain when gold is at or above the era threshold', () => {
    const { state: base, civId } = makeCrisisFixture({ era: 3, turn: 50 });
    const threshold = getFinancialPanicGoldThreshold(3);
    const state = withGold(base, civId, threshold);
    const bus = new EventBus();

    const next = processEventChainScheduler(state, bus);

    expect(countActiveEventChainsForCiv(next, civId)).toBe(0);
  });

  it('respects the cooldown after a chain already started this civ', () => {
    const { state: base, civId } = makeCrisisFixture({ era: 3, turn: 50, lastCrisisOnsetTurn: undefined });
    let state = withGold(base, civId, 1);
    state = { ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], lastEventChainOnsetTurn: 45 } } };
    const bus = new EventBus();

    const next = processEventChainScheduler(state, bus);

    expect(countActiveEventChainsForCiv(next, civId)).toBe(0);
  });

  it('never starts a second simultaneous chain for the same civ', () => {
    const { state: base, civId } = makeCrisisFixture({ era: 3, turn: 50 });
    const state = withGold(base, civId, 1);
    const bus = new EventBus();

    const once = processEventChainScheduler(state, bus);
    expect(countActiveEventChainsForCiv(once, civId)).toBe(1);
    const twice = processEventChainScheduler({ ...once, turn: once.turn + 1 }, bus);
    expect(countActiveEventChainsForCiv(twice, civId)).toBe(1);
  });

  it('AI civs resolve their onset choice in the same scheduling pass — no pendingChoice left', () => {
    const { state: base } = makeCrisisFixture({ era: 3, turn: 50, includeAiCiv: true });
    const state = withGold(base, 'ai-1', 1);
    const bus = new EventBus();

    const next = processEventChainScheduler(state, bus);

    const aiChain = Object.values(next.activeEventChains ?? {}).find(c => c.targetCivId === 'ai-1');
    expect(aiChain).toBeDefined();
    expect(aiChain?.pendingChoice).toBeUndefined();
    expect(aiChain?.priorChoices).toHaveLength(1);
    expect(aiChain?.priorChoices[0].actorCivId).toBe('ai-1');
  });

  it('caps simultaneous AI-owned chains at the map-size world cap', () => {
    // Two AI civs both eligible; small-map cap is 1 -- only one may start.
    const { state: base } = makeCrisisFixture({ era: 3, turn: 50, includeAiCiv: true });
    let state = withGold(base, 'ai-1', 1);
    state = {
      ...state,
      cities: { ...state.cities, 'ai-c2': { ...state.cities['ai-c1'], id: 'ai-c2', name: 'ai-c2', position: { q: 12, r: 12 } } },
      civilizations: {
        ...state.civilizations,
        'ai-1': { ...state.civilizations['ai-1'], gold: 1 },
        'ai-2': { ...state.civilizations['ai-1'], id: 'ai-2', name: 'AI Civ 2', cities: ['ai-c2'], gold: 1 },
      },
    };
    const bus = new EventBus();

    const next = processEventChainScheduler(state, bus);

    const aiChains = Object.values(next.activeEventChains ?? {}).filter(c => c.targetCivId !== 'p1');
    expect(aiChains).toHaveLength(1);
  });
});
