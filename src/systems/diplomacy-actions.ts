/**
 * The diplomatic action surface a civ is offered against a target (tech/era
 * gates + `getAvailableActions`). Read-only projection; executing an action is
 * `applyDiplomaticAction` in `diplomacy-system.ts`, which re-runs the same
 * eligibility (`checkDiplomaticActionOffer`) before it writes anything (#1221).
 */
import type { DiplomacyState, DiplomaticAction } from '@/core/types/diplomacy';
import type { CivilizationEra } from '@/systems/era-types';
import { getRelationship, isAtWar } from '@/systems/diplomacy-queries';
import { isVassalBlocked } from '@/systems/diplomacy-vassal-rules';
import { TRIBUTE_DENIAL_MESSAGES, type TributeDenialReason } from '@/systems/diplomacy-tribute';

// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const TRADE_TECHS = ['trade-routes', 'currency', 'banking'];
// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const ALLIANCE_TECHS = ['political-philosophy']; // its unlock text: "Unlock alliances"
// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const NAP_TECHS = ['diplomacy-tech']; // its unlock text: "Unlock Non-Aggression Pacts"

/**
 * The complete input set `getAvailableActions` gates a civ's diplomatic
 * action surface from. `civilizationEra` is a required, explicitly-named
 * field rather than a positional `era: number` -- #1027 found the AI path
 * (`basic-ai.ts`) passing `state.era` (World Age: the era a *majority* of
 * living civs has reached) into what the human path
 * (`diplomacy-panel.ts`) correctly filled with `resolveCivilizationEra(...)`.
 * A bare positional number let that drift silently; a required named field
 * makes every call site spell out `civilizationEra: <expr>`, and the
 * `CivilizationEra` brand makes writing `civilizationEra: state.era` a
 * compile error rather than a silent bug (#1016/#1017). See
 * `.claude/rules/game-balance.md`'s Production Cost Context section (#984)
 * for the same lesson applied to a different system.
 */
export interface DiplomacyActionContext {
  completedTechs: string[];
  /** The acting civilization's own technology-derived era (`resolveCivilizationEra`). Never World Age (`state.era`). */
  civilizationEra: CivilizationEra;
  hasArmsControlTreaty: boolean;
}

/**
 * Why a diplomatic action is not available. One vocabulary for the offer surface and the executor (#1221):
 * what the panel withholds is exactly what `applyDiplomaticAction` refuses, with the same reason.
 *
 * These are *mechanical* reasons. Whether the other side is willing (an AI declining a legal proposal) is not
 * a denial: that is an outcome of a legal action.
 */
export type DiplomaticActionOfferDenial =
  | 'already-at-war'      // declare_war while at war
  | 'at-war'              // a treaty while at war
  | 'not-at-war'          // request_peace while at peace
  | 'not-yet-unlocked'    // era / tech / project gate
  | 'relationship-too-low'
  | 'already-in-force'    // that treaty already exists
  | 'vassal-restricted';  // the actor is a vassal

/** The actions the offer table governs, in the order the panel and the AI see them. */
export const OFFERED_DIPLOMATIC_ACTIONS = [
  'request_peace',
  'declare_war',
  'non_aggression_pact',
  'trade_agreement',
  'open_borders',
  'alliance',
  'arms_control_pact',
] as const satisfies readonly DiplomaticAction[];

export type OfferedDiplomaticAction = typeof OFFERED_DIPLOMATIC_ACTIONS[number];

export function isOfferedDiplomaticAction(action: DiplomaticAction): action is OfferedDiplomaticAction {
  return (OFFERED_DIPLOMATIC_ACTIONS as readonly DiplomaticAction[]).includes(action);
}

export type DiplomaticActionOfferCheck =
  | { ok: true }
  | { ok: false; reason: DiplomaticActionOfferDenial };

/**
 * The one eligibility rule for the actions the offer table governs, from the acting civ's side. Both the list
 * (`getAvailableActions`) and the executor (via `resolveDiplomaticAction`) call it, so they cannot disagree.
 */
export function checkDiplomaticActionOffer(
  state: DiplomacyState,
  targetCivId: string,
  context: DiplomacyActionContext,
  action: OfferedDiplomaticAction,
): DiplomaticActionOfferCheck {
  const { completedTechs, civilizationEra, hasArmsControlTreaty } = context;
  const deny = (reason: DiplomaticActionOfferDenial): DiplomaticActionOfferCheck => ({ ok: false, reason });
  const atWar = isAtWar(state, targetCivId);
  const hasTreaty = (type: string) =>
    state.treaties.some(t => t.type === type && (t.civB === targetCivId || t.civA === targetCivId));

  if (isVassalBlocked(action, Boolean(state.vassalage?.overlord))) return deny('vassal-restricted');

  if (action === 'request_peace') return atWar ? { ok: true } : deny('not-at-war');
  if (action === 'declare_war') return atWar ? deny('already-at-war') : { ok: true };
  if (atWar) return deny('at-war');

  switch (action) {
    case 'non_aggression_pact':
      if (!(civilizationEra >= 2 || completedTechs.some(t => NAP_TECHS.includes(t)))) return deny('not-yet-unlocked');
      return hasTreaty('non_aggression_pact') ? deny('already-in-force') : { ok: true };
    case 'trade_agreement':
      if (!(civilizationEra >= 3 || completedTechs.some(t => TRADE_TECHS.includes(t)))) return deny('not-yet-unlocked');
      if (!(getRelationship(state, targetCivId) > 0)) return deny('relationship-too-low');
      return hasTreaty('trade_agreement') ? deny('already-in-force') : { ok: true };
    case 'open_borders':
    case 'alliance':
      if (!(civilizationEra >= 4 || completedTechs.some(t => ALLIANCE_TECHS.includes(t)))) return deny('not-yet-unlocked');
      return hasTreaty(action) ? deny('already-in-force') : { ok: true };
    case 'arms_control_pact':
      // #545 MR6 review finding: without the not-already-signed check (matching every other treaty type), this
      // action -- and the AI's own evaluateDiplomacy decision to propose it, gated on the same check -- would
      // keep re-firing every turn for a civ pair that already has an active pact, growing the treaties array
      // unboundedly and duplicating rows in the diplomacy panel.
      if (!hasArmsControlTreaty) return deny('not-yet-unlocked');
      return hasTreaty('arms_control_pact') ? deny('already-in-force') : { ok: true };
  }
}

/** Plain-language copy for each offer denial. Deliberately never names a civilization (hot-seat: no leaks). */
export const DIPLOMATIC_OFFER_DENIAL_MESSAGES: Record<DiplomaticActionOfferDenial, string> = {
  'already-at-war': 'You are already at war with them.',
  'at-war': 'That cannot be done while you are at war with them.',
  'not-at-war': 'You are not at war with them, so there is no peace to make.',
  'not-yet-unlocked': 'Your civilization has not unlocked that yet.',
  'relationship-too-low': 'They do not trust you enough for that yet.',
  'already-in-force': 'That agreement is already in force.',
  'vassal-restricted': 'Vassalage prevents that action.',
};

/**
 * Every reason `applyDiplomaticAction` can refuse an action: the offer-table denials plus the executor-side
 * ones. `not-met` deliberately covers "no such civilization" too, so a refusal never confirms whether an
 * unmet civ exists or what it is (hot-seat: the copy must not leak what the actor has not earned).
 */
export type DiplomaticActionDenialReason =
  | DiplomaticActionOfferDenial
  | TributeDenialReason
  | 'not-met'
  | 'self-target'
  | 'not-available';  // no such relationship/vassal/breakaway, or the action has no execution path

export const DIPLOMATIC_ACTION_DENIAL_MESSAGES: Record<DiplomaticActionDenialReason, string> = {
  ...TRIBUTE_DENIAL_MESSAGES,
  ...DIPLOMATIC_OFFER_DENIAL_MESSAGES,
  'not-met': 'You have not met them yet.',
  'self-target': 'You cannot do that to yourself.',
  'not-available': 'That action is not available right now.',
};

export function getAvailableActions(
  state: DiplomacyState,
  targetCivId: string,
  context: DiplomacyActionContext,
): DiplomaticAction[] {
  // Vassalage is deliberately NOT surfaced here. `getVassalageEligibility` (which itself calls
  // `canOfferVassalage` with `resolveCivilizationEra(vassal.techState.completed)`) is the sole canonical
  // eligibility check for offering vassalage, consulted directly by both the human panel
  // (`vassalage-controls.ts`) and the AI (`basic-ai.ts`'s `evaluateVassalage` call). #1027's audit found this
  // function used to carry its own second, weaker vassalage rule here -- removed rather than fixed in place.
  //
  // #998 / #1030: `propose_embargo` and `propose_league` were offered here without the canonical
  // `canProposeEmbargo`/`canProposeLeague` checks and had NO execution path anywhere -- a silent dead end.
  // Removed rather than wired up; a player-initiated propose flow is separate, larger feature work.
  return OFFERED_DIPLOMATIC_ACTIONS.filter(action => checkDiplomaticActionOffer(state, targetCivId, context, action).ok);
}
