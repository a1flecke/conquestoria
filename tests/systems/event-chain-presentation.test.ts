import { describe, it, expect } from 'vitest';
import type { ViewerSurface } from '../helpers/viewer-safety';
import { expectViewerSafety, expectHotSeatDifferential } from '../helpers/viewer-safety';
import {
  buildEventChainCardId,
  buildEventChainConclusionMomentItem,
  getEventChainDramaCards,
  parseEventChainCardId,
} from '@/systems/event-chain-presentation';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { ActiveEventChain, CouncilCard, EventChainChoiceRecord, GameEvents, GameState } from '@/core/types';

function pendingChain(targetCivId: string, id = 'chain-1'): ActiveEventChain {
  return {
    id,
    kind: 'financial-panic',
    targetCivId,
    cityIds: ['c1'],
    stageId: 'onset',
    startedTurn: 50,
    turnsInStage: 0,
    nextEvaluationTurn: 50,
    priorChoices: [],
    pendingChoice: { stageId: 'onset', optionIds: ['bailout', 'austerity-reform', 'do-nothing'] },
  };
}

const surface: ViewerSurface<GameState, CouncilCard[]> = {
  name: 'event-chain drama cards',
  project: (state, viewerId) => getEventChainDramaCards(state, viewerId),
};

describe('event-chain-presentation viewer safety (#990)', () => {
  it('a chain belongs to exactly one civ — never leaks existence or content to another', () => {
    const { state: world, civId } = makeCrisisFixture({ turn: 50, includeSecondHuman: true });

    expectViewerSafety(surface, {
      world,
      viewerId: civId,
      hidden: [
        {
          label: "another civ's chain must never appear",
          apply: w => { w.activeEventChains = { 'other-chain': pendingChain('p2', 'other-chain') }; },
        },
      ],
      earned: [
        {
          label: "the viewer's own chain must appear",
          apply: w => { w.activeEventChains = { 'own-chain': pendingChain(civId, 'own-chain') }; },
        },
      ],
    });
  });

  it('hot seat: only the owning seat ever sees the pending decision', () => {
    const { state: world, civId } = makeCrisisFixture({ turn: 50, includeSecondHuman: true });

    expectHotSeatDifferential(surface, {
      world,
      viewers: [civId, 'p2'],
      knownOnlyTo: civId,
      mutation: {
        label: "own civ's financial panic becomes pending",
        apply: w => { w.activeEventChains = { 'chain-1': pendingChain(civId, 'chain-1') }; },
      },
    });
  });

  it('a chain with no pending choice (awaiting its delayed consequence) shows no card', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state: GameState = {
      ...base,
      activeEventChains: { 'chain-1': { ...pendingChain(civId), pendingChoice: undefined, stageId: 'consequence' } },
    };

    expect(getEventChainDramaCards(state, civId)).toEqual([]);
  });

  it('produces one card per offered option', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50 });
    const state: GameState = { ...base, activeEventChains: { 'chain-1': pendingChain(civId) } };

    const cards = getEventChainDramaCards(state, civId);

    expect(cards).toHaveLength(3);
    expect(cards.map(c => c.actionLabel)).toEqual(['Emergency Bailout', 'Austerity Reform', 'Do Nothing']);
  });

  it('card id round-trips through build/parse', () => {
    const id = buildEventChainCardId('chain-1', 'bailout');
    expect(parseEventChainCardId(id)).toEqual({ chainId: 'chain-1', optionId: 'bailout' });
  });

  it('parseEventChainCardId rejects a non-event-chain card id', () => {
    expect(parseEventChainCardId('survey-frontier')).toBeNull();
  });
});

describe('buildEventChainConclusionMomentItem (#993)', () => {
  function resolvedEvent(overrides: Partial<GameEvents['eventchain:resolved']> = {}): GameEvents['eventchain:resolved'] {
    const priorChoices: EventChainChoiceRecord[] = [
      { stageId: 'onset', optionId: 'bailout', turn: 40, actorCivId: 'player' },
    ];
    return {
      chainId: 'chain-1',
      kind: 'financial-panic',
      civId: 'player',
      outcome: 'resolved',
      priorChoices,
      ...overrides,
    };
  }

  it('builds a moment for the currently-active viewer whose own chain resolved', () => {
    const { state: base } = makeCrisisFixture({ turn: 50 });
    const state: GameState = { ...base, currentPlayer: 'player' };

    const item = buildEventChainConclusionMomentItem(state, resolvedEvent());

    expect(item).toEqual({
      civId: 'player',
      chainId: 'chain-1',
      kind: 'financial-panic',
      title: 'Financial Panic',
      optionLabel: 'Emergency Bailout',
      optionDescription: 'Pay a gold sum now to guarantee the treasury crisis passes quietly.',
    });
  });

  it('never builds a moment for anyone but the currently-active viewer', () => {
    // An AI civ's, or a different hot-seat human's, own chain resolving must
    // never pop a full-screen ceremony on a screen someone else is looking
    // at -- it still gets its own toast via routeEventChainResolved,
    // unaffected by this gate.
    const { state: base } = makeCrisisFixture({ turn: 50, includeSecondHuman: true });
    const state: GameState = { ...base, currentPlayer: 'p2' };

    expect(buildEventChainConclusionMomentItem(state, resolvedEvent({ civId: 'player' }))).toBeNull();
  });

  it('builds nothing for a cancellation outcome, even for the active viewer', () => {
    const { state: base } = makeCrisisFixture({ turn: 50 });
    const state: GameState = { ...base, currentPlayer: 'player' };

    for (const outcome of ['city-lost', 'civ-eliminated', 'invalid'] as const) {
      expect(buildEventChainConclusionMomentItem(state, resolvedEvent({ outcome }))).toBeNull();
    }
  });

  it('builds nothing when no matching onset choice can be found (defensive)', () => {
    const { state: base } = makeCrisisFixture({ turn: 50 });
    const state: GameState = { ...base, currentPlayer: 'player' };

    expect(buildEventChainConclusionMomentItem(state, resolvedEvent({ priorChoices: [] }))).toBeNull();
  });
});
