// #1372: the viewer's own war purpose, projected for the strategic assessment (#1374) to rank.
// Pure and deterministic: no RNG, no mutation, no events, no save field.
//
// It answers one question per known major-civ war -- "what strategic choice does this war give me
// right now?" -- from facts the viewer authored or is entitled to see: their own declared goal and its
// canonical status (`getWarGoalStatus`), the opponent's identity once met, and whether a war-resolution
// request already sits between the pair. It never reads relative strength, `opponentAI`, the
// opponent's own goal, or anything that would predict their consent: "worth considering" is not
// "they will accept". Progress is qualitative on purpose -- the domain owns active/achieved, not a percentage.
import type { GameState } from '@/core/types';
import type { CouncilCardAction } from '@/core/types/council';
import type { WarGoalKind, WarGoalStatus } from '@/core/types/diplomacy';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { hasMetCivilization } from '@/systems/discovery-system';
import { isWarResolutionRequestPair } from '@/systems/diplomacy-requests';
import { canDeclareWarGoal, describeWarGoalLabel, getWarGoalStatus, WAR_GOAL_KINDS } from '@/systems/war-goal-system';

export type WarObjectiveStage = 'no-goal' | Exclude<WarGoalStatus, 'none'>;

/**
 * Relative rank input for the opportunity list (1-100). Satisfied/exceeded is the moment a settlement is
 * worth weighing, an abandoned goal needs a rethink, a missing goal is a gap, an active goal is a reminder.
 * The final ordering belongs to the assessment; these only fix the order within this kind.
 */
export const WAR_OBJECTIVE_PRIORITY: Record<WarObjectiveStage, number> = {
  exceeded: 82,
  satisfied: 80,
  abandoned: 75,
  'no-goal': 60,
  active: 30,
};

export interface WarObjectiveOpportunity {
  /** Stable per opponent, so the same war keeps one card id as its stage changes. */
  id: string;
  opponentCivId: string;
  opponentName: string;
  stage: WarObjectiveStage;
  priority: number;
  title: string;
  why: string;
  destination: CouncilCardAction;
}

const OPEN_DIPLOMACY: CouncilCardAction = { kind: 'open-diplomacy' };

/** Whether the viewer could declare any war goal against this opponent -- the canonical legality, never a copy. */
function canDeclareAnyGoal(state: GameState, viewerCivId: string, opponentCivId: string): boolean {
  const opponent = state.civilizations[opponentCivId];
  if (!opponent) return false;
  return WAR_GOAL_KINDS.some((kind: WarGoalKind) => kind === 'force_vassalage'
    ? canDeclareWarGoal(state, viewerCivId, opponentCivId, kind).ok
    : opponent.cities.some(cityId => canDeclareWarGoal(state, viewerCivId, opponentCivId, kind, cityId).ok));
}

function describe(
  state: GameState,
  viewerCivId: string,
  opponentCivId: string,
  opponentName: string,
  stage: WarObjectiveStage,
): { title: string; why: string } | null {
  switch (stage) {
    case 'no-goal':
      if (!canDeclareAnyGoal(state, viewerCivId, opponentCivId)) return null;
      return {
        title: `Give the war against ${opponentName} a purpose`,
        why: `You are fighting ${opponentName} without a declared objective. Choose one in Diplomacy so the war has a clear aim.`,
      };
    case 'active':
      return {
        title: describeWarGoalLabel(state, viewerCivId, opponentCivId) ?? `War aim against ${opponentName}`,
        why: `Your declared aim against ${opponentName} is still in progress.`,
      };
    case 'satisfied':
      return {
        title: `Your war aim against ${opponentName} is achieved`,
        why: `You have met the objective you declared. A negotiated settlement is now worth considering, or you can keep fighting.`,
      };
    case 'exceeded':
      return {
        title: `Your war has gone beyond its aim against ${opponentName}`,
        why: `Your declared objective is already achieved and you have taken more than you set out to. Consider whether further fighting still serves your plan.`,
      };
    case 'abandoned':
      return {
        title: `Your war aim against ${opponentName} no longer holds`,
        why: `Your declared objective can no longer be met as written. Review the war in Diplomacy.`,
      };
  }
}

export function getWarObjectiveOpportunities(state: GameState, viewerCivId: string): WarObjectiveOpportunity[] {
  const viewer = state.civilizations[viewerCivId];
  if (!viewer) return [];
  const requests = state.pendingDiplomacyRequests ?? [];
  const result: WarObjectiveOpportunity[] = [];

  for (const opponentCivId of majorCivWarOpponentIds(viewer.diplomacy.atWarWith)) {
    const opponent = state.civilizations[opponentCivId];
    if (!opponent || opponent.isEliminated || !hasMetCivilization(state, viewerCivId, opponentCivId)) continue;

    const status = getWarGoalStatus(state, viewerCivId, opponentCivId);
    const stage: WarObjectiveStage = status === 'none' ? 'no-goal' : status;
    // A live peace/settlement request already sits between the pair: advising "consider a settlement"
    // would point at an action the lifecycle refuses to duplicate, and the Diplomacy panel owns the answer.
    if ((stage === 'satisfied' || stage === 'exceeded')
      && requests.some(request => isWarResolutionRequestPair(request, viewerCivId, opponentCivId))) continue;

    const copy = describe(state, viewerCivId, opponentCivId, opponent.name, stage);
    if (!copy) continue;
    result.push({
      id: `war-objective-${opponentCivId}`,
      opponentCivId,
      opponentName: opponent.name,
      stage,
      priority: WAR_OBJECTIVE_PRIORITY[stage],
      ...copy,
      destination: OPEN_DIPLOMACY,
    });
  }

  return result.sort((a, b) => b.priority - a.priority || (a.opponentCivId < b.opponentCivId ? -1 : a.opponentCivId > b.opponentCivId ? 1 : 0));
}
