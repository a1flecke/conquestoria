import type { TreatyType } from '@/core/types';

export type AgreementKind = Exclude<TreatyType, 'vassalage'> | 'peace';
export type TreatyDeclineReason = 'relations-too-strained' | 'strategic-caution' | 'peace-not-acceptable';

export interface TreatyConsent {
  accepted: boolean;
  reason?: TreatyDeclineReason;
}

export interface TreatyConsentInput {
  kind: AgreementKind;
  relationship: number;
  diplomacyFocus: number;
  targetHasKnownStrategicCapability: boolean;
  actorHasKnownStrategicCapability: boolean;
  targetVisibleStrength: number;
  proposerVisibleStrength: number;
}

export function evaluateTreatyConsent(input: TreatyConsentInput): TreatyConsent {
  switch (input.kind) {
    case 'non_aggression_pact':
      return input.relationship > -20 && input.diplomacyFocus > 0.3
        ? { accepted: true }
        : { accepted: false, reason: 'relations-too-strained' };
    case 'trade_agreement':
      return input.relationship > 0
        ? { accepted: true }
        : { accepted: false, reason: 'relations-too-strained' };
    case 'open_borders':
      return input.relationship > 20 && input.diplomacyFocus > 0.4
        ? { accepted: true }
        : { accepted: false, reason: 'strategic-caution' };
    case 'alliance':
      return input.relationship > 40 && input.diplomacyFocus > 0.5
        ? { accepted: true }
        : { accepted: false, reason: 'relations-too-strained' };
    case 'arms_control_pact':
      return input.relationship > 0 && input.diplomacyFocus > 0.4
        && input.targetHasKnownStrategicCapability && input.actorHasKnownStrategicCapability
        ? { accepted: true }
        : { accepted: false, reason: 'strategic-caution' };
    case 'peace':
      return evaluatePeaceConsent(input);
  }
}

export function evaluatePeaceConsent(input: TreatyConsentInput): TreatyConsent {
  return input.targetVisibleStrength < input.proposerVisibleStrength * 0.7 || input.relationship > -20
    ? { accepted: true }
    : { accepted: false, reason: 'peace-not-acceptable' };
}
