import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { tickEventChainByKind } from '@/systems/event-chain-progression';
import { getFinancialPanicBailoutCost, getFinancialPanicGoldThreshold } from '@/systems/event-chain-definitions';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { ActiveEventChain, GameState } from '@/core/types';

function chainAt(
  state: GameState,
  civId: string,
  overrides: Partial<ActiveEventChain> = {},
): ActiveEventChain {
  return {
    id: 'chain-1',
    kind: 'financial-panic',
    targetCivId: civId,
    cityIds: ['c1'],
    stageId: 'onset',
    startedTurn: state.turn,
    turnsInStage: 0,
    nextEvaluationTurn: state.turn,
    priorChoices: [],
    ...overrides,
  };
}

describe('event-chain-progression — financial-panic consequences (#990)', () => {
  it('still waits while a pending choice has not expired', () => {
    const { state, civId } = makeCrisisFixture({ turn: 50 });
    const chain = chainAt(state, civId, {
      pendingChoice: { stageId: 'onset', optionIds: ['bailout', 'austerity-reform', 'do-nothing'] },
      pendingChoiceExpiresTurn: 53,
    });
    const bus = new EventBus();

    const { record } = tickEventChainByKind(state, chain, bus);

    expect(record?.pendingChoice).toBeDefined();
  });

  it('auto-applies the default option once the pending-choice window expires, marked defaulted', () => {
    const { state, civId } = makeCrisisFixture({ turn: 53 });
    const chain = chainAt(state, civId, {
      startedTurn: 50,
      pendingChoice: { stageId: 'onset', optionIds: ['bailout', 'austerity-reform', 'do-nothing'] },
      pendingChoiceExpiresTurn: 53,
    });
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('eventchain:choice-made', e => events.push(e));

    const { record } = tickEventChainByKind(state, chain, bus);

    expect(record?.pendingChoice).toBeUndefined();
    expect(record?.stageId).toBe('consequence');
    expect(record?.priorChoices).toEqual([{ stageId: 'onset', optionId: 'do-nothing', turn: 53, actorCivId: civId }]);
    expect(events).toEqual([{ chainId: 'chain-1', stageId: 'onset', optionId: 'do-nothing', actorCivId: civId, wasDefaulted: true }]);
  });

  it('bailout: always resolves cleanly and always charges its gold cost, regardless of war or gold recovery', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3 });
    const state = { ...base, civilizations: { ...base.civilizations, [civId]: { ...base.civilizations[civId], gold: 200 } } };
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [{ stageId: 'onset', optionId: 'bailout', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('eventchain:resolved', e => events.push(e));

    const { record, state: nextState } = tickEventChainByKind(state, chain, bus);

    expect(record).toBeNull();
    expect(nextState.civilizations[civId].gold).toBe(200 - getFinancialPanicBailoutCost(3));
    expect(nextState.cities.c1.unrestLevel).toBe(0); // guaranteed clean
    expect(events).toEqual([{ chainId: 'chain-1', kind: 'financial-panic', civId, outcome: 'resolved', priorChoices: chain.priorChoices }]);
  });

  it('bailout never overdraws — caps the charge at whatever gold is on hand', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3 });
    const state = { ...base, civilizations: { ...base.civilizations, [civId]: { ...base.civilizations[civId], gold: 5 } } };
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [{ stageId: 'onset', optionId: 'bailout', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();

    const { state: nextState } = tickEventChainByKind(state, chain, bus);

    expect(nextState.civilizations[civId].gold).toBe(0);
    expect(nextState.cities.c1.unrestLevel).toBe(0);
  });

  it('reform: resolves cleanly at peace (this PR\'s "reform is optimal" scenario)', () => {
    const { state, civId } = makeCrisisFixture({ turn: 54, era: 3 }); // no war by default
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [{ stageId: 'onset', optionId: 'austerity-reform', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();

    const { state: nextState } = tickEventChainByKind(state, chain, bus);

    expect(nextState.civilizations[civId].gold).toBe(state.civilizations[civId].gold); // no cost
    expect(nextState.cities.c1.unrestLevel).toBe(0);
  });

  it('reform: fails into unrest (not revolt) when still at war', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3, includeSecondHuman: true });
    const state = {
      ...base,
      civilizations: {
        ...base.civilizations,
        [civId]: { ...base.civilizations[civId], diplomacy: { ...base.civilizations[civId].diplomacy, atWarWith: ['p2'] } },
      },
    };
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [{ stageId: 'onset', optionId: 'austerity-reform', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();

    const { state: nextState } = tickEventChainByKind(state, chain, bus);

    expect(nextState.cities.c1.unrestLevel).toBe(1);
    expect(nextState.cities.c1.unrestTurns).toBe(0);
  });

  it('do-nothing: resolves for free when gold has already recovered (this PR\'s "do-nothing is optimal" scenario)', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3 });
    const threshold = getFinancialPanicGoldThreshold(3);
    const state = { ...base, civilizations: { ...base.civilizations, [civId]: { ...base.civilizations[civId], gold: threshold } } };
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [{ stageId: 'onset', optionId: 'do-nothing', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();

    const { state: nextState } = tickEventChainByKind(state, chain, bus);

    expect(nextState.civilizations[civId].gold).toBe(threshold);
    expect(nextState.cities.c1.unrestLevel).toBe(0);
  });

  it('do-nothing: forces a revolt when gold never recovered (worst outcome, this PR\'s "bailout is optimal" scenario counterpart)', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 54, era: 3 });
    const state = { ...base, civilizations: { ...base.civilizations, [civId]: { ...base.civilizations[civId], gold: 1 } } };
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [{ stageId: 'onset', optionId: 'do-nothing', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();

    const { state: nextState } = tickEventChainByKind(state, chain, bus);

    expect(nextState.cities.c1.unrestLevel).toBe(2);
  });

  it('never re-resolves a chain before its nextEvaluationTurn', () => {
    const { state, civId } = makeCrisisFixture({ turn: 51 });
    const chain = chainAt(state, civId, {
      stageId: 'consequence',
      nextEvaluationTurn: 54, // still in the future
      priorChoices: [{ stageId: 'onset', optionId: 'do-nothing', turn: 50, actorCivId: civId }],
    });
    const bus = new EventBus();

    const { record } = tickEventChainByKind(state, chain, bus);

    expect(record).not.toBeNull();
    expect(record?.stageId).toBe('consequence');
  });

  it('an unresolvable target civ resolves as invalid rather than throwing', () => {
    const { state, civId } = makeCrisisFixture({ turn: 54 });
    const chain = chainAt(state, civId, {
      targetCivId: 'ghost-civ',
      stageId: 'consequence',
      nextEvaluationTurn: 54,
      priorChoices: [],
    });
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('eventchain:resolved', e => events.push(e));

    const { record } = tickEventChainByKind(state, chain, bus);

    expect(record).toBeNull();
    expect(events[0].outcome).toBe('invalid');
  });
});
