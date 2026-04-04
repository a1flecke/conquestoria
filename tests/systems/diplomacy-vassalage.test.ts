import { describe, it, expect } from 'vitest';
import {
  createDiplomacyState,
  canOfferVassalage,
  offerVassalage,
  acceptVassalage,
  endVassalage,
  endVassalageUnilateral,
  processVassalageTribute,
  processProtectionTimers,
  checkIndependenceThreshold,
  petitionIndependence,
  onVassalAttacked,
  isVassalBlocked,
} from '@/systems/diplomacy-system';
import type { DiplomacyState } from '@/core/types';

function makeDipState(overrides?: Partial<DiplomacyState>): DiplomacyState {
  return {
    relationships: { 'other': 0 },
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    vassalage: {
      overlord: null, vassals: [], protectionScore: 100,
      protectionTimers: [], peakCities: 3, peakMilitary: 5,
    },
    ...overrides,
  };
}

describe('vassalage', () => {
  describe('canOfferVassalage', () => {
    it('returns true when below 50% peak cities in era >= 2', () => {
      expect(canOfferVassalage(1, 3, 2, 5, 2)).toBe(true);
    });

    it('returns false in era 1', () => {
      expect(canOfferVassalage(1, 3, 2, 5, 1)).toBe(false);
    });

    it('returns false when peak cities < 2', () => {
      expect(canOfferVassalage(0, 1, 2, 5, 2)).toBe(false);
    });

    it('returns false when above 50% peak', () => {
      expect(canOfferVassalage(2, 3, 4, 5, 2)).toBe(false);
    });
  });

  describe('acceptVassalage', () => {
    it('sets overlord on vassal and adds to overlord vassals list', () => {
      const vassal = makeDipState();
      const overlord = makeDipState();
      const { vassalState, overlordState } = acceptVassalage(vassal, overlord, 'vassal-id', 'overlord-id', 10);
      expect(vassalState.vassalage.overlord).toBe('overlord-id');
      expect(overlordState.vassalage.vassals).toContain('vassal-id');
      expect(vassalState.treaties.some(t => t.type === 'vassalage')).toBe(true);
      expect(overlordState.treaties.some(t => t.type === 'vassalage')).toBe(true);
    });
  });

  describe('endVassalage', () => {
    it('clears overlord and removes from vassals list', () => {
      const vassal = makeDipState({ vassalage: { overlord: 'overlord-id', vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const { vassalState, overlordState } = endVassalage(vassal, overlord, 'vassal-id', 'overlord-id');
      expect(vassalState.vassalage.overlord).toBeNull();
      expect(overlordState.vassalage.vassals).not.toContain('vassal-id');
    });
  });

  describe('processVassalageTribute', () => {
    it('transfers 25% of vassal gold income to overlord', () => {
      const result = processVassalageTribute(40); // 40 gold income
      expect(result.tributeAmount).toBe(10);
    });
  });

  describe('processProtectionTimers', () => {
    it('decrements timer and applies penalty when expired', () => {
      const state = makeDipState({
        vassalage: {
          overlord: 'overlord-id', vassals: [], protectionScore: 100,
          protectionTimers: [{ attackerCivId: 'attacker', turnsRemaining: 1 }],
          peakCities: 3, peakMilitary: 5,
        },
      });
      const result = processProtectionTimers(state);
      expect(result.vassalage.protectionScore).toBe(80);
      expect(result.vassalage.protectionTimers).toHaveLength(0);
    });

    it('does not penalize if timer still active', () => {
      const state = makeDipState({
        vassalage: {
          overlord: 'overlord-id', vassals: [], protectionScore: 100,
          protectionTimers: [{ attackerCivId: 'attacker', turnsRemaining: 2 }],
          peakCities: 3, peakMilitary: 5,
        },
      });
      const result = processProtectionTimers(state);
      expect(result.vassalage.protectionScore).toBe(100);
      expect(result.vassalage.protectionTimers[0].turnsRemaining).toBe(1);
    });
  });

  describe('checkIndependenceThreshold', () => {
    it('returns true when vassal military exceeds modified threshold', () => {
      // Protection 100 → threshold 60%. Vassal has 70, overlord has 100 → 70% > 60%
      expect(checkIndependenceThreshold(70, 100, 100)).toBe(true);
    });

    it('returns false when below threshold', () => {
      expect(checkIndependenceThreshold(40, 100, 100)).toBe(false);
    });

    it('lowers threshold with poor protection', () => {
      // Protection 60 → threshold 40%. Vassal has 45, overlord has 100 → 45% > 40%
      expect(checkIndependenceThreshold(45, 100, 60)).toBe(true);
    });

    it('auto-breakaway at protection <= 20', () => {
      expect(checkIndependenceThreshold(1, 100, 20)).toBe(true);
    });
  });

  describe('petitionIndependence', () => {
    it('returns peaceful separation when overlord accepts', () => {
      const vassal = makeDipState({ vassalage: { overlord: 'overlord-id', vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const result = petitionIndependence(vassal, overlord, 'vassal-id', 'overlord-id', true);
      expect(result.vassalState.vassalage.overlord).toBeNull();
      expect(result.overlordState.vassalage.vassals).not.toContain('vassal-id');
      expect(result.relationshipChange).toBe(10);
    });

    it('returns war declaration with treachery when overlord refuses', () => {
      const vassal = makeDipState({ vassalage: { overlord: 'overlord-id', vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const result = petitionIndependence(vassal, overlord, 'vassal-id', 'overlord-id', false);
      expect(result.vassalState.vassalage.overlord).toBeNull();
      expect(result.vassalState.atWarWith).toContain('overlord-id');
      expect(result.vassalState.treacheryScore).toBe(20); // vassalage_independence
      expect(result.relationshipChange).toBe(-50);
    });
  });

  describe('onVassalAttacked', () => {
    it('starts protection timer without auto-declaring war', () => {
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const result = onVassalAttacked(overlord, 'attacker-id');
      expect(result.vassalage.protectionTimers).toHaveLength(1);
      expect(result.vassalage.protectionTimers[0].attackerCivId).toBe('attacker-id');
      expect(result.vassalage.protectionTimers[0].turnsRemaining).toBe(3);
      // Does NOT auto-declare war — overlord decides on their turn
      expect(result.atWarWith).not.toContain('attacker-id');
    });

    it('does not duplicate timer for same attacker', () => {
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [{ attackerCivId: 'attacker-id', turnsRemaining: 2 }], peakCities: 3, peakMilitary: 5 } });
      const result = onVassalAttacked(overlord, 'attacker-id');
      expect(result.vassalage.protectionTimers).toHaveLength(1);
    });
  });

  describe('isVassalBlocked', () => {
    it('blocks war declaration for vassals', () => {
      expect(isVassalBlocked('declare_war', true)).toBe(true);
    });

    it('blocks treaty signing for vassals', () => {
      expect(isVassalBlocked('non_aggression_pact', true)).toBe(true);
      expect(isVassalBlocked('alliance', true)).toBe(true);
    });

    it('blocks embargo proposal for vassals', () => {
      expect(isVassalBlocked('propose_embargo', true)).toBe(true);
    });

    it('blocks league proposal for vassals', () => {
      expect(isVassalBlocked('propose_league', true)).toBe(true);
    });

    it('allows actions for non-vassals', () => {
      expect(isVassalBlocked('declare_war', false)).toBe(false);
    });
  });
});
