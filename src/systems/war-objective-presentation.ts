// #1372: the viewer's own war purpose, projected for the strategic assessment (#1374) to rank.
// Pure and deterministic: no RNG, no mutation, no events, no save field.
//
// It answers one question per known major-civ war -- "what strategic choice does this war give me
// right now?" -- from facts the viewer authored or is entitled to see: their own declared goal and its
// canonical status (`getWarGoalStatus`), the opponent's identity once met, and whether a war-resolution
// request already sits between the pair. It never reads relative strength, `opponentAI`, the
// opponent's own goal, or anything that would predict their consent (#1398 adds the viewer's OWN force condition, empire-wide and never a comparison): "worth considering" is not
// "they will accept". Progress is qualitative on purpose -- the domain owns active/achieved, not a percentage.
import type { GameState } from '@/core/types';
import type { CouncilCardAction } from '@/core/types/council';
import type { WarGoalKind, WarGoalStatus } from '@/core/types/diplomacy';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { hasMetCivilization } from '@/systems/discovery-system';
import { isWarResolutionRequestPair } from '@/systems/diplomacy-requests';
import { canDeclareWarGoal, describeWarGoalLabel, getWarGoalStatus, WAR_GOAL_KINDS } from '@/systems/war-goal-system';
import { getOwnForceReadiness, type ForceLimitationKind, type OwnForceReadiness } from '@/systems/own-force-readiness';

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

/**
 * An unfinished aim while the viewer's own forces are materially limited (#1398): a real decision (recover, or press on),
 * so it outranks the plain "aim in progress" reminder but never a missing aim, a settlement moment or an abandoned aim.
 */
export const WAR_OBJECTIVE_ACTIVE_LIMITED_PRIORITY = 55;

/** Plain names for the limitations war guidance may mention. Land supply is deliberately absent: it already has its own Council constraint. */
const LIMIT_LABELS: Partial<Record<ForceLimitationKind, string>> = {
  wounded: 'badly wounded',
  'air-worn': 'worn aircraft',
  'air-cannot-strike': 'aircraft that cannot strike',
  'naval-extended': 'ships far from port',
  'naval-depleted': 'depleted ships',
};

/**
 * Whether operational limits are worth putting in front of a war decision: at least two units, and a quarter of the
 * force, are limited by something other than supply. One tired ship in a large army changes nothing.
 */
function hasMaterialLimits(readiness: OwnForceReadiness): boolean {
  const limited = readiness.limitedUnitsExcludingSupply;
  return limited >= 2 && limited * 4 >= readiness.eligibleUnits;
}

/**
 * One honest sentence about the whole force. It is empire-wide on purpose: nothing here knows which units are near
 * which front, so it never claims to describe this war's theater, and it compares against nobody.
 */
function describeLimits(readiness: OwnForceReadiness): string {
  const parts = readiness.limitations
    .filter(item => LIMIT_LABELS[item.kind])
    .slice(0, 3)
    .map(item => `${item.units} ${LIMIT_LABELS[item.kind]}`);
  return `Across your whole armed forces (not just this front), ${readiness.limitedUnitsExcludingSupply} of ${readiness.eligibleUnits} units are limited: ${parts.join(', ')}.`;
}

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
  limits: string | null,
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
        why: limits
          ? `Your declared aim against ${opponentName} is still in progress. ${limits} You could let them recover before pressing the attack, or keep fighting; talks stay open in Diplomacy either way.`
          : `Your declared aim against ${opponentName} is still in progress.`,
      };
    case 'satisfied':
      return {
        title: `Your war aim against ${opponentName} is achieved`,
        why: `You have met the objective you declared. A negotiated settlement is now worth considering, or you can keep fighting.${limits ? ` ${limits} Worn forces are one more reason to weigh a settlement, though the other side may not agree to one.` : ''}`,
      };
    case 'exceeded':
      return {
        title: `Your war has gone beyond its aim against ${opponentName}`,
        why: `Your declared objective is already achieved and you have taken more than you set out to. Consider whether further fighting still serves your plan.${limits ? ` ${limits}` : ''}`,
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
  // Computed at most once per call, and only when a stage that can use it is reached.
  let limitsText: string | null | undefined;
  const limitsFor = (): string | null => {
    if (limitsText === undefined) {
      const readiness = getOwnForceReadiness(state, viewerCivId);
      limitsText = hasMaterialLimits(readiness) ? describeLimits(readiness) : null;
    }
    return limitsText;
  };

  for (const opponentCivId of majorCivWarOpponentIds(viewer.diplomacy.atWarWith)) {
    const opponent = state.civilizations[opponentCivId];
    if (!opponent || opponent.isEliminated || !hasMetCivilization(state, viewerCivId, opponentCivId)) continue;

    const status = getWarGoalStatus(state, viewerCivId, opponentCivId);
    const stage: WarObjectiveStage = status === 'none' ? 'no-goal' : status;
    // A live peace/settlement request already sits between the pair: advising "consider a settlement"
    // would point at an action the lifecycle refuses to duplicate, and the Diplomacy panel owns the answer.
    if ((stage === 'satisfied' || stage === 'exceeded')
      && requests.some(request => isWarResolutionRequestPair(request, viewerCivId, opponentCivId))) continue;

    const usesLimits = stage === 'active' || stage === 'satisfied' || stage === 'exceeded';
    const limits = usesLimits ? limitsFor() : null;
    const copy = describe(state, viewerCivId, opponentCivId, opponent.name, stage, limits);
    if (!copy) continue;
    result.push({
      id: `war-objective-${opponentCivId}`,
      opponentCivId,
      opponentName: opponent.name,
      stage,
      priority: stage === 'active' && limits ? WAR_OBJECTIVE_ACTIVE_LIMITED_PRIORITY : WAR_OBJECTIVE_PRIORITY[stage],
      ...copy,
      destination: OPEN_DIPLOMACY,
    });
  }

  return result.sort((a, b) => b.priority - a.priority || (a.opponentCivId < b.opponentCivId ? -1 : a.opponentCivId > b.opponentCivId ? 1 : 0));
}
