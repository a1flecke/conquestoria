import type {
  AIPlanReason,
  AIStrategicObjective,
  AIStrategicRole,
  AITarget,
  GameMap,
} from '@/core/types';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { findPath } from '@/systems/unit-system';
import { createAIDecisionTrace, type AIDecisionTrace } from './ai-decision-trace';

export interface AIObjectiveCandidate {
  objective: AIStrategicObjective;
  target: AITarget;
  theaterId: string;
  travelTurns: number;
  strategicValue: number;
  expectedLossRatio: number;
  supplyDistance: number;
  explicitDistantReasons: AIPlanReason[];
  requiredRoles: Partial<Record<AIStrategicRole, number>>;
}

export interface AIObjectiveTravelCandidate extends Omit<AIObjectiveCandidate, 'travelTurns'> {
  start: { q: number; r: number };
  domain: 'land' | 'naval' | 'air';
  movementPoints: number;
  completedMovementTechHash: string;
}

export interface AIObjectiveChoiceContext {
  actorId: string;
  turn: number;
  candidates: readonly AIObjectiveCandidate[];
  availableRoles: Partial<Record<AIStrategicRole, number>>;
}

export interface AIObjectiveChoice {
  plan: {
    objective: AIStrategicObjective;
    target: AITarget;
    theaterId: string;
    reasonCodes: AIPlanReason[];
    requiredRoles: Partial<Record<AIStrategicRole, number>>;
    score: number;
  } | null;
  demands: AIStrategicRole[];
  eligibleCandidateIds: string[];
  trace: AIDecisionTrace;
}

const DISTANT_ELIGIBILITY_REASONS = new Set<AIPlanReason>([
  'retaliate-recent-attack',
  'continue-active-war',
  'alliance-obligation',
  'critical-resource',
  'no-local-alternative',
]);

const OFFENSIVE_OBJECTIVES = new Set<AIStrategicObjective>([
  'raid',
  'blockade',
  'repel',
  'capture',
  'support-ally',
]);

function finiteClamped(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

export function targetStableKey(target: AITarget): string {
  switch (target.kind) {
    case 'city':
    case 'unit':
    case 'camp':
      return `${target.kind}:${target.id}`;
    case 'resource':
      return `resource:${target.resource}:${hexKey(target.position)}`;
    case 'region':
      return `region:${target.id}`;
  }
}

function candidateId(candidate: AIObjectiveCandidate): string {
  return `${candidate.objective}:${targetStableKey(candidate.target)}`;
}

export function scoreObjectiveCandidate(candidate: AIObjectiveCandidate): number {
  if (!Number.isFinite(candidate.travelTurns) || candidate.travelTurns < 0) {
    return -Number.MAX_VALUE;
  }
  const travelTurns = finiteClamped(candidate.travelTurns, 0, Number.MAX_SAFE_INTEGER);
  const strategicValue = finiteClamped(candidate.strategicValue, 0, 100);
  const expectedLossRatio = finiteClamped(candidate.expectedLossRatio, 0, 2);
  const supplyDistance = finiteClamped(candidate.supplyDistance, 0, Number.MAX_SAFE_INTEGER);
  const distancePenalty = 4 * travelTurns + 0.75 * travelTurns * travelTurns;
  const lossPenalty = 35 * expectedLossRatio;
  const supplyPenalty = 2 * supplyDistance;
  const distantReasonBonus = candidate.explicitDistantReasons.length > 0 ? 35 : 0;
  return strategicValue
    + distantReasonBonus
    - distancePenalty
    - lossPenalty
    - supplyPenalty;
}

export function getObjectiveApproximateDistance(
  map: Pick<GameMap, 'width' | 'wrapsHorizontally'>,
  start: { q: number; r: number },
  target: { q: number; r: number },
): number {
  return map.wrapsHorizontally
    ? wrappedHexDistance(start, target, map.width)
    : hexDistance(start, target);
}

function targetPosition(target: AITarget): { q: number; r: number } {
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

export function resolveObjectiveTravelCandidates(
  map: GameMap,
  candidates: readonly AIObjectiveTravelCandidate[],
  pathfinder: typeof findPath = findPath,
): AIObjectiveCandidate[] {
  const perObjective = new Map<AIStrategicObjective, AIObjectiveTravelCandidate[]>();
  for (const candidate of candidates) {
    const group = perObjective.get(candidate.objective) ?? [];
    group.push(candidate);
    perObjective.set(candidate.objective, group);
  }

  const approximate = [...perObjective.values()]
    .flatMap(group => group
      .sort((left, right) => {
        const distanceDelta = getObjectiveApproximateDistance(
          map,
          left.start,
          targetPosition(left.target),
        ) - getObjectiveApproximateDistance(map, right.start, targetPosition(right.target));
        return distanceDelta || targetStableKey(left.target).localeCompare(targetStableKey(right.target));
      })
      .slice(0, 8))
    .sort((left, right) => {
      const distanceDelta = getObjectiveApproximateDistance(
        map,
        left.start,
        targetPosition(left.target),
      ) - getObjectiveApproximateDistance(map, right.start, targetPosition(right.target));
      return distanceDelta || candidateId({ ...left, travelTurns: 0 })
        .localeCompare(candidateId({ ...right, travelTurns: 0 }));
    })
    .slice(0, 24);

  const pathLengthByKey = new Map<string, number | null>();
  return approximate.map(candidate => {
    const destination = targetPosition(candidate.target);
    const cacheKey = [
      candidate.domain,
      hexKey(candidate.start),
      hexKey(destination),
      candidate.completedMovementTechHash,
    ].join(':');
    if (!pathLengthByKey.has(cacheKey)) {
      const path = pathfinder(candidate.start, destination, map, candidate.domain);
      pathLengthByKey.set(cacheKey, path ? Math.max(0, path.length - 1) : null);
    }
    const pathLength = pathLengthByKey.get(cacheKey);
    const movementPoints = Math.max(1, Math.floor(candidate.movementPoints));
    const {
      start: _start,
      domain: _domain,
      movementPoints: _movementPoints,
      completedMovementTechHash: _completedMovementTechHash,
      ...objective
    } = candidate;
    return {
      ...objective,
      travelTurns: pathLength === null || pathLength === undefined
        ? Number.POSITIVE_INFINITY
        : Math.ceil(pathLength / movementPoints),
    };
  });
}

function missingRoles(
  candidate: AIObjectiveCandidate,
  availableRoles: AIObjectiveChoiceContext['availableRoles'],
): AIStrategicRole[] {
  return (Object.entries(candidate.requiredRoles) as Array<[AIStrategicRole, number]>)
    .filter(([role, count]) => (availableRoles[role] ?? 0) < count)
    .map(([role]) => role);
}

export function choosePrimaryObjective(
  context: AIObjectiveChoiceContext,
): AIObjectiveChoice {
  const demands = new Set<AIStrategicRole>();
  const analyzed = context.candidates.map(candidate => {
    const reasons = candidate.explicitDistantReasons
      .filter(reason => DISTANT_ELIGIBILITY_REASONS.has(reason));
    const missing = missingRoles(candidate, context.availableRoles);
    for (const role of missing) demands.add(role);
    const exactTargetKnown = !(
      candidate.target.kind === 'region'
      && OFFENSIVE_OBJECTIVES.has(candidate.objective)
    );
    if (!exactTargetKnown) demands.add('recon');
    const pathReachable = Number.isFinite(candidate.travelTurns) && candidate.travelTurns >= 0;
    return {
      candidate: { ...candidate, explicitDistantReasons: reasons },
      id: candidateId(candidate),
      reasons,
      baseEligible: missing.length === 0 && exactTargetKnown && pathReachable,
    };
  });

  const pathCandidates = analyzed.filter(entry => entry.baseEligible);
  const nearestTurns = pathCandidates.length > 0
    ? Math.min(...pathCandidates.map(entry => entry.candidate.travelTurns))
    : Number.POSITIVE_INFINITY;
  const localityLimit = Number.isFinite(nearestTurns)
    ? Math.max(nearestTurns + 3, Math.ceil(nearestTurns * 1.5))
    : Number.NEGATIVE_INFINITY;

  const ranked = analyzed.map(entry => {
    const local = entry.candidate.travelTurns <= localityLimit;
    const eligible = entry.baseEligible && (local || entry.reasons.length > 0);
    return {
      ...entry,
      eligible,
      score: scoreObjectiveCandidate(entry.candidate),
    };
  });

  const selected = ranked
    .filter(entry => entry.eligible)
    .sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id))[0];

  const selectedReasons = selected ? [...selected.reasons] : [];
  if (
    selected
    && selectedReasons.length === 0
    && selected.candidate.travelTurns > 6
    && selected.candidate.travelTurns === nearestTurns
  ) {
    selectedReasons.push('no-local-alternative');
  }

  const trace = createAIDecisionTrace({
    actorId: context.actorId,
    turn: context.turn,
    decision: 'objective',
    selectedId: selected?.id ?? null,
    candidates: ranked.map(entry => ({
      id: entry.id,
      score: entry.score,
      eligible: entry.eligible,
      reasonCodes: entry.reasons,
    })),
  });

  return {
    plan: selected
      ? {
          objective: selected.candidate.objective,
          target: selected.candidate.target,
          theaterId: selected.candidate.theaterId,
          reasonCodes: selectedReasons,
          requiredRoles: { ...selected.candidate.requiredRoles },
          score: selected.score,
        }
      : null,
    demands: [...demands].sort(),
    eligibleCandidateIds: ranked
      .filter(entry => entry.eligible)
      .map(entry => entry.id),
    trace,
  };
}
