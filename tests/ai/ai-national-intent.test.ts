import { describe, expect, it } from 'vitest';
import {
  NATIONAL_INTENT_MIN_HOLD_TURNS,
  NATIONAL_INTENT_RECOVERY_STABLE_TURNS,
  NATIONAL_INTENT_SWITCH_MARGIN,
  resolveNationalIntent,
  type NationalIntentInput,
} from '@/ai/ai-national-intent';
import type { DominationDoctrine } from '@/ai/ai-domination';
import type { NationalIntentState, PersonalityTraits } from '@/core/types';

const NEUTRAL_PERSONALITY: PersonalityTraits = {
  traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5,
};
const NO_PURSUIT: DominationDoctrine = {
  pursuit: false, threatId: null, captureValueBonus: 0, reasonCodes: [],
};

// Neutral personality's expansionDrive (0.5) gives a soft cap of 4
// (EXPANSION_CITY_SOFT_CAP_BASE=2 + round(0.5*4)=2). Defaulting to exactly 4 owned
// cities means 'expand' scores 0 by default, so other tests get a genuinely neutral
// 'develop'-favoring baseline rather than an accidental expand bias.
function baseInput(overrides: Partial<NationalIntentInput> = {}): NationalIntentInput {
  return {
    turn: 20,
    previous: null,
    perception: { ownCities: Array.from({ length: 4 }) as never },
    personality: NEUTRAL_PERSONALITY,
    doctrine: NO_PURSUIT,
    cityThreats: [],
    atWarWith: [],
    challenge: 'standard',
    ...overrides,
  };
}

describe('#1086 resolveNationalIntent', () => {
  describe('initial selection', () => {
    it('selects deterministically with no previous state', () => {
      const input = baseInput();
      expect(resolveNationalIntent(input)).toEqual(resolveNationalIntent(input));
    });

    it('same seed/state repeats identically across repeated calls', () => {
      const input = baseInput({ perception: { ownCities: [] as never }, cityThreats: [
        { captureRisk: 90, isLastCity: true },
      ] });
      const first = resolveNationalIntent(input);
      const second = resolveNationalIntent(input);
      expect(second).toEqual(first);
    });
  });

  describe('hysteresis', () => {
    it('retains intent for a small score fluctuation within the hold window', () => {
      const first = resolveNationalIntent(baseInput({ turn: 20, previous: null }));
      // One turn later, still well inside the hold window -- a tiny perception change
      // (one more city) must not flip the intent even if it would nudge raw scores.
      const second = resolveNationalIntent(baseInput({
        turn: 21,
        previous: first,
        perception: { ownCities: [{}, {}, {}] as never },
      }));
      expect(second.current).toBe(first.current);
      expect(second.reasonCodes).toContain('intent-hysteresis-retained');
    });

    it('does not oscillate over a short noisy sequence', () => {
      let state: NationalIntentState | null = null;
      const cityCounts = [2, 3, 2, 3, 2];
      const seen = new Set<string>();
      for (let i = 0; i < cityCounts.length; i += 1) {
        state = resolveNationalIntent(baseInput({
          turn: 20 + i,
          previous: state,
          perception: { ownCities: Array.from({ length: cityCounts[i]! }) as never },
        }));
        seen.add(state.current);
      }
      expect(seen.size).toBe(1);
    });

    it('switches after the hold window once evidence crosses the margin (boundary)', () => {
      // Start committed to 'develop' (no expansion room, no war, no domination pursuit,
      // no threats) at turn 0.
      const first = resolveNationalIntent(baseInput({
        turn: 0, previous: null,
        perception: { ownCities: Array.from({ length: 10 }) as never }, // at/above soft cap -> expand scores 0
      }));
      expect(first.current).toBe('develop');

      // Past the hold window, with a genuine expansion opportunity now available (one
      // owned city, well below the soft cap of 4 -- NOT zero, which would instead read
      // as shock/citylessness) -- margin is 12; expand's score must exceed develop's by
      // more than that.
      const reconsiderTurn = first.reconsiderAfterTurn;
      const stillHeld = resolveNationalIntent(baseInput({
        turn: reconsiderTurn - 1,
        previous: first,
        perception: { ownCities: [{}] as never },
      }));
      expect(stillHeld.current).toBe('develop');
      expect(stillHeld.reasonCodes).toContain('intent-hysteresis-retained');

      const switched = resolveNationalIntent(baseInput({
        turn: reconsiderTurn,
        previous: first,
        perception: { ownCities: [{}] as never },
      }));
      expect(switched.current).toBe('expand');
      expect(switched.reasonCodes).toContain('intent-sustained-evidence');
    });

    it('retains the incumbent when the challenger does not clear the switch margin', () => {
      const first = resolveNationalIntent(baseInput({
        turn: 0, previous: null,
        perception: { ownCities: Array.from({ length: 10 }) as never },
      }));
      expect(first.current).toBe('develop');
      // Past the hold window with only a marginal improvement for a rival intent --
      // one extra non-existential threat nudges 'deter' up by 18, but that is not
      // enough alone to guarantee a switch once compared with the margin; assert the
      // actual documented boundary behavior directly instead of assuming.
      const reconsidered = resolveNationalIntent(baseInput({
        turn: first.reconsiderAfterTurn,
        previous: first,
        perception: { ownCities: Array.from({ length: 10 }) as never },
        cityThreats: [{ captureRisk: 20, isLastCity: false }],
      }));
      // develop=45, deter=30+18=48 -- a genuine 3-point lead, well under the 12 margin.
      expect(reconsidered.current).toBe('develop');
      expect(reconsidered.reasonCodes).toContain('intent-hysteresis-retained');
    });
  });

  describe('shock', () => {
    it('overrides a mid-hold ambition intent on sudden citylessness', () => {
      const first = resolveNationalIntent(baseInput({ turn: 0, previous: null }));
      expect(first.reconsiderAfterTurn).toBeGreaterThan(1);
      const shocked = resolveNationalIntent(baseInput({
        turn: 1, // still well inside the hold window
        previous: first,
        perception: { ownCities: [] as never },
      }));
      expect(shocked.current).toBe('recover');
      expect(shocked.shockActive).toBe(true);
      expect(shocked.reasonCodes).toContain('intent-shock-recover');
    });

    it('overrides on a last-city capture risk at/above the threshold', () => {
      const result = resolveNationalIntent(baseInput({
        cityThreats: [{ captureRisk: 50, isLastCity: true }],
      }));
      expect(result.current).toBe('recover');
    });

    it('does not trigger shock for a last-city threat below the threshold', () => {
      const result = resolveNationalIntent(baseInput({
        cityThreats: [{ captureRisk: 49, isLastCity: true }],
      }));
      expect(result.current).not.toBe('recover');
    });

    it('does not trigger shock for a non-last-city threat regardless of risk', () => {
      const result = resolveNationalIntent(baseInput({
        cityThreats: [{ captureRisk: 99, isLastCity: false }],
      }));
      expect(result.current).not.toBe('recover');
    });

    it('persists in recover while danger persists, resetting the shock-free streak', () => {
      let state = resolveNationalIntent(baseInput({
        turn: 0, previous: null, perception: { ownCities: [] as never },
      }));
      expect(state.current).toBe('recover');
      for (let turn = 1; turn <= 3; turn += 1) {
        state = resolveNationalIntent(baseInput({
          turn, previous: state, perception: { ownCities: [] as never },
        }));
        expect(state.current).toBe('recover');
        expect(state.shockFreeStreak).toBe(0);
      }
    });

    it('does not exit after a single shock-free round', () => {
      const shocked = resolveNationalIntent(baseInput({
        turn: 0, previous: null, perception: { ownCities: [] as never },
      }));
      const oneShockFreeRound = resolveNationalIntent(baseInput({
        turn: 1, previous: shocked, perception: { ownCities: [{}, {}] as never },
      }));
      expect(oneShockFreeRound.current).toBe('recover');
      expect(oneShockFreeRound.shockActive).toBe(false);
      expect(oneShockFreeRound.shockFreeStreak).toBe(1);
    });

    it('exits recover after the stabilization window and reselects', () => {
      let state = resolveNationalIntent(baseInput({
        turn: 0, previous: null, perception: { ownCities: [] as never },
      }));
      expect(state.current).toBe('recover');
      for (let turn = 1; turn <= NATIONAL_INTENT_RECOVERY_STABLE_TURNS; turn += 1) {
        state = resolveNationalIntent(baseInput({
          turn, previous: state, perception: { ownCities: [{}, {}] as never },
        }));
      }
      expect(state.current).not.toBe('recover');
      expect(state.reasonCodes).toContain('intent-shock-resolved');
    });

    it('cannot be suppressed by personality', () => {
      const aggressive: PersonalityTraits = {
        traits: ['aggressive'], warLikelihood: 0.9, diplomacyFocus: 0.2, expansionDrive: 0.3,
      };
      const result = resolveNationalIntent(baseInput({
        personality: aggressive,
        doctrine: { pursuit: true, threatId: 'x', captureValueBonus: 20, reasonCodes: ['domination-pursuit'] },
        perception: { ownCities: [] as never },
      }));
      expect(result.current).toBe('recover');
    });
  });

  describe('personality bias', () => {
    it('same perceived world, different personality selects a different intent', () => {
      const world = { turn: 0, previous: null, cityThreats: [] as NationalIntentInput['cityThreats'] };
      const trader = resolveNationalIntent(baseInput({
        ...world,
        personality: { traits: ['trader'], warLikelihood: 0.2, diplomacyFocus: 0.5, expansionDrive: 0.3 },
      }));
      const diplomatic = resolveNationalIntent(baseInput({
        ...world,
        personality: { traits: ['diplomatic'], warLikelihood: 0.2, diplomacyFocus: 0.8, expansionDrive: 0.3 },
        cityThreats: [{ captureRisk: 20, isLastCity: false }],
      }));
      expect(trader.current).toBe('develop');
      expect(diplomatic.current).toBe('deter');
      expect(trader.current).not.toBe(diplomatic.current);
    });

    it('does not override strong world evidence for a personality with no matching bias', () => {
      // The 'trader' trait itself carries no expand-specific bonus (only 'develop'
      // gets one), yet a large genuine expansion opportunity (one owned city, far below
      // a wide soft cap) still wins over the trait-boosted 'develop' baseline --
      // proving world evidence, not a personality script, decides.
      const trader: PersonalityTraits = {
        traits: ['trader'], warLikelihood: 0.2, diplomacyFocus: 0.5, expansionDrive: 0.9,
      };
      const result = resolveNationalIntent(baseInput({
        personality: trader,
        perception: { ownCities: [{}] as never },
      }));
      expect(result.current).toBe('expand');
    });
  });

  describe('domination integration', () => {
    it('dominate is only reachable when doctrine.pursuit is true', () => {
      const notPursuing = resolveNationalIntent(baseInput({ doctrine: NO_PURSUIT }));
      expect(notPursuing.current).not.toBe('dominate');

      const pursuing = resolveNationalIntent(baseInput({
        doctrine: { pursuit: true, threatId: 'rival', captureValueBonus: 20, reasonCodes: ['domination-pursuit'] },
      }));
      expect(pursuing.current).toBe('dominate');
      expect(pursuing.reasonCodes).toContain('intent-domination-pursuit');
    });
  });

  describe('hidden-information invariance', () => {
    it('is unaffected by fields not present in NationalIntentInput (only perception-safe inputs exist)', () => {
      // NationalIntentInput's type itself has no field for hidden enemy facts, so this
      // is structurally guaranteed -- this test pins that two calls with identical
      // perception-safe inputs (the only inputs the function accepts) are byte-identical,
      // the same invariant a hidden-enemy-mutation test would prove if the type allowed
      // hidden state to be passed at all.
      const input = baseInput({ cityThreats: [{ captureRisk: 30, isLastCity: false }] });
      expect(resolveNationalIntent({ ...input })).toEqual(resolveNationalIntent({ ...input }));
    });
  });

  describe('save/reload', () => {
    it('a JSON round trip of the previous state produces an identical next result', () => {
      const first = resolveNationalIntent(baseInput({ turn: 0, previous: null }));
      const reloaded: NationalIntentState = JSON.parse(JSON.stringify(first));
      const nextFromLive = resolveNationalIntent(baseInput({ turn: 5, previous: first }));
      const nextFromReloaded = resolveNationalIntent(baseInput({ turn: 5, previous: reloaded }));
      expect(nextFromReloaded).toEqual(nextFromLive);
    });
  });

  it('never returns a unit-commanding action (structural: the return type has no such field)', () => {
    const result = resolveNationalIntent(baseInput());
    expect(Object.keys(result).sort()).toEqual(
      ['current', 'previous', 'reasonCodes', 'reconsiderAfterTurn', 'selectedTurn', 'shockActive', 'shockFreeStreak'].sort(),
    );
  });

  it('exposes hold/switch constants used by the hysteresis contract', () => {
    expect(NATIONAL_INTENT_MIN_HOLD_TURNS).toBeGreaterThan(0);
    expect(NATIONAL_INTENT_SWITCH_MARGIN).toBeGreaterThan(0);
    expect(NATIONAL_INTENT_RECOVERY_STABLE_TURNS).toBeGreaterThan(0);
  });
});
