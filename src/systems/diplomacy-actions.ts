/**
 * The diplomatic action surface a civ is offered against a target (tech/era
 * gates + `getAvailableActions`). Read-only projection; executing an action is
 * `applyDiplomaticAction` in `diplomacy-system.ts`.
 */
import type { DiplomacyState, DiplomaticAction } from '@/core/types';
import type { CivilizationEra } from '@/systems/era-types';
import { getRelationship, isAtWar } from '@/systems/diplomacy-queries';
import { isVassalBlocked } from '@/systems/diplomacy-vassal-rules';

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

export function getAvailableActions(
  state: DiplomacyState,
  targetCivId: string,
  context: DiplomacyActionContext,
): DiplomaticAction[] {
  const { completedTechs, civilizationEra, hasArmsControlTreaty } = context;
  const actions: DiplomaticAction[] = [];
  const atWar = isAtWar(state, targetCivId);

  if (atWar) {
    actions.push('request_peace');
  } else {
    actions.push('declare_war');

    const hasNAPTech = completedTechs.some(t => NAP_TECHS.includes(t));
    const hasTradeTech = completedTechs.some(t => TRADE_TECHS.includes(t));
    const hasAllianceTech = completedTechs.some(t => ALLIANCE_TECHS.includes(t));
    const hasNAP = state.treaties.some(
      t => t.type === 'non_aggression_pact' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const hasTrade = state.treaties.some(
      t => t.type === 'trade_agreement' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const relationship = getRelationship(state, targetCivId);

    if ((civilizationEra >= 2 || hasNAPTech) && !hasNAP) {
      actions.push('non_aggression_pact');
    }
    if ((civilizationEra >= 3 || hasTradeTech) && relationship > 0 && !hasTrade) {
      actions.push('trade_agreement');
    }
    if (civilizationEra >= 4 || hasAllianceTech) {
      if (!state.treaties.some(t => t.type === 'open_borders' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('open_borders');
      }
      if (!state.treaties.some(t => t.type === 'alliance' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('alliance');
      }
    }

    // #545 MR6 review finding: without the not-already-signed check (matching
    // every other treaty type above), this action -- and the AI's own
    // evaluateDiplomacy decision to propose it, gated on the same
    // getAvailableActions() call -- would keep re-firing every turn for a
    // civ pair that already has an active pact, signing (AI<->AI: immediate,
    // per basic-ai.ts) a new duplicate arms_control_pact treaty entry each
    // time. Unguarded, this grows the treaties array unboundedly turn over
    // turn and duplicates rows in the diplomacy panel.
    if (
      hasArmsControlTreaty
      && !state.treaties.some(t => t.type === 'arms_control_pact' && (t.civB === targetCivId || t.civA === targetCivId))
    ) {
      actions.push('arms_control_pact');
    }

    // Vassalage is deliberately NOT surfaced here. `getVassalageEligibility`
    // (which itself calls `canOfferVassalage` with
    // `resolveCivilizationEra(vassal.techState.completed)`) is the sole
    // canonical eligibility check for offering vassalage, consulted directly
    // by both the human panel (`vassalage-controls.ts`) and the AI
    // (`basic-ai.ts`'s `evaluateVassalage` call). #1027's audit found this
    // function used to carry its own second, weaker vassalage rule here
    // (`era >= 2 && !overlord`, with no "actually weakened" check at all) --
    // dead code with zero consumers on either path, but exactly the
    // "second vassalage rule" shape this issue's brief warned against
    // reintroducing. Removed rather than fixed in place, since fixing it
    // properly would require this function to also receive city/military
    // counts it has no other use for.

    // #998 / #1030: `propose_embargo` and `propose_league` were offered here (re-deriving
    // era/tech gating instead of calling the canonical `canProposeEmbargo`/`canProposeLeague`,
    // and without their `isAllied`/`currentLeague`/relationship checks) but had NO execution
    // path anywhere — `applyDiplomaticAction`'s switch has no case for either, no UI button
    // ever rendered them via a different route, and no AI logic ever selects them. A complete,
    // silent dead end for both actions. Removed rather than wired up: the underlying join/leave/
    // enforce/dissolve mechanics are real and tested (`diplomacy-embargo.test.ts`), but shipping
    // a *player-initiated* propose flow (UI, AI-initiation heuristics, balance) is separate,
    // larger feature work, not something this invariant-testing issue's scope covers.
  }

  return actions.filter(action => !isVassalBlocked(action, Boolean(state.vassalage?.overlord)));
}
