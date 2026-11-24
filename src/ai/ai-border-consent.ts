/**
 * #1766 target-side border-withdrawal consent.
 *
 * A deterministic, difficulty-invariant decision: no RNG, no `Difficulty` input. The intruder weighs its own
 * relationship view of the approached civ, its leader's diplomatic focus and appetite for war, a viewer-safe strength
 * comparison, and whether a legal withdrawal route exists at all. It never reads the host's real army; strength
 * arrives as the intruder's own perception (`diplomatic-strength.ts`).
 */
export interface BorderWithdrawalConsentInput {
  /** The intruder's own relationship score toward the host. */
  relationship: number;
  /** The intruder leader's diplomatic focus, 0..1. */
  diplomacyFocus: number;
  /** The intruder leader's war likelihood, 0..1. */
  warLikelihood: number;
  /** The intruder's own perceived strength. */
  ownStrength: number;
  /** The host's conservative perceived strength (never its real roster). */
  hostStrengthLower: number;
  /** Whether the intruder has any usable observation of the host's military. */
  hostObserved: boolean;
  /** Armed intruder units currently inside the disputed radius. */
  violatingUnitCount: number;
  /** How many of those can legally reach a tile outside every threatened radius. */
  withdrawableUnitCount: number;
}

export type BorderWithdrawalRefusalReason =
  | 'cannot-withdraw'
  | 'relations-too-hostile'
  | 'strategic-caution';

export interface BorderWithdrawalConsent {
  accepted: boolean;
  reason?: BorderWithdrawalRefusalReason;
}

/** The intruder sees itself as outmatched below this fraction of the host's conservative strength. */
export const BORDER_WITHDRAWAL_OUTMATCHED_RATIO = 0.7;
/** Above this multiple of the host's conservative strength, force is not something the intruder needs to avoid. */
export const BORDER_WITHDRAWAL_SUPERIOR_RATIO = 1.5;
/** The consent score at or above which the intruder promises to withdraw. */
export const BORDER_WITHDRAWAL_CONSENT_THRESHOLD = 0;

/**
 * Never promise what cannot be delivered: with no legal route out of the radius the answer is always no, however
 * friendly the relationship. Otherwise a partly-constrained withdrawal lowers the score, being clearly stronger
 * lowers it further, and being visibly outmatched raises it.
 */
export function evaluateBorderWithdrawalConsent(input: BorderWithdrawalConsentInput): BorderWithdrawalConsent {
  if (input.violatingUnitCount <= 0) return { accepted: true };
  if (input.withdrawableUnitCount <= 0) return { accepted: false, reason: 'cannot-withdraw' };

  const outmatched = input.hostObserved
    && input.hostStrengthLower > 0
    && input.ownStrength < input.hostStrengthLower * BORDER_WITHDRAWAL_OUTMATCHED_RATIO;
  const clearlyStronger = input.hostObserved
    && input.hostStrengthLower > 0
    && input.ownStrength > input.hostStrengthLower * BORDER_WITHDRAWAL_SUPERIOR_RATIO;

  let score = (input.relationship / 100) * 0.5
    + input.diplomacyFocus
    - input.warLikelihood * 0.8;
  if (outmatched) score += 1;
  if (clearlyStronger) score -= 0.8;
  if (input.withdrawableUnitCount < input.violatingUnitCount) score -= 0.3;

  if (score >= BORDER_WITHDRAWAL_CONSENT_THRESHOLD) return { accepted: true };
  return {
    accepted: false,
    reason: clearlyStronger ? 'strategic-caution' : 'relations-too-hostile',
  };
}
