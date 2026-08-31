import { describe, expect, it } from 'vitest';
import { evaluatePeaceConsent, evaluateTreatyConsent } from '@/ai/ai-treaty-consent';

describe('treaty consent policy (#901)', () => {
  it('declines a hostile alliance and accepts a friendly non-aggression pact', () => {
    expect(evaluateTreatyConsent({
      kind: 'alliance', relationship: -50, diplomacyFocus: 0.9,
      targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
    })).toEqual({ accepted: false, reason: 'relations-too-strained' });

    expect(evaluateTreatyConsent({
      kind: 'non_aggression_pact', relationship: 10, diplomacyFocus: 0.8,
      targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
    })).toEqual({ accepted: true });
  });

  it('arms control needs both sides to have known strategic capability, plus positive relations', () => {
    const base = {
      kind: 'arms_control_pact' as const, relationship: 20, diplomacyFocus: 0.6,
    };
    expect(evaluateTreatyConsent({ ...base, targetHasKnownStrategicCapability: true, actorHasKnownStrategicCapability: true }))
      .toEqual({ accepted: true });
    expect(evaluateTreatyConsent({ ...base, targetHasKnownStrategicCapability: true, actorHasKnownStrategicCapability: false }))
      .toEqual({ accepted: false, reason: 'strategic-caution' });
    expect(evaluateTreatyConsent({ ...base, targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: true }))
      .toEqual({ accepted: false, reason: 'strategic-caution' });
  });

  describe('evaluatePeaceConsent', () => {
    it('relationship-only (production wiring today): accepts once relations recover past -20, otherwise declines', () => {
      const base = {
        kind: 'peace' as const, diplomacyFocus: 0.2,
        targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
      };
      // no strength estimates threaded -- proposeTreatyAgreement omits them (#901 follow-up)
      expect(evaluatePeaceConsent({ ...base, relationship: -60 })).toEqual({ accepted: false, reason: 'peace-not-acceptable' });
      expect(evaluatePeaceConsent({ ...base, relationship: -10 })).toEqual({ accepted: true });
    });

    it('when both perceived-strength estimates ARE supplied, a visibly outmatched target sues for peace despite bad relations', () => {
      expect(evaluatePeaceConsent({
        kind: 'peace', relationship: -60, diplomacyFocus: 0.2,
        targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
        targetVisibleStrength: 4, proposerVisibleStrength: 10,
      })).toEqual({ accepted: true });

      // ...but a roughly-even matchup at the same bad relationship still refuses
      expect(evaluatePeaceConsent({
        kind: 'peace', relationship: -60, diplomacyFocus: 0.2,
        targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
        targetVisibleStrength: 9, proposerVisibleStrength: 10,
      })).toEqual({ accepted: false, reason: 'peace-not-acceptable' });
    });
  });
});
