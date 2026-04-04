import { describe, it, expect } from 'vitest';
import {
  applyTreachery,
  broadcastTreacheryPenalty,
  decayTreachery,
} from '@/systems/diplomacy-system';
import type { DiplomacyState } from '@/core/types';

function makeDipState(overrides?: Partial<DiplomacyState>): DiplomacyState {
  return {
    relationships: { 'civ-a': 0, 'civ-b': 10 },
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 },
    ...overrides,
  };
}

describe('betrayal & treachery', () => {
  describe('applyTreachery', () => {
    it('adds treachery for breaking NAP', () => {
      const state = makeDipState();
      const result = applyTreachery(state, 'non_aggression_pact');
      expect(result.treacheryScore).toBe(20);
    });

    it('adds treachery for breaking alliance', () => {
      const state = makeDipState();
      const result = applyTreachery(state, 'alliance');
      expect(result.treacheryScore).toBe(30);
    });

    it('adds treachery for breaking vassalage', () => {
      const state = makeDipState();
      const result = applyTreachery(state, 'vassalage');
      expect(result.treacheryScore).toBe(40);
    });

    it('clamps at 100', () => {
      const state = makeDipState({ treacheryScore: 90 });
      const result = applyTreachery(state, 'vassalage');
      expect(result.treacheryScore).toBe(100);
    });

    it('stacks when breaking multiple treaties via war declaration', () => {
      let state = makeDipState();
      state = applyTreachery(state, 'non_aggression_pact'); // +20
      state = applyTreachery(state, 'alliance');              // +30
      expect(state.treacheryScore).toBe(50);
    });
  });

  describe('broadcastTreacheryPenalty', () => {
    it('applies relationship penalty to all civs based on treachery score', () => {
      const states: Record<string, DiplomacyState> = {
        betrayer: makeDipState({ treacheryScore: 40 }),
        'civ-a': makeDipState({ relationships: { betrayer: 20 } }),
        'civ-b': makeDipState({ relationships: { betrayer: 10 } }),
      };
      const result = broadcastTreacheryPenalty(states, 'betrayer');
      // Penalty = -(40/4) = -10
      expect(result['civ-a'].relationships['betrayer']).toBe(10);
      expect(result['civ-b'].relationships['betrayer']).toBe(0);
    });
  });

  describe('decayTreachery', () => {
    it('decays 1 point every 5 turns', () => {
      const state = makeDipState({ treacheryScore: 20 });
      const result = decayTreachery(state, 15); // turn 15 → divisible by 5
      expect(result.treacheryScore).toBe(19);
    });

    it('does not decay on non-5th turn', () => {
      const state = makeDipState({ treacheryScore: 20 });
      const result = decayTreachery(state, 13);
      expect(result.treacheryScore).toBe(20);
    });

    it('does not go below 0', () => {
      const state = makeDipState({ treacheryScore: 0 });
      const result = decayTreachery(state, 10);
      expect(result.treacheryScore).toBe(0);
    });
  });
});
