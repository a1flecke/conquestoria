import type { PersonalityTraits, DiplomacyState, DiplomaticAction, MinorCivState } from '@/core/types';
import {
  getRelationship,
  isAtWar,
  getAvailableActions,
  canOfferVassalage,
} from '@/systems/diplomacy-system';
import { shouldDeclareWar } from './ai-personality';
import type { MilitaryStrengthEstimate } from './ai-strength';

export interface DiplomaticDecision {
  action: DiplomaticAction;
  targetCiv: string;
}

export interface DiplomaticContext {
  hasMet: boolean;
  hasBorderPressure: boolean;
  // #545 MR5: does this civ know the potential war target has strategic
  // (nuclear) capability -- see hasKnownStrategicCapability.
  targetHasKnownStrategicCapability: boolean;
}

export function evaluateDiplomacy(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  completedTechs: string[],
  era: number,
  militaryStrengths: Record<string, MilitaryStrengthEstimate>,
  selfStrength: MilitaryStrengthEstimate,
  currentTurn: number,
  contextByCiv: Record<string, DiplomaticContext>,
  strategicDeterrenceCautionWeight: number,
  hasArmsControlTreaty: boolean,
  actorHasKnownCapability: boolean,
): DiplomaticDecision[] {
  const decisions: DiplomaticDecision[] = [];

  for (const civId of Object.keys(diplomacy.relationships)) {
    const actions = getAvailableActions(diplomacy, civId, completedTechs, era, hasArmsControlTreaty);
    const relationship = getRelationship(diplomacy, civId);
    const theirStrength = militaryStrengths[civId]?.midpoint ?? 0;
    const ownStrength = selfStrength.midpoint;
    const advantage = ownStrength > 0 && theirStrength > 0
      ? ownStrength / theirStrength
      : 1;

    if (isAtWar(diplomacy, civId)) {
      if (advantage < 0.7 || relationship > -20) {
        decisions.push({ action: 'request_peace', targetCiv: civId });
      }
    } else {
      const context = contextByCiv[civId]
        ?? { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false };
      if (!context.hasMet) continue;
      if (actions.includes('declare_war') && shouldDeclareWar(
        personality,
        relationship,
        advantage,
        currentTurn,
        context.hasMet,
        context.hasBorderPressure,
        context.targetHasKnownStrategicCapability,
        strategicDeterrenceCautionWeight,
      )) {
        decisions.push({ action: 'declare_war', targetCiv: civId });
        continue;
      }

      if (actions.includes('alliance') && relationship > 50) {
        decisions.push({ action: 'alliance', targetCiv: civId });
      } else if (actions.includes('trade_agreement') && relationship > 10) {
        decisions.push({ action: 'trade_agreement', targetCiv: civId });
      } else if (actions.includes('non_aggression_pact') && relationship > 0 && personality.diplomacyFocus > 0.4) {
        decisions.push({ action: 'non_aggression_pact', targetCiv: civId });
      }

      // #545 MR6 spec §12: a separate, independent condition -- not part of
      // the else-if chain above, since a civ can reasonably want both an
      // alliance and an arms-control pact with the same target. Same
      // relationship/diplomacyFocus bar as non_aggression_pact (spec's own
      // "a similar...bar" framing), plus two capability checks: the actor's
      // own known capability (self-evident, no visibility gate) and the
      // target's known capability (MR5's hasKnownStrategicCapability, via
      // the already-threaded DiplomaticContext field).
      if (
        actions.includes('arms_control_pact')
        && relationship > 0 && personality.diplomacyFocus > 0.4
        && actorHasKnownCapability
        && context.targetHasKnownStrategicCapability
      ) {
        decisions.push({ action: 'arms_control_pact', targetCiv: civId });
      }
    }
  }

  return decisions;
}

export interface MinorCivDecision {
  mcId: string;
  action: 'gift_gold' | 'declare_war';
}

export function evaluateMinorCivDiplomacy(
  personality: PersonalityTraits,
  minorCivs: Record<string, MinorCivState>,
  civId: string,
  gold: number,
): MinorCivDecision[] {
  const decisions: MinorCivDecision[] = [];
  const GIFT_COST = 25;

  for (const [mcId, mc] of Object.entries(minorCivs)) {
    if (mc.isDestroyed) continue;

    const rel = mc.diplomacy.relationships[civId] ?? 0;

    // Diplomatic AIs gift gold to improve relations
    if (personality.diplomacyFocus > 0.4 && rel < 40 && gold >= GIFT_COST) {
      decisions.push({ mcId, action: 'gift_gold' });
    }
  }

  return decisions;
}

// #901: `evaluateProposal` used to live here -- a per-treaty acceptance policy
// with zero callers anywhere in src/ (the bug this issue tracked). Its logic
// now lives, wired in and extended to arms control + peace, in
// `evaluateTreatyConsent` / `evaluatePeaceConsent`
// (`src/ai/ai-treaty-consent.ts`), invoked by `proposeTreatyAgreement`.

export function evaluateVassalage(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  era: number,
  selfStrength: MilitaryStrengthEstimate,
  currentCities: number,
  currentMilitary: number,
  otherStrengths: Record<string, MilitaryStrengthEstimate>,
): DiplomaticDecision | null {
  if (!canOfferVassalage(
    currentCities, diplomacy.vassalage.peakCities,
    currentMilitary, diplomacy.vassalage.peakMilitary, era,
  )) return null;

  // Find strongest non-enemy civ
  let bestTarget: string | null = null;
  let bestStrength = 0;
  for (const [civId, estimate] of Object.entries(otherStrengths)) {
    if (diplomacy.atWarWith.includes(civId)) continue;
    const strength = estimate.midpoint;
    if (strength > bestStrength) {
      bestStrength = strength;
      bestTarget = civId;
    }
  }

  if (bestTarget && selfStrength.midpoint < bestStrength * 0.4) {
    return { action: 'offer_vassalage', targetCiv: bestTarget };
  }
  return null;
}

export function evaluateEmbargoResponse(
  personality: PersonalityTraits,
  relationships: Record<string, number>,
  proposerId: string,
  targetCivId: string,
): boolean {
  const relWithProposer = relationships[proposerId] ?? 0;
  const relWithTarget = relationships[targetCivId] ?? 0;
  const threshold = personality.traits.includes('aggressive') ? 10 :
                    personality.traits.includes('diplomatic') ? 30 : 20;
  return relWithProposer > relWithTarget + threshold;
}

export function evaluateLeagueResponse(
  personality: PersonalityTraits,
  relationships: Record<string, number>,
  leagueMembers: string[],
): boolean {
  if (leagueMembers.length === 0) return false;
  const avgRel = leagueMembers.reduce((sum, m) => sum + (relationships[m] ?? 0), 0) / leagueMembers.length;
  const threshold = personality.traits.includes('aggressive') ? 30 :
                    personality.traits.includes('diplomatic') ? 5 : 10;
  return avgRel > threshold;
}
