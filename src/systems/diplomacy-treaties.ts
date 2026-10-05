/**
 * Bilateral treaty lifecycle: sign, break, expire and the consented commit.
 * `signTreaty` writes ONE side; `commitTreatyAgreement` is the sole
 * bilateral commit path (source rule: `check-src-rule-violations.sh`).
 * Asking whether a treaty exists lives in `diplomacy-queries.ts`.
 */
import type { GameState, DiplomacyState, Treaty, TreatyType, TributeTerms } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hasMetCivilization } from '@/systems/discovery-system';
import { computeArmsControlCap } from '@/systems/strategic-arsenal-system';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import { modifyRelationship } from '@/systems/diplomacy-state';
import { hasTreatyBetween, isAtWar } from '@/systems/diplomacy-queries';

// Signs the treaty into THIS side's diplomacy state immediately — no consent
// step. Callers targeting a human must go through enqueueTreatyProposal
// instead (#554). Both sides must be signed for a complete treaty.
export function signTreaty(
  state: DiplomacyState,
  selfId: string,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
  arsenalCap?: number,
): DiplomacyState {
  const treaty: Treaty = {
    type,
    civA: selfId,
    civB: otherCivId,
    turnsRemaining,
  };
  if (type === 'trade_agreement') {
    treaty.goldPerTurn = 2;
  }
  if (type === 'arms_control_pact' && arsenalCap !== undefined) {
    treaty.arsenalCap = arsenalCap;
  }
  const newState = {
    ...state,
    treaties: [...state.treaties, treaty],
    events: [
      ...state.events,
      { type: 'treaty_signed', turn, otherCiv: otherCivId, weight: 1 },
    ],
  };
  return modifyRelationship(newState, otherCivId, 5);
}

export function breakTreaty(
  state: DiplomacyState,
  otherCivId: string,
  treatyType: TreatyType,
  turn: number,
): DiplomacyState {
  const newState = {
    ...state,
    treaties: state.treaties.filter(
      t => !(t.type === treatyType && (t.civB === otherCivId || t.civA === otherCivId)),
    ),
    events: [
      ...state.events,
      { type: 'treaty_broken', turn, otherCiv: otherCivId, weight: 1 },
    ],
  };
  return modifyRelationship(newState, otherCivId, -30);
}

export function tickTreaties(state: DiplomacyState): DiplomacyState {
  const remaining: Treaty[] = [];
  for (const treaty of state.treaties) {
    if (treaty.turnsRemaining === -1) {
      remaining.push(treaty);
    } else if (treaty.turnsRemaining > 1) {
      remaining.push({ ...treaty, turnsRemaining: treaty.turnsRemaining - 1 });
    }
  }
  return { ...state, treaties: remaining };
}

/**
 * #545 MR6 spec §12: "available to propose once the proposing civ has
 * completed the Arms Control Treaty national project" -- the only human-
 * facing gate for this action (unlike every other treaty type, there is no
 * relationship/era/tech condition here; see getAvailableActions above).
 */
export function hasArmsControlTreaty(state: GameState, civId: string): boolean {
  if (!isSuperweaponsEnabled(state)) return false;
  return state.builtNationalProjects?.[`${civId}:arms_control_treaty`] !== undefined;
}

/** The sole bilateral treaty mutation path once both parties have consented. */
export function commitTreatyAgreement(state: GameState, civAId: string, civBId: string, type: Exclude<TreatyType, 'vassalage' | 'tribute'>, bus: EventBus): GameState {
  const civA = state.civilizations[civAId];
  const civB = state.civilizations[civBId];
  if (
    !civA || !civB
    || civA.diplomacy.vassalage.overlord || civB.diplomacy.vassalage.overlord
    || !hasMetCivilization(state, civAId, civBId)
    || isAtWar(civA.diplomacy, civBId)
    || isAtWar(civB.diplomacy, civAId)
    || hasTreatyBetween(state, civAId, civBId, type)
  ) return state;
  const turns = type === 'non_aggression_pact' ? 10 : -1;
  const cap = type === 'arms_control_pact' ? computeArmsControlCap(state, civAId, civBId) : undefined;
  const aState = signTreaty(civA.diplomacy, civAId, civBId, type, turns, state.turn, cap);
  const bState = signTreaty(civB.diplomacy, civBId, civAId, type, turns, state.turn, cap);
  const aBonus = resolveCivDefinition(state, civA.civType ?? '')?.bonusEffect;
  const bBonus = resolveCivDefinition(state, civB.civType ?? '')?.bonusEffect;
  const relationshipBonus = (aBonus?.type === 'allied_kingdoms' ? aBonus.treatyRelationshipBonus : 0)
    + (bBonus?.type === 'allied_kingdoms' ? bBonus.treatyRelationshipBonus : 0);
  bus.emit('diplomacy:treaty-accepted', { civA: civAId, civB: civBId, treaty: type });
  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request =>
      !(request.type === 'treaty' && request.treatyType === type
        && ((request.fromCivId === civAId && request.toCivId === civBId) || (request.fromCivId === civBId && request.toCivId === civAId)))),
    civilizations: {
      ...state.civilizations,
      [civAId]: { ...civA, diplomacy: relationshipBonus ? modifyRelationship(aState, civBId, relationshipBonus) : aState },
      [civBId]: { ...civB, diplomacy: relationshipBonus ? modifyRelationship(bState, civAId, relationshipBonus) : bState },
    },
  };
}

/**
 * #1334: the sole writer of a standalone tribute contract. A tribute is directional (one payer, one demander) but the
 * record is mirrored on both civs like every other treaty, with identical terms and rounds, so reciprocity holds by
 * construction. Acceptance carries no relationship change: the coercion is already the contract.
 */
export function commitTributeAgreement(state: GameState, terms: TributeTerms, rounds: number): GameState {
  const demander = state.civilizations[terms.demanderId];
  const payer = state.civilizations[terms.payerId];
  if (!demander || !payer || terms.demanderId === terms.payerId || rounds < 1 || terms.goldPerRound < 1) return state;
  const record = (selfId: string, otherId: string): Treaty => ({
    type: 'tribute',
    civA: selfId,
    civB: otherId,
    turnsRemaining: rounds,
    tribute: { ...terms },
  });
  const sign = (diplomacy: DiplomacyState, selfId: string, otherId: string): DiplomacyState => ({
    ...diplomacy,
    treaties: [...diplomacy.treaties, record(selfId, otherId)],
    events: [...diplomacy.events, { type: 'tribute_accepted', turn: state.turn, otherCiv: otherId, weight: 1 }],
  });
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [terms.demanderId]: { ...demander, diplomacy: sign(demander.diplomacy, terms.demanderId, terms.payerId) },
      [terms.payerId]: { ...payer, diplomacy: sign(payer.diplomacy, terms.payerId, terms.demanderId) },
    },
  };
}
