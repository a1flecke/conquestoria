import { describe, it, expect } from 'vitest';
import {
  EVENT_CHAIN_DEFINITIONS,
  chooseAiFinancialPanicOption,
  getFinancialPanicGoldThreshold,
  getFinancialPanicBailoutCost,
} from '@/systems/event-chain-definitions';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { EventChainKind } from '@/core/types';

// Compile-time lockstep check: this array must list every EventChainKind. If a
// future kind is added to types.ts without a definition, this file fails to
// compile (an EventChainKind not assignable to the array element type) rather
// than silently shipping an undefined-behavior kind.
const ALL_KINDS: readonly EventChainKind[] = ['financial-panic'];

describe('event-chain-definitions (#990)', () => {
  it('EVENT_CHAIN_DEFINITIONS has exactly one entry per EventChainKind — no more, no fewer', () => {
    expect(Object.keys(EVENT_CHAIN_DEFINITIONS).sort()).toEqual([...ALL_KINDS].sort());
  });

  it('every stage id is unique within its definition, and only the last stage has no options', () => {
    for (const definition of Object.values(EVENT_CHAIN_DEFINITIONS)) {
      const ids = definition.stages.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      // Every choice-gated stage must declare a default and an expiry window,
      // or a human decision-maker could wait forever.
      for (const stage of definition.stages) {
        if (stage.options) {
          expect(stage.defaultOptionId).toBeDefined();
          expect(stage.options.map(o => o.id)).toContain(stage.defaultOptionId);
          expect(stage.pendingChoiceExpiresTurns).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gold threshold and bailout cost both scale with era (never flat)', () => {
    expect(getFinancialPanicGoldThreshold(5)).toBeGreaterThan(getFinancialPanicGoldThreshold(1));
    expect(getFinancialPanicBailoutCost(5)).toBeGreaterThan(getFinancialPanicBailoutCost(1));
  });

  it('AI policy is a pure function of the civ\'s own known state — same input, same output', () => {
    const { state, civId } = makeCrisisFixture({ turn: 50 });
    const a = chooseAiFinancialPanicOption(state, civId);
    const b = chooseAiFinancialPanicOption(state, civId);
    expect(a).toBe(b);
  });

  it('AI never picks do-nothing (out of scope for the exemplar AI policy — see definitions.ts doc comment)', () => {
    const { state: base, civId } = makeCrisisFixture({ turn: 50, includeSecondHuman: true });
    const atPeace = chooseAiFinancialPanicOption(base, civId);
    expect(atPeace).not.toBe('do-nothing');

    const atWar = {
      ...base,
      civilizations: {
        ...base.civilizations,
        [civId]: { ...base.civilizations[civId], diplomacy: { ...base.civilizations[civId].diplomacy, atWarWith: ['p2'] } },
      },
    };
    const warChoice = chooseAiFinancialPanicOption(atWar, civId);
    expect(warChoice).toBe('bailout');
    expect(atPeace).toBe('austerity-reform');
  });
});
