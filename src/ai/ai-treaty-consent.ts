/**
 * #901 target-side treaty/peace consent policy. Deliberately a **cycle-free
 * leaf** (imports only `@/core/types`) so `diplomacy-system.ts` can call it
 * without an import cycle -- the plan's stated architecture. Pure functions of
 * relationship + personality + already-known strategic capability: no
 * `GameState`, no RNG, no difficulty input (Explorer / Standard / Veteran
 * share identical consent thresholds per the design). Invoked by
 * `proposeTreatyAgreement` for both the human->AI and AI->AI paths.
 */
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
  /**
   * Peace-only, and OPTIONAL: a non-omniscient estimate of each side's
   * militarily-relevant strength as the *target* perceives it. When both are
   * provided, a target that is visibly outmatched sues for peace even at a
   * bad relationship. `proposeTreatyAgreement` does not yet compute these
   * (that needs the AI perception layer — see `ai-strength.ts` /
   * `ai-perception.ts` — threaded into the diplomacy call site), so peace
   * consent currently reduces to the relationship test. Tracked as #901
   * follow-up work; do not pass placeholder constants here.
   */
  targetVisibleStrength?: number;
  proposerVisibleStrength?: number;
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
  const outmatched =
    input.targetVisibleStrength !== undefined
    && input.proposerVisibleStrength !== undefined
    && input.targetVisibleStrength < input.proposerVisibleStrength * 0.7;
  return outmatched || input.relationship > -20
    ? { accepted: true }
    : { accepted: false, reason: 'peace-not-acceptable' };
}
