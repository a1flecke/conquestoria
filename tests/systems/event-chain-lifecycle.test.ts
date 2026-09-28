import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processEventChainTurn, resolveEventChain, handleCityLeftForEventChains } from '@/systems/event-chain-lifecycle';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { ActiveEventChain, GameState } from '@/core/types';

function chainAt(state: GameState, civId: string, overrides: Partial<ActiveEventChain> = {}): ActiveEventChain {
  return {
    id: 'chain-1',
    kind: 'financial-panic',
    targetCivId: civId,
    cityIds: ['c1'],
    stageId: 'consequence',
    startedTurn: state.turn - 4,
    turnsInStage: 3,
    nextEvaluationTurn: state.turn,
    priorChoices: [{ stageId: 'onset', optionId: 'do-nothing', turn: state.turn - 4, actorCivId: civId }],
    ...overrides,
  };
}

describe('event-chain-lifecycle (#990)', () => {
  it('processEventChainTurn ticks and resolves a due chain, removing it from state', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3 });
    const state = {
      ...base,
      civilizations: { ...base.civilizations, [civId]: { ...base.civilizations[civId], gold: 1 } },
      activeEventChains: { 'chain-1': chainAt(base, civId) },
    };
    const bus = new EventBus();

    const next = processEventChainTurn(state, bus);

    expect(next.activeEventChains?.['chain-1']).toBeUndefined();
  });

  it('processEventChainTurn ticks multiple chains in stable sorted-id order', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3, includeSecondHuman: true });
    const state = {
      ...base,
      activeEventChains: {
        'chain-b': chainAt(base, civId, { id: 'chain-b', nextEvaluationTurn: base.turn + 10 }),
        'chain-a': chainAt(base, 'p2', { id: 'chain-a', cityIds: [], nextEvaluationTurn: base.turn + 10 }),
      },
    };
    const bus = new EventBus();

    const next = processEventChainTurn(state, bus);

    // Neither is due yet -- both survive, still present under their own ids.
    expect(Object.keys(next.activeEventChains ?? {}).sort()).toEqual(['chain-a', 'chain-b']);
  });

  it('resolveEventChain removes the chain and emits eventchain:resolved with the given outcome', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54 });
    const state = { ...base, activeEventChains: { 'chain-1': chainAt(base, civId) } };
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('eventchain:resolved', e => events.push(e));

    const next = resolveEventChain(state, 'chain-1', 'civ-eliminated', bus);

    expect(next.activeEventChains?.['chain-1']).toBeUndefined();
    expect(events).toEqual([{ chainId: 'chain-1', kind: 'financial-panic', civId, outcome: 'civ-eliminated', priorChoices: state.activeEventChains!['chain-1'].priorChoices }]);
  });

  it('resolveEventChain is a no-op for an unknown chain id', () => {
    const { state, civId } = makeCrisisFixture({ turn: 54 });
    const bus = new EventBus();

    const next = resolveEventChain(state, 'no-such-chain', 'invalid', bus);

    expect(next).toBe(state);
  });

  it('handleCityLeftForEventChains trims a lost non-participating city without touching the chain', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54 });
    const state = { ...base, activeEventChains: { 'chain-1': chainAt(base, civId, { cityIds: ['c1', 'c2'] }) } };
    const bus = new EventBus();

    const next = handleCityLeftForEventChains(state, 'c2', bus);

    expect(next.activeEventChains!['chain-1'].cityIds).toEqual(['c1']);
  });

  it('handleCityLeftForEventChains cancels the chain outright once its last participating city is lost (city-lost)', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54 });
    const state = { ...base, activeEventChains: { 'chain-1': chainAt(base, civId, { cityIds: ['c1'] }) } };
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('eventchain:resolved', e => events.push(e));

    const next = handleCityLeftForEventChains(state, 'c1', bus);

    expect(next.activeEventChains?.['chain-1']).toBeUndefined();
    expect(events[0].outcome).toBe('city-lost');
  });

  it('handleCityLeftForEventChains ignores a chain that never listed the lost city', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54 });
    const state = { ...base, activeEventChains: { 'chain-1': chainAt(base, civId, { cityIds: ['c1'] }) } };
    const bus = new EventBus();

    const next = handleCityLeftForEventChains(state, 'c2', bus);

    expect(next.activeEventChains!['chain-1']).toBe(state.activeEventChains!['chain-1']);
  });
});
