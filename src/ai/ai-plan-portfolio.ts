import type {
  AIPlanReason,
  AIStrategicObjective,
  AIStrategicPlan,
  AIStrategicRole,
  AITarget,
  HexCoord,
  MajorCivPlanPortfolio,
} from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { targetStableKey } from './ai-objective-scoring';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';

export interface AIPlanCandidate {
  objective: AIStrategicObjective;
  target: AITarget;
  theaterId: string;
  score: number;
  reasonCodes: AIPlanReason[];
  requiredRoles: Partial<Record<AIStrategicRole, number>>;
  commitment: number;
  targetValid: boolean;
  reasonValid: boolean;
  expectedLossRatio: number;
  progress: boolean;
}

export interface AICityThreat {
  cityId: string;
  position: HexCoord;
  theaterId?: string;
  travelTurns: number;
  alreadyAttackedTerritory: boolean;
  captureRisk: number;
  hostileStrength: number;
  isCapital: boolean;
  isLastCity: boolean;
  threatStillValid: boolean;
  consecutiveBeyondSixPhases?: number;
}

export interface AIModernizationFactors {
  bestTrainableStrength: number;
  deployedStrength: number;
  actorEra: number;
  globalEra: number;
  knownRivalMaxStrength: number;
  obsoleteUnitShare: number;
  treasuryCanAct: boolean;
}

export interface AIPortfolioContext {
  actorId: string;
  turn: number;
  actorEliminated: boolean;
  portfolio: MajorCivPlanPortfolio;
  candidates: readonly AIPlanCandidate[];
  cityThreats: readonly AICityThreat[];
  modernization: AIModernizationFactors;
}

export interface AIPortfolioRefreshResult {
  portfolio: MajorCivPlanPortfolio;
  unplannedDefenseCityIds: string[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

export function createEmptyMajorCivPortfolio(): MajorCivPlanPortfolio {
  return createEmptyMajorCivPlanPortfolio();
}

function planMatchesCandidate(
  plan: AIStrategicPlan,
  candidate: AIPlanCandidate,
): boolean {
  return plan.objective === candidate.objective
    && targetStableKey(plan.target) === targetStableKey(candidate.target);
}

function deterministicPlanId(
  actorId: string,
  objective: AIStrategicObjective,
  target: AITarget,
  createdTurn: number,
): string {
  return `ai-plan:${actorId}:${objective}:${targetStableKey(target)}:${createdTurn}`;
}

function normalizedTheater(theaterId: string | undefined, anchor: HexCoord): string {
  const trimmed = theaterId?.trim();
  return trimmed ? trimmed : `local:${hexKey(anchor)}`;
}

function targetAnchor(target: AITarget): HexCoord {
  switch (target.kind) {
    case 'city':
    case 'unit':
    case 'camp':
      return target.lastKnownPosition;
    case 'resource':
      return target.position;
    case 'region':
      return target.anchor;
  }
}

function createPlan(
  context: Pick<AIPortfolioContext, 'actorId' | 'turn'>,
  candidate: AIPlanCandidate,
): AIStrategicPlan {
  return {
    id: deterministicPlanId(
      context.actorId,
      candidate.objective,
      candidate.target,
      context.turn,
    ),
    actorId: context.actorId,
    objective: candidate.objective,
    target: structuredClone(candidate.target),
    theaterId: normalizedTheater(candidate.theaterId, targetAnchor(candidate.target)),
    phase: 'mobilizing',
    reasonCodes: [...candidate.reasonCodes],
    commitment: clamp(candidate.commitment, 0, 1),
    createdTurn: context.turn,
    reconsiderAfterTurn: context.turn + 3,
    expiresAfterTurn: context.turn + 12,
    lastProgressTurn: context.turn,
    requiredRoles: { ...candidate.requiredRoles },
    assignedUnitIds: [],
  };
}

function currentPlanIsValid(
  plan: AIStrategicPlan,
  candidate: AIPlanCandidate | undefined,
  turn: number,
): boolean {
  if (!candidate?.targetValid || !candidate.reasonValid) return false;
  if (candidate.expectedLossRatio > 1.5) return false;
  if (turn > plan.expiresAfterTurn) return false;
  const stalledPastReconsideration = turn >= plan.reconsiderAfterTurn
    && !candidate.progress
    && plan.lastProgressTurn < plan.reconsiderAfterTurn;
  return !stalledPastReconsideration;
}

function selectPrimaryPlan(context: AIPortfolioContext): AIStrategicPlan | null {
  const ranked = [...context.candidates]
    .filter(candidate =>
      candidate.targetValid
      && candidate.reasonValid
      && candidate.expectedLossRatio <= 1.5)
    .sort((left, right) =>
      right.score - left.score
      || targetStableKey(left.target).localeCompare(targetStableKey(right.target)));
  const best = ranked[0];
  const current = context.portfolio.primaryPlan;
  const currentCandidate = current
    ? context.candidates.find(candidate => planMatchesCandidate(current, candidate))
    : undefined;

  if (current && currentPlanIsValid(current, currentCandidate, context.turn)) {
    const switchingBonus = 10 + 20 * clamp(current.commitment, 0, 1);
    if (!best || (currentCandidate?.score ?? Number.NEGATIVE_INFINITY) + switchingBonus >= best.score) {
      return {
        ...current,
        lastProgressTurn: currentCandidate?.progress ? context.turn : current.lastProgressTurn,
        commitment: clamp(current.commitment, 0, 1),
        reasonCodes: currentCandidate ? [...currentCandidate.reasonCodes] : [...current.reasonCodes],
        requiredRoles: currentCandidate
          ? { ...currentCandidate.requiredRoles }
          : { ...current.requiredRoles },
      };
    }
  }

  return best ? createPlan(context, best) : null;
}

function createDefensePlan(
  context: AIPortfolioContext,
  threat: AICityThreat,
): AIStrategicPlan {
  const target: AITarget = {
    kind: 'city',
    id: threat.cityId,
    lastKnownPosition: { ...threat.position },
  };
  return {
    id: deterministicPlanId(context.actorId, 'defend', target, context.turn),
    actorId: context.actorId,
    objective: 'defend',
    target,
    theaterId: normalizedTheater(threat.theaterId, threat.position),
    phase: 'mobilizing',
    reasonCodes: ['urgent-defense'],
    commitment: 1,
    createdTurn: context.turn,
    reconsiderAfterTurn: context.turn + 1,
    expiresAfterTurn: context.turn + 6,
    lastProgressTurn: context.turn,
    rallyPoint: { ...threat.position },
    requiredRoles: { frontline: 1, ranged: 1 },
    assignedUnitIds: [],
  };
}

function rankUrgentThreats(threats: readonly AICityThreat[]): AICityThreat[] {
  const unique = new Map<string, AICityThreat>();
  for (const threat of threats) {
    const existing = unique.get(threat.cityId);
    if (
      !existing
      || threat.alreadyAttackedTerritory && !existing.alreadyAttackedTerritory
      || threat.captureRisk > existing.captureRisk
    ) {
      unique.set(threat.cityId, threat);
    }
  }
  return [...unique.values()]
    .filter(threat =>
      threat.threatStillValid
      && (threat.alreadyAttackedTerritory || threat.travelTurns <= 3))
    .sort((left, right) =>
      Number(right.alreadyAttackedTerritory) - Number(left.alreadyAttackedTerritory)
      || right.captureRisk - left.captureRisk
      || Number(right.isCapital || right.isLastCity) - Number(left.isCapital || left.isLastCity)
      || right.hostileStrength - left.hostileStrength
      || left.cityId.localeCompare(right.cityId));
}

function rankRetainedThreats(
  context: AIPortfolioContext,
  urgentCityIds: ReadonlySet<string>,
): AICityThreat[] {
  return [...context.cityThreats]
    .filter(threat =>
      !urgentCityIds.has(threat.cityId)
      && context.portfolio.defensePlansByCityId[threat.cityId] !== undefined
      && threat.threatStillValid
      && (
        threat.travelTurns <= 6
        || (threat.consecutiveBeyondSixPhases ?? 0) < 2
      ))
    .sort((left, right) =>
      left.travelTurns - right.travelTurns
      || right.captureRisk - left.captureRisk
      || left.cityId.localeCompare(right.cityId));
}

export function calculateModernizationDemand(
  factors: AIModernizationFactors,
): number {
  const trainable = Math.max(0, factors.bestTrainableStrength);
  const deployed = Math.max(0, factors.deployedStrength);
  const roleGap = trainable > 0 ? Math.max(0, trainable - deployed) / trainable : 0;
  const eraGap = Math.max(0, factors.globalEra - factors.actorEra) / Math.max(1, factors.globalEra);
  const rivalGap = factors.knownRivalMaxStrength > 0
    ? Math.max(0, factors.knownRivalMaxStrength - deployed) / factors.knownRivalMaxStrength
    : 0;
  const obsoleteShare = clamp(factors.obsoleteUnitShare, 0, 1);
  const raw = roleGap * 35 + eraGap * 20 + rivalGap * 25 + obsoleteShare * 20;
  return Math.round(clamp(raw * (factors.treasuryCanAct ? 1 : 0.8), 0, 100));
}

export function refreshMajorCivPortfolio(
  context: AIPortfolioContext,
): AIPortfolioRefreshResult {
  if (context.actorEliminated) {
    return {
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        lastPlannedTurn: context.turn,
      },
      unplannedDefenseCityIds: [],
    };
  }

  const urgentThreats = rankUrgentThreats(context.cityThreats);
  const urgentCityIds = new Set(urgentThreats.map(threat => threat.cityId));
  const retainedThreats = rankRetainedThreats(context, urgentCityIds);
  const plannedThreats = [...urgentThreats, ...retainedThreats].slice(0, 4);
  const defensePlansByCityId = Object.fromEntries(plannedThreats.map(threat => {
    const existing = context.portfolio.defensePlansByCityId[threat.cityId];
    return [
      threat.cityId,
      existing
        ? {
            ...existing,
            target: structuredClone(existing.target),
            reasonCodes: [...existing.reasonCodes],
            requiredRoles: { ...existing.requiredRoles },
            assignedUnitIds: [...existing.assignedUnitIds],
          }
        : createDefensePlan(context, threat),
    ];
  }));

  return {
    portfolio: {
      ...context.portfolio,
      primaryPlan: selectPrimaryPlan(context),
      defensePlansByCityId,
      upgradeRoutesByUnitId: { ...context.portfolio.upgradeRoutesByUnitId },
      modernizationDemand: calculateModernizationDemand(context.modernization),
      lastPlannedTurn: context.turn,
    },
    unplannedDefenseCityIds: urgentThreats
      .filter(threat => !plannedThreats.some(planned => planned.cityId === threat.cityId))
      .map(threat => threat.cityId),
  };
}
