import { describe, expect, it } from 'vitest';
import { evaluatePeaceConsent, evaluateTreatyConsent } from '@/ai/ai-treaty-consent';

describe('AI treaty consent', () => {
  it('declines a hostile alliance and accepts a friendly non-aggression pact', () => {
    expect(evaluateTreatyConsent({
      kind: 'alliance', relationship: -50, diplomacyFocus: 0.9,
      targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
      targetVisibleStrength: 10, proposerVisibleStrength: 10,
    })).toEqual({ accepted: false, reason: 'relations-too-strained' });

    expect(evaluateTreatyConsent({
      kind: 'non_aggression_pact', relationship: 10, diplomacyFocus: 0.8,
      targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
      targetVisibleStrength: 10, proposerVisibleStrength: 10,
    })).toEqual({ accepted: true });
  });

  it('accepts peace when the target sees the proposer as stronger', () => {
    expect(evaluatePeaceConsent({
      kind: 'peace', relationship: -60, diplomacyFocus: 0.2,
      targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false,
      targetVisibleStrength: 4, proposerVisibleStrength: 10,
    })).toEqual({ accepted: true });
  });
});
