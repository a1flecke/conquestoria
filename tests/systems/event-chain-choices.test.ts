import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { chooseEventChainOption } from '@/systems/event-chain-choices';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { ActiveEventChain, GameState } from '@/core/types';

function withPendingChain(state: GameState, civId: string, overrides: Partial<ActiveEventChain> = {}): GameState {
  const chain: ActiveEventChain = {
    id: 'chain-1',
    kind: 'financial-panic',
    targetCivId: civId,
    cityIds: ['c1'],
    stageId: 'onset',
    startedTurn: state.turn,
    turnsInStage: 0,
    nextEvaluationTurn: state.turn,
    priorChoices: [],
    pendingChoice: { stageId: 'onset', optionIds: ['bailout', 'austerity-reform', 'do-nothing'] },
    pendingChoiceExpiresTurn: state.turn + 3,
    ...overrides,
  };
  return { ...state, activeEventChains: { 'chain-1': chain } };
}

describe('event-chain-choices (#990)', () => {
  it('records the choice, clears pendingChoice, and advances to the consequence stage', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state = withPendingChain(base, civId);
    const bus = new EventBus();

    const result = chooseEventChainOption(state, 'chain-1', 'bailout', civId, bus);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const chain = result.state.activeEventChains!['chain-1'];
    expect(chain.pendingChoice).toBeUndefined();
    expect(chain.stageId).toBe('consequence');
    expect(chain.nextEvaluationTurn).toBe(50 + 4);
    expect(chain.priorChoices).toEqual([{ stageId: 'onset', optionId: 'bailout', turn: 50, actorCivId: civId }]);
  });

  it('rejects a choice from a civ that does not own the chain', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50, includeSecondHuman: true });
    const state = withPendingChain(base, civId);
    const bus = new EventBus();

    const result = chooseEventChainOption(state, 'chain-1', 'bailout', 'p2', bus);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toMatch(/not your decision/i);
    expect(result.state.activeEventChains!['chain-1'].pendingChoice).toBeDefined();
  });

  it('rejects an unknown chain id', () => {
    const { state, civId } = makeCrisisFixture({ turn: 50 });
    const bus = new EventBus();

    const result = chooseEventChainOption(state, 'no-such-chain', 'bailout', civId, bus);

    expect(result.success).toBe(false);
  });

  it('rejects a choice once no decision is pending', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state = withPendingChain(base, civId, { pendingChoice: undefined, stageId: 'consequence' });
    const bus = new EventBus();

    const result = chooseEventChainOption(state, 'chain-1', 'bailout', civId, bus);

    expect(result.success).toBe(false);
  });

  it('rejects an option id that is not offered', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state = withPendingChain(base, civId);
    const bus = new EventBus();

    const result = chooseEventChainOption(state, 'chain-1', 'not-a-real-option', civId, bus);

    expect(result.success).toBe(false);
  });

  it('an unknown stageId (corrupted state) clears pendingChoice rather than silently restarting at onset', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state = withPendingChain(base, civId, { stageId: 'not-a-real-stage' });
    const bus = new EventBus();

    const result = chooseEventChainOption(state, 'chain-1', 'bailout', civId, bus);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const chain = result.state.activeEventChains!['chain-1'];
    expect(chain.pendingChoice).toBeUndefined();
    expect(chain.stageId).toBe('not-a-real-stage'); // unchanged, never silently reset to 'onset'
  });

  it('emits eventchain:choice-made exactly once, with wasDefaulted false', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state = withPendingChain(base, civId);
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('eventchain:choice-made', e => events.push(e));

    chooseEventChainOption(state, 'chain-1', 'do-nothing', civId, bus);

    expect(events).toEqual([{ chainId: 'chain-1', stageId: 'onset', optionId: 'do-nothing', actorCivId: civId, wasDefaulted: false }]);
  });
});
