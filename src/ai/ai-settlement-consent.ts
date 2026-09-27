/**
 * #988 target-side settlement (typed peace term) consent policy. A cycle-free
 * leaf like {@link import('./ai-treaty-consent').evaluatePeaceConsent} --
 * imports only `@/core/types` -- so `settlement-system.ts` can call it
 * without an import cycle. Pure function of relationship + each term's value
 * to the recipient + already-known relative strength; no `GameState`, no RNG,
 * no difficulty input (challenge tiers share identical consent thresholds).
 */
import type { SettlementTerm, TreatyDeclineReason } from '@/core/types';

export interface SettlementConsent {
  accepted: boolean;
  reason?: TreatyDeclineReason;
}

export interface SettlementConsentInput {
  recipientCivId: string;
  terms: readonly SettlementTerm[];
  relationship: number;
  /** Peace-only, optional non-omniscient strength estimate -- see
   * `TreatyConsentInput.targetVisibleStrength`'s doc comment for why this is
   * threaded the same way here. */
  targetVisibleStrength?: number;
  proposerVisibleStrength?: number;
}

/**
 * Net value of one term from `recipientCivId`'s own point of view: positive
 * means the term benefits them, negative means it costs them. Reads only the
 * term's own fields -- never `GameState` -- so a caller with a perceived (not
 * necessarily perfectly accurate) term list can reuse this unchanged.
 */
function scoreSettlementTermForRecipient(recipientCivId: string, term: SettlementTerm): number {
  switch (term.kind) {
    case 'transfer_city':
      if (term.fromCivId === recipientCivId) return -20;
      if (term.toCivId === recipientCivId) return 15;
      return 0;
    case 'reparations':
      if (!term.goldAmount) return 0;
      if (term.fromCivId === recipientCivId) return -term.goldAmount / 5;
      if (term.toCivId === recipientCivId) return term.goldAmount / 5;
      return 0;
    case 'vassalize':
      if (term.vassalId === recipientCivId) return -50;
      if (term.overlordId === recipientCivId) return 30;
      return 0;
    case 'release_vassal':
      // The vassal being freed gains independence; its (former) overlord loses tribute/control.
      if (term.vassalId === recipientCivId) return 25;
      return -20;
  }
}

export function evaluateSettlementConsent(input: SettlementConsentInput): SettlementConsent {
  const netValue = input.terms.reduce(
    (sum, term) => sum + scoreSettlementTermForRecipient(input.recipientCivId, term),
    0,
  );
  const outmatched =
    input.targetVisibleStrength !== undefined
    && input.proposerVisibleStrength !== undefined
    && input.targetVisibleStrength < input.proposerVisibleStrength * 0.7;
  // A civ that knows it is losing the war accepts materially worse terms to
  // end it; a civ at a good relationship (or no visible disadvantage) still
  // wants terms that are at worst mildly costly, never a rout.
  const acceptanceBar = outmatched ? -60 : (input.relationship > 0 ? -10 : 10);
  return netValue >= acceptanceBar
    ? { accepted: true }
    : { accepted: false, reason: 'terms-too-costly' };
}
